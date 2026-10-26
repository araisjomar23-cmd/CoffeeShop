"use server";

import { createClient } from "@/lib/supabase/server";
import { requireStaffRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

type OrderItemInput = {
  menu_item_id: string;
  quantity: number;
  note: string;
};

type OrderType = "dine_in" | "takeaway";

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function createOrder(
  items: OrderItemInput[],
  customerName: string,
  orderType: OrderType,
  requestId: string,
): Promise<
  | { ok: true; orderNumber: number; totalCentavos: number }
  | { ok: false; error: string }
> {
  await requireStaffRole();

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "Add at least one item before saving." };
  }

  if (items.length > 50) {
    return { ok: false, error: "An order cannot contain more than 50 items." };
  }

  if (typeof customerName !== "string" || customerName.length > 100) {
    return { ok: false, error: "Customer name must be text." };
  }

  if (orderType !== "dine_in" && orderType !== "takeaway") {
    return { ok: false, error: "Choose dine-in or takeaway." };
  }
  if (typeof requestId !== "string" || !UUID_PATTERN.test(requestId)) {
    return { ok: false, error: "This order could not be safely retried. Refresh and try again." };
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

    if (typeof item.note !== "string" || item.note.length > 140) {
      return { ok: false, error: "Item notes must be 140 characters or fewer." };
    }

    rpcItems.push({
      menu_item_id: item.menu_item_id,
      quantity: item.quantity,
      note: item.note.trim(),
    });
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_order_idempotent", {
      p_request_id: requestId,
      p_customer_name: customerName.trim(),
      p_items: rpcItems,
      p_order_type: orderType,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const savedOrder = data?.[0];
    if (!savedOrder) {
      return { ok: false, error: "The order was not saved. Please try again." };
    }

    return {
      ok: true,
      orderNumber: savedOrder.order_number,
      totalCentavos: savedOrder.total_centavos,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save the order.",
    };
  }
}

export async function cancelPaidOrder(
  orderId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaffRole(["owner"]);
  if (!UUID_PATTERN.test(orderId)) return { ok: false, error: "Invalid order." };
  if (typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 250) {
    return { ok: false, error: "Enter a reason between 3 and 250 characters." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("cancel_order", {
      p_order_id: orderId,
      p_reason: reason.trim(),
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/summary");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to cancel the order." };
  }
}

export async function transitionOrder(
  orderId: string,
  nextStatus: "ready" | "completed" | "new",
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaffRole();
  if (!UUID_PATTERN.test(orderId)) return { ok: false, error: "Invalid order." };
  if (nextStatus !== "ready" && nextStatus !== "completed" && nextStatus !== "new") {
    return { ok: false, error: "Unsupported order status." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("transition_order", {
      p_order_id: orderId,
      p_next_status: nextStatus,
    });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/kitchen");
    revalidatePath("/summary");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unable to update the order." };
  }
}
