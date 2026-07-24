import { requireRole } from "@/lib/auth";
import { listUnits, listCategories } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";
import { createProductAction } from "../actions";

export default async function NewProductPage() {
  const { organization } = await requireRole("admin");
  const [units, categories] = await Promise.all([
    listUnits(organization.id),
    listCategories(organization.id),
  ]);

  return (
    <div>
      <PageHeader title="Add product" subtitle="Create a new item in your catalogue" />
      <ProductForm
        action={createProductAction}
        units={units}
        categories={categories}
        submitLabel="Create product"
      />
    </div>
  );
}
