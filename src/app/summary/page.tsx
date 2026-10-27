import { summarizeCollections, summarizeSales } from "@/lib/sales-summary";
import { readAllPages } from "@/lib/read-all-pages";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatPeso } from "@/lib/money";
import { requireStaffRole } from "@/lib/auth";
import StaffNav from "@/components/StaffNav";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import RouteLoading from "@/components/RouteLoading";

type Order = Tables<"orders">;
type OrderItem = Tables<"order_items">;
type OrderWithItems = Omit<Order, "revision"> & { order_items: Pick<OrderItem, "item_name" | "quantity" | "note">[] };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SummaryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<SummaryLoading />}>
      <AuthorizedSummaryPage searchParams={searchParams} />
    </Suspense>
  );
}

async function AuthorizedSummaryPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const role = await requireStaffRole(["owner"]);
  return (
    <main className="min-h-screen bg-steam text-roast">
      <div className="mx-auto w-full max-w-6xl px-3 py-5 sm:px-6 sm:py-7 lg:py-9">
        <header className="mb-7 border-b border-roast/10 pb-6 sm:mb-8">
          <h1 className="font-display text-3xl leading-tight sm:text-4xl lg:text-5xl">Sales summary</h1>
          <StaffNav current="sales" role={role} />
        </header>
        <Suspense key={(await searchParams).date?.toString() ?? "today"} fallback={<p role="status" className="rounded-2xl bg-counter p-6">Loading sales for this date...</p>}>
          <SummaryContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function SummaryContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const requestedDate = params.date;
  const date = typeof requestedDate === "string" && isRealDate(requestedDate) && requestedDate <= manilaToday()
    ? requestedDate
    : manilaToday();
  const dateLabel = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+08:00`));
  const today = manilaToday();
  const previousDate = shiftDate(date, -1);
  const nextDate = shiftDate(date, 1);

  let orders: OrderWithItems[];
  let paymentEvents: { amount_centavos: number; payment_method: string }[];
  try {
    const supabase = await createClient();
    const [daily, payments] = await Promise.all([
      readAllPages((from, to) => supabase.from("orders")
        .select("id, order_date, order_number, customer_name, status, total_centavos, created_at, order_type, payment_method, cash_received_centavos, change_centavos, cancellation_reason, order_items(item_name, quantity, note)")
        .eq("order_date", date).order("created_at", { ascending: false }).order("id").range(from, to)),
      readAllPages((from, to) => supabase.from("order_payment_events").select("amount_centavos, payment_method")
        .gte("created_at", date + "T00:00:00+08:00").lt("created_at", shiftDate(date, 1) + "T00:00:00+08:00").order("id").range(from, to)),
    ]);
    orders = daily as OrderWithItems[];
    paymentEvents = payments;

  } catch {
    return (
      <p role="alert" className="rounded-2xl border border-error/30 bg-counter p-6 font-semibold text-error">
        Couldn&apos;t load the sales summary. Refresh to try again.
      </p>
    );
  }

  const { salesOrders, cancelledOrders, salesCentavos, averageCentavos, paymentTotals, unrecordedCount, rankedItems } = summarizeSales(orders);
  const collections = summarizeCollections(paymentEvents);

  return (
    <>
      <section aria-label="Date navigation" className="mb-6 rounded-2xl border border-roast/10 bg-counter p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{date === today ? "Today's sales" : "Sales for"}</p><h2 className="mt-1 font-display text-xl sm:text-2xl">{dateLabel}</h2></div>
          <Link href="/summary" className="inline-flex min-h-10 shrink-0 items-center rounded-lg border border-roast/15 px-3 text-sm font-semibold hover:bg-steam">{date === today ? "Refresh" : "Today"}</Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
          <form action="/summary" className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:col-span-1 sm:order-2">
            <label className="min-w-0 text-xs font-semibold text-muted">Choose date<input key={date} type="date" name="date" required max={today} defaultValue={date} className="mt-1 min-h-11 w-full rounded-lg border border-roast/15 bg-steam px-3 text-roast" /></label>
            <button className="min-h-11 rounded-lg bg-pistachio px-4 text-sm font-semibold text-counter hover:bg-pistachio/90">View</button>
          </form>
          <Link href={`/summary?date=${previousDate}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-roast/15 px-2 text-xs font-semibold hover:bg-steam sm:order-1 sm:px-3 sm:text-sm">Previous day</Link>
          {date < today ? <Link href={`/summary?date=${nextDate}`} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-roast/15 px-2 text-xs font-semibold hover:bg-steam sm:order-3 sm:px-3 sm:text-sm">Next day</Link> : <span aria-disabled="true" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-steam px-2 text-xs text-muted sm:order-3 sm:px-3 sm:text-sm">Next day</span>}
        </div>
      </section>
      <section aria-labelledby="at-a-glance-heading" className="mb-6">
        <div className="mb-3"><h2 id="at-a-glance-heading" className="font-display text-xl sm:text-2xl">At a glance</h2><p className="mt-1 text-xs text-muted sm:text-sm">Order totals for {date === today ? "today" : dateLabel}.</p></div>
        <div aria-label="Sales statistics" className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile label="Order sales" value={formatPeso(salesCentavos)} valueClassName="text-counter" featured />
        <StatTile label="Orders (not cancelled)" value={String(salesOrders.length)} />
        <StatTile label="Average order" value={averageCentavos === null ? "--" : formatPeso(averageCentavos)} />
        <StatTile label="Cancelled orders" value={String(cancelledOrders.length)} valueClassName="text-error" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">Includes active orders, even while they are being prepared. Cancelled orders are excluded.</p>
      </section>
      <section aria-labelledby="reports-heading" className="mb-6 rounded-2xl border border-roast/10 bg-counter p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="reports-heading" className="font-display text-xl sm:text-2xl">Reports</h2><p className="mt-1 text-xs text-muted sm:text-sm">Download daily or date-range sales details.</p></div>
          <a href={`/summary/export?date=${date}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pistachio px-4 text-center text-sm font-semibold text-counter hover:bg-pistachio/90 sm:w-auto">Download daily PDF</a>
        </div>
        <form action="/summary/export" method="get" className="grid min-w-0 gap-3 rounded-xl border border-roast/10 bg-steam/50 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-[minmax(0,1fr)_minmax(9rem,auto)_minmax(9rem,auto)_auto] xl:items-end">
          <div className="min-w-0 sm:col-span-2 xl:col-span-1"><h3 className="font-semibold">Export a date range</h3><p className="mt-1 text-xs text-muted sm:text-sm">Download sales and order details for up to one year.</p></div>
          <label className="block min-w-0 text-sm font-semibold">From<input type="date" name="startDate" required defaultValue={date} className="mt-1 min-h-11 w-full rounded-lg border border-roast/20 bg-counter px-3 font-normal" /></label>
          <label className="block min-w-0 text-sm font-semibold">To<input type="date" name="endDate" required defaultValue={date} className="mt-1 min-h-11 w-full rounded-lg border border-roast/20 bg-counter px-3 font-normal" /></label>
          <button className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-roast/10 bg-counter px-4 text-sm font-semibold hover:border-pistachio sm:col-span-2 xl:col-span-1">Download range PDF</button>
        </form>
      </section>
      <section aria-labelledby="payment-summary-heading" className="mb-6">
        <div className="mb-3"><h2 id="payment-summary-heading" className="font-display text-xl sm:text-2xl">Payments</h2><p className="mt-1 text-xs text-muted sm:text-sm">See what orders were marked as paid and what money was recorded.</p></div>
        <div className="grid gap-3 lg:grid-cols-2">
        <article className="min-w-0 rounded-2xl border border-roast/10 bg-counter p-4 sm:p-5">
        <h3 className="font-semibold">Order sales by payment method</h3>
        <p className="mt-1 text-xs text-muted">Based on the payment method saved on each order.</p>
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
          <PaymentTile label="Cash orders" amount={paymentTotals.cash} />
          <PaymentTile label="GCash orders" amount={paymentTotals.e_wallet} />
          {paymentTotals.card > 0 && <PaymentTile label="Card (older orders)" amount={paymentTotals.card} />}
          {unrecordedCount > 0 && <PaymentTile label="Method not recorded" amount={paymentTotals.unrecorded} />}
        </dl>
        {unrecordedCount > 0 && <p className="mt-3 rounded-xl bg-sticky/50 p-3 text-sm">{unrecordedCount} older {unrecordedCount === 1 ? "order has" : "orders have"} no payment method recorded. Their value is included in order sales, but cannot be assigned to cash or GCash.</p>}
        </article>
        <article className="min-w-0 rounded-2xl border border-roast/10 bg-counter p-4 sm:p-5">
          <h3 className="font-semibold">Collections and refunds</h3>
          <p className="mt-1 text-xs text-muted">Actual money movements recorded on {date === today ? "today" : dateLabel}. Refunds for older cancelled orders may be unavailable if they were not recorded at the time.</p>
          {paymentEvents.length === 0 ? <p className="mt-4 rounded-xl bg-steam p-3 text-sm leading-relaxed text-muted">No payment movements recorded for this date. This can differ from order sales, especially for older orders.</p> : <dl className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
            <PaymentTile label="Received" amount={collections.received} />
            <PaymentTile label="Returned" amount={collections.returned} />
            <PaymentTile label="Net cash" amount={collections.cash} />
            <PaymentTile label="Net GCash" amount={collections.e_wallet} />
            {collections.card !== 0 && <PaymentTile label="Net card (older orders)" amount={collections.card} />}
          </dl>}
        </article>
        </div>
      </section>
      <section aria-labelledby="daily-orders-heading" className="mb-6">
        <div className="mb-3"><h2 id="daily-orders-heading" className="font-display text-xl sm:text-2xl">Orders</h2><p className="mt-1 text-xs text-muted sm:text-sm">Order details and current status for this date.</p></div>
        {orders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-roast/20 bg-counter p-8 text-center text-roast">No orders for this day yet.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-2xl border border-roast/10 bg-counter xl:block">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead className="border-b border-roast/15 bg-steam/60 text-sm text-muted">
                  <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Items and notes</th><th className="px-4 py-3 text-right">Total and payment</th><th className="px-4 py-3">Status / actions</th></tr>
                </thead>
                <tbody className="divide-y divide-roast/10">
                  {orders.map((order) => <OrderTableRow key={order.id} order={order} />)}
                </tbody>
              </table>
            </div>
            <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
              {orders.map((order) => <OrderCard key={order.id} order={order} />)}
            </ul>
          </>
        )}
      </section>
      <section aria-labelledby="best-sellers-heading" className="mb-6 rounded-2xl border border-roast/10 bg-counter p-4 sm:p-5">
        <h2 id="best-sellers-heading" className="font-display text-xl sm:text-2xl">Top items</h2>
        <p className="mt-1 text-xs text-muted sm:text-sm">Most ordered items for this date.</p>
      {rankedItems.length === 0 ? (
          <p className="mt-4 text-muted">No items sold.</p>
        ) : (
          <ol className="mt-4 divide-y divide-roast/10">
            {rankedItems.map((item, index) => (
              <li key={item.name} className="flex min-h-12 items-center gap-4 py-2">
                <span className="w-8 font-display text-xl text-muted">{index + 1}</span>
                <span className="flex-1 font-semibold">{item.name}</span>
                <span className="tabular-nums text-muted">{item.quantity} sold</span>
              </li>
            ))}
          </ol>
        )}
      </section>

    </>
  );
}

function PaymentTile({ label, amount }: { label: string; amount: number }) {
  return <div className="min-w-0 rounded-xl border border-roast/5 bg-steam/70 p-3"><dt className="text-xs font-semibold text-muted sm:text-sm">{label}</dt><dd className="mt-1 break-words font-semibold tabular-nums">{formatPeso(amount)}</dd></div>;
}

function StatTile({ label, value, valueClassName = "text-roast", featured = false }: { label: string; value: string | null; valueClassName?: string; featured?: boolean }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-3 sm:p-5 ${featured ? "border-pistachio bg-pistachio text-counter" : "border-roast/10 bg-counter"}`}>
      <p className={`text-xs font-semibold sm:text-sm ${featured ? "text-counter/75" : "text-muted"}`}>{label}</p>
      {value !== null && <p className={`mt-2 break-words font-display text-xl tabular-nums sm:text-3xl ${valueClassName}`}>{value}</p>}
    </div>
  );
}

function OrderTableRow({ order }: { order: OrderWithItems }) {
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-4 font-semibold">#{order.order_number}<span className="mt-1 block text-xs font-normal capitalize text-muted">{order.order_type?.replace("_", " ") ?? "Legacy order"}</span></td>
      <td className="whitespace-nowrap px-4 py-4 tabular-nums">{formatManilaTime(order.created_at)}</td>
      <td className="px-4 py-4">{order.customer_name?.trim() || "No name"}</td>
      <td className="px-4 py-4">{summarizeItems(order.order_items)}{order.order_items.some((item) => item.note) && <ul className="mt-2 space-y-1 text-xs text-muted">{order.order_items.filter((item) => item.note).map((item, index) => <li key={`${item.item_name}-${index}`}>{item.item_name}: {item.note}</li>)}</ul>}</td>
      <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums"><span className="font-semibold">{formatPeso(order.total_centavos)}</span><span className="mt-1 block text-xs text-muted">{paymentLabel(order.payment_method)}{order.cash_received_centavos !== null && ` · received ${formatPeso(order.cash_received_centavos)} · change ${formatPeso(order.change_centavos ?? 0)}`}</span></td>
      <td className="px-4 py-4"><StatusBadge status={order.status} />{order.cancellation_reason && <p className="mt-1 max-w-44 text-xs text-error">Reason: {order.cancellation_reason}</p>}</td>
    </tr>
  );
}

function OrderCard({ order }: { order: OrderWithItems }) {
  return (
    <li className="rounded-2xl border border-roast/10 bg-counter p-4">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-display text-xl">Order #{order.order_number}</p><p className="break-words text-sm capitalize text-muted">{order.order_type?.replace("_", " ") ?? "Legacy order"} · {paymentLabel(order.payment_method)}</p><p className="break-words text-sm text-muted">{formatManilaTime(order.created_at)} · {order.customer_name?.trim() || "No name"}</p></div>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-3 break-words text-sm">{summarizeItems(order.order_items)}</p>
      {order.order_items.some((item) => item.note) && <ul className="mt-2 space-y-1 text-xs text-muted">{order.order_items.filter((item) => item.note).map((item, index) => <li key={`${item.item_name}-${index}`}>{item.item_name}: {item.note}</li>)}</ul>}
      <p className="mt-3 text-right font-semibold tabular-nums">{formatPeso(order.total_centavos)}</p>
      {order.cash_received_centavos !== null && <p className="text-right text-xs text-muted">Received {formatPeso(order.cash_received_centavos)} · change {formatPeso(order.change_centavos ?? 0)}</p>}
      {order.cancellation_reason && <p className="mt-2 text-xs text-error">Cancellation reason: {order.cancellation_reason}</p>}
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className="inline-flex min-h-8 items-center rounded-full bg-steam px-3 text-xs font-semibold capitalize text-roast">{status}</span>;
}

function paymentLabel(method: string | null) {
  if (method === "e_wallet") return "Cashless · GCash";
  return method ? `${method[0].toUpperCase()}${method.slice(1)}` : "Payment not recorded";
}

function summarizeItems(items: OrderWithItems["order_items"]) {
  return items.map((item) => `${item.quantity}× ${item.item_name}`).join(", ");
}

function formatManilaTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function isRealDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function SummaryLoading() {
  return <RouteLoading screen="sales" title="Sales summary" />;
}
