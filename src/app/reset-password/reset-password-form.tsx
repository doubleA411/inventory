"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => router.push("/login"), 2000);
      return () => clearTimeout(t);
    }
  }, [state.ok, router]);

  if (!token) {
    return (
      <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
        This reset link is missing its token. Request a new one from{" "}
        <Link href="/forgot-password" className="underline">
          the forgot-password page
        </Link>
        .
      </p>
    );
  }

  if (state.ok) {
    return (
      <div className="space-y-3 text-center">
        <p className="rounded-lg bg-(--color-ok-soft) px-3 py-2 text-sm text-(--color-ok)">
          Password updated. Redirecting you to sign in…
        </p>
        <Link href="/login" className="text-sm font-medium text-(--color-primary) hover:underline">
          Sign in now
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          className="input"
          placeholder="At least 6 characters"
        />
      </div>
      <div>
        <label className="label" htmlFor="confirmPassword">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          className="input"
        />
      </div>
      {state.error && (
        <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
