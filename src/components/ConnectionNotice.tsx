"use client";

import { useSyncExternalStore } from "react";

function subscribe(update: () => void) {
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}

export default function ConnectionNotice() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return <p role="alert" className="no-print border-b border-error/30 bg-sticky px-4 py-3 text-center text-sm font-semibold text-roast">
    You are offline. Keep this tab open to preserve your ticket. Reconnect before saving; check Orders before retrying an interrupted payment.
  </p>;
}
