import { requireRole } from "@/lib/auth";
import { listMembers } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { TeamManager } from "./team-manager";

export default async function TeamPage() {
  const { organization, user } = await requireRole("admin");
  const members = await listMembers(organization.id);

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Manage who can access your inventory and what they can do."
      />
      <TeamManager members={members} currentUserId={user.id} />
    </div>
  );
}
