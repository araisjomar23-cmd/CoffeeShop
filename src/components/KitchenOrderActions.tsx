"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { transitionOrder } from "@/app/actions";

export default function KitchenOrderActions({ orderId, status }: { orderId: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nextStatus = status === "new" ? "ready" : status === "ready" ? "completed" : status === "completed" ? "new" : null;
  const actionLabel = status === "new" ? "Mark ready" : status === "ready" ? "Mark completed" : "Reopen order";

  async function advance() {
    if (!nextStatus) return;
    setSaving(true);
    setError(null);
    try {
    const result = await transitionOrder(orderId, nextStatus);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    } catch {
      setError("Connection interrupted. Refresh to check the order status.");
    } finally { setSaving(false); }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      {nextStatus && <button type="button" onClick={advance} disabled={saving} className="inline-flex min-h-12 items-center rounded-xl bg-pistachio px-5 font-bold text-counter hover:brightness-95 disabled:opacity-60">{saving ? "Saving..." : actionLabel}</button>}
      <Link href={`/kitchen/print/${orderId}`} className="inline-flex min-h-12 items-center rounded-xl border border-roast/20 px-5 font-semibold hover:border-pistachio">Print ticket</Link>
      {error && <p role="alert" className="w-full text-sm text-error">{error}</p>}
    </div>
  );
}
