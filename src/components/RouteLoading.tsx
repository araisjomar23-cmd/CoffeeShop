import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Icon from "@/components/Icon";
import { SHOP_NAME } from "@/lib/shop";

type LoadingScreen = "order" | "kitchen" | "sales" | "ticket";

const descriptions = {
  order: "Pick a favorite, add the extras, and make someone's day.",
  kitchen: "From the first pour to the final pickup. Keep your counter moving.",
  sales: "Sales, favorites, and the numbers behind every cup.",
};

export default function RouteLoading({ screen, title, contentOnly = false }: { screen: LoadingScreen; title: string; contentOnly?: boolean }) {
  const content = <div aria-busy="true">
    <p role="status" className="sr-only">Loading {screen === "order" ? "menu" : screen === "kitchen" ? "orders" : screen === "ticket" ? "order ticket" : "sales overview"}...</p>
    <div aria-hidden="true" className="motion-safe:animate-pulse">
      {screen === "sales" ? <SalesSkeleton /> : screen === "order" ? <OrderSkeleton /> : screen === "kitchen" ? <KitchenSkeleton /> : <TicketSkeleton />}
    </div>
  </div>;

  // Nested data boundaries replace only the content, keeping the real header visible.
  if (contentOnly) return content;

  if (screen === "ticket") return <main className="min-h-screen bg-steam px-3 py-5 text-roast sm:px-4 sm:py-8">
    <div className="mx-auto mb-5 flex max-w-xl items-center justify-between gap-3">
      <Link href="/kitchen" className="inline-flex min-h-11 items-center gap-2 font-semibold"><Icon name="left" />Back to queue</Link>
      <span className="inline-flex min-h-11 items-center gap-2 text-sm text-muted"><Icon name="printer" />Loading ticket...</span>
    </div>
    {content}
  </main>;

  return <main className="min-h-screen bg-steam text-roast">
    <div className="cafe-shell">
      <PageHeader current={screen} role="owner" title={screen === "sales" ? "Sales overview" : title} description={descriptions[screen]} />
      {content}
    </div>
  </main>;
}

function Bar({ className = "w-24", light = false }: { className?: string; light?: boolean }) {
  return <div className={`h-3 max-w-full rounded-full ${light ? "bg-white/25" : "bg-roast/10"} ${className}`} />;
}

function SalesSkeleton() {
  return <>
    <div className="mb-[22px] flex flex-wrap items-center justify-between gap-5">
      <div className="space-y-3"><Bar className="w-24" /><Bar className="h-7 w-60" /></div>
      <div className="flex min-h-11 w-full gap-2 min-[701px]:w-auto"><Bar className="h-11 w-11" /><Bar className="h-11 w-36" /><Bar className="h-11 w-11" /><Bar className="h-11 w-32" /></div>
    </div>
    <div className="mb-[18px] grid grid-cols-1 gap-3 min-[341px]:grid-cols-2 min-[901px]:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className={`min-h-[140px] rounded-2xl border border-roast/10 p-5 max-[700px]:min-h-[125px] ${index === 0 ? "bg-pistachio" : "bg-counter"}`}>
        <Bar light={index === 0} /><Bar light={index === 0} className="mt-4 h-8 w-32" />{index === 0 && <Bar light className="mt-3 w-40" />}
      </div>)}
    </div>
    <div className="mb-[18px] grid gap-3 min-[701px]:grid-cols-2">
      <div className="rounded-2xl border border-roast/10 bg-counter p-5"><Bar className="h-4 w-24" /><div className="mt-5 flex h-2 overflow-hidden rounded bg-caramel/30"><span className="w-3/5 bg-pistachio/40" /></div><div className="mt-4 flex justify-between gap-5"><Bar className="h-6 w-28" /><Bar className="h-6 w-28" /></div><Bar className="mt-6 w-40" /><Bar className="mt-4 w-28" /></div>
      <div className="rounded-2xl border border-roast/10 bg-counter p-5"><Bar className="mb-5 h-4 w-24" />{Array.from({ length: 5 }, (_, i) => <div key={i} className="mt-3 flex justify-between gap-4"><Bar className="w-44" /><Bar className="w-5" /></div>)}</div>
    </div>
    <div className="rounded-2xl border border-roast/10 bg-counter p-5"><Bar className="mb-4 h-4 w-24" />{Array.from({ length: 3 }, (_, i) => <div key={i} className="flex min-h-14 items-center gap-3 border-t border-roast/5 py-3"><Bar className="w-10" /><Bar className="w-full" /><Bar className="h-6 w-20 shrink-0" /></div>)}</div>
    <div className="mt-4 rounded-2xl border border-roast/10 bg-counter p-5"><Bar className="w-40" /></div>
  </>;
}

function OrderSkeleton() {
  return <div className="grid min-w-0 items-start gap-5 pb-24 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6 lg:pb-0 xl:grid-cols-[minmax(0,1fr)_25rem]">
    <section>
      <Bar className="mb-5 h-5 w-20" />
      <div className="mb-4 flex gap-2 overflow-hidden">{Array.from({ length: 5 }, (_, i) => <Bar key={i} className={`h-12 w-24 shrink-0 rounded-xl ${i === 0 ? "bg-pistachio/35" : ""}`} />)}</div>
      <Bar className="mb-4 h-8 w-32" />
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="rounded-2xl border border-roast/10 bg-counter p-4 sm:p-5"><Bar className="mb-4 w-20" /><Bar className="h-5 w-36" /><div className="mt-5 grid grid-cols-2 gap-2"><Bar className="h-14 w-full rounded-xl" /><Bar className="h-14 w-full rounded-xl" /></div></div>)}</div>
    </section>
    <aside className="cafe-ticket rounded-2xl border border-roast/10 p-5 lg:p-6">
      <Bar className="h-7 w-36" /><div className="my-6 grid h-24 place-items-center rounded-xl border border-dashed border-roast/15"><Bar className="w-40" /></div>
      <div className="flex justify-between border-y border-roast/10 py-5"><Bar className="w-12" /><Bar className="h-7 w-24" /></div>
      {Array.from({ length: 2 }, (_, i) => <div key={i} className="mt-5"><Bar className="mb-3 w-24" /><div className="grid grid-cols-2 gap-2"><Bar className="h-11 w-full rounded-xl" /><Bar className="h-11 w-full rounded-xl" /></div></div>)}
      <Bar className="mt-6 w-28" /><Bar className="mt-3 h-12 w-full rounded-xl" /><Bar className="mt-4 h-12 w-full rounded-xl bg-pistachio/40" />
    </aside>
  </div>;
}

function KitchenSkeleton() {
  return <>
    <div className="cafe-queue-tools"><div className="cafe-queue-tabs">{["Preparing", "Ready", "Completed"].map(label => <div key={label} className="cafe-queue-tab text-muted">{label}<Bar className="h-5 w-5" /></div>)}</div><Bar className="h-11 w-36" /></div>
    <div className="mb-5 space-y-3"><Bar className="h-6 w-40" /><Bar className="w-28" /></div>
    <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="cafe-order-card rounded-2xl border border-t-[3px] border-roast/10 border-t-caramel/60 bg-counter p-5">
      <div className="flex justify-between gap-4"><Bar className="h-8 w-16" /><Bar className="h-8 w-24 rounded-full" /></div><Bar className="mt-3 w-40" />
      {Array.from({ length: 3 }, (_, row) => <div key={row} className="border-b border-roast/10 py-5"><Bar className="h-4 w-44" /></div>)}
      <Bar className="my-5 ml-auto h-5 w-24" /><div className="flex gap-2"><Bar className="h-11 w-full rounded-xl bg-pistachio/40" /><Bar className="h-11 w-24 shrink-0 rounded-xl" /></div><div className="mt-3 flex gap-3"><Bar className="h-11 w-24 rounded-xl" /><Bar className="h-11 w-32 rounded-xl" /></div>
    </div>)}</div>
  </>;
}

function TicketSkeleton() {
  return <article className="mx-auto max-w-xl rounded-2xl border border-roast/15 bg-counter p-5 sm:p-8"><div className="space-y-4 border-b border-dashed border-roast/20 pb-6"><p className="text-center text-sm font-bold uppercase tracking-widest">{SHOP_NAME}</p><Bar className="mx-auto h-9 w-40" /><Bar className="mx-auto w-48" /></div>{Array.from({ length: 3 }, (_, index) => <div key={index} className="border-b border-dashed border-roast/15 py-6"><Bar className="h-5 w-48" /><Bar className="mt-3 w-32" /></div>)}<Bar className="ml-auto mt-6 h-7 w-32" /></article>;
}
