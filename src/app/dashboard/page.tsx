import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import RouteLoading from "@/components/RouteLoading";
import { requireStaffRole } from "@/lib/auth";
import { formatPeso } from "@/lib/money";
import { readAllPages } from "@/lib/read-all-pages";
import { summarizeCollections, summarizeSales } from "@/lib/sales-summary";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import styles from "./dashboard.module.css";

type OrderItem = Tables<"order_items">;
type DashboardOrder = Pick<Tables<"orders">, "id" | "order_date" | "order_number" | "customer_name" | "status" | "total_centavos" | "created_at" | "payment_method"> & {
  order_items: Pick<OrderItem, "item_name" | "quantity">[];
};
type PaymentEvent = { amount_centavos: number; payment_method: string };
type DashboardPeriod = "today" | "this-week" | "last-week" | "this-month" | "custom";
type DashboardQuery = Record<string, string | string[] | undefined>;
type DashboardSearchParams = Promise<DashboardQuery>;
type DateRange = { startDate: string; endDate: string; period: DashboardPeriod };
type TrendPoint = { key: string; label: string; total: number };

export default function DashboardPage({ searchParams }: { searchParams: DashboardSearchParams }) {
  return <Suspense fallback={<RouteLoading screen="sales" title="Dashboard" />}><AuthorizedDashboard searchParams={searchParams} /></Suspense>;
}

async function AuthorizedDashboard({ searchParams }: { searchParams: DashboardSearchParams }) {
  await connection();
  const role = await requireStaffRole(["owner"]);

  return (
    <main className="cafe-shell">
      <PageHeader current="dashboard" role={role} title="Dashboard" description="Sales, order trends, and best sellers across any period." />
      <Suspense fallback={<RouteLoading screen="sales" title="Dashboard" contentOnly />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function DashboardContent({ searchParams }: { searchParams: DashboardSearchParams }) {
  await connection();
  const params = await searchParams;
  const range = getDateRange(params, manilaToday());
  const { startDate, endDate, period } = range;
  const periodLabel = getPeriodLabel(period);
  let orders: DashboardOrder[];
  let paymentEvents: PaymentEvent[];

  try {
    const supabase = await createClient();
    const [dailyOrders, dailyPayments] = await Promise.all([
      readAllPages((from, to) => supabase.from("orders")
        .select("id, order_date, order_number, customer_name, status, total_centavos, created_at, payment_method, order_items(item_name, quantity)")
        .gte("order_date", startDate)
        .lte("order_date", endDate)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)),
      readAllPages((from, to) => supabase.from("order_payment_events")
        .select("amount_centavos, payment_method")
        .gte("created_at", `${startDate}T00:00:00+08:00`)
        .lt("created_at", `${shiftDate(endDate, 1)}T00:00:00+08:00`)
        .order("id")
        .range(from, to)),
    ]);
    orders = dailyOrders as DashboardOrder[];
    paymentEvents = dailyPayments;
  } catch {
    return <p role="alert" className={styles.error}>Could not load the dashboard. Refresh to try again.</p>;
  }

  const { salesOrders, cancelledOrders, salesCentavos, averageCentavos, paymentTotals, rankedItems } = summarizeSales(orders, 5);
  const collections = summarizeCollections(paymentEvents);
  const paymentTotal = paymentTotals.cash + paymentTotals.e_wallet + paymentTotals.card + paymentTotals.unrecorded;
  const statusCounts = {
    new: orders.filter((order) => order.status === "new").length,
    ready: orders.filter((order) => order.status === "ready").length,
    completed: orders.filter((order) => order.status === "completed").length,
    cancelled: cancelledOrders.length,
  };
  const recentOrders = orders.slice(0, 5);
  const dateLabel = formatDateRange(startDate, endDate);
  const trend = buildSalesTrend(salesOrders, startDate, endDate);
  const dailySalesTitle = differenceInDays(startDate, endDate) > 35 ? "Weekly sales trend" : "Sales by day";
  const maxTrendSales = Math.max(0, ...trend.map((point) => point.total));

  return (
    <div className={styles.dashboard}>
      <div className={styles.toolbar}>
        <div><p className={styles.eyebrow}>{periodLabel} snapshot</p><h2 className={styles.date}>{dateLabel}</h2></div>
      </div>

      <section aria-label="Choose sales period" className={styles.rangePanel}>
        <div className={styles.rangeHeading}><h2>Sales period</h2><span>Choose a quick view or set your own dates.</span></div>
        <nav aria-label="Quick sales periods" className={styles.periods}>
          {([
            ["today", "Today"],
            ["this-week", "This week"],
            ["last-week", "Last week"],
            ["this-month", "This month"],
          ] as const).map(([value, label]) => <Link key={value} href={periodHref(value)} aria-current={period === value ? "page" : undefined} className={`${styles.periodLink} ${period === value ? styles.periodActive : ""}`}>{label}</Link>)}
        </nav>
        <form action="/dashboard" method="get" className={styles.rangeForm}>
          <input type="hidden" name="period" value="custom" />
          <label>From<input type="date" name="startDate" required max={manilaToday()} defaultValue={startDate} /></label>
          <label>To<input type="date" name="endDate" required max={manilaToday()} defaultValue={endDate} /></label>
          <button type="submit">Apply range</button>
        </form>
      </section>

      <section aria-label="Key numbers for selected sales period" className={styles.metrics}>
        <Metric label="Order sales" value={formatPeso(salesCentavos)} detail="Non-cancelled orders" featured />
        <Metric label="Orders" value={String(salesOrders.length)} detail={`${statusCounts.new + statusCounts.ready} still in progress`} />
        <Metric label="Average order" value={averageCentavos === null ? "--" : formatPeso(averageCentavos)} detail="Per non-cancelled order" />
        <Metric label="Cancelled" value={String(cancelledOrders.length)} detail="Excluded from sales" alert={cancelledOrders.length > 0} />
      </section>

      <section aria-labelledby="trend-heading" className={styles.panel}>
        <div className={styles.panelHeading}><div><h2 id="trend-heading">{dailySalesTitle}</h2><p>Order sales by date, excluding cancelled orders. Longer ranges are grouped by week.</p></div></div>
        {trend.length ? <div className={styles.trendScroller}><div className={styles.trendChart} role="img" aria-label={`${dailySalesTitle}: ${trend.map((point) => `${point.label}, ${formatPeso(point.total)}`).join("; ")}`}>
          {trend.map((point) => {
            const height = point.total === 0 ? 0 : Math.max(5, Math.round(point.total / maxTrendSales * 100));
            return <div key={point.key} className={styles.trendColumn} title={`${point.label}: ${formatPeso(point.total)}`}>
              <div className={styles.trendTrack}><span className={styles.trendBar} style={{ height: `${height}%` }} /></div>
              <span className={styles.trendLabel}>{point.label}</span>
            </div>;
          })}
        </div></div> : <p className={styles.empty}>No sales for this period yet.</p>}
      </section>

      <section aria-labelledby="flow-heading" className={styles.panel}>
        <div className={styles.panelHeading}><div><h2 id="flow-heading">Order status</h2><p>Current status of orders placed {periodLabel.toLowerCase()}.</p></div><Link href="/kitchen">Open kitchen <span aria-hidden="true">→</span></Link></div>
        <div className={styles.flowGrid}>
          <StatusTile label="New" count={statusCounts.new} tone="new" />
          <StatusTile label="Ready" count={statusCounts.ready} tone="ready" />
          <StatusTile label="Completed" count={statusCounts.completed} tone="completed" />
          <StatusTile label="Cancelled" count={statusCounts.cancelled} tone="cancelled" />
        </div>
      </section>

      <div className={styles.contentGrid}>
        <section aria-labelledby="payments-heading" className={styles.panel}>
          <div className={styles.panelHeading}><div><h2 id="payments-heading">Payments</h2><p>Order totals by recorded payment method for this period.</p></div></div>
          <div className={styles.paymentBar} aria-hidden="true">
            {paymentTotal > 0 && <>
              <span className={styles.cashBar} style={{ width: `${paymentTotals.cash / paymentTotal * 100}%` }} />
              <span className={styles.gcashBar} style={{ width: `${paymentTotals.e_wallet / paymentTotal * 100}%` }} />
              <span className={styles.otherBar} style={{ width: `${(paymentTotals.card + paymentTotals.unrecorded) / paymentTotal * 100}%` }} />
            </>}
          </div>
          <dl className={styles.paymentList}>
            <PaymentRow label="Cash" amount={paymentTotals.cash} />
            <PaymentRow label="GCash" amount={paymentTotals.e_wallet} />
            {paymentTotals.card > 0 && <PaymentRow label="Card" amount={paymentTotals.card} />}
            {paymentTotals.unrecorded > 0 && <PaymentRow label="Method not recorded" amount={paymentTotals.unrecorded} />}
          </dl>
          <div className={styles.collectionBox}>
            <h3>Money recorded {period === "today" ? "today" : "during this period"}</h3>
            <p>Payments and refunds can include orders placed on a different day.</p>
            <dl className={styles.collectionTotals}>
              <PaymentRow label="Received" amount={collections.received} />
              <PaymentRow label="Returned" amount={collections.returned} />
            </dl>
          </div>
        </section>

        <section aria-labelledby="popular-heading" className={styles.panel}>
          <div className={styles.panelHeading}><div><h2 id="popular-heading">Top items</h2><p>Most ordered items {periodLabel.toLowerCase()}.</p></div></div>
          {rankedItems.length ? <ol className={styles.popularList}>{rankedItems.map((item, index) => <li key={item.name}><span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span><span className={styles.itemName}>{item.name}</span><strong>{item.quantity}<small> sold</small></strong></li>)}</ol> : <p className={styles.empty}>No items sold in this period yet.</p>}
          <Link href={`/summary?date=${endDate}`} className={styles.textLink}>View sales for {formatShortDate(endDate)} <span aria-hidden="true">→</span></Link>
        </section>
      </div>

      <section aria-labelledby="recent-heading" className={styles.panel}>
        <div className={styles.panelHeading}><div><h2 id="recent-heading">Recent orders</h2><p>Latest tickets placed {periodLabel.toLowerCase()}.</p></div><Link href="/kitchen">All orders <span aria-hidden="true">→</span></Link></div>
        {recentOrders.length ? <ul className={styles.recentList}>{recentOrders.map((order) => <li key={order.id}>
          <div className={styles.orderIdentity}><strong>#{order.order_number}</strong><span>{order.customer_name?.trim() || "No name"}</span></div>
          <span className={styles.orderTime}>{formatManilaTime(order.created_at)}</span>
          <StatusPill status={order.status} />
          <strong className={`${styles.orderAmount} ${order.status === "cancelled" ? styles.cancelledAmount : ""}`}>{formatPeso(order.status === "cancelled" ? 0 : order.total_centavos)}</strong>
        </li>)}</ul> : <p className={styles.empty}>No orders placed in this period yet.</p>}
      </section>

      <p className={styles.footnote}>Order sales are based on orders placed in the selected period and exclude cancellations. Money recorded reflects payment events logged during that period.</p>
    </div>
  );
}

function Metric({ label, value, detail, featured = false, alert = false }: { label: string; value: string; detail: string; featured?: boolean; alert?: boolean }) {
  return <article className={`${styles.metric} ${featured ? styles.featured : ""}`}><p>{label}</p><strong>{value}</strong><small className={alert ? styles.alert : ""}>{detail}</small></article>;
}

function StatusTile({ label, count, tone }: { label: string; count: number; tone: "new" | "ready" | "completed" | "cancelled" }) {
  return <div className={`${styles.statusTile} ${styles[tone]}`}><span>{label}</span><strong>{count}</strong></div>;
}

function PaymentRow({ label, amount }: { label: string; amount: number }) {
  return <div className={styles.paymentRow}><dt>{label}</dt><dd>{formatPeso(amount)}</dd></div>;
}

function StatusPill({ status }: { status: string }) {
  const knownStatus = ["new", "ready", "completed", "cancelled"].includes(status) ? status as "new" | "ready" | "completed" | "cancelled" : "completed";
  return <span className={`${styles.statusPill} ${styles[knownStatus]}`}>{status}</span>;
}

function formatManilaTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function getDateRange(params: DashboardQuery, today: string): DateRange {
  const period = typeof params.period === "string" ? params.period : "";
  const requestedStart = typeof params.startDate === "string" ? params.startDate : "";
  const requestedEnd = typeof params.endDate === "string" ? params.endDate : "";
  if (period === "custom" || requestedStart || requestedEnd) {
    const startDate = requestedStart;
    const endDate = requestedEnd;
    if (isRealDate(startDate) && isRealDate(endDate) && startDate <= endDate && endDate <= today && differenceInDays(startDate, endDate) <= 365) {
      return { startDate, endDate, period: "custom" };
    }
    return { startDate: today, endDate: today, period: "today" };
  }

  switch (period) {
    case "this-week":
      return { startDate: weekStart(today), endDate: today, period: "this-week" };
    case "last-week": {
      const endDate = shiftDate(weekStart(today), -1);
      return { startDate: shiftDate(endDate, -6), endDate, period: "last-week" };
    }
    case "this-month":
      return { startDate: `${today.slice(0, 7)}-01`, endDate: today, period: "this-month" };
    default:
      return { startDate: today, endDate: today, period: "today" };
  }
}

function getPeriodLabel(period: DashboardPeriod) {
  if (period === "this-week") return "This week";
  if (period === "last-week") return "Last week";
  if (period === "this-month") return "This month";
  if (period === "custom") return "Custom range";
  return "Today";
}

function periodHref(period: Exclude<DashboardPeriod, "custom">) {
  return `/dashboard?period=${period}`;
}

function buildSalesTrend(orders: DashboardOrder[], startDate: string, endDate: string): TrendPoint[] {
  const days = differenceInDays(startDate, endDate);
  const totals = new Map<string, number>();

  if (days <= 35) {
    for (const order of orders) totals.set(order.order_date, (totals.get(order.order_date) ?? 0) + order.total_centavos);
    return Array.from({ length: days }, (_, index) => {
      const key = shiftDate(startDate, index);
      return { key, label: days <= 7 ? weekdayLabel(key) : String(Number(key.slice(-2))), total: totals.get(key) ?? 0 };
    });
  }

  for (const order of orders) {
    const key = weekStart(order.order_date);
    totals.set(key, (totals.get(key) ?? 0) + order.total_centavos);
  }
  const firstWeek = weekStart(startDate);
  const lastWeek = weekStart(endDate);
  const weekCount = Math.floor((Date.parse(`${lastWeek}T00:00:00Z`) - Date.parse(`${firstWeek}T00:00:00Z`)) / 604800000) + 1;
  return Array.from({ length: weekCount }, (_, index) => {
    const key = shiftDate(firstWeek, index * 7);
    return { key, label: formatShortDate(key), total: totals.get(key) ?? 0 };
  });
}

function weekdayLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short" }).format(new Date(`${value}T12:00:00+08:00`));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00+08:00`));
}

function formatDateRange(startDate: string, endDate: string) {
  if (startDate === endDate) {
    return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${startDate}T12:00:00+08:00`));
  }
  return `${formatShortDate(startDate)} - ${new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${endDate}T12:00:00+08:00`))}`;
}

function isRealDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function differenceInDays(startDate: string, endDate: string) {
  return (Date.parse(endDate + "T00:00:00Z") - Date.parse(startDate + "T00:00:00Z")) / 86400000 + 1;
}

function weekStart(value: string) {
  const dayOfWeek = new Date(`${value}T12:00:00Z`).getUTCDay();
  return shiftDate(value, -((dayOfWeek + 6) % 7));
}

function shiftDate(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
