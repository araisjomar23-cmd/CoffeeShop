"use server";

import { createClient } from "@/lib/supabase/server";

type OrderItemInput = {
  menu_item_id: string;
  quantity: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function createOrder(
  items: OrderItemInput[],
  customerName: string,
): Promise<
  | { ok: true; orderNumber: number }
  | { ok: false; error: string }
> {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Add at least one item before saving." };
  }

  if (items.length > 50) {
    return { ok: false, error: "An order cannot contain more than 50 items." };
  }

  if (typeof customerName !== "string") {
    return { ok: false, error: "Customer name must be text." };
  }

  const rpcItems: OrderItemInput[] = [];
  for (const item of items) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.menu_item_id !== "string" ||
      !UUID_PATTERN.test(item.menu_item_id)
    ) {
      return { ok: false, error: "Each item must have a valid menu item ID." };
    }

    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      return {
        ok: false,
        error: "Each item quantity must be an integer between 1 and 99.",
      };
    }

    rpcItems.push({
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
    });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_order", {
      p_customer_name: customerName.trim(),
      p_items: rpcItems,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const savedOrder = data?.[0];
    if (!savedOrder) {
      return { ok: false, error: "The order was not saved. Please try again." };
    }

    return { ok: true, orderNumber: savedOrder.order_number };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save the order.",
    };
  }
}
