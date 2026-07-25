import { requireAuth } from "@/lib/auth";
import { AppShell } from "./nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, organization, role } = await requireAuth();
  return (
    <AppShell
      role={role}
      orgName={organization.name}
      orgLogoUrl={organization.logoUrl}
      userName={user.name}
    >
      {children}
    </AppShell>
  );
}
