"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelPaidOrder } from "@/app/actions";

export default function CancelOrderForm({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    const result = await cancelPaidOrder(orderId, reason);
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-error underline underline-offset-2">Cancel order</button>
      ) : (
        <form onSubmit={handleSubmit} className="min-w-48 space-y-2">
          <label className="block text-xs font-semibold" htmlFor={`cancel-reason-${orderId}`}>Reason for cancellation
            <textarea id={`cancel-reason-${orderId}`} required minLength={3} maxLength={250} rows={2} value={reason} disabled={isSaving} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-lg border border-roast/20 bg-steam p-2 text-sm font-normal text-roast" />
          </label>
          {error && <p role="alert" className="text-xs text-error">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={isSaving || reason.trim().length < 3} className="text-xs font-bold text-error disabled:opacity-50">{isSaving ? "Saving…" : "Confirm cancel"}</button>
            <button type="button" disabled={isSaving} onClick={() => { setOpen(false); setError(null); }} className="text-xs font-semibold text-muted">Keep order</button>
          </div>
        </form>
      )}
    </div>
  );
}
