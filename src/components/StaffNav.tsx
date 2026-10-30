import Link from "next/link";
import Image from "next/image";
import Icon from "@/components/Icon";
import SignOutButton from "@/components/SignOutButton";
import type { StaffRole } from "@/lib/auth";
import { SHOP_NAME } from "@/lib/shop";

export default function StaffNav({ current, role }: { current: "order" | "kitchen" | "sales"; role: StaffRole }) {
  const activeClass = "cafe-nav-link cafe-nav-active";
  const inactiveClass = "cafe-nav-link";

  return (
    <div className="cafe-topbar">
      <Link href="/" className="cafe-brand" aria-label={`${SHOP_NAME} home`}>
        <Image src="/mariteas-logo.png" alt="MariTea's Burgers & Milk Tea" width={64} height={64} sizes="64px" className="cafe-brand-logo" />
        <span><strong>{SHOP_NAME}</strong><small>Your everyday café companion</small></span>
      </Link>
    <nav aria-label="Main navigation" className="cafe-nav">
      <Link aria-current={current === "order" ? "page" : undefined} href="/" className={current === "order" ? activeClass : inactiveClass}><Icon name="plus" />New order</Link>
      <Link aria-current={current === "kitchen" ? "page" : undefined} href="/kitchen" className={current === "kitchen" ? activeClass : inactiveClass}><Icon name="orders" />Orders</Link>
      {role === "owner" && <Link aria-current={current === "sales" ? "page" : undefined} href="/summary" className={current === "sales" ? activeClass : inactiveClass}><Icon name="sales" />Sales</Link>}
    </nav>
      <SignOutButton />
    </div>
  );
}
