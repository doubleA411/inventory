import Link from "next/link";
import { requireAuth, hasRole } from "@/lib/auth";
import { listProducts, listCategories, listUnits } from "@/lib/queries";
import { listVendors } from "@/lib/purchase-queries";
import { PageHeader, EmptyState } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { ProductsTable } from "./products-table";
import { ProductCreateSheet } from "./product-create-sheet";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; filter?: string }>;
}) {
  const { organization, role } = await requireAuth();
  const sp = await searchParams;
  const onlyLow = sp.filter === "low";
  const [products, categories, units, vendors] = await Promise.all([
    listProducts(organization.id, { search: sp.search, onlyLow }),
    listCategories(organization.id),
    listUnits(organization.id),
    listVendors(organization.id),
  ]);
  const canEdit = hasRole(role, "admin");

  const reportParams = new URLSearchParams();
  if (sp.search) reportParams.set("search", sp.search);
  if (onlyLow) reportParams.set("filter", "low");
  const reportHref = `/print/report/products${
    reportParams.toString() ? `?${reportParams.toString()}` : ""
  }`;

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${products.length} item${products.length === 1 ? "" : "s"}${
          onlyLow ? " below reorder level" : ""
        }`}
        action={
          <div className="flex gap-2">
            <Link href={reportHref} className="btn-outline">
              Export PDF
            </Link>
            {canEdit && (
              <ProductCreateSheet
                units={units.map((u) => ({
                  id: u.id,
                  name: u.name,
                  symbol: u.symbol,
                  groupName: u.groupName,
                }))}
                categories={categories}
                vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
              />
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchBox
          basePath="/products"
          defaultValue={sp.search ?? ""}
          otherParams={{ filter: onlyLow ? "low" : undefined }}
          placeholder="Search by name, code or category…"
        />
        <div className="flex gap-2">
          <Link
            href="/products"
            className={onlyLow ? "btn-outline" : "btn-primary"}
          >
            All
          </Link>
          <Link
            href="/products?filter=low"
            className={onlyLow ? "btn-primary" : "btn-outline"}
          >
            Low stock
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="No products found"
          description={
            sp.search
              ? "Try a different search."
              : "Add your first product or import a list to get started."
          }
          action={
            canEdit && (
              <div className="flex justify-center gap-2">
                <Link href="/import" className="btn-outline">
                  Import CSV/XLSX
                </Link>
              </div>
            )
          }
        />
      ) : (
        <ProductsTable
          products={products}
          categories={categories}
          currency={organization.currency}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
