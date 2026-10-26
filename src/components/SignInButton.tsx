"use client";

import { useFormStatus } from "react-dom";

export default function SignInButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-roast px-5 font-semibold text-counter hover:bg-roast/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio disabled:cursor-wait disabled:opacity-80"
      type="submit"
      disabled={pending}
      aria-live="polite"
    >
      {pending && (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5 animate-spin">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
