"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function KitchenQueueRefresh() {
  const router = useRouter();
  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [router]);
  return <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted">Updates every 15 seconds.</p><button type="button" onClick={() => router.refresh()} className="min-h-11 rounded-xl border border-roast/20 bg-counter px-4 text-sm font-semibold">Refresh now</button></div>;
}
