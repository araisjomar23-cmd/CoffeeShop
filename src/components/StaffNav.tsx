import Link from "next/link";
import { signOut } from "@/app/auth-actions";
import type { StaffRole } from "@/lib/auth";

export default function StaffNav({ current, role }: { current: "order" | "kitchen" | "sales"; role: StaffRole }) {
  const activeClass = "inline-flex min-h-12 min-w-0 items-center justify-center rounded-xl bg-pistachio px-3 text-center text-sm font-semibold text-counter sm:px-5 sm:text-base";
  const inactiveClass = "inline-flex min-h-12 min-w-0 items-center justify-center rounded-xl border border-roast/20 bg-counter px-3 text-center text-sm font-semibold text-roast hover:border-pistachio focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio sm:px-5 sm:text-base";

  return (
    <nav aria-label="Main navigation" className="mt-5 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
      <Link aria-current={current === "order" ? "page" : undefined} href="/" className={current === "order" ? activeClass : inactiveClass}>New order</Link>
      <Link aria-current={current === "kitchen" ? "page" : undefined} href="/kitchen" className={current === "kitchen" ? activeClass : inactiveClass}>Orders</Link>
      {role === "owner" && <Link aria-current={current === "sales" ? "page" : undefined} href="/summary" className={current === "sales" ? activeClass : inactiveClass}>Sales</Link>}
      <form action={signOut} className="col-span-3 sm:ml-auto">
        <button className={`${inactiveClass} w-full sm:w-auto`} type="submit">Sign out</button>
      </form>
    </nav>
  );
}
