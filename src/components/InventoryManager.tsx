"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createIngredient, recordInventoryMovement, removeMenuItemRecipe, setMenuItemRecipe } from "@/app/inventory/actions";

export type IngredientRow = { id: string; name: string; unit: string; quantity_on_hand: number; low_stock_threshold: number };
export type MenuItemRow = { id: string; name: string; category: string };
export type RecipeRow = { menu_item_id: string; ingredient_id: string; quantity_per_item: number; item_name: string; ingredient_name: string; unit: string };
export type MovementRow = { id: string; ingredient_id: string; movement_type: string; quantity_delta: number; reason: string; order_id: string | null; created_at: string };

export default function InventoryManager({ ingredients, menuItems, recipes, movements }: {
  ingredients: IngredientRow[];
  menuItems: MenuItemRow[];
  recipes: RecipeRow[];
  movements: MovementRow[];
}) {
  const router = useRouter();
  const lowStock = ingredients.filter((item) => item.quantity_on_hand <= item.low_stock_threshold);
  const recipeMenuIds = new Set(recipes.map((recipe) => recipe.menu_item_id));
  const unconfiguredMenu = menuItems.filter((item) => !recipeMenuIds.has(item.id));
  return <div className="space-y-8">
    <section className="rounded-2xl border border-roast/10 bg-counter p-5 sm:p-6">
      <h2 className="font-display text-2xl">Stock overview</h2>
      {lowStock.length > 0 && <div role="status" className="mt-4 rounded-xl border border-error/30 bg-error/5 p-4 text-sm text-error"><strong>Low stock:</strong> {lowStock.map((item) => item.name).join(", ")}</div>}
      {ingredients.length === 0 ? <p className="mt-4 text-muted">No ingredients yet. Add them below using the shop&apos;s actual units and starting quantities.</p> : <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ingredients.map((ingredient) => <li key={ingredient.id} className="min-w-0 rounded-xl border border-roast/10 bg-steam/60 p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{ingredient.name}</p><p className="mt-1 text-sm text-muted">Alert at {quantity(ingredient.low_stock_threshold)} {ingredient.unit}</p></div>{ingredient.quantity_on_hand <= ingredient.low_stock_threshold && <span className="rounded-full bg-error/10 px-3 py-1 text-xs font-bold text-error">Low</span>}</div>
        <p className="mt-3 font-display text-3xl tabular-nums">{quantity(ingredient.quantity_on_hand)} <span className="font-sans text-base">{ingredient.unit}</span></p>
        <MovementForm ingredient={ingredient} onDone={() => router.refresh()} />
      </li>)}</ul>}
    </section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-roast/10 bg-counter p-5 sm:p-6"><h2 className="font-display text-2xl">Add an ingredient</h2><p className="mt-1 text-sm text-muted">Use grams (g), milliliters (ml), or individual items (each).</p><IngredientForm onDone={() => router.refresh()} /></section>
      <section className="rounded-2xl border border-roast/10 bg-counter p-5 sm:p-6">
        <h2 className="font-display text-2xl">Menu recipes</h2><p className="mt-1 text-sm text-muted">Set how much of each ingredient one menu item uses. Saving a pair updates its amount.</p>
        {menuItems.length === 0 || ingredients.length === 0 ? <p className="mt-4 rounded-xl bg-steam p-4 text-sm text-muted">Add ingredients and active menu items before setting recipes.</p> : <RecipeForm menuItems={menuItems} ingredients={ingredients} onDone={() => router.refresh()} />}
        {recipes.length > 0 && <ul className="mt-4 divide-y divide-roast/10">{recipes.map((recipe) => <li key={recipe.menu_item_id + "-" + recipe.ingredient_id} className="flex items-center justify-between gap-3 py-3"><p className="text-sm"><strong>{recipe.item_name}</strong><span className="text-muted"> uses {quantity(recipe.quantity_per_item)} {recipe.unit} {recipe.ingredient_name}</span></p><RemoveRecipeButton recipe={recipe} onDone={() => router.refresh()} /></li>)}</ul>}
        {unconfiguredMenu.length > 0 && <p className="mt-4 rounded-xl border border-caramel/30 bg-sticky/50 p-3 text-sm"><strong>Recipe needed:</strong> {unconfiguredMenu.map((item) => item.name).join(", ")}. Sales of these items will not deduct inventory until a recipe is added.</p>}
      </section>
    </div>
    <section className="rounded-2xl border border-roast/10 bg-counter p-5 sm:p-6">
      <h2 className="font-display text-2xl">Inventory history</h2><p className="mt-1 text-sm text-muted">Recent restocks, waste, adjustments, and ingredient use from completed orders.</p>
      {movements.length === 0 ? <p className="mt-4 text-muted">No stock changes recorded yet.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-roast/15 text-muted"><tr><th className="py-3 pr-3">When</th><th className="py-3 pr-3">Ingredient</th><th className="py-3 pr-3">Change</th><th className="py-3 pr-3">Type</th><th className="py-3">Reason</th></tr></thead><tbody className="divide-y divide-roast/10">{movements.map((move) => { const ingredient = ingredients.find((item) => item.id === move.ingredient_id); return <tr key={move.id}><td className="whitespace-nowrap py-3 pr-3">{dateTime(move.created_at)}</td><td className="py-3 pr-3">{ingredient?.name ?? "Removed ingredient"}</td><td className="whitespace-nowrap py-3 pr-3 tabular-nums">{move.quantity_delta > 0 ? "+" : ""}{quantity(move.quantity_delta)} {ingredient?.unit}</td><td className="py-3 pr-3 capitalize">{move.movement_type === "sale" ? "Order use" : move.movement_type}</td><td className="py-3">{move.reason}</td></tr>; })}</tbody></table></div>}
    </section>
  </div>;
}

function IngredientForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState(""); const [unit, setUnit] = useState("g"); const [threshold, setThreshold] = useState("0"); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(null); const result = await createIngredient(name, unit, Number(threshold)); setSaving(false); if (!result.ok) { setError(result.error); return; } setName(""); setThreshold("0"); onDone(); }
  return <form onSubmit={submit} className="mt-4 space-y-3">
    <label className="block text-sm font-semibold">Name<input required minLength={2} maxLength={80} value={name} disabled={saving} onChange={(event) => setName(event.target.value)} placeholder="e.g. Espresso beans" className={inputClass} /></label>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Unit<select value={unit} disabled={saving} onChange={(event) => setUnit(event.target.value)} className={inputClass}><option value="g">Grams (g)</option><option value="ml">Milliliters (ml)</option><option value="each">Each</option></select></label><label className="block text-sm font-semibold">Low-stock alert at<input type="number" min="0" step="0.001" required value={threshold} disabled={saving} onChange={(event) => setThreshold(event.target.value)} className={inputClass} /></label></div>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}<button disabled={saving} className={`${buttonClass} w-full sm:w-auto`}>{saving ? "Saving..." : "Add ingredient"}</button>
  </form>;
}

function MovementForm({ ingredient, onDone }: { ingredient: IngredientRow; onDone: () => void }) {
  const [type, setType] = useState<"restock" | "waste" | "adjustment">("restock"); const [direction, setDirection] = useState<"add" | "subtract">("add"); const [amount, setAmount] = useState(""); const [reason, setReason] = useState(""); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(null); const result = await recordInventoryMovement(ingredient.id, type, Number(amount), type === "adjustment" ? direction : "", reason); setSaving(false); if (!result.ok) { setError(result.error); return; } setAmount(""); setReason(""); onDone(); }
  return <form onSubmit={submit} className="mt-4 space-y-2 border-t border-roast/10 pt-3">
    <label className="block text-xs font-semibold">Stock change<select value={type} disabled={saving} onChange={(event) => setType(event.target.value as typeof type)} className={inputClass}><option value="restock">Restock</option><option value="waste">Waste</option><option value="adjustment">Manual adjustment</option></select></label>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{type === "adjustment" && <label className="block text-xs font-semibold">Direction<select value={direction} disabled={saving} onChange={(event) => setDirection(event.target.value as typeof direction)} className={inputClass}><option value="add">Add</option><option value="subtract">Subtract</option></select></label>}<label className="block text-xs font-semibold">Quantity ({ingredient.unit})<input required type="number" min="0.001" step="0.001" value={amount} disabled={saving} onChange={(event) => setAmount(event.target.value)} className={inputClass} /></label></div>
    <label className="block text-xs font-semibold">Reason<input required minLength={3} maxLength={200} value={reason} disabled={saving} onChange={(event) => setReason(event.target.value)} placeholder={type === "restock" ? "e.g. Supplier delivery" : type === "waste" ? "e.g. Milk expired" : "e.g. Physical count correction"} className={inputClass} /></label>
    {error && <p role="alert" className="text-xs text-error">{error}</p>}<button disabled={saving} className={`${buttonClass} w-full`}>{saving ? "Saving..." : "Record stock change"}</button>
  </form>;
}

function RecipeForm({ menuItems, ingredients, onDone }: { menuItems: MenuItemRow[]; ingredients: IngredientRow[]; onDone: () => void }) {
  const [itemId, setItemId] = useState(menuItems[0]?.id ?? ""); const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? ""); const [amount, setAmount] = useState(""); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(null); const result = await setMenuItemRecipe(itemId, ingredientId, Number(amount)); setSaving(false); if (!result.ok) { setError(result.error); return; } setAmount(""); onDone(); }
  const selectedIngredient = ingredients.find((ingredient) => ingredient.id === ingredientId);
  return <form onSubmit={submit} className="mt-4 space-y-3">
    <label className="block text-sm font-semibold">Menu item<select value={itemId} disabled={saving} onChange={(event) => setItemId(event.target.value)} className={inputClass}>{menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Ingredient<select value={ingredientId} disabled={saving} onChange={(event) => setIngredientId(event.target.value)} className={inputClass}>{ingredients.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></label><label className="block text-sm font-semibold">Amount per item ({selectedIngredient?.unit ?? "unit"})<input type="number" required min="0.001" step="0.001" value={amount} disabled={saving} onChange={(event) => setAmount(event.target.value)} className={inputClass} /></label></div>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}<button disabled={saving} className={`${buttonClass} w-full sm:w-auto`}>{saving ? "Saving..." : "Save recipe amount"}</button>
  </form>;
}

function RemoveRecipeButton({ recipe, onDone }: { recipe: RecipeRow; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function remove() { setSaving(true); setError(null); const result = await removeMenuItemRecipe(recipe.menu_item_id, recipe.ingredient_id); setSaving(false); if (!result.ok) setError(result.error); else onDone(); }
  return <div><button type="button" disabled={saving} onClick={() => void remove()} className="min-h-10 px-2 text-sm font-semibold text-error underline underline-offset-2">{saving ? "Removing..." : "Remove"}</button>{error && <p role="alert" className="text-xs text-error">{error}</p>}</div>;
}

const inputClass = "mt-1 min-h-11 w-full rounded-lg border border-roast/20 bg-steam px-3 font-normal text-roast outline-none focus:border-pistachio disabled:opacity-60";
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg bg-pistachio px-4 text-sm font-semibold text-counter disabled:opacity-60";
function quantity(value: number) { return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 3 }).format(value); }
function dateTime(value: string) { return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
