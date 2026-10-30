import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import Image from "next/image";
import PasswordInput from "@/components/PasswordInput";
import SignInButton from "@/components/SignInButton";
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
      .select("user_id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile?.role === "owner") redirect("/");
  }

  const { error } = await searchParams;
  const message = error === "not-staff"
    ? "Sign in with the owner account to use this POS."
    : error === "credentials"
      ? "Email or password was incorrect."
      : error === "unavailable"
        ? "Could not verify owner access. Please try again."
      : null;

  return (
    <main className="cafe-login flex min-h-dvh items-center justify-center px-4 py-8 text-roast sm:py-12">
      <section className="cafe-login-card w-full max-w-md rounded-3xl border bg-counter p-6 sm:p-10">
        <div className="flex justify-center">
          <Image src="/mariteas-logo.png" alt="MariTea’s Burgers & Milk Tea" width={400} height={400} className="mb-2 h-28 w-28 sm:h-40 sm:w-40 object-contain" priority />
        </div>
        <p className="text-center text-sm font-semibold uppercase tracking-[0.14em] text-muted">MariTea&apos;s POS</p>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl">Welcome back.</h1>
        <p className="mt-3 text-muted">A fresh start for another good day. Sign in to your café.</p>
        {message && <p role="alert" className="mt-5 rounded-xl border border-error/30 bg-steam p-3 text-sm font-semibold text-error">{message}</p>}
        <form action={signIn} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold" htmlFor="email">Email
            <input className="mt-2 min-h-12 w-full rounded-xl border border-roast/20 bg-steam px-4 font-normal outline-none focus:border-pistachio" id="email" name="email" type="email" autoComplete="username" required />
          </label>
          <div>
            <label className="block text-sm font-semibold" htmlFor="password">Password</label>
            <PasswordInput />
          </div>
          <SignInButton />
        </form>
      </section>
    </main>
  );
}

function LoginLoading() {
  return (
    <main className="cafe-login flex min-h-dvh items-center justify-center px-4 py-8 text-roast sm:py-12">
      <section aria-busy="true" className="cafe-login-card w-full max-w-md rounded-3xl border bg-counter p-6 sm:p-10">
        <div className="flex justify-center"><Image src="/mariteas-logo.png" alt="MariTea's Burgers & Milk Tea" width={400} height={400} className="mb-2 h-28 w-28 object-contain sm:h-40 sm:w-40" /></div>
        <p className="text-center text-sm font-semibold uppercase tracking-[0.14em] text-muted">MariTea&apos;s POS</p>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl">Welcome back.</h1>
        <p className="mt-3 text-muted">A fresh start for another good day. Sign in to your café.</p>
        <p role="status" className="sr-only">Loading sign in...</p>
        <div aria-hidden="true" className="mt-6 space-y-5 motion-safe:animate-pulse">
          {["Email", "Password"].map(label => <div key={label}><p className="text-sm font-semibold">{label}</p><div className="mt-2 h-12 rounded-xl border border-roast/10 bg-steam" /></div>)}
          <div className="h-12 rounded-xl bg-roast/20" />
        </div>
      </section>
    </main>
  );
}
