const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

export function formatPeso(centavos: number): string {
  return pesoFormatter.format(centavos / 100);
}
