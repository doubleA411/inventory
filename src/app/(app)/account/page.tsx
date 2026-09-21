import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "./change-password-form";

export default async function AccountPage() {
  const { user } = await requireAuth();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Your account" subtitle="Personal sign-in and account security." />
      <div className="mb-4 px-1 text-sm">
        <span className="text-(--color-muted)">Signed in as </span>
        <span className="font-medium">{user.email}</span>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
