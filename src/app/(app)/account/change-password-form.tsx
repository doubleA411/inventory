"use client";

import { useActionState } from "react";
import { CheckCircle2, KeyRound, ShieldCheck } from "lucide-react";
import { PasswordInput } from "@/components/password-input";
import { changePasswordAction, type ChangePasswordState } from "./actions";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <section className="card overflow-hidden">
      <div className="flex gap-3 border-b border-(--color-border) p-5 sm:p-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-(--color-primary-soft) text-(--color-primary)">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Change password</h2>
          <p className="mt-1 text-sm leading-5 text-(--color-muted)">
            Updating it signs out every other browser using this account.
          </p>
        </div>
      </div>

      <form action={formAction} className="space-y-4 p-5 sm:p-6">
        <div>
          <label className="label" htmlFor="currentPassword">Current password</label>
          <PasswordInput
            id="currentPassword"
            name="currentPassword"
            autoComplete="current-password"
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="newPassword">New password</label>
            <PasswordInput
              id="newPassword"
              name="newPassword"
              autoComplete="new-password"
              minLength={8}
              placeholder="At least 8 characters"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="confirmPassword">Confirm new password</label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
        </div>

        {state.error ? (
          <p role="alert" className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-(--color-ok-soft) px-3 py-2 text-sm text-(--color-ok)">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Password updated. Other signed-in browsers have been signed out.
          </p>
        ) : null}

        <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-(--color-border) pt-4 sm:flex-row sm:items-center">
          <p className="flex items-center gap-2 text-xs text-(--color-muted)">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Your password is stored as a secure hash.
          </p>
          <button className="btn-primary justify-center" type="submit" disabled={pending}>
            {pending ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </section>
  );
}
