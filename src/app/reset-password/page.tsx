import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const ctx = await getAuthContext();
  if (ctx) redirect("/dashboard");
  const { token } = await searchParams;

  return (
    <div className="min-h-full grid place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-(--color-primary)">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9" />
          </div>
          <h1 className="text-xl font-semibold">Set a new password</h1>
        </div>

        <div className="card p-6">
          <ResetPasswordForm token={token ?? ""} />
        </div>
      </div>
    </div>
  );
}
