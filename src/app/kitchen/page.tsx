import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { requireStaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPeso } from "@/lib/money";
import StaffNav from "@/components/StaffNav";
import KitchenOrderActions from "@/components/KitchenOrderActions";
import KitchenQueueRefresh from "@/components/KitchenQueueRefresh";
import CancelOrderForm from "@/components/CancelOrderForm";
import EditActiveOrder from "@/components/EditActiveOrder";
import RouteLoading from "@/components/RouteLoading";
import type { StaffRole } from "@/lib/auth";
import type { Tables } from "@/types/database";

type KitchenOrder = Pick<Tables<"orders">, "id" | "order_number" | "status" | "created_at" | "customer_name" | "order_type" | "total_centavos">
  & { order_items: Pick<Tables<"order_items">, "id" | "item_name" | "unit_price_centavos" | "quantity" | "note">[] };

export default async function KitchenPage() {
  return <Suspense fallback={<RouteLoading screen="kitchen" title="Preparation queue" />}><AuthorizedKitchenPage /></Suspense>;
}

async function AuthorizedKitchenPage() {
  await connection();
  const role = await requireStaffRole();
  const today = manilaToday();
  let orders: KitchenOrder[] = [];
  let loadFailed = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, status, created_at, customer_name, order_type, total_centavos, order_items(id, item_name, unit_price_centavos, quantity, note)")
      .eq("order_date", today)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .order("order_number", { ascending: false });
    if (error) throw error;
    orders = (data ?? []) as KitchenOrder[];
  } catch {
    loadFailed = true;
  }

  const activeOrders = orders.filter((order) => order.status === "new" || order.status === "ready");
  const completedOrders = orders.filter((order) => order.status === "completed");

  return (
    <main className="min-h-screen bg-steam text-roast">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
        <header className="mb-7 border-b border-roast/10 pb-6">
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">Preparation queue</h1>
          <StaffNav current="kitchen" role={role} />
          <div className="mt-4"><KitchenQueueRefresh /></div>
        </header>
        {loadFailed ? (
          <p role="alert" className="rounded-2xl border border-error/30 bg-counter p-6 font-semibold text-error">Could not load the order queue. Refresh to try again.</p>
        ) : (
          <>
            <section aria-labelledby="active-orders-heading">
              <div className="mb-4 flex items-end justify-between gap-3"><div><h2 id="active-orders-heading" className="font-display text-3xl">Active orders</h2><p className="mt-1 text-sm text-muted">{activeOrders.length} waiting or in preparation</p></div><Link href="/" className="inline-flex min-h-12 items-center rounded-xl border border-roast/20 bg-counter px-4 font-semibold">New order</Link></div>
              {activeOrders.length === 0 ? <p className="rounded-2xl border border-dashed border-roast/20 bg-counter p-8 text-center text-muted">No orders waiting for preparation.</p> : <ul className="grid gap-4 lg:grid-cols-2">{activeOrders.map((order) => <KitchenOrderCard key={order.id} order={order} role={role} />)}</ul>}
            </section>
            <section aria-labelledby="completed-orders-heading" className="mt-10">
              <h2 id="completed-orders-heading" className="mb-4 font-display text-2xl">Completed today</h2>
              {completedOrders.length === 0 ? <p className="rounded-2xl border border-dashed border-roast/20 bg-counter p-6 text-muted">No completed orders yet.</p> : <ul className="grid gap-3 lg:grid-cols-2">{completedOrders.map((order) => <KitchenOrderCard key={order.id} order={order} role={role} compact />)}</ul>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function KitchenOrderCard({ order, role, compact = false }: { order: KitchenOrder; role: StaffRole; compact?: boolean }) {
  return (
    <li className={`rounded-2xl border bg-counter p-5 ${order.status === "new" ? "border-caramel/60" : "border-roast/10"}`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-display text-3xl">#{order.order_number}</p><p className="mt-1 text-sm text-muted">{formatTime(order.created_at)} · {order.order_type?.replace("_", " ") ?? "Order"}{order.customer_name?.trim() ? ` · ${order.customer_name.trim()}` : ""}</p></div>
        <span className={`inline-flex min-h-9 items-center rounded-full px-3 text-sm font-bold capitalize ${order.status === "new" ? "bg-sticky" : order.status === "ready" ? "bg-pistachio text-counter" : "bg-steam text-muted"}`}>{order.status}</span>
      </div>
      <ul className="mt-4 divide-y divide-roast/10">{order.order_items.map((item, index) => <li key={`${item.item_name}-${index}`} className="py-3"><p className="font-semibold"><span className="mr-2 text-muted">{item.quantity}×</span>{item.item_name}</p>{item.note && <p className="mt-1 pl-7 text-sm text-muted">Note: {item.note}</p>}</li>)}</ul>
      {!compact && <p className="mt-3 border-t border-roast/10 pt-3 text-right font-semibold tabular-nums">{formatPeso(order.total_centavos)}</p>}
      <KitchenOrderActions orderId={order.id} status={order.status} />
      {!compact && <div className="mt-2 flex flex-wrap items-center gap-4"><EditActiveOrder orderId={order.id} orderNumber={order.order_number} customerName={order.customer_name} orderType={order.order_type === "dine_in" ? "dine_in" : "takeaway"} items={order.order_items.map((item) => ({ id: item.id, name: item.item_name, unitPriceCentavos: item.unit_price_centavos, quantity: item.quantity, note: item.note ?? "" }))} />{role === "owner" && <CancelOrderForm orderId={order.id} />}</div>}
    </li>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
