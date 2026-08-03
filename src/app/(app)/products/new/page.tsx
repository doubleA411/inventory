import { requireRole } from "@/lib/auth";
import { listUnits, listCategories } from "@/lib/queries";
import { listVendors } from "@/lib/purchase-queries";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";
import { createProductAction } from "../actions";

export default async function NewProductPage() {
  const { organization } = await requireRole("admin");
  const [units, categories, vendors] = await Promise.all([
    listUnits(organization.id),
    listCategories(organization.id),
    listVendors(organization.id),
  ]);

  return (
    <div>
      <PageHeader title="Add product" subtitle="Create a new item in your catalogue" />
      <ProductForm
        action={createProductAction}
        units={units}
        categories={categories}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        submitLabel="Create product"
      />
    </div>
  );
}
