type PaymentEvent = {
  amount_centavos: number;
  payment_method: string;
};

type SalesOrder = {
  status: string;
  total_centavos: number;
  payment_method: string | null;
  order_items: { item_name: string; quantity: number }[];
};

export function summarizeSales<T extends SalesOrder>(orders: readonly T[], topItemLimit = 5) {
  const salesOrders = orders.filter((order) => order.status !== "cancelled");
  const cancelledOrders = orders.filter((order) => order.status === "cancelled");
  const salesCentavos = salesOrders.reduce((total, order) => total + order.total_centavos, 0);
  const paymentTotals = { cash: 0, card: 0, e_wallet: 0, unrecorded: 0 };
  const itemCounts = new Map<string, number>();

  for (const order of salesOrders) {
    if (order.payment_method === "cash") paymentTotals.cash += order.total_centavos;
    else if (order.payment_method === "card") paymentTotals.card += order.total_centavos;
    else if (order.payment_method === "e_wallet") paymentTotals.e_wallet += order.total_centavos;
    else paymentTotals.unrecorded += order.total_centavos;

    for (const item of order.order_items) {
      itemCounts.set(item.item_name, (itemCounts.get(item.item_name) ?? 0) + item.quantity);
    }
  }

  const rankedItems = Array.from(itemCounts, ([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name))
    .slice(0, topItemLimit);

  return {
    salesOrders,
    cancelledOrders,
    salesCentavos,
    averageCentavos: salesOrders.length ? Math.round(salesCentavos / salesOrders.length) : null,
    paymentTotals,
    unrecordedCount: salesOrders.filter((order) => !["cash", "e_wallet", "card"].includes(order.payment_method ?? "")).length,
    rankedItems,
  };
}

export function summarizeCollections(events: PaymentEvent[]) {
  return events.reduce(
    (totals, event) => {
      const amount = event.amount_centavos;
      if (amount > 0) totals.received += amount;
      if (amount < 0) totals.returned += Math.abs(amount);

      if (event.payment_method === "cash") totals.cash += amount;
      else if (event.payment_method === "e_wallet") totals.e_wallet += amount;
      else if (event.payment_method === "card") totals.card += amount;

      return totals;
    },
    { received: 0, returned: 0, cash: 0, e_wallet: 0, card: 0 },
  );
}
