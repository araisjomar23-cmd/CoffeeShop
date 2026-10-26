import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatPeso } from "@/lib/money";
import { requireStaffRole } from "@/lib/auth";
import StaffNav from "@/components/StaffNav";
import CancelOrderForm from "@/components/CancelOrderForm";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import RouteLoading from "@/components/RouteLoading";

type Order = Tables<"orders">;
type OrderItem = Tables<"order_items">;
type OrderWithItems = Order & { order_items: Pick<OrderItem, "item_name" | "quantity" | "note">[] };
type WeeklyOrder = { order_items: Pick<OrderItem, "item_name" | "quantity">[] };
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
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
        <header className="mb-7 border-b border-roast/10 pb-6 sm:mb-8">
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">Sales summary</h1>
          <StaffNav current="sales" role={role} />
        </header>
        <Suspense fallback={<SummaryLoading />}>
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
  const date = typeof requestedDate === "string" && isRealDate(requestedDate)
    ? requestedDate
    : manilaToday();
  const dateLabel = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00+08:00`));
  const today = manilaToday();
  const previousDate = shiftDate(date, -1);
  const nextDate = shiftDate(date, 1);

  let orders: OrderWithItems[];
  let weeklyOrders: WeeklyOrder[];
  try {
    const supabase = await createClient();
    const [dailyResult, weeklyResult] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_date, order_number, customer_name, status, total_centavos, created_at, order_type, payment_method, cash_received_centavos, change_centavos, cancellation_reason, order_items(item_name, quantity, note)")
        .eq("order_date", date)
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("order_items(item_name, quantity)")
        .gte("order_date", shiftDate(today, -6))
        .lte("order_date", today)
        .neq("status", "cancelled"),
    ]);

    if (dailyResult.error) throw dailyResult.error;
    if (weeklyResult.error) throw weeklyResult.error;
    orders = (dailyResult.data ?? []) as OrderWithItems[];
    weeklyOrders = (weeklyResult.data ?? []) as WeeklyOrder[];
  } catch {
    return (
      <p role="alert" className="rounded-2xl border border-error/30 bg-counter p-6 font-semibold text-error">
        Couldn&apos;t load the sales summary. Refresh to try again.
      </p>
    );
  }

  const salesOrders = orders.filter((order) => order.status !== "cancelled");
  const cancelledOrders = orders.filter((order) => order.status === "cancelled");
  const salesCentavos = salesOrders.reduce((sum, order) => sum + order.total_centavos, 0);
  const averageCentavos = salesOrders.length > 0
    ? Math.round(salesCentavos / salesOrders.length)
    : null;
  const paymentTotals = { cash: 0, card: 0, e_wallet: 0, unrecorded: 0 };
  for (const order of salesOrders) {
    if (order.payment_method === "cash") paymentTotals.cash += order.total_centavos;
    else if (order.payment_method === "card") paymentTotals.card += order.total_centavos;
    else if (order.payment_method === "e_wallet") paymentTotals.e_wallet += order.total_centavos;
    else paymentTotals.unrecorded += order.total_centavos;
  }
  const bestSellers = new Map<string, number>();
  for (const order of salesOrders) {
    for (const item of order.order_items) {
      bestSellers.set(item.item_name, (bestSellers.get(item.item_name) ?? 0) + item.quantity);
    }
  }
  const rankedItems = Array.from(bestSellers, ([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, 5);
  const weeklyBestSellers = new Map<string, number>();
  for (const order of weeklyOrders) {
    for (const item of order.order_items) {
      weeklyBestSellers.set(item.item_name, (weeklyBestSellers.get(item.item_name) ?? 0) + item.quantity);
    }
  }
  const weeklyRankedItems = Array.from(weeklyBestSellers, ([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, 6);

  return (
    <>
      <section aria-label="Date navigation" className="mb-6 grid grid-cols-2 items-center gap-3 sm:flex sm:justify-between">
        <div className="col-span-2 row-start-1 text-center sm:col-span-1 sm:row-auto">
          <h2 className="font-display text-2xl sm:text-3xl">{dateLabel}</h2>
          {date !== today && <Link href="/summary" className="inline-flex min-h-12 items-center px-3 text-sm font-semibold text-pistachio underline underline-offset-4">Today</Link>}
        </div>
        <Link href={`/summary?date=${previousDate}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-roast/20 bg-counter px-2 text-sm font-semibold text-roast hover:border-pistachio focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio sm:px-4 sm:text-base"><span className="sm:hidden">← Previous</span><span className="hidden sm:inline">← Previous day</span></Link>
        <Link href={`/summary?date=${nextDate}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-roast/20 bg-counter px-2 text-sm font-semibold text-roast hover:border-pistachio focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio sm:px-4 sm:text-base"><span className="sm:hidden">Next →</span><span className="hidden sm:inline">Next day →</span></Link>
      </section>

      <div className="mb-6 flex justify-stretch sm:justify-end">
        <a href={`/summary/export?date=${date}`} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-roast/20 bg-counter px-5 text-center font-semibold text-roast hover:border-pistachio focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio sm:w-auto">
          Download daily sales CSV
        </a>
      </div>

      <form action="/summary/export" method="get" className="mb-6 rounded-2xl border border-roast/10 bg-counter p-4 sm:flex sm:items-end sm:gap-4">
        <div className="flex-1"><h2 className="font-semibold">Export a date range</h2><p className="mt-1 text-sm text-muted">Download sales and order details for up to one year.</p></div>
        <label className="mt-3 block text-sm font-semibold sm:mt-0">From<input type="date" name="startDate" required defaultValue={date} className="mt-1 min-h-11 w-full rounded-lg border border-roast/20 bg-steam px-3 font-normal sm:w-auto" /></label>
        <label className="mt-3 block text-sm font-semibold sm:mt-0">To<input type="date" name="endDate" required defaultValue={date} className="mt-1 min-h-11 w-full rounded-lg border border-roast/20 bg-steam px-3 font-normal sm:w-auto" /></label>
        <button className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pistachio px-4 font-semibold text-counter sm:mt-0 sm:w-auto">Download range CSV</button>
      </form>

      <section aria-label="Sales statistics" className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Orders" value={String(salesOrders.length)} />
        <StatTile label="Cancelled" value={String(cancelledOrders.length)} valueClassName="text-error" />
        <StatTile label="Total sales" value={formatPeso(salesCentavos)} valueClassName="text-[#8A5A14]" />
        <StatTile label="Average order" value={averageCentavos === null ? null : formatPeso(averageCentavos)} />
        <StatTile label="Expected cash" value={paymentTotals.unrecorded === 0 ? formatPeso(paymentTotals.cash) : "Unavailable"} />
      </section>

      <section aria-labelledby="payment-summary-heading" className="mb-8 rounded-2xl border border-roast/10 bg-counter p-5 sm:p-6">
        <h2 id="payment-summary-heading" className="font-display text-2xl">Sales by payment method</h2>
        {paymentTotals.unrecorded > 0 && <p className="mt-2 rounded-xl border border-caramel/30 bg-sticky/50 p-3 text-sm">{formatPeso(paymentTotals.unrecorded)} across {salesOrders.filter((order) => !order.payment_method).length} orders has no payment method recorded, so expected cash is unavailable.</p>}
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PaymentTile label="Cash" amount={paymentTotals.cash} />
          <PaymentTile label="Card" amount={paymentTotals.card} />
          <PaymentTile label="Cashless (GCash)" amount={paymentTotals.e_wallet} />
          <PaymentTile label="Unrecorded" amount={paymentTotals.unrecorded} />
        </dl>
      </section>

      <section aria-labelledby="popular-week-heading" className="mb-8 rounded-2xl border border-roast/10 bg-counter p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="popular-week-heading" className="font-display text-2xl">Popular this week</h2>
          <p className="text-sm text-muted">Based on the last 7 days</p>
        </div>
        {weeklyRankedItems.length === 0 ? (
          <p className="mt-4 text-muted">No items sold in the last 7 days.</p>
        ) : (
          <ol className="mt-4 divide-y divide-roast/10">
            {weeklyRankedItems.map((item, index) => (
              <li key={item.name} className="flex min-h-12 items-center gap-4 py-2">
                <span className="w-8 font-display text-xl text-muted">{index + 1}</span>
                <span className="flex-1 font-semibold">{item.name}</span>
                <span className="tabular-nums text-muted">{item.quantity} sold</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="best-sellers-heading" className="mb-8 rounded-2xl border border-roast/10 bg-counter p-5 sm:p-6">
        <h2 id="best-sellers-heading" className="font-display text-2xl">Best sellers</h2>
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

      <section aria-labelledby="daily-orders-heading">
        <h2 id="daily-orders-heading" className="mb-4 font-display text-2xl">Orders</h2>
        {orders.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-roast/20 bg-counter p-8 text-center text-roast">No orders for this day yet.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-2xl border border-roast/10 bg-counter md:block">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead className="border-b border-roast/15 bg-steam/60 text-sm text-muted">
                  <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Items and notes</th><th className="px-4 py-3 text-right">Total and payment</th><th className="px-4 py-3">Status / actions</th></tr>
                </thead>
                <tbody className="divide-y divide-roast/10">
                  {orders.map((order) => <OrderTableRow key={order.id} order={order} />)}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 md:hidden">
              {orders.map((order) => <OrderCard key={order.id} order={order} />)}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

function PaymentTile({ label, amount }: { label: string; amount: number }) {
  return <div className="rounded-xl bg-steam/70 p-3"><dt className="text-sm font-semibold text-muted">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{formatPeso(amount)}</dd></div>;
}

function StatTile({ label, value, valueClassName = "text-roast" }: { label: string; value: string | null; valueClassName?: string }) {
  return (
    <div className="rounded-2xl border border-roast/10 bg-counter p-5">
      <p className="text-sm font-semibold text-muted">{label}</p>
      {value !== null && <p className={`mt-2 font-display text-3xl tabular-nums sm:text-4xl ${valueClassName}`}>{value}</p>}
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
      <td className="px-4 py-4"><StatusBadge status={order.status} />{order.cancellation_reason && <p className="mt-1 max-w-44 text-xs text-error">Reason: {order.cancellation_reason}</p>}{order.status !== "cancelled" && <CancelOrderForm orderId={order.id} />}</td>
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
      <p className="mt-3 text-sm">{summarizeItems(order.order_items)}</p>
      {order.order_items.some((item) => item.note) && <ul className="mt-2 space-y-1 text-xs text-muted">{order.order_items.filter((item) => item.note).map((item, index) => <li key={`${item.item_name}-${index}`}>{item.item_name}: {item.note}</li>)}</ul>}
      <p className="mt-3 text-right font-semibold tabular-nums">{formatPeso(order.total_centavos)}</p>
      {order.cash_received_centavos !== null && <p className="text-right text-xs text-muted">Received {formatPeso(order.cash_received_centavos)} · change {formatPeso(order.change_centavos ?? 0)}</p>}
      {order.cancellation_reason && <p className="mt-2 text-xs text-error">Cancellation reason: {order.cancellation_reason}</p>}
      {order.status !== "cancelled" && <CancelOrderForm orderId={order.id} />}
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
