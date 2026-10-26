import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatPeso } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

type Order = Tables<"orders">;
type OrderItem = Tables<"order_items">;
type OrderWithItems = Order & { order_items: Pick<OrderItem, "item_name" | "quantity">[] };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SummaryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="min-h-screen bg-steam text-roast">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
        <header className="mb-7 border-b border-roast/10 pb-6 sm:mb-8">
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">Sales summary</h1>
          <nav aria-label="Main navigation" className="mt-5 flex gap-3">
            <Link href="/" className="inline-flex min-h-12 items-center rounded-xl border border-roast/20 bg-counter px-5 font-semibold text-roast hover:border-pistachio focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio">New order</Link>
            <Link aria-current="page" href="/summary" className="inline-flex min-h-12 items-center rounded-xl bg-pistachio px-5 font-semibold text-counter">Sales</Link>
          </nav>
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
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_date, order_number, customer_name, status, total_centavos, created_at, order_items(item_name, quantity)")
      .eq("order_date", date)
      .order("created_at", { ascending: false });

    if (error) throw error;
    orders = (data ?? []) as OrderWithItems[];
  } catch {
    return (
      <p role="alert" className="rounded-2xl border border-error/30 bg-counter p-6 font-semibold text-error">
        Couldn&apos;t load the sales summary. Refresh to try again.
      </p>
    );
  }

  const completedOrders = orders.filter((order) => order.status !== "cancelled");
  const salesCentavos = completedOrders.reduce((sum, order) => sum + order.total_centavos, 0);
  const averageCentavos = completedOrders.length > 0
    ? Math.round(salesCentavos / completedOrders.length)
    : null;
  const bestSellers = new Map<string, number>();
  for (const order of completedOrders) {
    for (const item of order.order_items) {
      bestSellers.set(item.item_name, (bestSellers.get(item.item_name) ?? 0) + item.quantity);
    }
  }
  const rankedItems = Array.from(bestSellers, ([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, 5);

  return (
    <>
      <section aria-label="Date navigation" className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/summary?date=${previousDate}`} className="inline-flex min-h-12 items-center rounded-xl border border-roast/20 bg-counter px-4 font-semibold text-roast hover:border-pistachio focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio">← Previous day</Link>
        <div className="text-center">
          <h2 className="font-display text-2xl sm:text-3xl">{dateLabel}</h2>
          {date !== today && <Link href="/summary" className="inline-flex min-h-12 items-center px-3 text-sm font-semibold text-pistachio underline underline-offset-4">Today</Link>}
        </div>
        <Link href={`/summary?date=${nextDate}`} className="inline-flex min-h-12 items-center rounded-xl border border-roast/20 bg-counter px-4 font-semibold text-roast hover:border-pistachio focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio">Next day →</Link>
      </section>

      <div className="mb-6 flex justify-end">
        <a href={`/summary/export?date=${date}`} className="inline-flex min-h-12 items-center rounded-xl border border-roast/20 bg-counter px-5 font-semibold text-roast hover:border-pistachio focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio">
          Download daily sales CSV
        </a>
      </div>

      <section aria-label="Sales statistics" className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatTile label="Orders" value={String(completedOrders.length)} />
        <StatTile label="Total sales" value={formatPeso(salesCentavos)} valueClassName="text-[#8A5A14]" />
        <StatTile label="Average order" value={averageCentavos === null ? null : formatPeso(averageCentavos)} />
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
                  <tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Time</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Items</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Status</th></tr>
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
      <td className="whitespace-nowrap px-4 py-4 font-semibold">#{order.order_number}</td>
      <td className="whitespace-nowrap px-4 py-4 tabular-nums">{formatManilaTime(order.created_at)}</td>
      <td className="px-4 py-4">{order.customer_name?.trim() || "No name"}</td>
      <td className="px-4 py-4">{summarizeItems(order.order_items)}</td>
      <td className="whitespace-nowrap px-4 py-4 text-right font-semibold tabular-nums">{formatPeso(order.total_centavos)}</td>
      <td className="px-4 py-4"><StatusBadge status={order.status} /></td>
    </tr>
  );
}

function OrderCard({ order }: { order: OrderWithItems }) {
  return (
    <li className="rounded-2xl border border-roast/10 bg-counter p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-display text-xl">Order #{order.order_number}</p><p className="text-sm text-muted">{formatManilaTime(order.created_at)} · {order.customer_name?.trim() || "No name"}</p></div>
        <StatusBadge status={order.status} />
      </div>
      <p className="mt-3 text-sm">{summarizeItems(order.order_items)}</p>
      <p className="mt-3 text-right font-semibold tabular-nums">{formatPeso(order.total_centavos)}</p>
    </li>
  );
}

function StatusBadge({ status }: { status: string }) {
  return <span className="inline-flex min-h-8 items-center rounded-full bg-steam px-3 text-xs font-semibold capitalize text-roast">{status}</span>;
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
  return <p role="status" className="rounded-2xl bg-counter p-6 text-muted">Loading sales summary…</p>;
}
