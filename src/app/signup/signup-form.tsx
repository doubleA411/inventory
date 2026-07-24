"use client";

import { useActionState } from "react";
import { signupAction, type SignupState } from "./actions";
import { INDUSTRIES } from "@/lib/industries";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    signupAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="companyName">
          Company name
        </label>
        <input
          id="companyName"
          name="companyName"
          required
          className="input"
          placeholder="e.g. Sunrise Caterers"
        />
      </div>
      <div>
        <label className="label" htmlFor="industry">
          Industry
        </label>
        <select id="industry" name="industry" required className="input" defaultValue="">
          <option value="" disabled>
            Choose your industry…
          </option>
          {INDUSTRIES.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" required className="input" placeholder="Full name" />
      </div>
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
          placeholder="you@company.com"
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
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
      {state.error && (
        <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? "Creating your workspace…" : "Create account"}
      </button>
    </form>
  );
}
