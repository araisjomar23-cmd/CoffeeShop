import { readAllPages } from "@/lib/read-all-pages";
import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { requireStaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPeso } from "@/lib/money";
import PageHeader from "@/components/PageHeader";
import KitchenOrderActions from "@/components/KitchenOrderActions";
import KitchenQueueRefresh from "@/components/KitchenQueueRefresh";
import CancelOrderForm from "@/components/CancelOrderForm";
import EditActiveOrder from "@/components/EditActiveOrder";
import RouteLoading from "@/components/RouteLoading";
import type { StaffRole } from "@/lib/auth";
import type { Tables } from "@/types/database";

type KitchenOrder = Pick<Tables<"orders">, "revision" | "payment_method" | "id" | "order_number" | "status" | "created_at" | "customer_name" | "order_type" | "total_centavos">
  & { order_items: Pick<Tables<"order_items">, "id" | "item_name" | "unit_price_centavos" | "quantity" | "note">[] };
type MenuOption = Pick<Tables<"menu_items">, "id" | "name" | "category" | "price_centavos">;

type KitchenSearchParams = Promise<{ view?: string | string[] }>;

export default function KitchenPage({ searchParams }: { searchParams: KitchenSearchParams }) {
  return <Suspense fallback={<RouteLoading screen="kitchen" title="Orders" />}><AuthorizedKitchenPage searchParams={searchParams} /></Suspense>;
}

async function AuthorizedKitchenPage({ searchParams }: { searchParams: KitchenSearchParams }) {
  await connection();
  const role = await requireStaffRole();
  const today = manilaToday();
  let orders: KitchenOrder[] = [];
  let menuItems: MenuOption[] = [];
  let addons: MenuOption[] = [];
  let loadFailed = false;
  try {
    const supabase = await createClient();
    const [ordersResult, menuResult] = await Promise.all([
      readAllPages((from, to) => supabase.from("orders")
        .select("revision, payment_method, id, order_number, status, created_at, customer_name, order_type, total_centavos, order_items(id, item_name, unit_price_centavos, quantity, note)")
        .or(`status.in.(new,ready),order_date.eq.${today}`)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .order("order_number", { ascending: false }).order("id").range(from, to)),
      supabase.from("menu_items").select("id, name, category, price_centavos").eq("is_active", true).order("category").order("name"),
    ]);
    if (menuResult.error) throw menuResult.error;
    orders = ordersResult as KitchenOrder[];
    addons = (menuResult.data ?? []).filter((item) => item.category === "Add-ons");
    menuItems = (menuResult.data ?? []).filter((item) => item.category !== "Add-ons");
  } catch {
    loadFailed = true;
  }

  const requestedView = (await searchParams).view;
  const view = requestedView === "ready" || requestedView === "completed" ? requestedView : "new";
  const preparingOrders = orders.filter((order) => order.status === "new");
  const readyOrders = orders.filter((order) => order.status === "ready");
  const completedOrders = orders.filter((order) => order.status === "completed");
  const visibleOrders = view === "ready" ? readyOrders : view === "completed" ? completedOrders : preparingOrders;
  const viewLabel = view === "ready" ? "Ready to serve" : view === "completed" ? "Completed today" : "In preparation";

  return (
    <main className="min-h-screen bg-steam text-roast">
      <div className="cafe-shell">
        <PageHeader current="kitchen" role={role} title="Orders" description="From the first pour to the final pickup. Keep your counter moving." />
        <div className="cafe-queue-tools">
          <nav aria-label="Order status" className="cafe-queue-tabs">
            <Link className="cafe-queue-tab" aria-current={view === "new" ? "page" : undefined} href="/kitchen">Preparing <span>{preparingOrders.length}</span></Link>
            <Link className="cafe-queue-tab" aria-current={view === "ready" ? "page" : undefined} href="/kitchen?view=ready">Ready <span>{readyOrders.length}</span></Link>
            <Link className="cafe-queue-tab" aria-current={view === "completed" ? "page" : undefined} href="/kitchen?view=completed">Completed <span>{completedOrders.length}</span></Link>
          </nav>
          <div><KitchenQueueRefresh /></div>
        </div>
        {loadFailed ? (
          <p role="alert" className="rounded-2xl border border-error/30 bg-counter p-6 font-semibold text-error">Could not load the order queue. Refresh to try again.</p>
        ) : (
          <>
            <section aria-labelledby="queue-heading">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 id="queue-heading" className="text-xl font-semibold">{viewLabel}</h2><p className="mt-1 text-sm text-muted">{visibleOrders.length} {visibleOrders.length === 1 ? "order" : "orders"}{view === "new" ? " to make" : view === "ready" ? " waiting for pickup" : " served today"}</p></div><Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-roast/15 bg-counter px-4 text-sm font-semibold">+ New order</Link></div>
              {visibleOrders.length === 0 ? <div className="rounded-2xl border border-dashed border-roast/15 bg-counter px-6 py-16 text-center"><p className="font-display text-2xl">{view === "new" ? "A moment to catch your breath." : view === "ready" ? "Nothing waiting at the counter." : "A fresh day ahead."}</p><p className="mt-3 text-sm text-muted">{view === "new" ? "New orders will appear here when they are placed." : view === "ready" ? "Mark an order ready when it is prepared." : "Completed orders for today will appear here."}</p></div> : <ul className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleOrders.map((order) => <KitchenOrderCard key={order.id} order={order} role={role} menuItems={menuItems} addons={addons} compact={view === "completed"} />)}</ul>}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function KitchenOrderCard({ order, role, menuItems, addons, compact = false }: { order: KitchenOrder; role: StaffRole; menuItems: MenuOption[]; addons: MenuOption[]; compact?: boolean }) {
  return (
    <li data-status={order.status} className="cafe-order-card min-w-0 rounded-2xl border bg-counter p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 break-words"><p className="font-sans font-semibold text-3xl">#{order.order_number}</p><p className="mt-1 text-sm text-muted">{formatTime(order.created_at)} · {order.order_type?.replace("_", " ") ?? "Order"}{order.customer_name?.trim() ? ` · ${order.customer_name.trim()}` : ""}</p></div>
        <span className={`inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-sm font-semibold capitalize ${order.status === "new" ? "bg-sticky text-roast" : order.status === "ready" ? "bg-pistachio/10 text-pistachio" : "bg-steam text-muted"}`}>{order.status === "new" ? "Preparing" : order.status}</span>
      </div>
      <ul className="mt-4 divide-y divide-roast/10">{order.order_items.map((item, index) => <li key={`${item.item_name}-${index}`} className="py-3"><p className="break-words font-semibold"><span className="mr-2 text-muted">{item.quantity}×</span>{item.item_name}</p>{item.note && <p className="mt-1 break-words pl-7 text-sm text-muted">Note: {item.note}</p>}</li>)}</ul>
      {!compact && <p className="mt-3 border-t border-roast/10 pt-3 text-right font-semibold tabular-nums">{formatPeso(order.total_centavos)}</p>}
      <KitchenOrderActions orderId={order.id} status={order.status} />
      {!compact && <div className="mt-2 flex flex-wrap items-center gap-4"><EditActiveOrder orderId={order.id} orderNumber={order.order_number} revision={order.revision} originalTotal={order.total_centavos} paymentMethod={order.payment_method} customerName={order.customer_name} orderType={order.order_type === "dine_in" ? "dine_in" : "takeaway"} items={order.order_items.map((item) => ({ id: item.id, name: item.item_name, unitPriceCentavos: item.unit_price_centavos, quantity: item.quantity, note: item.note ?? "" }))} menuItems={menuItems} addons={addons} />{role === "owner" && <CancelOrderForm orderId={order.id} revision={order.revision} totalCentavos={order.total_centavos} paymentMethod={order.payment_method} />}</div>}
    </li>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
