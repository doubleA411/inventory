import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { getImportUnits, getImportExistingNames } from "./actions";
import { ImportTool } from "./import-tool";

export default async function ImportPage() {
  await requireRole("admin");
  const [units, existingNames] = await Promise.all([
    getImportUnits(),
    getImportExistingNames(),
  ]);

  return (
    <div>
      <PageHeader
        title="Import / Export"
        subtitle="Bulk-load your product list from CSV or Excel, or export your data."
      />
      <ImportTool units={units} existingNames={existingNames} />
    </div>
  );
}
