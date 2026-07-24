import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getProductDetail, listUnits, listCategories } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ProductForm } from "../../product-form";
import { updateProductAction } from "../../actions";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireRole("admin");
  const { id } = await params;
  const [detail, units, categories] = await Promise.all([
    getProductDetail(organization.id, id),
    listUnits(organization.id),
    listCategories(organization.id),
  ]);
  if (!detail) notFound();
  const p = detail.product;
  const action = updateProductAction.bind(null, id);

  return (
    <div>
      <PageHeader title="Edit product" subtitle={p.name} />
      <ProductForm
        action={action}
        units={units}
        categories={categories}
        submitLabel="Save changes"
        defaults={{
          name: p.name,
          code: p.code,
          categoryId: p.categoryId,
          stockUnitId: p.stockUnitId,
          reorderLevel: p.reorderLevel,
          costPrice: p.costPrice,
          notes: p.notes,
        }}
      />
    </div>
  );
}
