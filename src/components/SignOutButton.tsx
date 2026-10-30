"use client";

import { useId, useRef, useTransition } from "react";
import { signOut } from "@/app/auth-actions";
import Icon from "@/components/Icon";
import styles from "./SignOutButton.module.css";

export default function SignOutButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [pending, startTransition] = useTransition();

  return <div className="cafe-signout">
    <button className="cafe-nav-link" type="button" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog"><Icon name="logout" />Sign out</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { if (pending) event.preventDefault(); }}>
      <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-pistachio/10 text-pistachio"><Icon name="logout" width={24} height={24} /></span>
      <h2 id={titleId} className="text-2xl font-semibold">Sign out?</h2>
      <p id={descriptionId} className="mt-3 text-base leading-relaxed text-muted">Are you sure you want to sign out? You can sign in again whenever you&apos;re ready.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button autoFocus type="button" disabled={pending} onClick={() => dialog.current?.close()} className="min-h-12 rounded-xl border border-roast/20 px-4 text-sm font-semibold hover:bg-steam disabled:opacity-60">Stay signed in</button>
        <button type="button" disabled={pending} onClick={() => startTransition(async () => { await signOut(); })} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-pistachio px-4 text-sm font-semibold text-counter hover:brightness-95 disabled:opacity-60"><Icon name="logout" />{pending ? "Signing out..." : "Sign out"}</button>
      </div>
      <p role="status" className="sr-only">{pending ? "Signing out..." : ""}</p>
    </dialog>
  </div>;
}
