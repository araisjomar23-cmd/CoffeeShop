import { Suspense } from "react";
import { connection } from "next/server";
import OrderScreen from "@/components/OrderScreen";
import { createClient } from "@/lib/supabase/server";
import { SHOP_NAME } from "@/lib/shop";
import { requireStaffRole } from "@/lib/auth";
import StaffNav from "@/components/StaffNav";
import RouteLoading from "@/components/RouteLoading";
import type { Tables } from "@/types/database";

type MenuItem = Tables<"menu_items">;
type MenuResult = { items: MenuItem[]; addons: MenuItem[]; errorMessage: string | null };

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
  const { items, addons, errorMessage } = await loadMenuItems();

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

  return <OrderScreen items={items} addons={addons} />;
}

async function loadMenuItems(): Promise<MenuResult> {
  try {
    const supabase = await createClient();
    const menuResult = await supabase.from("menu_items").select("*").eq("is_active", true).order("category", { ascending: true }).order("name", { ascending: true });

    if (menuResult.error) return { items: [], addons: [], errorMessage: menuResult.error.message };

    const addons = (menuResult.data ?? []).filter((item) => item.category === "Add-ons");
    const items = (menuResult.data ?? []).filter((item) => item.category !== "Add-ons");

    return { items, addons, errorMessage: null };
  } catch (error) {
    return {
      items: [],
      addons: [],
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
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
  return <RouteLoading screen="order" title="New order" />;
}
