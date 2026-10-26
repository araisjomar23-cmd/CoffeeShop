import { Suspense } from "react";
import { connection } from "next/server";
import StaffNav from "@/components/StaffNav";
import InventoryManager, { type IngredientRow, type MenuItemRow, type MovementRow, type RecipeRow } from "@/components/InventoryManager";
import { requireStaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default function InventoryPage() {
  return <Suspense fallback={<p role="status" className="p-6 text-muted">Loading inventory...</p>}><AuthorizedInventoryPage /></Suspense>;
}

async function AuthorizedInventoryPage() {
  await connection();
  const role = await requireStaffRole(["owner"]);
  let ingredients: IngredientRow[] = [];
  let menuItems: MenuItemRow[] = [];
  let recipes: RecipeRow[] = [];
  let movements: MovementRow[] = [];
  let loadFailed = false;

  try {
    const supabase = await createClient();
    const [ingredientResult, menuResult, recipeResult, movementResult] = await Promise.all([
      supabase.from("ingredients").select("id, name, unit, quantity_on_hand, low_stock_threshold").order("name"),
      supabase.from("menu_items").select("id, name, category").eq("is_active", true).order("name"),
      supabase.from("menu_item_recipes").select("menu_item_id, ingredient_id, quantity_per_item"),
      supabase.from("inventory_movements").select("id, ingredient_id, movement_type, quantity_delta, reason, order_id, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    if (ingredientResult.error || menuResult.error || recipeResult.error || movementResult.error) throw new Error("Inventory query failed.");
    ingredients = (ingredientResult.data ?? []) as IngredientRow[];
    menuItems = (menuResult.data ?? []) as MenuItemRow[];
    movements = (movementResult.data ?? []) as MovementRow[];
    const ingredientById = new Map(ingredients.map((item) => [item.id, item]));
    const menuById = new Map(menuItems.map((item) => [item.id, item]));
    recipes = (recipeResult.data ?? []).flatMap((recipe) => {
      const ingredient = ingredientById.get(recipe.ingredient_id);
      const item = menuById.get(recipe.menu_item_id);
      return ingredient && item ? [{
        menu_item_id: recipe.menu_item_id,
        ingredient_id: recipe.ingredient_id,
        quantity_per_item: recipe.quantity_per_item,
        item_name: item.name,
        ingredient_name: ingredient.name,
        unit: ingredient.unit,
      }] : [];
    });
  } catch {
    loadFailed = true;
  }

  return <main className="min-h-screen bg-steam text-roast"><div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-9">
    <header className="mb-7 border-b border-roast/10 pb-6"><h1 className="font-display text-4xl leading-tight sm:text-5xl">Inventory</h1><StaffNav current="inventory" role={role} /><p className="mt-3 max-w-3xl text-muted">Track ingredients in their base units. Once recipes are configured, completing an order deducts the required stock and records the change.</p></header>
    {loadFailed ? <p role="alert" className="rounded-2xl border border-error/30 bg-counter p-6 font-semibold text-error">Could not load inventory. Refresh to try again.</p> : <>
      <InventoryManager ingredients={ingredients} menuItems={menuItems} recipes={recipes} movements={movements} />
      <form action="/inventory/export" method="get" className="mt-8 rounded-2xl border border-roast/10 bg-counter p-5 sm:flex sm:items-end sm:gap-4">
        <div className="flex-1"><h2 className="font-display text-2xl">Inventory report</h2><p className="mt-1 text-sm text-muted">Export stock changes for a date range with a current-stock snapshot.</p></div>
        <label className="mt-3 block text-sm font-semibold sm:mt-0">From<input type="date" name="startDate" required defaultValue={manilaToday()} className="mt-1 min-h-11 w-full rounded-lg border border-roast/20 bg-steam px-3 font-normal sm:w-auto" /></label>
        <label className="mt-3 block text-sm font-semibold sm:mt-0">To<input type="date" name="endDate" required defaultValue={manilaToday()} className="mt-1 min-h-11 w-full rounded-lg border border-roast/20 bg-steam px-3 font-normal sm:w-auto" /></label>
        <button className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pistachio px-4 font-semibold text-counter sm:mt-0 sm:w-auto">Download inventory CSV</button>
      </form>
    </>}
  </div></main>;
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}
