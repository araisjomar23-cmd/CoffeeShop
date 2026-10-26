import { createClient } from "@/lib/supabase/server";
import { requireStaffRole } from "@/lib/auth";

type ExportOrder = {
  order_date: string;
  order_number: number;
  customer_name: string | null;
  status: string;
  total_centavos: number;
  created_at: string;
  order_type: string | null;
  payment_method: string | null;
  cash_received_centavos: number | null;
  change_centavos: number | null;
  cancellation_reason: string | null;
  order_items: {
    item_name: string;
    unit_price_centavos: number;
    quantity: number;
    note: string | null;
  }[];
};

export async function GET(request: Request) {
  await requireStaffRole(["owner"]);
  const params = new URL(request.url).searchParams;
  const requestedDate = params.get("date");
  const requestedStart = params.get("startDate");
  const requestedEnd = params.get("endDate");
  let startDate: string;
  let endDate: string;
  if (requestedStart !== null || requestedEnd !== null) {
    if (!requestedStart || !requestedEnd || !isRealDate(requestedStart) || !isRealDate(requestedEnd) || requestedStart > requestedEnd || daysBetween(requestedStart, requestedEnd) > 365) {
      return new Response("Choose a valid date range no longer than one year.", { status: 400 });
    }
    startDate = requestedStart;
    endDate = requestedEnd;
  } else {
    const selectedDate = requestedDate && isRealDate(requestedDate) ? requestedDate : manilaToday();
    startDate = selectedDate;
    endDate = selectedDate;
  }
  const date = startDate === endDate ? startDate : startDate + "-to-" + endDate;

  try {
    const supabase = await createClient();
    const orders: ExportOrder[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from("orders")
        .select("order_date, order_number, customer_name, status, total_centavos, created_at, order_type, payment_method, cash_received_centavos, change_centavos, cancellation_reason, order_items(item_name, unit_price_centavos, quantity, note)")
        .gte("order_date", startDate)
        .lte("order_date", endDate)
        .order("created_at", { ascending: true })
        .range(offset, offset + 499);
      if (error) throw error;
      const page = (data ?? []) as ExportOrder[];
      orders.push(...page);
      if (page.length < 500) break;
      if (orders.length >= 20000) throw new Error("Date range contains too many orders to export at once.");
    }
    const rows = [[
      "order_date", "order_number", "time", "customer", "order_type", "payment_method", "status", "item", "quantity",
      "unit_price_php", "item_total_php", "order_total_php", "cash_received_php", "change_php", "item_note", "cancellation_reason",
    ]];

    for (const order of orders) {
      const items = order.order_items.length ? order.order_items : [null];
      for (const item of items) {
        rows.push([
          order.order_date,
          String(order.order_number),
          new Intl.DateTimeFormat("en-PH", {
            timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit",
          }).format(new Date(order.created_at)),
          order.customer_name?.trim() || "",
          order.order_type ?? "",
          paymentMethodLabel(order.payment_method),
          order.status,
          item?.item_name ?? "",
          item ? String(item.quantity) : "",
          item ? pesos(item.unit_price_centavos) : "",
          item ? pesos(item.unit_price_centavos * item.quantity) : "",
          pesos(order.total_centavos),
          order.cash_received_centavos === null ? "" : pesos(order.cash_received_centavos),
          order.change_centavos === null ? "" : pesos(order.change_centavos),
          item?.note ?? "",
          order.cancellation_reason ?? "",
        ]);
      }
    }

    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="coffee-shop-sales-${date}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Could not export sales data. Please try again.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

function csvCell(value: string) {
  // Prefix spreadsheet formula characters so customer-entered text is treated as data.
  const safeValue = /^[\t\r ]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function pesos(centavos: number) {
  return (centavos / 100).toFixed(2);
}

function paymentMethodLabel(method: string | null) {
  if (method === "e_wallet") return "Cashless (GCash)";
  if (method === "cash") return "Cash";
  if (method === "card") return "Card";
  return "";
}

function isRealDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function daysBetween(startDate: string, endDate: string) {
  return (Date.parse(endDate + "T00:00:00Z") - Date.parse(startDate + "T00:00:00Z")) / 86400000;
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
