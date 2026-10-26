"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { createOrder } from "@/app/actions";
import { formatPeso } from "@/lib/money";
import { calculateTicketTotal, cartLineKey, isAddonAllowed, restoreTicketSnapshot } from "@/lib/order-ticket";
import type { Tables } from "@/types/database";

type MenuItem = Tables<"menu_items">;
type CartLine = { key: string; item: MenuItem; quantity: number; note: string; addons: MenuItem[] };
type Cart = Record<string, CartLine>;
type MenuDisplayCard =
  | { kind: "item"; item: MenuItem }
  | { kind: "sized-drink"; name: string; sizes: MenuItem[] };
type SaveFeedback =
  | {
      kind: "success";
      orderNumber: number;
      totalCentavos: number;
      orderType: "dine_in" | "takeaway";
    }
  | { kind: "error"; detail: string };

type TicketAction =
  | { type: "add"; item: MenuItem; addons: MenuItem[] }
  | { type: "increase"; id: string }
  | { type: "decrease"; id: string }
  | { type: "set_note"; id: string; note: string }
  | { type: "restore"; cart: Cart }
  | { type: "clear" };

const EMPTY_CART: Cart = {};

function productQuantity(cart: Cart, itemId: string) {
  return Object.values(cart).reduce((total, line) => total + (line.item.id === itemId ? line.quantity : 0), 0);
}

function updateQuantity(cart: Cart, key: string, amount: number): Cart {
  const line = cart[key];
  if (!line) return cart;
  if (amount > 0 && line.quantity >= 99) return cart;

  const quantity = line.quantity + amount;
  if (quantity <= 0) {
    const nextCart = { ...cart };
    delete nextCart[key];
    return nextCart;
  }

  return { ...cart, [key]: { ...line, quantity } };
}

function ticketReducer(cart: Cart, action: TicketAction): Cart {
  switch (action.type) {
    case "add": {
      const key = cartLineKey(action.item.id, action.addons.map((addon) => addon.id));
      const existingLine = cart[key];
      if (existingLine?.quantity >= 99) return cart;
      return {
        ...cart,
        [key]: {
          key,
          item: action.item,
          quantity: existingLine ? existingLine.quantity + 1 : 1,
          note: existingLine?.note ?? "",
          addons: action.addons,
        },
      };
    }
    case "increase":
      return updateQuantity(cart, action.id, 1);
    case "decrease":
      return updateQuantity(cart, action.id, -1);
    case "set_note":
      return cart[action.id]
        ? { ...cart, [action.id]: { ...cart[action.id], note: action.note } }
        : cart;
    case "restore":
      return action.cart;
    case "clear":
      return EMPTY_CART;
  }
}

export default function OrderScreen({ items, addons }: { items: MenuItem[]; addons: MenuItem[] }) {
  const [cart, dispatch] = useReducer(ticketReducer, EMPTY_CART);
  const [selectedCategory, setSelectedCategory] = useState(
    () => items.some((item) => item.category === "Coffee") ? "Coffee" : items.some((item) => item.category === "Milk Tea") ? "Milk Tea" : items[0]?.category ?? "",
  );
  const [customerName, setCustomerName] = useState("");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway">("takeaway");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "e_wallet">("cash");
  const [cartRestored, setCartRestored] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const didRestore = useRef(false);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (didRestore.current) return;
    didRestore.current = true;
    try {
      const saved = sessionStorage.getItem("coffee-pos-order-ticket-v1");
      if (saved) {
        const restored = restoreTicketSnapshot(JSON.parse(saved), items, addons);
        dispatch({ type: "restore", cart: restored.cart });
        // Restoring from sessionStorage is an intentional external-to-React state sync.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCustomerName(restored.customerName);
        setOrderType(restored.orderType);
        setPaymentMethod(restored.paymentMethod);
        requestIdRef.current = restored.requestId;
      }
    } catch {
      // Storage can be unavailable in private browsing; the in-memory ticket still works.
    }
    setCartRestored(true);
  }, [items, addons]);

  useEffect(() => {
    if (!cartRestored) return;
    try {
      sessionStorage.setItem("coffee-pos-order-ticket-v1", JSON.stringify({
        lines: Object.values(cart).map((line) => ({ id: line.item.id, addonIds: line.addons.map((addon) => addon.id), quantity: line.quantity, note: line.note })),
        customerName,
        orderType,
        paymentMethod,
        requestId: requestIdRef.current,
      }));
    } catch {
      // Storage can be unavailable in private browsing; the in-memory ticket still works.
    }
  }, [cart, customerName, orderType, paymentMethod, cartRestored]);
  const lines = Object.values(cart);
  const orderTotalCentavos = calculateTicketTotal(lines);
  const itemCount = lines.reduce((count, line) => count + line.quantity, 0);
  const canSubmit = lines.length > 0 && !isSaving && cartRestored;

  function updateTicket(action: TicketAction) {
    requestIdRef.current = null;
    setSaveFeedback(null);
    dispatch(action);
  }

  function updateCustomerName(name: string) {
    requestIdRef.current = null;
    setSaveFeedback(null);
    setCustomerName(name);
  }

  function updateOrderType(value: "dine_in" | "takeaway") {
    requestIdRef.current = null;
    setSaveFeedback(null);
    setOrderType(value);
  }

  function updatePaymentMethod(value: "cash" | "e_wallet") {
    requestIdRef.current = null;
    setSaveFeedback(null);
    setPaymentMethod(value);
  }

  function beginAddItem(item: MenuItem) {
    const choices = addons.filter((addon) => isAddonAllowed(item.category, addon.name));
    if (choices.length === 0) {
      updateTicket({ type: "add", item, addons: [] });
      return;
    }
    setCustomizingItem(item);
    setSelectedAddonIds([]);
  }

  function addCustomizedItem() {
    if (!customizingItem) return;
    const selectedAddons = addons.filter((addon) => selectedAddonIds.includes(addon.id));
    updateTicket({ type: "add", item: customizingItem, addons: selectedAddons });
    setCustomizingItem(null);
    setSelectedAddonIds([]);
  }

  async function handleSaveOrder() {
    const requestId = requestIdRef.current ?? crypto.randomUUID();
    requestIdRef.current = requestId;
    try {
      sessionStorage.setItem("coffee-pos-order-ticket-v1", JSON.stringify({
        lines: lines.map((line) => ({ id: line.item.id, addonIds: line.addons.map((addon) => addon.id), quantity: line.quantity, note: line.note })),
        customerName,
        orderType,
        paymentMethod,
        requestId,
      }));
    } catch {
      // The server still deduplicates during this page session if storage is unavailable.
    }
    setIsSaving(true);
    setSaveFeedback(null);

    try {
      const result = await createOrder(
        lines.map((line) => ({
          menu_item_id: line.item.id,
          quantity: line.quantity,
          note: line.note,
          addon_ids: line.addons.map((addon) => addon.id),
        })),
        customerName,
        orderType,
        paymentMethod,
        requestId,
      );

      if (!result.ok) {
        setSaveFeedback({ kind: "error", detail: result.error });
        return;
      }

      dispatch({ type: "clear" });
      requestIdRef.current = null;
      setCustomerName("");
      setPaymentMethod("cash");
      setSaveFeedback({
        kind: "success",
        orderNumber: result.orderNumber,
        totalCentavos: result.totalCentavos,
        orderType,
      });
    } catch (error) {
      setSaveFeedback({
        kind: "error",
        detail: error instanceof Error ? error.message : "Unable to save the order.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  const itemsByCategory = new Map<string, MenuItem[]>();
  for (const item of items) {
    const categoryItems = itemsByCategory.get(item.category) ?? [];
    categoryItems.push(item);
    itemsByCategory.set(item.category, categoryItems);
  }
  const categoryPriority = ["Coffee", "Milk Tea", "Burgers", "Sides", "Combos", "Add-ons"];
  const categories = Array.from(itemsByCategory.keys()).sort((a, b) => {
    const aPriority = categoryPriority.indexOf(a);
    const bPriority = categoryPriority.indexOf(b);
    return (aPriority < 0 ? categoryPriority.length : aPriority) - (bPriority < 0 ? categoryPriority.length : bPriority) || a.localeCompare(b);
  });
  const visibleItems = itemsByCategory.get(selectedCategory) ?? [];
  const displayCards = groupSizedDrinks(visibleItems);

  return (
    <>
      <div className="grid gap-8 pb-32 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:pb-0">
        <div className="min-w-0">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="text-lg font-semibold text-roast">Menu</h2>
            <p className="text-right text-sm text-muted">Choose a category</p>
          </div>
          {selectedCategory === "Add-ons" && <p className="mb-4 rounded-xl bg-counter px-4 py-3 text-sm text-muted">Add an extra, then use its item note to say which burger or milk tea it goes with.</p>}
          {selectedCategory === "Combos" && <p className="mb-4 rounded-xl bg-counter px-4 py-3 text-sm text-muted">Add a note with the burger and milk tea choices for each combo.</p>}

          <div
            role="group"
            aria-label="Menu categories"
            className="mb-6 flex gap-3 overflow-x-auto pb-1"
          >
              {categories.map((category) => {
              const isSelected = category === selectedCategory;

              return (
                <button
                  key={category}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedCategory(category)}
                  className={`min-h-14 min-w-32 rounded-2xl border px-6 text-base font-semibold transition-colors duration-100 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio ${
                    isSelected
                      ? "border-pistachio bg-pistachio text-counter"
                      : "border-roast/20 bg-counter text-roast hover:border-pistachio"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          <section aria-labelledby="selected-category-heading">
            <h3
              id="selected-category-heading"
              className="mb-4 font-display text-2xl text-roast sm:text-3xl"
            >
              {selectedCategory}
            </h3>
            {displayCards.length === 0 ? <p className="rounded-2xl border border-dashed border-roast/20 bg-counter p-8 text-center text-muted">No items in this category yet.</p> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3">
              {displayCards.map((card) => {
                if (card.kind === "sized-drink") {
                  return <article key={`sized-drink-${card.name}`} className="min-w-0 rounded-2xl border border-roast/15 bg-counter p-4 text-roast sm:p-5">
                    <h4 className="mb-4 min-h-7 text-base font-semibold leading-snug sm:text-lg">{card.name}</h4>
                    <div className="grid grid-cols-2 gap-2">{card.sizes.map((item) => {
                      const quantity = productQuantity(cart, item.id);
                      const size = item.name.match(/\((\d+) oz\)$/)?.[1] ?? "";
                      return <button key={item.id} type="button" aria-label={`Add ${card.name}, ${size} ounces, to order`} disabled={isSaving || !cartRestored || quantity >= 99} onClick={() => beginAddItem(item)} className="relative flex min-h-14 touch-manipulation flex-col items-center justify-center rounded-xl border border-roast/20 px-2 py-2 text-sm font-semibold hover:border-pistachio focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio disabled:opacity-50">
                        <span>{size} oz</span><span className="mt-0.5 tabular-nums">{formatPeso(item.price_centavos)}</span>
                        {quantity > 0 && <span className="absolute -right-2 -top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-pistachio px-1 text-xs text-counter">{quantity}</span>}
                      </button>;
                    })}</div>
                  </article>;
                }
                const { item } = card;
                const quantity = productQuantity(cart, item.id);
                const quantityLimitReached = quantity >= 99;

                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={
                      quantityLimitReached
                        ? `Maximum quantity reached for ${item.name}`
                        : `Add ${item.name} to order`
                    }
                    disabled={isSaving || !cartRestored || quantityLimitReached}
                    onClick={() => beginAddItem(item)}
                    className="relative flex min-h-28 touch-manipulation flex-col justify-between rounded-2xl border border-roast/15 bg-counter p-4 text-left text-roast transition-transform duration-100 active:scale-[0.98] hover:border-pistachio/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 sm:p-5"
                  >
                    {quantity > 0 && (
                      <span className="absolute right-3 top-3 inline-flex min-h-7 min-w-7 items-center justify-center rounded-full bg-pistachio px-2 text-sm font-bold text-counter tabular-nums">
                        {quantity}
                      </span>
                    )}
                    <span className="pr-8 text-base font-semibold leading-snug sm:text-lg">
                      {item.name}
                    </span>
                    <span className="mt-4 text-lg font-semibold text-roast tabular-nums sm:text-xl">
                      {formatPeso(item.price_centavos)}
                    </span>
                  </button>
                );
              })}
            </div>}
          </section>
        </div>

        <aside
          id="order-ticket"
          aria-labelledby="ticket-heading"
          className="relative overflow-hidden rounded-2xl border border-roast/15 bg-sticky p-5 text-roast shadow-[0_8px_18px_rgba(43,33,28,0.12)] lg:sticky lg:top-6"
        >
          <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-8 w-8 bg-[linear-gradient(225deg,var(--steam)_0_49%,rgba(43,33,28,0.12)_50%,transparent_54%)]" />
          {saveFeedback?.kind === "success" && (
            <div aria-live="polite" className="mb-4 rounded-xl border border-pistachio/25 bg-counter/70 p-4 text-center text-pistachio motion-safe:animate-[feedback-fade_180ms_ease-out] motion-reduce:animate-none">
              <span className="block text-sm font-semibold">Order placed · {saveFeedback.orderType === "dine_in" ? "Dine in" : "Takeaway"}</span>
              <span className="font-display text-3xl">Order #{saveFeedback.orderNumber}</span>
              <span className="mt-1 block text-sm">{formatPeso(saveFeedback.totalCentavos)} total</span>
            </div>
          )}
          <TicketPanel
            lines={lines}
            totalCentavos={orderTotalCentavos}
            dispatch={updateTicket}
            customerName={customerName}
            setCustomerName={updateCustomerName}
            isSaving={isSaving}
            saveFeedback={saveFeedback?.kind === "error" ? saveFeedback : null}
            orderType={orderType}
            setOrderType={updateOrderType}
            paymentMethod={paymentMethod}
            setPaymentMethod={updatePaymentMethod}
            canSubmit={canSubmit}
            onSave={() => void handleSaveOrder()}
          />
        </aside>
      </div>

      {customizingItem && <div className="fixed inset-0 z-50 flex items-end justify-center bg-roast/50 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomizingItem(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="customize-item-heading" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-counter p-5 text-roast shadow-2xl sm:max-w-md sm:rounded-2xl">
          <div className="flex items-start justify-between gap-4">
            <div><h2 id="customize-item-heading" className="font-display text-2xl">{customizingItem.name}</h2><p className="mt-1 text-sm text-muted">Add extras (optional)</p></div>
            <button type="button" onClick={() => setCustomizingItem(null)} className="min-h-11 min-w-11 rounded-full border border-roast/20 text-xl" aria-label="Close item options">×</button>
          </div>
          <div className="mt-4 space-y-2">{addons.filter((addon) => isAddonAllowed(customizingItem.category, addon.name)).map((addon) => {
            const checked = selectedAddonIds.includes(addon.id);
            return <label key={addon.id} className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border border-roast/15 px-4 py-3 hover:border-pistachio">
              <span className="font-semibold">{addon.name}</span><span className="ml-auto text-sm tabular-nums">+{formatPeso(addon.price_centavos)}</span>
              <input type="checkbox" checked={checked} onChange={() => setSelectedAddonIds((current) => checked ? current.filter((id) => id !== addon.id) : [...current, addon.id])} className="h-5 w-5 accent-[#3f5b45]" />
            </label>;
          })}</div>
          <p className="mt-5 flex items-center justify-between border-t border-roast/10 pt-4 font-semibold"><span>Item total</span><span className="tabular-nums">{formatPeso(customizingItem.price_centavos + addons.filter((addon) => selectedAddonIds.includes(addon.id)).reduce((sum, addon) => sum + addon.price_centavos, 0))}</span></p>
          <button type="button" onClick={addCustomizedItem} className="mt-4 min-h-14 w-full rounded-xl bg-pistachio px-4 font-bold text-counter">Add to order</button>
        </section>
      </div>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-roast/15 bg-sticky p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-1">
          <div aria-live="polite">
            <p className="text-xs font-medium text-muted">
              Ticket · {itemCount} {itemCount === 1 ? "item" : "items"}
            </p>
            <p className="text-lg font-bold text-roast tabular-nums">
              {formatPeso(orderTotalCentavos)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSaveOrder()}
            disabled={!canSubmit}
            className="inline-flex min-h-14 min-w-36 items-center justify-center rounded-xl bg-pistachio px-5 font-semibold text-counter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio disabled:cursor-not-allowed disabled:bg-[#6B6259] disabled:text-white"
          >
            {isSaving ? "Saving…" : saveFeedback?.kind === "error" ? "Retry order" : "Place order"}
          </button>
        </div>
      </div>
    </>
  );
}

function groupSizedDrinks(items: MenuItem[]): MenuDisplayCard[] {
  const cards: MenuDisplayCard[] = [];
  const sizedDrinkCards = new Map<string, Extract<MenuDisplayCard, { kind: "sized-drink" }>>();

  for (const item of items) {
    const match = item.category === "Milk Tea" || item.category === "Coffee" ? item.name.match(/^(.*) \((?:12|16) oz\)$/) : null;
    if (!match) {
      cards.push({ kind: "item", item });
      continue;
    }

    const flavor = match[1];
    let card = sizedDrinkCards.get(flavor);
    if (!card) {
      card = { kind: "sized-drink", name: flavor, sizes: [] };
      sizedDrinkCards.set(flavor, card);
      cards.push(card);
    }
    card.sizes.push(item);
  }

  return cards;
}

function TicketPanel({
  lines,
  totalCentavos,
  dispatch,
  customerName,
  setCustomerName,
  isSaving,
  saveFeedback,
  orderType,
  setOrderType,
  paymentMethod,
  setPaymentMethod,
  canSubmit,
  onSave,
}: {
  lines: CartLine[];
  totalCentavos: number;
  dispatch: (action: TicketAction) => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  isSaving: boolean;
  saveFeedback: Extract<SaveFeedback, { kind: "error" }> | null;
  orderType: "dine_in" | "takeaway";
  setOrderType: (value: "dine_in" | "takeaway") => void;
  paymentMethod: "cash" | "e_wallet";
  setPaymentMethod: (value: "cash" | "e_wallet") => void;
  canSubmit: boolean;
  onSave: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 id="ticket-heading" className="font-display text-2xl tracking-tight">
          New order
        </h2>
        <button
          type="button"
          onClick={() => dispatch({ type: "clear" })}
          disabled={lines.length === 0 || isSaving}
          className="min-h-12 rounded-xl px-3 text-sm font-semibold text-roast/75 underline decoration-roast/30 underline-offset-4 hover:text-roast disabled:cursor-not-allowed disabled:opacity-60"
        >
          Clear order
        </button>
      </div>

      {lines.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-roast/25 bg-counter/45 p-5 text-center text-sm text-roast">
          Tap an item to start an order.
        </p>
      ) : (
        <ul className="mt-5">
          {lines.map((line) => {
            const unitTotalCentavos = line.item.price_centavos + line.addons.reduce((sum, addon) => sum + addon.price_centavos, 0);
            const lineTotalCentavos = unitTotalCentavos * line.quantity;

            return (
              <li
                key={line.key}
                className="flex items-center justify-between gap-3 border-b border-dashed border-roast/30 py-4 first:pt-0 motion-safe:animate-[ticket-pop_120ms_ease-out] motion-reduce:animate-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{line.item.name}</p>
                  {line.addons.length > 0 && <p className="mt-1 text-xs text-muted">+ {line.addons.map((addon) => addon.name).join(", ")}</p>}
                  <p className="mt-1 text-sm text-muted tabular-nums">
                    {line.quantity} × {formatPeso(unitTotalCentavos)}
                  </p>
                  <label className="mt-2 block text-xs font-semibold text-muted">
                    Item note (optional)
                    <input
                      type="text"
                      value={line.note}
                      maxLength={140}
                      disabled={isSaving}
                      onChange={(event) => dispatch({ type: "set_note", id: line.key, note: event.target.value })}
                      placeholder="e.g. pearl for Milk Tea #1; combo choices"
                      className="mt-1 min-h-10 w-full rounded-lg border border-roast/20 bg-counter px-3 text-sm font-normal text-roast outline-none focus:border-pistachio"
                    />
                  </label>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Remove one ${line.item.name}`}
                    onClick={() =>
                      dispatch({ type: "decrease", id: line.key })
                    }
                    disabled={isSaving}
                    className="min-h-12 min-w-12 rounded-xl border border-roast/25 text-xl font-semibold text-roast hover:bg-counter/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-semibold">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`Add one ${line.item.name}`}
                    onClick={() =>
                      dispatch({ type: "increase", id: line.key })
                    }
                    disabled={isSaving || line.quantity >= 99}
                    className="min-h-12 min-w-12 rounded-xl border border-roast/25 text-xl font-semibold text-roast hover:bg-counter/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    +
                  </button>
                </div>
                <p className="w-20 text-right font-semibold tabular-nums">
                  {formatPeso(lineTotalCentavos)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 flex items-baseline justify-between border-t border-roast/15 pt-4">
        <span className="font-semibold text-roast">Total</span>
        <span className="font-display text-3xl text-[#8A5A14] tabular-nums underline decoration-[#8A5A14]/30 underline-offset-4">
          {formatPeso(totalCentavos)}
        </span>
      </div>

      <div className="mt-5 space-y-4 border-t border-roast/20 pt-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Order type</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["takeaway", "dine_in"] as const).map((value) => (
              <label key={value} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-semibold capitalize ${orderType === value ? "border-pistachio bg-pistachio/15" : "border-roast/20 bg-counter"}`}>
                <input className="sr-only" type="radio" name="order-type" value={value} checked={orderType === value} disabled={isSaving} onChange={() => setOrderType(value)} />
                {value === "dine_in" ? "Dine in" : "Takeaway"}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Payment method</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["cash", "e_wallet"] as const).map((value) => (
              <label key={value} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-semibold ${paymentMethod === value ? "border-pistachio bg-pistachio/15" : "border-roast/20 bg-counter"}`}>
                <input className="sr-only" type="radio" name="payment-method" value={value} checked={paymentMethod === value} disabled={isSaving} onChange={() => setPaymentMethod(value)} />
                {value === "cash" ? "Cash" : "Cashless · GCash"}
              </label>
            ))}
          </div>
        </fieldset>

      </div>

      <div className="mt-5 space-y-4 border-t border-roast/20 pt-5">
        <div>
          <label
            htmlFor="customer-name"
            className="mb-2 block text-sm font-semibold text-roast"
          >
            Name (optional)
          </label>
          <input
            id="customer-name"
            type="text"
            maxLength={100}
            value={customerName}
            disabled={isSaving}
            onChange={(event) => {
              setCustomerName(event.target.value);
            }}
            className="min-h-12 w-full border-0 border-b-2 border-roast/35 bg-transparent px-1 text-roast outline-none placeholder:text-roast/55 focus:border-pistachio focus:ring-0 disabled:opacity-60"
          />
        </div>

        {saveFeedback && (
          <p
            role="alert"
            className="rounded-xl border border-error/30 bg-counter p-3 text-sm text-error"
          >
            <span className="block font-semibold">Couldn&apos;t save the order. Your ticket is still here; edit it or retry.</span>
            {saveFeedback.detail && <span className="mt-1 block break-words text-xs text-roast/75">{saveFeedback.detail}</span>}
          </p>
        )}

        <button
          type="button"
          onClick={onSave}
          disabled={!canSubmit}
          className="min-h-14 w-full rounded-xl bg-pistachio px-5 font-semibold text-counter hover:bg-pistachio/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio disabled:cursor-not-allowed disabled:bg-[#6B6259] disabled:text-white"
        >
          {isSaving ? "Saving order…" : saveFeedback ? "Retry order" : "Place order"}
        </button>
      </div>
    </div>
  );
}
