import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./settings-form";
import { AssetUpload } from "./asset-upload";
import { LetterheadLayout } from "./letterhead-layout";

export default async function SettingsPage() {
  const { organization: o } = await requireRole("admin");

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Company profile, GST, branding and document defaults."
      />

      <div className="space-y-6">
        {/* Branding / uploads */}
        <div className="card p-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold">Branding & letterhead</h2>
            <p className="mt-0.5 text-sm text-(--color-muted)">
              Your letterhead is used as the background for printed quotations and bills.
            </p>
          </div>
          <div className="space-y-6">
            <AssetUpload
              field="logoUrl"
              label="Company logo"
              hint="PNG, JPG, SVG or WebP. Shown in the app and on documents."
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              currentUrl={o.logoUrl}
              aspect="square"
            />
            <AssetUpload
              field="letterheadUrl"
              label="Letterhead"
              hint="Full A4 letterhead (image or PDF). PDFs are auto-converted to an image so quotes & bills print on top of it."
              accept="image/png,image/jpeg,image/webp,application/pdf"
              currentUrl={o.letterheadUrl}
              aspect="page"
              convertPdf
            />
            <AssetUpload
              field="signatureUrl"
              label="Signature"
              hint="Optional. Appears in the signature area of documents."
              accept="image/png,image/jpeg,image/webp"
              currentUrl={o.signatureUrl}
              aspect="wide"
            />
          </div>

          {o.letterheadUrl && !o.letterheadUrl.toLowerCase().endsWith(".pdf") && (
            <div className="mt-6 border-t border-(--color-border) pt-6">
              <h3 className="text-sm font-semibold">Letterhead layout</h3>
              <p className="mt-0.5 mb-4 text-sm text-(--color-muted)">
                Position where your quote &amp; bill content prints on the letterhead.
              </p>
              <LetterheadLayout
                letterheadUrl={o.letterheadUrl}
                initialTop={Number(o.letterheadMarginTop)}
                initialBottom={Number(o.letterheadMarginBottom)}
              />
            </div>
          )}
        </div>

        <SettingsForm
          org={{
            name: o.name,
            legalName: o.legalName,
            addressLine: o.addressLine,
            city: o.city,
            stateCode: o.stateCode,
            pincode: o.pincode,
            phone: o.phone,
            email: o.email,
            website: o.website,
            gstRegistered: o.gstRegistered,
            gstin: o.gstin,
            defaultTaxRate: o.defaultTaxRate,
            defaultSac: o.defaultSac,
            bankName: o.bankName,
            bankAccount: o.bankAccount,
            bankIfsc: o.bankIfsc,
            bankUpi: o.bankUpi,
            invoicePrefix: o.invoicePrefix,
            quotePrefix: o.quotePrefix,
            invoiceStartingNumber: o.invoiceStartingNumber,
            defaultTerms: o.defaultTerms,
            defaultNotes: o.defaultNotes,
          }}
        />
      </div>
    </div>
  );
}
