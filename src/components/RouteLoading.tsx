import { SHOP_NAME } from "@/lib/shop";

type LoadingScreen = "order" | "kitchen" | "sales" | "ticket";

export default function RouteLoading({ screen, title }: { screen: LoadingScreen; title: string }) {
  return (
    <main className="min-h-screen bg-steam text-roast">
      <div className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6 sm:py-7 lg:py-9">
        <header className="mb-7 border-b border-roast/10 pb-6 sm:mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{SHOP_NAME} POS</p>
          <div className="mt-3 flex items-center gap-3">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-7 w-7 shrink-0 animate-spin text-pistachio motion-reduce:animate-none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div>
              <h1 className="font-display text-3xl leading-tight sm:text-4xl">{title}</h1>
              <p role="status" aria-live="polite" className="mt-1 text-sm text-muted">Loading your {screen === "sales" ? "sales" : screen === "order" ? "menu" : screen === "ticket" ? "ticket" : screen}…</p>
            </div>
          </div>
          <div aria-hidden="true" className="mt-5 flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, index) => <span key={index} className="h-11 w-28 rounded-xl bg-roast/10 motion-safe:animate-pulse" />)}
          </div>
        </header>
        <div aria-hidden="true" className="motion-safe:animate-pulse">
          {screen === "sales" ? <SalesSkeleton /> : screen === "order" ? <OrderSkeleton /> : screen === "kitchen" ? <KitchenSkeleton /> : <ListSkeleton />}
        </div>
      </div>
    </main>
  );
}

function SalesSkeleton() {
  return <>
    <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-28 rounded-2xl border border-roast/10 bg-counter p-5"><div className="h-3 w-20 rounded bg-roast/10" /><div className="mt-5 h-7 w-28 rounded bg-roast/10" /></div>)}</div>
    <div className="mt-5 h-48 rounded-2xl border border-roast/10 bg-counter p-5"><div className="h-5 w-full max-w-48 rounded bg-roast/10" /><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-16 rounded-xl bg-roast/5" />)}</div></div>
    <div className="mt-5 rounded-2xl border border-roast/10 bg-counter p-5"><div className="h-5 w-36 rounded bg-roast/10" />{Array.from({ length: 4 }, (_, index) => <div key={index} className="mt-5 h-8 rounded-lg bg-roast/5" />)}</div>
  </>;
}

function OrderSkeleton() {
  return <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
    <section><div className="h-5 w-24 rounded bg-roast/10" /><div className="mt-5 flex gap-3"><div className="h-12 w-28 rounded-xl bg-roast/10" /><div className="h-12 w-28 rounded-xl bg-roast/10" /></div><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-28 rounded-2xl border border-roast/10 bg-counter p-4"><div className="h-4 w-full max-w-28 rounded bg-roast/10" /><div className="mt-10 h-5 w-20 rounded bg-roast/10" /></div>)}</div></section>
    <aside className="min-h-80 rounded-2xl border border-roast/10 bg-sticky p-5"><div className="h-7 w-36 rounded bg-roast/10" />{Array.from({ length: 3 }, (_, index) => <div key={index} className="mt-6 h-12 rounded-lg bg-roast/5" />)}<div className="mt-8 h-14 rounded-xl bg-pistachio/40" /></aside>
  </div>;
}

function KitchenSkeleton() {
  return <><div className="h-7 w-44 rounded bg-roast/10" /><div className="mt-4 grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-72 rounded-2xl border border-roast/10 bg-counter p-5"><div className="h-9 w-20 rounded bg-roast/10" /><div className="mt-5 h-4 w-40 rounded bg-roast/10" />{Array.from({ length: 3 }, (_, row) => <div key={row} className="mt-5 h-7 rounded bg-roast/5" />)}<div className="mt-6 h-12 rounded-xl bg-pistachio/35" /></div>)}</div></>;
}

function ListSkeleton() {
  return <><div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-2xl border border-roast/10 bg-counter p-5"><div className="h-4 w-full max-w-32 rounded bg-roast/10" /><div className="mt-5 h-7 w-24 rounded bg-roast/10" /></div>)}</div><div className="mt-6 rounded-2xl border border-roast/10 bg-counter p-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="mb-4 h-10 rounded-lg bg-roast/5 last:mb-0" />)}</div></>;
}
