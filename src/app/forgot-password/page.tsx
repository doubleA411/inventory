import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const ctx = await getAuthContext();
  if (ctx) redirect("/dashboard");

  return (
    <div className="min-h-full grid place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-(--color-primary)">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9" />
          </div>
          <h1 className="text-xl font-semibold">Reset your password</h1>
          <p className="mt-1 text-sm text-(--color-muted)">
            Enter your email and we&apos;ll send you a reset link
          </p>
        </div>

        <div className="card p-6">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
