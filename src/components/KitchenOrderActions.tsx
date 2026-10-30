"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { transitionOrder } from "@/app/actions";
import Icon from "@/components/Icon";

export default function KitchenOrderActions({ orderId, status }: { orderId: string; status: string }) {
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();
  const nextStatus = status === "new" ? "ready" : status === "ready" ? "completed" : status === "completed" ? "new" : null;
  const actionLabel = status === "new" ? "Mark ready" : status === "ready" ? "Mark completed" : "Reopen order";

  async function advance() {
    if (!nextStatus) return;
    setError(null);
    try {
      const result = await transitionOrder(orderId, nextStatus);
      if (!result.ok) {
        setError(result.error);
      }
      // The server action revalidates /kitchen and returns the updated queue.
    } catch {
      setError("Connection interrupted. Refresh to check the order status.");
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {nextStatus && <button type="button" onClick={() => startTransition(advance)} disabled={saving} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-pistachio px-4 text-sm font-semibold text-counter hover:brightness-95 disabled:opacity-60"><Icon name={saving || status === "completed" ? "refresh" : "check"} className="shrink-0" />{saving ? "Saving..." : actionLabel}</button>}
      <Link href={`/kitchen/print/${orderId}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted hover:bg-steam hover:text-roast"><Icon name="printer" />Print ticket</Link>
      {error && <p role="alert" className="w-full text-sm text-error">{error}</p>}
    </div>
  );
}
