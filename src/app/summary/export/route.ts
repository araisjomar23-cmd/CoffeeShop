import { createClient } from "@/lib/supabase/server";

type ExportOrder = {
  order_date: string;
  order_number: number;
  customer_name: string | null;
  status: string;
  total_centavos: number;
  created_at: string;
  order_items: {
    item_name: string;
    unit_price_centavos: number;
    quantity: number;
    note: string | null;
  }[];
};

export async function GET(request: Request) {
  const requestedDate = new URL(request.url).searchParams.get("date");
  const date = requestedDate && isRealDate(requestedDate) ? requestedDate : manilaToday();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .select("order_date, order_number, customer_name, status, total_centavos, created_at, order_items(item_name, unit_price_centavos, quantity, note)")
      .eq("order_date", date)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const orders = (data ?? []) as ExportOrder[];
    const rows = [[
      "order_date", "order_number", "time", "customer", "status", "item", "quantity",
      "unit_price_php", "item_total_php", "order_total_php", "item_note",
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
          order.status,
          item?.item_name ?? "",
          item ? String(item.quantity) : "",
          item ? pesos(item.unit_price_centavos) : "",
          item ? pesos(item.unit_price_centavos * item.quantity) : "",
          pesos(order.total_centavos),
          item?.note ?? "",
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

function isRealDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
