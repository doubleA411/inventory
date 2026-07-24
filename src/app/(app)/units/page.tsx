import { requireRole } from "@/lib/auth";
import { listUnits, listUnitGroups } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { UnitsManager } from "./units-manager";

export default async function UnitsPage() {
  const { organization } = await requireRole("admin");
  const [units, groups] = await Promise.all([
    listUnits(organization.id),
    listUnitGroups(organization.id),
  ]);

  return (
    <div>
      <PageHeader
        title="Units"
        subtitle="Define the units of measure and how they convert. Any industry can add its own."
      />
      <UnitsManager units={units} groups={groups} />
    </div>
  );
}
