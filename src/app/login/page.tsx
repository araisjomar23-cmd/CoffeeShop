import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import Image from "next/image";
import PasswordInput from "@/components/PasswordInput";
import { signIn } from "@/app/auth-actions";
import { createClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({ searchParams }: LoginPageProps) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("staff_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile) redirect("/");
  }

  const { error } = await searchParams;
  const message = error === "not-staff"
    ? "This account is not set up as shop staff. Ask the owner to grant access."
    : error === "credentials"
      ? "Email or password was incorrect."
      : error === "unavailable"
        ? "Could not verify staff access. Please try again."
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-steam px-4 py-10 text-roast">
      <section className="w-full max-w-md rounded-3xl border border-roast/10 bg-counter p-6 shadow-sm sm:p-8">
        <div className="flex justify-center">
          <Image src="/mariteas-logo.svg" alt="MariTea’s Burgers & Milk Tea" width={240} height={240} className="mb-2 h-48 w-48 object-contain" priority />
        </div>
        <p className="text-center text-sm font-semibold uppercase tracking-[0.14em] text-muted">MariTea&apos;s POS</p>
        <h1 className="mt-2 font-display text-4xl">Staff sign in</h1>
        <p className="mt-3 text-muted">Sign in with the account provided by the shop owner.</p>
        {message && <p role="alert" className="mt-5 rounded-xl border border-error/30 bg-steam p-3 text-sm font-semibold text-error">{message}</p>}
        <form action={signIn} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold" htmlFor="email">Email
            <input className="mt-2 min-h-12 w-full rounded-xl border border-roast/20 bg-steam px-4 font-normal outline-none focus:border-pistachio" id="email" name="email" type="email" autoComplete="username" required />
          </label>
          <div>
            <label className="block text-sm font-semibold" htmlFor="password">Password</label>
            <PasswordInput />
          </div>
          <button className="min-h-12 w-full rounded-xl bg-roast px-5 font-semibold text-counter hover:bg-roast/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio" type="submit">Sign in</button>
        </form>
      </section>
    </main>
  );
}

function LoginLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-steam px-4 py-10 text-roast">
      <p role="status" className="rounded-2xl bg-counter p-6 text-muted">Loading sign in…</p>
    </main>
  );
}
