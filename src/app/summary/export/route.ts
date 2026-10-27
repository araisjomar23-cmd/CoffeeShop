import { summarizeCollections, summarizeSales } from "@/lib/sales-summary";
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

type PaymentEvent = { amount_centavos: number; payment_method: string };
type PdfPage = { commands: string[] };
const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const LEFT = 40;
const RIGHT = 802;

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
    const selectedDate = requestedDate && isRealDate(requestedDate) && requestedDate <= manilaToday() ? requestedDate : manilaToday();
    startDate = selectedDate;
    endDate = selectedDate;
  }

  const fileRange = startDate === endDate ? startDate : `${startDate}-to-${endDate}`;

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
        .order("id", { ascending: true })
        .range(offset, offset + 499);
      if (error) throw error;
      const batch = (data ?? []) as ExportOrder[];
      orders.push(...batch);
      if (batch.length < 500) break;
      if (orders.length >= 20000) throw new Error("Date range contains too many orders to export at once.");
    }

    const startTimestamp = `${startDate}T00:00:00+08:00`;
    const endTimestamp = `${shiftDate(endDate, 1)}T00:00:00+08:00`;
    const payments: PaymentEvent[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from("order_payment_events")
        .select("amount_centavos, payment_method")
        .gte("created_at", startTimestamp)
        .lt("created_at", endTimestamp)
        .order("id")
        .range(offset, offset + 499);
      if (error) throw error;
      const batch = (data ?? []) as PaymentEvent[];
      payments.push(...batch);
      if (batch.length < 500) break;
      if (payments.length >= 20000) throw new Error("Date range contains too many payment movements to export at once.");
    }

    const pdf = buildSalesReport(startDate, endDate, orders, payments);
    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="coffee-shop-sales-${fileRange}.pdf"`,
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

function buildSalesReport(startDate: string, endDate: string, orders: ExportOrder[], payments: PaymentEvent[]) {
  const { salesOrders, cancelledOrders, salesCentavos, averageCentavos, paymentTotals: orderPayments, rankedItems } = summarizeSales(orders, 8);
  const collections = summarizeCollections(payments);
  let page: PdfPage = { commands: [] };
  const pages: PdfPage[] = [page];

  text(page, "COFFEE SHOP  |  SALES REPORT", LEFT, 42, 20, true);
  text(page, `Reporting period: ${dateRangeLabel(startDate, endDate)}`, LEFT, 65, 10);
  text(page, `Generated: ${dateTimeLabel(new Date().toISOString())}`, 610, 65, 9);
  rule(page, 77);

  sectionTitle(page, "SALES OVERVIEW", 101);
  const metrics = [
    ["ORDER SALES", pesos(salesCentavos)],
    ["COMPLETED / ACTIVE ORDERS", String(salesOrders.length)],
    ["AVERAGE ORDER", averageCentavos === null ? "--" : pesos(averageCentavos)],
    ["CANCELLED ORDERS", String(cancelledOrders.length)],
  ];
  const metricX = [LEFT, 235, 430, 625];
  metrics.forEach(([label, value], index) => {
    text(page, label, metricX[index], 124, 8, true, "muted");
    text(page, value, metricX[index], 148, 17, true, index === 0 ? "green" : "dark");
  });
  text(page, "Order sales include non-cancelled orders, including orders still being prepared.", LEFT, 168, 8, false, "muted");
  rule(page, 182);

  sectionTitle(page, "PAYMENT SUMMARY", 205);
  text(page, "ORDER SALES BY PAYMENT METHOD", LEFT, 229, 9, true);
  text(page, `Cash: ${pesos(orderPayments.cash)}`, LEFT, 249, 9);
  text(page, `GCash: ${pesos(orderPayments.e_wallet)}`, LEFT, 265, 9);
  text(page, `Card: ${pesos(orderPayments.card)}`, LEFT, 281, 9);
  text(page, `Method not recorded: ${pesos(orderPayments.unrecorded)}`, LEFT, 297, 9);

  text(page, "RECORDED COLLECTIONS AND REFUNDS", 430, 229, 9, true);
  text(page, `Money received: ${pesos(collections.received)}`, 430, 249, 9);
  text(page, `Money returned: ${pesos(collections.returned)}`, 430, 265, 9);
  text(page, `Net cash: ${pesos(collections.cash)}`, 430, 281, 9);
  text(page, `Net GCash: ${pesos(collections.e_wallet)}`, 430, 297, 9);
  text(page, `Net card: ${pesos(collections.card)}`, 430, 313, 9);
  text(page, "Collections use recorded payment events and can differ from order sales. Some older cancelled-order refunds cannot be verified.", 430, 330, 7.5, false, "muted");
  rule(page, 345);

  sectionTitle(page, "TOP ITEMS", 368);
  if (!rankedItems.length) {
    text(page, "No items sold during this period.", LEFT, 392, 9, false, "muted");
  } else {
    rankedItems.forEach(({ name, quantity }, index) => {
      const column = index < 4 ? 0 : 1;
      const row = index % 4;
      const x = column === 0 ? LEFT : 430;
      const y = 392 + row * 20;
      text(page, `${index + 1}. ${truncate(name, 52)}`, x, y, 9);
      text(page, `${quantity} sold`, x + 330, y, 9, true, "green");
    });
  }
  rule(page, 490);
  sectionTitle(page, `ORDER DETAILS  (${orders.length})`, 513);
  text(page, orders.length ? "Each entry shows the order status, payment method, amount, and items." : "No orders were recorded during this period.", LEFT, 532, 8, false, "muted");

  if (orders.length) {
    page = newDetailPage(pages, startDate, endDate);
    let y = 134;
    for (const order of orders) {
      const detailLines = orderDetailLines(order);
      for (let index = 0; index < detailLines.length; index++) {
        if (y + 13 > 550) {
          page = newDetailPage(pages, startDate, endDate);
          y = 134;
        }
        text(page, detailLines[index], LEFT, y, index === 0 ? 9 : 8, index === 0, index === 0 ? "dark" : "muted");
        y += 13;
      }
      if (y + 12 <= 550) rule(page, y - 5, "light");
      y += 12;
    }
  }

  return serializePdf(pages);
}

function newDetailPage(pages: PdfPage[], startDate: string, endDate: string) {
  const page = { commands: [] };
  pages.push(page);
  text(page, "ORDER DETAILS", LEFT, 42, 18, true);
  text(page, dateRangeLabel(startDate, endDate), LEFT, 63, 9, false, "muted");
  rule(page, 78);
  text(page, "Orders are listed in chronological order. Cancelled orders show zero sales and their original amount.", LEFT, 101, 8, false, "muted");
  rule(page, 115, "light");
  return page;
}

function orderDetailLines(order: ExportOrder) {
  const items = order.order_items.length
    ? order.order_items.map((item) => `${item.quantity}x ${item.item_name}${item.note ? ` (${item.note})` : ""}`).join("; ")
    : "No item details";
  const first = `#${order.order_number}  |  ${dateTimeLabel(order.created_at)}  |  ${order.customer_name?.trim() || "No name"}  |  ${order.order_type?.replace("_", " ") || "Legacy order"}`;
  const second = `${order.status.toUpperCase()}  |  ${paymentMethodLabel(order.payment_method)}  |  Total: ${pesos(order.status === "cancelled" ? 0 : order.total_centavos)}${order.status === "cancelled" ? `  |  Original: ${pesos(order.total_centavos)}` : ""}`;
  const itemText = `Items: ${items}`;
  const lines = [first, second, ...wrap(itemText, 132)];
  if (order.cancellation_reason) lines.push(...wrap(`Cancellation reason: ${order.cancellation_reason}`, 132));
  return lines;
}

function serializePdf(pages: PdfPage[]) {
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageRefs = pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ");
  objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((page, index) => {
    const pageObject = 5 + index * 2;
    const contentObject = pageObject + 1;
    const stream = page.commands.join("\n");
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let output = "%PDF-1.4\n%CoffeeShopSalesReport\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = output.length;
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = output.length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(output);
}

function text(page: PdfPage, value: string, x: number, top: number, size: number, bold = false, color: "dark" | "green" | "muted" = "dark") {
  const colors = { dark: "0.16 0.13 0.11", green: "0.24 0.36 0.27", muted: "0.42 0.39 0.36" };
  const y = PAGE_HEIGHT - top;
  page.commands.push(`BT ${colors[color]} rg /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfString(value)}) Tj ET`);
}

function sectionTitle(page: PdfPage, value: string, top: number) {
  text(page, value, LEFT, top, 11, true);
}

function rule(page: PdfPage, top: number, shade: "normal" | "light" = "normal") {
  const gray = shade === "light" ? "0.9" : "0.78";
  const y = PAGE_HEIGHT - top;
  page.commands.push(`q ${gray} G 0.6 w ${LEFT} ${y} m ${RIGHT} ${y} l S Q`);
}

function pdfString(value: string) {
  const safe = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "?");
  return safe.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function wrap(value: string, maxLength: number) {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line ? line.length + 1 : 0) + word.length > maxLength) {
      if (line) lines.push(line);
      line = word.length > maxLength ? `${word.slice(0, maxLength - 3)}...` : word;
    } else {
      line += `${line ? " " : ""}${word}`;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function pesos(centavos: number) {
  return `PHP ${new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(centavos / 100)}`;
}

function paymentMethodLabel(method: string | null) {
  if (method === "e_wallet") return "GCash";
  if (method === "cash") return "Cash";
  if (method === "card") return "Card";
  return "Not recorded";
}

function dateRangeLabel(startDate: string, endDate: string) {
  if (startDate === endDate) return dateLabel(startDate);
  return `${dateLabel(startDate)} to ${dateLabel(endDate)}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${value}T12:00:00+08:00`));
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" }).format(new Date(value));
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

function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
