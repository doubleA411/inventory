import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, vendors } from "@/lib/db/schema";

// saveVendor is a server action: it calls requireRole (needs a session cookie)
// and revalidatePath (needs a request store). Stub both so the action's data
// logic can be exercised directly.
const auth = vi.hoisted(() => ({ orgId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth", () => ({
  requireRole: async () => ({ organization: { id: auth.orgId } }),
}));

const { saveVendor } = await import("./actions");

describe("saveVendor", () => {
  const createdVendorIds: string[] = [];

  beforeAll(async () => {
    // The dev database holds a real business alongside the demo org — always
    // scope to the demo org so tests can never touch real vendor records.
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Sample Caterers"))
      .limit(1);
    if (!org) throw new Error('No "Sample Caterers" org — run `npm run db:seed` first.');
    auth.orgId = org.id;
  });

  afterAll(async () => {
    if (createdVendorIds.length) {
      await db.delete(vendors).where(inArray(vendors.id, createdVendorIds));
    }
  });

  it("does not wipe fields the edit form doesn't send", async () => {
    // A vendor carrying the fields the edit sheet does not render.
    const created = await saveVendor({
      name: `Test Vendor ${Date.now()}`,
      gstin: "33AAAAA0000A1Z5",
      addressLine: "12 Example Street",
      pincode: "600001",
      email: "vendor@example.com",
      notes: "keeps the good rice",
      district: "Coimbatore",
      phone: "9000000000",
      openingBalance: 500,
    });
    expect(created.ok).toBe(true);
    createdVendorIds.push(created.id!);

    // Exactly what the edit sheet submits — name/phone/location/openingBalance.
    const updated = await saveVendor({
      id: created.id,
      name: "Test Vendor Renamed",
      phone: "9111111111",
      location: "Peelamedu",
      openingBalance: 0,
    });
    expect(updated.ok).toBe(true);

    const [row] = await db.select().from(vendors).where(eq(vendors.id, created.id!)).limit(1);

    // The edited fields changed...
    expect(row.name).toBe("Test Vendor Renamed");
    expect(row.phone).toBe("9111111111");
    expect(row.location).toBe("Peelamedu");
    expect(Number(row.openingBalance)).toBe(0);

    // ...and the untouched ones survived, rather than being nulled out.
    expect(row.gstin).toBe("33AAAAA0000A1Z5");
    expect(row.addressLine).toBe("12 Example Street");
    expect(row.pincode).toBe("600001");
    expect(row.email).toBe("vendor@example.com");
    expect(row.notes).toBe("keeps the good rice");
    expect(row.district).toBe("Coimbatore");
  });

  it("scopes updates to the caller's organization", async () => {
    const created = await saveVendor({ name: `Test Vendor Scope ${Date.now()}` });
    expect(created.ok).toBe(true);
    createdVendorIds.push(created.id!);

    auth.orgId = "00000000-0000-0000-0000-000000000000";
    await saveVendor({ id: created.id, name: "Should Not Apply" });

    const [row] = await db.select().from(vendors).where(eq(vendors.id, created.id!)).limit(1);
    expect(row.name).not.toBe("Should Not Apply");
  });
});
