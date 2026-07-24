"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotPasswordState, FormData>(
    forgotPasswordAction,
    {},
  );

  if (state.sent) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-(--color-fg)">
          If an account exists for that email, we&apos;ve sent a link to reset your
          password. It expires in 1 hour.
        </p>
        <Link href="/login" className="text-sm font-medium text-(--color-primary) hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          placeholder="you@example.com"
        />
      </div>
      {state.error && (
        <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <Link
        href="/login"
        className="block text-center text-sm text-(--color-muted) hover:text-(--color-fg)"
      >
        Back to sign in
      </Link>
    </form>
  );
}
