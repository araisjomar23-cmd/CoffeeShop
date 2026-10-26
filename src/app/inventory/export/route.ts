import { requireStaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type IngredientRow = { id: string; name: string; unit: string; quantity_on_hand: number; low_stock_threshold: number };
type MovementRow = {
  ingredient_id: string;
  movement_type: string;
  quantity_delta: number;
  reason: string;
  order_id: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  await requireStaffRole(["owner"]);
  const params = new URL(request.url).searchParams;
  const today = manilaToday();
  const startDate = params.get("startDate") ?? today;
  const endDate = params.get("endDate") ?? today;
  if (!isRealDate(startDate) || !isRealDate(endDate) || startDate > endDate || daysBetween(startDate, endDate) > 365) {
    return new Response("Choose a valid date range no longer than one year.", { status: 400 });
  }

  try {
    const supabase = await createClient();
    const ingredientResult = await supabase.from("ingredients")
      .select("id, name, unit, quantity_on_hand, low_stock_threshold")
      .order("name");
    if (ingredientResult.error) throw ingredientResult.error;
    const ingredients = (ingredientResult.data ?? []) as IngredientRow[];
    const movements: MovementRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("inventory_movements")
        .select("ingredient_id, movement_type, quantity_delta, reason, order_id, created_at")
        .gte("created_at", startDate + "T00:00:00+08:00")
        .lt("created_at", shiftDate(endDate, 1) + "T00:00:00+08:00")
        .order("created_at", { ascending: true })
        .range(offset, offset + 499);
      if (error) throw error;
      const page = (data ?? []) as MovementRow[];
      movements.push(...page);
      if (page.length < 500) break;
      if (movements.length >= 20000) throw new Error("Selected date range contains too many inventory changes to export.");
    }
    const ingredientById = new Map(ingredients.map((item) => [item.id, item]));
    const rows: string[][] = [[
      "record_type", "date_time_manila", "ingredient", "unit", "movement_type",
      "quantity_change", "current_quantity_on_hand", "low_stock_threshold", "reason", "order_id",
    ]];
    for (const movement of movements) {
      const ingredient = ingredientById.get(movement.ingredient_id);
      rows.push([
        "movement",
        dateTime(movement.created_at),
        ingredient?.name ?? "Unknown ingredient",
        ingredient?.unit ?? "",
        movement.movement_type,
        String(movement.quantity_delta),
        "",
        "",
        movement.reason,
        movement.order_id ?? "",
      ]);
    }
    const snapshotTime = new Date().toISOString();
    for (const ingredient of ingredients) {
      rows.push([
        "current_stock_snapshot",
        dateTime(snapshotTime),
        ingredient.name,
        ingredient.unit,
        "",
        "",
        String(ingredient.quantity_on_hand),
        String(ingredient.low_stock_threshold),
        "Current balance at export time; history is limited to the selected date range.",
        "",
      ]);
    }
    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=coffee-shop-inventory-" + startDate + "-to-" + endDate + ".csv",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Could not export inventory data. Please try again.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

function csvCell(value: string) {
  const safeValue = /^[\t\r ]*[=+@-]/.test(value) ? "'" + value : value;
  return "\"" + safeValue.replaceAll("\"", "\"\"") + "\"";
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function isRealDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function daysBetween(startDate: string, endDate: string) {
  return (Date.parse(endDate + "T00:00:00Z") - Date.parse(startDate + "T00:00:00Z")) / 86400000;
}

function shiftDate(value: string, amount: number) {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((entry) => entry.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}
