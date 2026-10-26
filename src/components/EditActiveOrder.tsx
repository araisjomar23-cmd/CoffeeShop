"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { editActiveOrder } from "@/app/actions";
import { formatPeso } from "@/lib/money";

type OrderType = "dine_in" | "takeaway";
type EditableItem = {
  id: string;
  name: string;
  unitPriceCentavos: number;
  quantity: number;
  note: string;
};

export default function EditActiveOrder({
  orderId,
  orderNumber,
  customerName: initialCustomerName,
  orderType: initialOrderType,
  items: initialItems,
}: {
  orderId: string;
  orderNumber: number;
  customerName: string | null;
  orderType: OrderType;
  items: EditableItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState(initialCustomerName ?? "");
  const [orderType, setOrderType] = useState<OrderType>(initialOrderType);
  const [items, setItems] = useState(() => initialItems.map((item) => ({ ...item, removed: false })));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const itemCount = items.filter((item) => !item.removed).length;
  const totalCentavos = items.reduce((total, item) => total + (item.removed ? 0 : item.quantity * item.unitPriceCentavos), 0);

  function beginEditing() {
    setCustomerName(initialCustomerName ?? "");
    setOrderType(initialOrderType);
    setItems(initialItems.map((item) => ({ ...item, removed: false })));
    setError(null);
    setOpen(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (itemCount === 0) {
      setError("Keep at least one item in the order.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await editActiveOrder(orderId, customerName, orderType, items.map((item) => ({
      order_item_id: item.id,
      quantity: item.removed ? 0 : item.quantity,
      note: item.note,
    })));
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return <button type="button" onClick={beginEditing} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-roast/20 px-5 font-semibold hover:border-pistachio">Edit order</button>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-roast/50 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby={`edit-order-heading-${orderId}`} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-counter p-5 text-roast shadow-2xl sm:max-w-xl sm:rounded-2xl sm:p-6">
        <form onSubmit={save}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={`edit-order-heading-${orderId}`} className="font-display text-2xl">Edit order #{orderNumber}</h2>
              <p className="mt-1 text-sm text-muted">Adjust quantities, notes, and order details.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} disabled={saving} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-roast/20 text-xl disabled:opacity-50" aria-label="Close edit order">×</button>
          </div>

          <ul className="mt-5 divide-y divide-roast/10">
            {items.map((item) => (
              <li key={item.id} className={`py-4 first:pt-0 ${item.removed ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold ${item.removed ? "line-through" : ""}`}>{item.name}</p>
                    <p className="mt-1 text-sm text-muted">{formatPeso(item.unitPriceCentavos)} each</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!item.removed && <>
                      <button type="button" aria-label={`Remove one ${item.name}`} disabled={saving || item.quantity <= 1} onClick={() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, quantity: Math.max(1, entry.quantity - 1) } : entry))} className="min-h-11 min-w-11 rounded-xl border border-roast/20 text-xl disabled:opacity-40">−</button>
                      <span className="w-6 text-center font-semibold tabular-nums">{item.quantity}</span>
                      <button type="button" aria-label={`Add one ${item.name}`} disabled={saving || item.quantity >= 99} onClick={() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, quantity: Math.min(99, entry.quantity + 1) } : entry))} className="min-h-11 min-w-11 rounded-xl border border-roast/20 text-xl disabled:opacity-40">+</button>
                    </>}
                  </div>
                </div>
                {!item.removed && <label className="mt-3 block text-xs font-semibold text-muted">Item note
                  <input type="text" maxLength={140} value={item.note} disabled={saving} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, note: event.target.value } : entry))} className="mt-1 min-h-11 w-full rounded-lg border border-roast/20 bg-steam px-3 text-sm font-normal text-roast" />
                </label>}
                <button type="button" disabled={saving} onClick={() => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, removed: !entry.removed } : entry))} className="mt-2 min-h-9 text-sm font-semibold text-error underline underline-offset-2 disabled:opacity-50">{item.removed ? "Restore item" : "Remove item"}</button>
              </li>
            ))}
          </ul>

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
          {error && <p role="alert" className="mt-3 rounded-lg border border-error/25 bg-error/5 p-3 text-sm text-error">{error}</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setOpen(false)} disabled={saving} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-roast/20 px-5 font-semibold disabled:opacity-50">Keep order</button>
            <button type="submit" disabled={saving || itemCount === 0} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-pistachio px-5 font-bold text-counter disabled:opacity-50">{saving ? "Saving changes…" : "Save changes"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
