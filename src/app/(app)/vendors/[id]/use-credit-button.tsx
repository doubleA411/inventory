"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/utils";
import { applyVendorCredit } from "../actions";

/**
 * Settles a vendor's unpaid bills from credit they already hold.
 *
 * Credit offsets the vendor's balance from the moment it exists, so the header
 * can read "nothing owed" while a bill underneath still shows a due — true, but
 * it reads as a bug. This closes that gap by recording which bills the money
 * actually paid for. It moves no money, so the wording says so plainly rather
 * than looking like another payment.
 */
export function UseCreditButton({
  vendorId,
  credit,
  currency,
}: {
  vendorId: string;
  credit: number;
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-2 flex flex-col items-center gap-1">
      <button
        className="btn-outline h-8 px-2 text-xs"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await applyVendorCredit(vendorId);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.refresh();
          })
        }
      >
        {pending ? "Using credit…" : `Use ${fmtMoney(credit, currency)} on unpaid bills`}
      </button>
      {error && <p className="text-xs text-(--color-danger)">{error}</p>}
    </div>
  );
}
