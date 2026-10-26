"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function KitchenQueueRefresh() {
  const router = useRouter();
  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [router]);
  return <p className="text-sm text-muted">Queue refreshes automatically every 15 seconds.</p>;
}
