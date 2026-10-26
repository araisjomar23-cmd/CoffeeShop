"use server";

import { revalidatePath } from "next/cache";
import { requireStaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
type ActionResult = { ok: true } | { ok: false; error: string };

export async function createIngredient(name: string, unit: string, lowStockThreshold: number): Promise<ActionResult> {
  await requireStaffRole(["owner"]);
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) {
    return { ok: false, error: "Name must be between 2 and 80 characters." };
  }
  if (unit !== "g" && unit !== "ml" && unit !== "each") return { ok: false, error: "Choose g, ml, or each." };
  if (!validQuantity(lowStockThreshold, true)) return { ok: false, error: "Enter a valid low-stock threshold (up to 3 decimal places)." };

  return runInventoryRpc("create_ingredient", {
    p_name: name.trim(),
    p_unit: unit,
    p_low_stock_threshold: lowStockThreshold,
  });
}

export async function setMenuItemRecipe(menuItemId: string, ingredientId: string, quantityPerItem: number): Promise<ActionResult> {
  await requireStaffRole(["owner"]);
  if (!UUID_PATTERN.test(menuItemId) || !UUID_PATTERN.test(ingredientId)) return { ok: false, error: "Choose a valid menu item and ingredient." };
  if (!validQuantity(quantityPerItem, false)) return { ok: false, error: "Recipe quantity must be greater than zero, up to 3 decimal places." };

  return runInventoryRpc("set_menu_item_recipe", {
    p_menu_item_id: menuItemId,
    p_ingredient_id: ingredientId,
    p_quantity_per_item: quantityPerItem,
  });
}

export async function removeMenuItemRecipe(menuItemId: string, ingredientId: string): Promise<ActionResult> {
  await requireStaffRole(["owner"]);
  if (!UUID_PATTERN.test(menuItemId) || !UUID_PATTERN.test(ingredientId)) return { ok: false, error: "Invalid recipe." };
  return runInventoryRpc("remove_menu_item_recipe", {
    p_menu_item_id: menuItemId,
    p_ingredient_id: ingredientId,
  });
}

export async function recordInventoryMovement(
  ingredientId: string,
  movementType: "restock" | "waste" | "adjustment",
  quantity: number,
  adjustmentDirection: "add" | "subtract" | "",
  reason: string,
): Promise<ActionResult> {
  await requireStaffRole(["owner"]);
  if (!UUID_PATTERN.test(ingredientId)) return { ok: false, error: "Choose a valid ingredient." };
  if (movementType !== "restock" && movementType !== "waste" && movementType !== "adjustment") return { ok: false, error: "Choose a valid stock change." };
  if (!validQuantity(quantity, false)) return { ok: false, error: "Quantity must be greater than zero, up to 3 decimal places." };
  if (movementType === "adjustment" && adjustmentDirection !== "add" && adjustmentDirection !== "subtract") return { ok: false, error: "Choose whether to add or subtract stock." };
  if (typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 200) return { ok: false, error: "Reason must be between 3 and 200 characters." };

  return runInventoryRpc("record_inventory_movement", {
    p_ingredient_id: ingredientId,
    p_movement_type: movementType,
    p_quantity: quantity,
    p_adjustment_direction: adjustmentDirection,
    p_reason: reason.trim(),
  });
}

async function runInventoryRpc(name: "create_ingredient" | "set_menu_item_recipe" | "remove_menu_item_recipe" | "record_inventory_movement", args: Record<string, string | number>) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc(name, args as never);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/inventory");
    revalidatePath("/kitchen");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Unable to update inventory." };
  }
}

function validQuantity(value: number, allowZero: boolean) {
  return Number.isFinite(value)
    && value >= (allowZero ? 0 : 0.001)
    && value <= 999999999
    && Math.round(value * 1000) / 1000 === value;
}
