export type TicketMenuItem = {
  id: string;
  name: string;
  category: string;
  price_centavos: number;
};

export type RestoredTicket<T extends TicketMenuItem> = {
  cart: Record<string, { key: string; item: T; quantity: number; note: string; addons: T[] }>;
  customerName: string;
  orderType: "dine_in" | "takeaway";
  requestId: string | null;
};

export function calculateTicketTotal(lines: { item: { price_centavos: number }; addons?: { price_centavos: number }[]; quantity: number }[]) {
  return lines.reduce((total, line) => total + (line.item.price_centavos + (line.addons ?? []).reduce((sum, addon) => sum + addon.price_centavos, 0)) * line.quantity, 0);
}

export function searchMenuItems<T extends Pick<TicketMenuItem, "name" | "category">>(
  allItems: T[],
  categoryItems: T[],
  query: string,
) {
  const normalizedQuery = normalize(query.trim());
  if (!normalizedQuery) return categoryItems;
  return allItems.filter((item) =>
    normalize(item.name).includes(normalizedQuery) || normalize(item.category).includes(normalizedQuery),
  );
}

export function restoreTicketSnapshot<T extends TicketMenuItem>(snapshot: unknown, menuItems: T[], availableAddons: T[] = []): RestoredTicket<T> {
  const restored: RestoredTicket<T> = { cart: {}, customerName: "", orderType: "takeaway", requestId: null };
  if (!snapshot || typeof snapshot !== "object") return restored;
  const saved = snapshot as { lines?: unknown; customerName?: unknown; orderType?: unknown; requestId?: unknown };
  if (typeof saved.customerName === "string") restored.customerName = saved.customerName.slice(0, 100);
  if (saved.orderType === "dine_in" || saved.orderType === "takeaway") restored.orderType = saved.orderType;
  if (typeof saved.requestId === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(saved.requestId)) restored.requestId = saved.requestId;
  if (!Array.isArray(saved.lines)) return restored;

  for (const entry of saved.lines) {
    if (!entry || typeof entry !== "object") continue;
    const line = entry as { id?: unknown; addonIds?: unknown; quantity?: unknown; note?: unknown };
    const item = menuItems.find((candidate) => candidate.id === line.id);
    if (!item || !Number.isInteger(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > 99) continue;
    const addons = Array.isArray(line.addonIds)
      ? line.addonIds.flatMap((id) => {
          const addon = availableAddons.find((candidate) => candidate.id === id);
          return addon && isAddonAllowed(item.category, addon.name) ? [addon] : [];
        })
      : [];
    const uniqueAddons = addons.filter((addon, index) => addons.findIndex((candidate) => candidate.id === addon.id) === index);
    const key = cartLineKey(item.id, uniqueAddons.map((addon) => addon.id));
    restored.cart[key] = {
      key,
      item,
      quantity: Number(line.quantity),
      note: typeof line.note === "string" ? line.note.slice(0, 140) : "",
      addons: uniqueAddons,
    };
  }
  return restored;
}

export function cartLineKey(itemId: string, addonIds: string[]) {
  return addonIds.length ? `${itemId}::${[...addonIds].sort().join(",")}` : itemId;
}

export function isAddonAllowed(category: string, addonName: string) {
  if (category === "Milk Tea") return addonName === "Pearl";
  if (category === "Burgers") return ["Lettuce", "Cheese", "Egg"].includes(addonName);
  return false;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}
