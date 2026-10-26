import assert from "node:assert/strict";
import test from "node:test";
import { calculateTicketTotal, restoreTicketSnapshot, searchMenuItems, type TicketMenuItem } from "../src/lib/order-ticket.ts";

const menu: TicketMenuItem[] = [
  { id: "cappuccino", name: "Cappuccino", category: "Drinks", price_centavos: 15000 },
  { id: "latte", name: "Cafe Latte", category: "Drinks", price_centavos: 15000 },
  { id: "iced-latte", name: "Iced Latte", category: "Drinks", price_centavos: 16000 },
  { id: "croissant", name: "Butter Croissant", category: "Pastries", price_centavos: 12500 },
];

test("calculates a realistic mixed order total in centavos", () => {
  const total = calculateTicketTotal([
    { item: menu[0], quantity: 2 },
    { item: menu[2], quantity: 1 },
    { item: menu[3], quantity: 2 },
  ]);
  assert.equal(total, 71000);
});

test("search finds items across categories and ignores case and accents", () => {
  assert.deepEqual(searchMenuItems(menu, [menu[0], menu[1], menu[2]], "LATTE").map((item) => item.id), ["latte", "iced-latte"]);
  assert.deepEqual(searchMenuItems(menu, [], "pAsTrÍe").map((item) => item.id), ["croissant"]);
});

test("restores a failed ticket while dropping stale or invalid lines", () => {
  const ticket = restoreTicketSnapshot({
    customerName: "  Ana  ",
    orderType: "dine_in",
    requestId: "123e4567-e89b-12d3-a456-426614174000",
    lines: [
      { id: "cappuccino", quantity: 2, note: "less sugar" },
      { id: "removed-item", quantity: 1, note: "" },
      { id: "latte", quantity: 100, note: "invalid quantity" },
    ],
  }, menu);
  assert.equal(ticket.orderType, "dine_in");
  assert.equal(ticket.requestId, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(ticket.customerName, "  Ana  ");
  assert.deepEqual(Object.keys(ticket.cart), ["cappuccino"]);
  assert.equal(ticket.cart.cappuccino.quantity, 2);
  assert.equal(ticket.cart.cappuccino.note, "less sugar");
});
