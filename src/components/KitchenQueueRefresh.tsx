"use client";

import Icon from "@/components/Icon";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function KitchenQueueRefresh() {
  const router = useRouter();
  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [router]);
  return <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted">Updates every 15 seconds.</p><button type="button" onClick={() => router.refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-roast/20 bg-counter px-4 text-sm font-semibold"><Icon name="refresh" />Refresh now</button></div>;
}
