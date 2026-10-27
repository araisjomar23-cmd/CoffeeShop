import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPeso } from "@/lib/money";
import { SHOP_NAME } from "@/lib/shop";
import PrintTicketButton from "@/components/PrintTicketButton";
import RouteLoading from "@/components/RouteLoading";
import type { Tables } from "@/types/database";

type PrintableOrder = Pick<Tables<"orders">, "id" | "order_number" | "status" | "created_at" | "customer_name" | "order_type" | "total_centavos">
  & { order_items: Pick<Tables<"order_items">, "item_name" | "quantity" | "note">[] };

export default function PrintOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  return <Suspense fallback={<RouteLoading screen="ticket" title="Order ticket" />}><AuthorizedPrintOrderPage params={params} /></Suspense>;
}

async function AuthorizedPrintOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  await connection();
  await requireStaffRole();
  const { orderId } = await params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(orderId)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.from("orders")
    .select("id, order_number, status, created_at, customer_name, order_type, total_centavos, order_items(item_name, quantity, note)")
    .eq("id", orderId).maybeSingle();
  if (error || !data) notFound();
  const order = data as PrintableOrder;

  return (
    <main className="min-h-screen bg-steam px-3 py-5 sm:px-4 sm:py-8 text-roast print:min-h-0 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-5 flex max-w-xl items-center justify-between gap-3"><Link href="/kitchen" className="font-semibold underline underline-offset-4">Back to queue</Link><PrintTicketButton /></div>
      <article className="mx-auto max-w-xl rounded-2xl border border-roast/15 bg-counter p-4 sm:p-8 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0">
        <header className="border-b-2 border-dashed border-roast/30 pb-4 text-center"><p className="text-sm font-bold uppercase tracking-[0.2em]">{SHOP_NAME}</p><h1 className="mt-2 break-words font-display text-3xl sm:text-4xl">Order #{order.order_number}</h1><p className="mt-2 text-sm">{new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(order.created_at))}</p><p className="mt-1 text-sm capitalize">{order.order_type?.replace("_", " ") ?? "Order"} · {order.status}</p>{order.customer_name?.trim() && <p className="mt-1 text-sm">Customer: {order.customer_name.trim()}</p>}</header>
        <ul className="divide-y divide-dashed divide-roast/25">{order.order_items.map((item, index) => <li key={`${item.item_name}-${index}`} className="py-4"><p className="break-words text-lg font-bold"><span className="mr-3">{item.quantity}×</span>{item.item_name}</p>{item.note && <p className="mt-2 break-words pl-8 text-sm">Note: {item.note}</p>}</li>)}</ul>
        <footer className="border-t-2 border-dashed border-roast/30 pt-4 text-right"><p className="text-sm capitalize">{order.status}</p><p className="mt-1 text-xl font-bold">Total: {formatPeso(order.total_centavos)}</p></footer>
      </article>
      <style>{`@media print { body { background: white !important; } @page { margin: 12mm; } }`}</style>
    </main>
  );
}
