"use client";

import { useState } from "react";

export default function PasswordInput() {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative mt-2">
      <input
        className="min-h-12 w-full rounded-xl border border-roast/20 bg-steam px-4 pr-20 font-normal outline-none focus:border-pistachio"
        id="password"
        name="password"
        type={isVisible ? "text" : "password"}
        autoComplete="current-password"
        required
      />
      <button
        type="button"
        aria-label={isVisible ? "Hide password" : "Show password"}
        aria-pressed={isVisible}
        onClick={() => setIsVisible((visible) => !visible)}
        className="absolute inset-y-0 right-2 my-1 min-w-14 rounded-lg px-2 text-sm font-semibold text-muted hover:bg-roast/5 hover:text-roast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pistachio"
      >
        {isVisible ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-5 w-5">
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.3 4.1 9.5 6.2a1.5 1.5 0 0 1 0 1.6 14 14 0 0 1-3 3.5" />
            <path d="M6.2 6.2a14 14 0 0 0-3.7 5 1.5 1.5 0 0 0 0 1.6C3.7 14.9 7 19 12 19a10.8 10.8 0 0 0 4-.8" />
          </svg>
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mx-auto h-5 w-5">
            <path d="M2.5 12s3.3-7 9.5-7 9.5 7 9.5 7-3.3 7-9.5 7-9.5-7-9.5-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
