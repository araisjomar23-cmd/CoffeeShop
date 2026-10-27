"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { editActiveOrder } from "@/app/actions";
import { formatPeso } from "@/lib/money";
import { isAddonAllowed } from "@/lib/order-ticket";

type OrderType = "dine_in" | "takeaway";
type EditOrderItemInput =
  | { order_item_id: string; quantity: number; note: string }
  | { menu_item_id: string; quantity: number; note: string; addon_ids: string[] };
type MenuOption = { id: string; name: string; category: string; price_centavos: number };
type EditableItem = {
  key: string;
  orderItemId?: string;
  menuItemId?: string;
  name: string;
  unitPriceCentavos: number;
  addonIds: string[];
  quantity: number;
  note: string;
  removed: boolean;
};

export default function EditActiveOrder({
  orderId,
  orderNumber,
  revision: currentRevision,
  originalTotal: currentTotal,
  paymentMethod,
  customerName: initialCustomerName,
  orderType: initialOrderType,
  items: initialItems,
  menuItems,
  addons,
}: {
  orderId: string;
  orderNumber: number;
  revision: number;
  originalTotal: number;
  paymentMethod: string | null;
  customerName: string | null;
  orderType: OrderType;
  items: { id: string; name: string; unitPriceCentavos: number; quantity: number; note: string }[];
  menuItems: MenuOption[];
  addons: MenuOption[];
}) {
  const router = useRouter();
  const [revision, setRevision] = useState(currentRevision);
  const [originalTotal, setOriginalTotal] = useState(currentTotal);
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState(initialCustomerName ?? "");
  const [orderType, setOrderType] = useState<OrderType>(initialOrderType);
  const [items, setItems] = useState<EditableItem[]>(() => initialItems.map((item) => ({ key: item.id, orderItemId: item.id, name: item.name, unitPriceCentavos: item.unitPriceCentavos, addonIds: [], quantity: item.quantity, note: item.note, removed: false })));
  const [selectedCategory, setSelectedCategory] = useState(menuItems[0]?.category ?? "Milk Tea");
  const [selectedAddonIds, setSelectedAddonIds] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmedTotal, setConfirmedTotal] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const itemCount = items.filter((item) => !item.removed).length;
  const totalCentavos = items.reduce((total, item) => total + (item.removed ? 0 : item.quantity * item.unitPriceCentavos), 0);

  const paymentConfirmed = confirmedTotal === totalCentavos;

  function beginEditing() {
    setRevision(currentRevision);
    setOriginalTotal(currentTotal);
    setCustomerName(initialCustomerName ?? "");
    setOrderType(initialOrderType);
    setItems(initialItems.map((item) => ({ key: item.id, orderItemId: item.id, name: item.name, unitPriceCentavos: item.unitPriceCentavos, addonIds: [], quantity: item.quantity, note: item.note, removed: false })));
    setSelectedAddonIds({});
    setError(null);
    setConfirmedTotal(null);
    setOpen(true);
  }

  function addMenuItem(menuItem: MenuOption) {
    const addonIds = selectedAddonIds[menuItem.id] ?? [];
    const chosenAddons = addons.filter((addon) => addonIds.includes(addon.id));
    const key = `new:${menuItem.id}:${[...addonIds].sort().join(",")}`;
    const existing = items.find((item) => item.key === key);
    if (!existing && itemCount >= 50) {
      setError("An order cannot have more than 50 active lines.");
      return;
    }
    setItems((current) => {
      if (existing) return current.map((item) => item.key === key ? { ...item, quantity: item.removed ? item.quantity : Math.min(99, item.quantity + 1), removed: false } : item);
      return [...current, {
        key,
        menuItemId: menuItem.id,
        name: `${menuItem.name}${chosenAddons.length ? ` + ${chosenAddons.map((addon) => addon.name).join(", ")}` : ""}`,
        unitPriceCentavos: menuItem.price_centavos + chosenAddons.reduce((sum, addon) => sum + addon.price_centavos, 0),
        addonIds,
        quantity: 1,
        note: "",
        removed: false,
      }];
    });
    setError(null);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (itemCount === 0) {
      setError("Keep at least one item in the order.");
      return;
    }
    setSaving(true);
    setError(null);
    const updatedItems: EditOrderItemInput[] = [];
    for (const item of items) {
      if (item.orderItemId) updatedItems.push({ order_item_id: item.orderItemId, quantity: item.removed ? 0 : item.quantity, note: item.note });
      else if (item.menuItemId && !item.removed) updatedItems.push({ menu_item_id: item.menuItemId, quantity: item.quantity, note: item.note, addon_ids: item.addonIds });
    }
    try {
    const result = await editActiveOrder(orderId, customerName, orderType, updatedItems, revision, paymentConfirmed);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
    } catch {
      setError("Connection interrupted. Close and refresh to check the order before retrying.");
    } finally { setSaving(false); }
  }

  if (!open) {
    return <button type="button" onClick={beginEditing} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-roast/20 px-5 font-semibold hover:border-pistachio">Edit order</button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-roast/50 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby={`edit-order-heading-${orderId}`} className="max-h-[calc(100dvh-1rem)] w-full min-w-0 overflow-y-auto overscroll-contain rounded-t-3xl bg-counter p-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-roast shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-6">
        <form onSubmit={save} onChange={() => setConfirmedTotal(null)}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={`edit-order-heading-${orderId}`} className="font-display text-2xl">Edit order #{orderNumber}</h2>
              <p className="mt-1 text-sm text-muted">Add, replace, or remove items and update order details.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} disabled={saving} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-roast/20 text-xl disabled:opacity-50" aria-label="Close edit order">×</button>
          </div>

          <ul className="mt-5 divide-y divide-roast/10">
            {items.map((item) => (
              <li key={item.key} className={`py-4 first:pt-0 ${item.removed ? "opacity-60" : ""}`}>
                <div className="flex flex-col items-start justify-between gap-3 min-[420px]:flex-row">
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${item.removed ? "line-through" : ""}`}>{item.name}</p>
                    <p className="mt-1 text-sm text-muted">{formatPeso(item.unitPriceCentavos)} each</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!item.removed && <>
                      <button type="button" aria-label={`Remove one ${item.name}`} disabled={saving || item.quantity <= 1} onClick={() => setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, quantity: Math.max(1, entry.quantity - 1) } : entry))} className="min-h-11 min-w-11 rounded-xl border border-roast/20 text-xl disabled:opacity-40">−</button>
                      <span className="w-6 text-center font-semibold tabular-nums">{item.quantity}</span>
                      <button type="button" aria-label={`Add one ${item.name}`} disabled={saving || item.quantity >= 99} onClick={() => setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, quantity: Math.min(99, entry.quantity + 1) } : entry))} className="min-h-11 min-w-11 rounded-xl border border-roast/20 text-xl disabled:opacity-40">+</button>
                    </>}
                  </div>
                </div>
                {!item.removed && <label className="mt-3 block text-xs font-semibold text-muted">Item note
                  <input type="text" maxLength={140} value={item.note} disabled={saving} onChange={(event) => setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, note: event.target.value } : entry))} className="mt-1 min-h-11 w-full rounded-lg border border-roast/20 bg-steam px-3 text-sm font-normal text-roast" />
                </label>}
                <button type="button" disabled={saving} onClick={() => setItems((current) => current.map((entry) => entry.key === item.key ? { ...entry, removed: !entry.removed } : entry))} className="mt-2 min-h-11 text-sm font-semibold text-error underline underline-offset-2 disabled:opacity-50">{item.removed ? "Restore item" : "Remove item"}</button>
              </li>
            ))}
          </ul>

          <section aria-labelledby={`add-items-heading-${orderId}`} className="mt-3 border-t border-roast/10 pt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 id={`add-items-heading-${orderId}`} className="font-display text-xl">Add items</h3>
              <span className="text-xs text-muted">Choose a different item if needed</span>
            </div>
            <div role="group" aria-label="Menu categories" className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {Array.from(new Set(menuItems.map((item) => item.category))).map((category) => <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)} className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm font-semibold ${selectedCategory === category ? "border-pistachio bg-pistachio text-counter" : "border-roast/20"}`}>{category}</button>)}
            </div>
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {menuItems.filter((item) => item.category === selectedCategory).map((menuItem) => {
                const availableAddons = addons.filter((addon) => isAddonAllowed(menuItem.category, addon.name));
                const chosenIds = selectedAddonIds[menuItem.id] ?? [];
                const newKey = `new:${menuItem.id}:${[...chosenIds].sort().join(",")}`;
                const existingNewLine = items.find((item) => item.key === newKey);
                return <article key={menuItem.id} className="rounded-xl border border-roast/10 bg-steam/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="font-semibold leading-snug">{menuItem.name}</p><p className="mt-1 text-sm tabular-nums text-muted">{formatPeso(menuItem.price_centavos)}</p></div>
                    <button type="button" onClick={() => addMenuItem(menuItem)} disabled={saving || (itemCount >= 50 && (!existingNewLine || existingNewLine.removed)) || (!existingNewLine?.removed && (existingNewLine?.quantity ?? 0) >= 99)} className="min-h-11 shrink-0 rounded-lg bg-pistachio px-3 text-sm font-bold text-counter disabled:opacity-50">{existingNewLine?.removed ? "Restore" : existingNewLine ? "+ Add one" : "Add"}</button>
                  </div>
                  {availableAddons.length > 0 && <fieldset className="mt-2 border-t border-roast/10 pt-2">
                    <legend className="mb-1 text-xs font-semibold text-muted">Add-ons</legend>
                    {availableAddons.map((addon) => <label key={addon.id} className="flex min-h-11 items-center gap-2 text-xs">
                      <input type="checkbox" checked={chosenIds.includes(addon.id)} disabled={saving} onChange={() => setSelectedAddonIds((current) => ({ ...current, [menuItem.id]: chosenIds.includes(addon.id) ? chosenIds.filter((id) => id !== addon.id) : [...chosenIds, addon.id] }))} className="h-4 w-4 accent-[#3f5b45]" />
                      <span>{addon.name}</span><span className="ml-auto tabular-nums text-muted">+{formatPeso(addon.price_centavos)}</span>
                    </label>)}
                  </fieldset>}
                </article>;
              })}
            </div>
          </section>

          <label className="mt-3 block text-sm font-semibold">Customer name (optional)
            <input type="text" maxLength={100} value={customerName} disabled={saving} onChange={(event) => setCustomerName(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-roast/20 bg-steam px-3 font-normal" />
          </label>

          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-semibold">Order type</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["takeaway", "dine_in"] as const).map((value) => <label key={value} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-semibold ${orderType === value ? "border-pistachio bg-pistachio/15" : "border-roast/20"}`}>
                <input className="sr-only" type="radio" name={`edit-order-type-${orderId}`} checked={orderType === value} disabled={saving} onChange={() => setOrderType(value)} />
                {value === "dine_in" ? "Dine in" : "Takeaway"}
              </label>)}
            </div>
          </fieldset>

          <div className="mt-5 flex items-baseline justify-between border-t border-roast/15 pt-4">
            <span className="font-semibold">Updated total</span>
            <span className="font-display text-2xl tabular-nums">{formatPeso(totalCentavos)}</span>
          </div>
          {totalCentavos !== originalTotal && <label className="mt-4 flex items-start gap-3 rounded-xl border border-caramel/40 bg-sticky/40 p-4 text-sm">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={paymentConfirmed} disabled={saving} onChange={(event) => { event.stopPropagation(); setConfirmedTotal(event.target.checked ? totalCentavos : null); }} />
            <span>{totalCentavos > originalTotal ? "I collected the extra " : "I returned "}{formatPeso(Math.abs(totalCentavos - originalTotal))} {paymentMethod === "e_wallet" ? "through GCash" : paymentMethod === "cash" ? "in cash" : "and checked the payment"}.</span>
          </label>}
          {error && <p role="alert" className="mt-3 rounded-lg border border-error/25 bg-error/5 p-3 text-sm text-error">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setOpen(false)} disabled={saving} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-roast/20 px-5 font-semibold disabled:opacity-50">Keep order</button>
            <button type="submit" disabled={saving || itemCount === 0 || (totalCentavos !== originalTotal && !paymentConfirmed)} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-pistachio px-5 font-bold text-counter disabled:opacity-50">{saving ? "Saving changes…" : "Save changes"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
