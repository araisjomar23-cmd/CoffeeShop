"use client";

import { useEffect, useState } from "react";

type HealthState = "Checking…" | "Connected" | string;

export default function HealthPage() {
  const [status, setStatus] = useState<HealthState>("Checking…");

  useEffect(() => {
    async function checkSupabase() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        setStatus("Missing Supabase environment variables");
        return;
      }

      try {
        const response = await fetch(
          `${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`,
          { headers: { apikey: supabaseAnonKey } },
        );

        if (!response.ok) {
          const errorBody = await response.text();
          setStatus(errorBody || `${response.status} ${response.statusText}`);
          return;
        }

        setStatus("Connected");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }

    void checkSupabase();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <p role="status" aria-live="polite">
        {status}
      </p>
    </main>
  );
}
