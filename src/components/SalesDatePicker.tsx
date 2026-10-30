"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function SalesDatePicker({ date, today }: { date: string; today: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <input aria-label="Sales date" aria-busy={pending} type="date" value={date} max={today} disabled={pending} onChange={(event) => {
    const value = event.target.value;
    if (value && value <= today) startTransition(() => router.push(`/summary?date=${value}`));
  }} />;
}
