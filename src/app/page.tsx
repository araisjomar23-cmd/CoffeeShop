import { Suspense } from "react";
import { connection } from "next/server";
import OrderScreen from "@/components/OrderScreen";
import { createClient } from "@/lib/supabase/server";
import { requireStaffRole } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
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
      <div className="cafe-shell cafe-workspace">
        <PageHeader current="order" role={role} title="New order" description="Pick a favorite, add the extras, and make someone's day." />

        <Suspense fallback={<RouteLoading screen="order" title="New order" contentOnly />}>
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
