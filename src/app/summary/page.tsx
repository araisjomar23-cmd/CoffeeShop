import { summarizeCollections, summarizeSales } from "@/lib/sales-summary";
import { readAllPages } from "@/lib/read-all-pages";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatPeso } from "@/lib/money";
import { requireStaffRole } from "@/lib/auth";
import Icon from "@/components/Icon";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import RouteLoading from "@/components/RouteLoading";
import SalesDatePicker from "@/components/SalesDatePicker";
import styles from "./sales.module.css";

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
    <main className={styles.page}>
      <div className={styles.container}>
        <PageHeader current="sales" role={role} title="Sales overview" description="Sales, favorites, and the numbers behind every cup." />
        <Suspense key={(await searchParams).date?.toString() ?? "today"} fallback={<RouteLoading screen="sales" title="Sales overview" contentOnly />}>
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

  const paymentTotal = paymentTotals.cash + paymentTotals.e_wallet + paymentTotals.card + paymentTotals.unrecorded;
  return (
    <>
      <section aria-label="Date navigation" className={styles.toolbar}>
        <div><p className={styles.eyebrow}>{date === today ? "Today's sales" : "Sales for"}</p><h2 className={styles.dateTitle}>{dateLabel}</h2></div>
        <div className={styles.dateActions}>
          <Link aria-label="Previous day" href={`/summary?date=${previousDate}`} className={styles.dateArrow}><Icon name="left" /></Link>
          <SalesDatePicker date={date} today={today} />
          {date < today ? <Link aria-label="Next day" href={`/summary?date=${nextDate}`} className={styles.dateArrow}><Icon name="right" /></Link> : <span aria-label="Next day" aria-disabled="true" className={styles.dateArrow}><Icon name="right" /></span>}
          <a href={`/summary/export?date=${date}`} className={styles.download}><Icon name="download" />Download PDF</a>
        </div>
      </section>
      <section aria-label="Sales statistics" className={styles.stats}>
        <StatTile label="Order sales" value={formatPeso(salesCentavos)} featured />
        <StatTile label="Orders" value={String(salesOrders.length)} />
        <StatTile label="Average order" value={averageCentavos === null ? "--" : formatPeso(averageCentavos)} />
        <StatTile label="Cancelled" value={String(cancelledOrders.length)} cancelled />
      </section>
      <div className={styles.overview}>
        <section aria-labelledby="payments-heading" className={styles.panel}>
          <h2 id="payments-heading">Payments</h2>
          <div className={styles.paymentBar} aria-hidden="true">
            {paymentTotal > 0 && <>
              <span style={{ width: `${paymentTotals.cash / paymentTotal * 100}%`, background: "#304d3e" }} />
              <span style={{ width: `${paymentTotals.e_wallet / paymentTotal * 100}%`, background: "#c77d27" }} />
              <span style={{ width: `${(paymentTotals.card + paymentTotals.unrecorded) / paymentTotal * 100}%`, background: "#a4aaa4" }} />
            </>}
          </div>
          <dl className={styles.paymentAmounts}>
            <PaymentTile label="Cash" amount={paymentTotals.cash} />
            <PaymentTile label="GCash" amount={paymentTotals.e_wallet} />
            {paymentTotals.card > 0 && <PaymentTile label="Card" amount={paymentTotals.card} />}
            {unrecordedCount > 0 && <PaymentTile label="Method not recorded" amount={paymentTotals.unrecorded} />}
          </dl>
          <p className={styles.refunds}>{date === today ? "Refunds today:" : "Refunds this day:"} <strong>{formatPeso(collections.returned)}</strong></p>
          <details className={styles.extraDetails}>
            <summary>Collection details</summary>
            <p>Payment totals above include active orders and exclude cancelled orders.</p>
            {unrecordedCount > 0 && <p>{unrecordedCount} older orders have no payment method recorded.</p>}
            {paymentEvents.length === 0 ? <p>No payment movements recorded for this date.</p> : <dl className={styles.paymentAmounts}>
              <PaymentTile label="Received" amount={collections.received} />
              <PaymentTile label="Returned" amount={collections.returned} />
              <PaymentTile label="Net cash" amount={collections.cash} />
              <PaymentTile label="Net GCash" amount={collections.e_wallet} />
              {collections.card !== 0 && <PaymentTile label="Net card" amount={collections.card} />}
            </dl>}
            <p>Collections reflect money movements on this date. Refunds for older cancelled orders may be unavailable if they were not recorded at the time.</p>
          </details>
        </section>
        <section aria-labelledby="top-items-heading" className={styles.panel}>
          <h2 id="top-items-heading">Top items</h2>
          {rankedItems.length === 0 ? <p className={styles.empty}>No items sold.</p> : <ol className={styles.topItems}>
            {rankedItems.map((item, index) => <li key={item.name}><span>{index + 1}. {item.name}</span><strong>{item.quantity}</strong></li>)}
          </ol>}
        </section>
      </div>
      <section aria-labelledby="orders-heading" className={`${styles.panel} ${styles.orders}`}>
        <div className={styles.panelHeading}><h2 id="orders-heading">Orders</h2><span>Newest first</span></div>
        {orders.length === 0 ? <p className={styles.empty}>No orders for this day yet.</p> : <ul className={styles.orderList}>
          {orders.map((order) => <li key={order.id}>
            <details>
              <summary className={styles.orderSummary}>
                <span className={styles.orderNumber}>#{String(order.order_number).padStart(3, "0")}</span>
                <span className={styles.itemSummary}>{summarizeItems(order.order_items)}</span>
                <StatusBadge status={order.status} />
                <span className={`${styles.orderTotal} ${order.status === "cancelled" ? styles.cancelledTotal : ""}`}>{formatPeso(order.total_centavos)}</span>
              </summary>
              <OrderCard order={order} />
            </details>
          </li>)}
        </ul>}
      </section>
      <details className={`${styles.panel} ${styles.rangeExport}`}>
        <summary>Export a date range</summary>
        <form action="/summary/export" method="get" className={styles.rangeForm}>
          <label>From<input type="date" name="startDate" required defaultValue={date} max={today} /></label>
          <label>To<input type="date" name="endDate" required defaultValue={date} max={today} /></label>
          <button className={styles.download}><Icon name="download" />Download range PDF</button>
        </form>
        <p className={styles.eyebrow}>Download sales and order details for up to one year.</p>
      </details>
    </>
  );
}

function PaymentTile({ label, amount }: { label: string; amount: number }) {
  return <div><dt>{label}</dt><dd>{formatPeso(amount)}</dd></div>;
}

function StatTile({ label, value, featured = false, cancelled = false }: { label: string; value: string; featured?: boolean; cancelled?: boolean }) {
  return <div className={`${styles.stat} ${featured ? styles.featured : ""}`}>
    <p>{label}</p><strong className={cancelled ? styles.cancelledValue : undefined}>{value}</strong>
    {featured && <small>Includes orders still being prepared</small>}
  </div>;
}
function OrderCard({ order }: { order: OrderWithItems }) {
  return (
    <div className="rounded-xl bg-steam/50 p-4">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-display text-xl">Order #{order.order_number}</p><p className="break-words text-sm capitalize text-muted">{order.order_type?.replace("_", " ") ?? "Legacy order"} · {paymentLabel(order.payment_method)}</p><p className="break-words text-sm text-muted">{formatManilaTime(order.created_at)} · {order.customer_name?.trim() || "No name"}</p></div>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-3 break-words text-sm">{summarizeItems(order.order_items)}</p>
      {order.order_items.some((item) => item.note) && <ul className="mt-2 space-y-1 text-xs text-muted">{order.order_items.filter((item) => item.note).map((item, index) => <li key={`${item.item_name}-${index}`}>{item.item_name}: {item.note}</li>)}</ul>}
      <p className="mt-3 text-right font-semibold tabular-nums">{formatPeso(order.total_centavos)}</p>
      {order.cash_received_centavos !== null && <p className="text-right text-xs text-muted">Received {formatPeso(order.cash_received_centavos)} · change {formatPeso(order.change_centavos ?? 0)}</p>}
      {order.cancellation_reason && <p className="mt-2 text-xs text-error">Cancellation reason: {order.cancellation_reason}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`${styles.badge} ${status === "cancelled" ? styles.cancelledBadge : status === "completed" ? styles.completedBadge : styles.preparingBadge}`}>{status === "new" ? "Preparing" : status.replaceAll("_", " ")}</span>;
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
