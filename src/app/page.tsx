import { Suspense } from "react";
import OrderScreen from "@/components/OrderScreen";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SHOP_NAME } from "@/lib/shop";
import type { Tables } from "@/types/database";

type MenuItem = Tables<"menu_items">;
type MenuResult = { items: MenuItem[]; errorMessage: string | null };

export default function HomePage() {
  return (
    <main className="min-h-screen bg-steam text-roast">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
        <header className="mb-7 border-b border-roast/10 pb-6 sm:mb-8">
          <h1 className="font-display text-4xl leading-tight text-roast sm:text-5xl">
            {SHOP_NAME}
          </h1>
          <nav aria-label="Main navigation" className="mt-5 flex gap-3">
            <Link aria-current="page" href="/" className="inline-flex min-h-12 items-center rounded-xl bg-pistachio px-5 font-semibold text-counter">New order</Link>
            <Link href="/summary" className="inline-flex min-h-12 items-center rounded-xl border border-roast/20 bg-counter px-5 font-semibold text-roast hover:border-pistachio focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio">Sales</Link>
          </nav>
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
  const { items, errorMessage } = await loadMenuItems();

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

  return <OrderScreen items={items} />;
}

async function loadMenuItems(): Promise<MenuResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return { items: [], errorMessage: error.message };
    }

    return { items: data, errorMessage: null };
  } catch (error) {
    return {
      items: [],
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
  return (
    <p role="status" className="rounded-2xl bg-counter p-6 text-muted">
      Loading menuâ€¦
    </p>
  );
}
