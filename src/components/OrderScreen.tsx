"use client";

import { useReducer, useState } from "react";
import { createOrder } from "@/app/actions";
import { formatPeso } from "@/lib/money";
import type { Tables } from "@/types/database";

type MenuItem = Tables<"menu_items">;
type CartLine = { item: MenuItem; quantity: number };
type Cart = Record<string, CartLine>;
type SaveFeedback =
  | { kind: "success"; orderNumber: number }
  | { kind: "error"; detail: string };

type TicketAction =
  | { type: "add"; item: MenuItem }
  | { type: "increase"; id: string }
  | { type: "decrease"; id: string }
  | { type: "clear" };

const EMPTY_CART: Cart = {};

function updateQuantity(cart: Cart, id: string, amount: number): Cart {
  const line = cart[id];
  if (!line) return cart;
  if (amount > 0 && line.quantity >= 99) return cart;

  const quantity = line.quantity + amount;
  if (quantity <= 0) {
    const nextCart = { ...cart };
    delete nextCart[id];
    return nextCart;
  }

  return { ...cart, [id]: { ...line, quantity } };
}

function ticketReducer(cart: Cart, action: TicketAction): Cart {
  switch (action.type) {
    case "add": {
      const existingLine = cart[action.item.id];
      if (existingLine?.quantity >= 99) return cart;
      return {
        ...cart,
        [action.item.id]: {
          item: action.item,
          quantity: existingLine ? existingLine.quantity + 1 : 1,
        },
      };
    }
    case "increase":
      return updateQuantity(cart, action.id, 1);
    case "decrease":
      return updateQuantity(cart, action.id, -1);
    case "clear":
      return EMPTY_CART;
  }
}

export default function OrderScreen({ items }: { items: MenuItem[] }) {
  const [cart, dispatch] = useReducer(ticketReducer, EMPTY_CART);
  const [selectedCategory, setSelectedCategory] = useState(
    () => items[0]?.category ?? "",
  );
  const [customerName, setCustomerName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null);
  const lines = Object.values(cart);
  const orderTotalCentavos = lines.reduce(
    (total, line) => total + line.item.price_centavos * line.quantity,
    0,
  );
  const itemCount = lines.reduce((count, line) => count + line.quantity, 0);

  function updateTicket(action: TicketAction) {
    setSaveFeedback(null);
    dispatch(action);
  }

  async function handleSaveOrder() {
    setIsSaving(true);
    setSaveFeedback(null);

    try {
      const result = await createOrder(
        lines.map((line) => ({
          menu_item_id: line.item.id,
          quantity: line.quantity,
        })),
        customerName,
      );

      if (!result.ok) {
        setSaveFeedback({ kind: "error", detail: result.error });
        return;
      }

      dispatch({ type: "clear" });
      setCustomerName("");
      setSaveFeedback({
        kind: "success",
        orderNumber: result.orderNumber,
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
  const categories = Array.from(itemsByCategory.keys());
  const selectedItems = itemsByCategory.get(selectedCategory) ?? [];

  return (
    <>
      <div className="grid gap-8 pb-32 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:pb-0">
        <div className="min-w-0">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 className="text-lg font-semibold text-roast">Menu</h2>
            <p className="text-sm text-muted">Choose a category</p>
          </div>

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
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
              {selectedItems.map((item) => {
                const quantity = cart[item.id]?.quantity ?? 0;
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
                    disabled={isSaving || quantityLimitReached}
                    onClick={() => updateTicket({ type: "add", item })}
                    className="relative flex min-h-24 flex-col justify-between rounded-2xl border border-roast/15 bg-counter p-4 text-left text-roast transition-transform duration-100 active:scale-[0.98] hover:border-pistachio/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 sm:p-5"
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
            </div>
          </section>
        </div>

        <aside
          id="order-ticket"
          aria-labelledby="ticket-heading"
          className="relative overflow-hidden rounded-2xl border border-roast/15 bg-sticky p-5 text-roast shadow-[0_8px_18px_rgba(43,33,28,0.12)] lg:sticky lg:top-6"
        >
          <span aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-8 w-8 bg-[linear-gradient(225deg,var(--steam)_0_49%,rgba(43,33,28,0.12)_50%,transparent_54%)]" />
          {saveFeedback?.kind === "success" && (
            <p aria-live="polite" className="mb-4 rounded-xl border border-pistachio/25 bg-counter/70 p-4 text-center text-pistachio motion-safe:animate-[feedback-fade_180ms_ease-out] motion-reduce:animate-none">
              <span className="block text-sm font-semibold">Order</span>
              <span className="font-display text-3xl">#{saveFeedback.orderNumber} saved</span>
            </p>
          )}
          <TicketPanel
            lines={lines}
            totalCentavos={orderTotalCentavos}
            dispatch={updateTicket}
            customerName={customerName}
            setCustomerName={setCustomerName}
            isSaving={isSaving}
            saveFeedback={saveFeedback?.kind === "error" ? saveFeedback : null}
            onSave={() => void handleSaveOrder()}
          />
        </aside>
      </div>

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
            disabled={lines.length === 0 || isSaving}
            className="inline-flex min-h-14 min-w-36 items-center justify-center rounded-xl bg-pistachio px-5 font-semibold text-counter focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio disabled:cursor-not-allowed disabled:bg-[#6B6259] disabled:text-white"
          >
            {isSaving ? "Saving…" : "Save order"}
          </button>
        </div>
      </div>
    </>
  );
}

function TicketPanel({
  lines,
  totalCentavos,
  dispatch,
  customerName,
  setCustomerName,
  isSaving,
  saveFeedback,
  onSave,
}: {
  lines: CartLine[];
  totalCentavos: number;
  dispatch: (action: TicketAction) => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  isSaving: boolean;
  saveFeedback: Extract<SaveFeedback, { kind: "error" }> | null;
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
            const lineTotalCentavos =
              line.item.price_centavos * line.quantity;

            return (
              <li
                key={`${line.item.id}-${line.quantity}`}
                className="flex items-center justify-between gap-3 border-b border-dashed border-roast/30 py-4 first:pt-0 motion-safe:animate-[ticket-pop_120ms_ease-out] motion-reduce:animate-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{line.item.name}</p>
                  <p className="mt-1 text-sm text-muted tabular-nums">
                    {line.quantity} × {formatPeso(line.item.price_centavos)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Remove one ${line.item.name}`}
                    onClick={() =>
                      dispatch({ type: "decrease", id: line.item.id })
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
                      dispatch({ type: "increase", id: line.item.id })
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
            <span className="block font-semibold">Couldn&apos;t save the order. Your ticket is still here, so you can try again.</span>
            {saveFeedback.detail && <span className="mt-1 block break-words text-xs text-roast/75">{saveFeedback.detail}</span>}
          </p>
        )}

        <button
          type="button"
          onClick={onSave}
          disabled={lines.length === 0 || isSaving}
          className="min-h-14 w-full rounded-xl bg-pistachio px-5 font-semibold text-counter hover:bg-pistachio/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio disabled:cursor-not-allowed disabled:bg-[#6B6259] disabled:text-white"
        >
          {isSaving ? "Saving order…" : "Save order"}
        </button>
      </div>
    </div>
  );
}
