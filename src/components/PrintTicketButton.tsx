"use client";

export default function PrintTicketButton() {
  return <button type="button" onClick={() => window.print()} className="no-print inline-flex min-h-12 items-center rounded-xl bg-pistachio px-5 font-bold text-counter">Print ticket</button>;
}
