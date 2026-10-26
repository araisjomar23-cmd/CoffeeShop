import { Suspense } from "react";
import { connection } from "next/server";
import OrderScreen from "@/components/OrderScreen";
import { createClient } from "@/lib/supabase/server";
import { SHOP_NAME } from "@/lib/shop";
import { requireStaffRole } from "@/lib/auth";
import StaffNav from "@/components/StaffNav";
import type { Tables } from "@/types/database";

type MenuItem = Tables<"menu_items">;
type MenuResult = { items: MenuItem[]; popularItemIds: { id: string; quantity: number }[]; errorMessage: string | null };

export default function HomePage() {
  return (
    <Suspense fallback={<MenuLoading />}>
      <AuthorizedHomePage />
    </Suspense>
  );
}

async function AuthorizedHomePage() {
  await connection();
  const role = await requireStaffRole();
  return (
    <main className="min-h-screen bg-steam text-roast">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
        <header className="mb-7 border-b border-roast/10 pb-6 sm:mb-8">
          <h1 className="font-display text-4xl leading-tight text-roast sm:text-5xl">
            {SHOP_NAME}
          </h1>
          <StaffNav current="order" role={role} />
          <p className="mt-2 text-base text-muted">
            Tap a category to browse the menu.
          </p>
        </header>

        <Suspense fallback={<MenuLoading />}>
          <MenuItems />
        </Suspense>
      </div>
    </main>
  );
}

async function MenuItems() {
  const { items, popularItemIds, errorMessage } = await loadMenuItems();

  if (errorMessage) {
    return <MenuError message={errorMessage} />;
  }

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-roast/20 bg-counter p-8 text-center text-roast">
        No menu items yet.
      </p>
    );
  }

  return <OrderScreen items={items} popularItemIds={popularItemIds} />;
}

async function loadMenuItems(): Promise<MenuResult> {
  try {
    const supabase = await createClient();
    const [menuResult, recentOrdersResult] = await Promise.all([
      supabase.from("menu_items").select("*").eq("is_active", true).order("category", { ascending: true }).order("name", { ascending: true }),
      supabase.from("orders").select("order_items(menu_item_id, quantity)").gte("order_date", shiftDate(manilaToday(), -6)).neq("status", "cancelled"),
    ]);

    if (menuResult.error) return { items: [], popularItemIds: [], errorMessage: menuResult.error.message };

    const itemCounts = new Map<string, number>();
    for (const order of recentOrdersResult.data ?? []) {
      for (const orderItem of order.order_items) {
        if (orderItem.menu_item_id) itemCounts.set(orderItem.menu_item_id, (itemCounts.get(orderItem.menu_item_id) ?? 0) + orderItem.quantity);
      }
    }
    const popularItemIds = Array.from(itemCounts, ([id, quantity]) => ({ id, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6);

    return { items: menuResult.data ?? [], popularItemIds, errorMessage: null };
  } catch (error) {
    return {
      items: [],
      popularItemIds: [],
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

function shiftDate(value: string, amount: number) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function MenuError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-error/30 bg-counter p-6 text-error">
      <p className="font-semibold">Couldn&apos;t load the menu. Check your connection and refresh.</p>
      <p className="mt-2 break-words text-sm text-roast/75">{message}</p>
    </div>
  );
}
function MenuLoading() {
  return (
    <p role="status" className="rounded-2xl bg-counter p-6 text-muted">
      Loading menuâ€¦
    </p>
  );
}
