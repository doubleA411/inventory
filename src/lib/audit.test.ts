import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditEvents, customers, organizations } from "@/lib/db/schema";

// test/setup.ts stubs the audit module for every other suite; this one needs
// the real thing. It works in a throwaway org — deleting the org is the one
// way the append-only trigger lets audit rows go.
vi.unmock("@/lib/audit");
const { listAuditEvents, writeAuditEvent } = await import("./audit");

describe("audit log", () => {
  const run = Date.now();
  let orgId: string;
  let customerId: string;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `Test Audit Org ${run}`, currency: "INR", timezone: "Asia/Kolkata" })
      .returning();
    orgId = org.id;
    const [c] = await db
      .insert(customers)
      .values({ organizationId: orgId, name: `Audit Customer ${run}`, district: "Chennai" })
      .returning();
    customerId = c.id;
  });

  afterAll(async () => {
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it("resolves the record's label when none is given", async () => {
    await writeAuditEvent(db, {
      orgId,
      action: "customer.created",
      entityType: "customer",
      entityId: customerId,
      summary: "Created customer",
    });
    const { events } = await listAuditEvents(orgId, "Asia/Kolkata", { action: "customer.created" });
    expect(events).toHaveLength(1);
    expect(events[0].entityLabel).toBe(`Audit Customer ${run}`);
  });

  it("rolls back with the transaction it was written in", async () => {
    await db
      .transaction(async (tx) => {
        await writeAuditEvent(tx, { orgId, action: "test.rolled_back", entityType: "test", summary: "x" });
        throw new Error("abort");
      })
      .catch(() => {});
    const { events } = await listAuditEvents(orgId, "Asia/Kolkata", { action: "test.rolled_back" });
    expect(events).toHaveLength(0);
  });

  it("refuses to edit or delete an event", async () => {
    await writeAuditEvent(db, { orgId, action: "test.immutable", entityType: "test", summary: "original" });
    await expect(
      db.update(auditEvents).set({ summary: "rewritten" }).where(eq(auditEvents.action, "test.immutable")),
    ).rejects.toThrow();
    await expect(
      db.delete(auditEvents).where(eq(auditEvents.action, "test.immutable")),
    ).rejects.toThrow();
  });

  it("filters dates by the organization's calendar day, and ignores malformed params", async () => {
    // 20:00 UTC on the 1st is 01:30 IST on the 2nd.
    const at = new Date("2026-01-01T20:00:00Z");
    await db.insert(auditEvents).values({
      organizationId: orgId,
      action: "test.dated",
      entityType: "test",
      summary: "late night",
      createdAt: at,
    });
    const onSecond = await listAuditEvents(orgId, "Asia/Kolkata", { action: "test.dated", from: "2026-01-02", to: "2026-01-02" });
    expect(onSecond.events).toHaveLength(1);
    const onFirst = await listAuditEvents(orgId, "Asia/Kolkata", { action: "test.dated", from: "2026-01-01", to: "2026-01-01" });
    expect(onFirst.events).toHaveLength(0);

    const junk = await listAuditEvents(orgId, "Asia/Kolkata", { action: "test.dated", actorId: "nope", from: "yesterday" });
    expect(junk.events).toHaveLength(1);
  });
});
