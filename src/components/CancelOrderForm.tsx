"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatPeso } from "@/lib/money";
import { cancelPaidOrder } from "@/app/actions";

export default function CancelOrderForm({ orderId, revision, totalCentavos, paymentMethod }: { orderId: string; revision: number; totalCentavos: number; paymentMethod: string | null }) {
  const router = useRouter();
  const [confirmedRevision, setConfirmedRevision] = useState<number | null>(null);
  const refundConfirmed = confirmedRevision === revision;
  const needsRefund = paymentMethod !== null && totalCentavos > 0;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
    const result = await cancelPaidOrder(orderId, reason, revision, refundConfirmed);
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
    } catch {
      setError("Connection interrupted. Refresh to check whether the order was cancelled before retrying.");
    } finally { setIsSaving(false); }
  }

  return (
    <div className="mt-2 min-w-0 max-w-full">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="min-h-11 px-2 text-sm font-semibold text-error underline underline-offset-2">Cancel order</button>
      ) : (
        <form onSubmit={handleSubmit} className="w-full min-w-0 space-y-2">
          <label className="block text-xs font-semibold" htmlFor={`cancel-reason-${orderId}`}>Reason for cancellation
            <textarea id={`cancel-reason-${orderId}`} required minLength={3} maxLength={250} rows={2} value={reason} disabled={isSaving} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-roast/20 bg-steam p-2 text-sm font-normal text-roast" />
          </label>
          {needsRefund && <label className="flex items-start gap-2 py-2 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={refundConfirmed} disabled={isSaving} onChange={(event) => setConfirmedRevision(event.target.checked ? revision : null)} /><span>I returned {formatPeso(totalCentavos)} {paymentMethod === "e_wallet" ? "through GCash" : "using the original payment method"}.</span></label>}
          {error && <p role="alert" className="text-xs text-error">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={isSaving || reason.trim().length < 3 || (needsRefund && !refundConfirmed)} className="min-h-11 px-2 text-sm font-bold text-error disabled:opacity-50">{isSaving ? "Saving…" : "Confirm cancel"}</button>
            <button type="button" disabled={isSaving} onClick={() => { setOpen(false); setError(null); }} className="min-h-11 px-2 text-sm font-semibold text-muted">Keep order</button>
          </div>
        </form>
      )}
    </div>
  );
}
