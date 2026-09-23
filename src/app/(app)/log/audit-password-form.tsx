"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { unlockAuditLog, type AuditUnlockState } from "./actions";

const initialState: AuditUnlockState = {};

export function AuditPasswordForm() {
  const router = useRouter();
  const [state, action, pending] = useActionState(unlockAuditLog, initialState);
  useEffect(() => {
    if (!pending && state.unlocked) router.refresh();
  }, [pending, router, state.unlocked]);

  return (
    <div className="mx-auto max-w-md pt-12">
      <div className="card p-6 sm:p-8">
        <ShieldCheck className="mb-4 h-8 w-8 text-(--color-primary)" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Unlock audit log</h1>
        <p className="mt-2 text-sm text-(--color-muted)">
          Re-enter your owner password to view sensitive organization-wide activity. Access closes after 15 minutes.
        </p>
        <form action={action} className="mt-6 space-y-4">
          <div>
            <label htmlFor="audit-password" className="mb-1.5 block text-sm font-medium">
              Your password
            </label>
            <input
              id="audit-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              className="input w-full"
            />
          </div>
          {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={pending}>
            {pending ? "Unlocking…" : "Unlock log"}
          </button>
        </form>
      </div>
    </div>
  );
}
