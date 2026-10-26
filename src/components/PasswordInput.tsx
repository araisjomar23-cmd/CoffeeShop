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
        {isVisible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
