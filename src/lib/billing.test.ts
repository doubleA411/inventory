import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organizations,
  users,
  memberships,
  customers,
  invoices,
  quotations,
  type Organization,
} from "@/lib/db/schema";
import {
  saveInvoiceCore,
  setInvoiceStatusCore,
  approveInvoiceCore,
  revokeInvoiceApprovalCore,
  recordPaymentCore,
  saveQuotationCore,
  approveQuotationCore,
  convertToInvoiceCore,
} from "@/lib/billing";

const run = Date.now();
const ITEM = { description: "Catering service", hsnSac: "996332", quantity: 10, rate: 100, taxRate: 18 };

describe("billing (quotations, invoices, approvals, payments)", () => {
  let gstOrg: Organization; // GST-registered, state = Tamil Nadu (33)
  let noGstOrg: Organization; // not GST-registered
  let userId: string;
  let sameStateCustomerId: string;
  let otherStateCustomerId: string;

  const cleanupOrgIds: string[] = [];
  const cleanupUserIds: string[] = [];
  const cleanupCustomerIds: string[] = [];

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({
        name: `Test GST Org ${run}`,
        currency: "INR",
        gstRegistered: true,
        stateCode: "33",
        invoicePrefix: `TINV${run}`,
        quotePrefix: `TQUO${run}`,
      })
      .returning();
    gstOrg = org;
    cleanupOrgIds.push(org.id);

    const [org2] = await db
      .insert(organizations)
      .values({
        name: `Test No-GST Org ${run}`,
        currency: "INR",
        gstRegistered: false,
        stateCode: "33",
        invoicePrefix: `TINV2${run}`,
        quotePrefix: `TQUO2${run}`,
      })
      .returning();
    noGstOrg = org2;
    cleanupOrgIds.push(org2.id);

    const [user] = await db
      .insert(users)
      .values({
        email: `billing-test-${run}@example.com`,
        passwordHash: "x",
        name: "Billing Test Owner",
      })
      .returning();
    userId = user.id;
    cleanupUserIds.push(user.id);
    await db.insert(memberships).values([
      { userId, organizationId: gstOrg.id, role: "owner" },
      { userId, organizationId: noGstOrg.id, role: "owner" },
    ]);

    const [sameState] = await db
      .insert(customers)
      .values({ organizationId: gstOrg.id, name: "Tamil Nadu Customer", stateCode: "33" })
      .returning();
    sameStateCustomerId = sameState.id;
    cleanupCustomerIds.push(sameState.id);

    const [otherState] = await db
      .insert(customers)
      .values({ organizationId: gstOrg.id, name: "Maharashtra Customer", stateCode: "27" })
      .returning();
    otherStateCustomerId = otherState.id;
    cleanupCustomerIds.push(otherState.id);
  });

  afterAll(async () => {
    // Cascades clean up invoices/quotations/items/customers/memberships.
    if (cleanupOrgIds.length) {
      await db.delete(organizations).where(inArray(organizations.id, cleanupOrgIds));
    }
    if (cleanupUserIds.length) {
      await db.delete(users).where(inArray(users.id, cleanupUserIds));
    }
  });

  describe("saveInvoiceCore — GST math", () => {
    it("splits CGST+SGST for a same-state customer", async () => {
      const res = await saveInvoiceCore(gstOrg, userId, {
        customerId: sameStateCustomerId,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, res.id));
      expect(inv.docType).toBe("tax_invoice");
      expect(Number(inv.subtotal)).toBe(1000);
      expect(Number(inv.cgst)).toBe(90);
      expect(Number(inv.sgst)).toBe(90);
      expect(Number(inv.igst)).toBe(0);
      expect(Number(inv.total)).toBe(1180);
      expect(inv.placeOfSupplyStateCode).toBe("33");
    });

    it("uses IGST only for an inter-state customer", async () => {
      const res = await saveInvoiceCore(gstOrg, userId, {
        customerId: otherStateCustomerId,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, res.id));
      expect(Number(inv.cgst)).toBe(0);
      expect(Number(inv.sgst)).toBe(0);
      expect(Number(inv.igst)).toBe(180);
      expect(inv.placeOfSupplyStateCode).toBe("27");
    });

    it("issues a Bill of Supply with no tax for a non-GST-registered org", async () => {
      const res = await saveInvoiceCore(noGstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, res.id));
      expect(inv.docType).toBe("bill_of_supply");
      expect(Number(inv.cgst) + Number(inv.sgst) + Number(inv.igst)).toBe(0);
      expect(Number(inv.total)).toBe(1000);
    });

    it("rejects an invoice with no line items", async () => {
      const res = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [],
      });
      expect(res.ok).toBe(false);
    });
  });

  describe("financial-year numbering", () => {
    it("assigns sequential, prefixed numbers within the same org+FY", async () => {
      const a = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      const b = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      const [invA] = await db.select().from(invoices).where(eq(invoices.id, a.id));
      const [invB] = await db.select().from(invoices).where(eq(invoices.id, b.id));
      expect(invA.number).toMatch(new RegExp(`^TINV${run}/26-27/\\d{4}$`));
      expect(invB.seq).toBe(invA.seq + 1);
    });
  });

  describe("owner-approval gate", () => {
    it("blocks marking an invoice sent until the owner approves it", async () => {
      const created = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const blocked = await setInvoiceStatusCore(gstOrg.id, created.id, "sent");
      expect(blocked.ok).toBe(false);
      expect(blocked.error).toMatch(/owner approval/i);

      await approveInvoiceCore(gstOrg.id, userId, created.id);
      const allowed = await setInvoiceStatusCore(gstOrg.id, created.id, "sent");
      expect(allowed.ok).toBe(true);

      const [inv] = await db.select().from(invoices).where(eq(invoices.id, created.id));
      expect(inv.status).toBe("sent");
      expect(inv.approvedAt).not.toBeNull();
    });

    it("clears approval when an approved invoice is edited again", async () => {
      const created = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      await approveInvoiceCore(gstOrg.id, userId, created.id);

      await saveInvoiceCore(gstOrg, userId, {
        id: created.id,
        customerId: null,
        issueDate: "2026-07-24",
        items: [{ ...ITEM, quantity: 20 }],
      });

      const [inv] = await db.select().from(invoices).where(eq(invoices.id, created.id));
      expect(inv.approvedAt).toBeNull();
      expect(Number(inv.subtotal)).toBe(2000);
    });

    it("supports revoking approval explicitly", async () => {
      const created = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      await approveInvoiceCore(gstOrg.id, userId, created.id);
      await revokeInvoiceApprovalCore(gstOrg.id, created.id);
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, created.id));
      expect(inv.approvedAt).toBeNull();
    });
  });

  describe("payments", () => {
    it("marks an invoice sent (not paid) after a partial payment", async () => {
      const created = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM], // total 1180
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const res = await recordPaymentCore(gstOrg.id, userId, {
        invoiceId: created.id,
        amount: 500,
        method: "cash",
      });
      expect(res.ok).toBe(true);

      const [inv] = await db.select().from(invoices).where(eq(invoices.id, created.id));
      expect(Number(inv.amountPaid)).toBe(500);
      expect(inv.status).toBe("sent");
    });

    it("marks an invoice paid once the full amount is recorded", async () => {
      const created = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM], // total 1180
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      await recordPaymentCore(gstOrg.id, userId, {
        invoiceId: created.id,
        amount: 1180,
        method: "upi",
      });
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, created.id));
      expect(inv.status).toBe("paid");
      expect(Number(inv.amountPaid)).toBe(1180);
    });
  });

  describe("quotations + convert to invoice", () => {
    it("computes quotation totals and blocks conversion until approved", async () => {
      const q = await saveQuotationCore(gstOrg, userId, {
        customerId: sameStateCustomerId,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(q.ok).toBe(true);
      if (!q.ok) return;
      const [quote] = await db.select().from(quotations).where(eq(quotations.id, q.id));
      expect(Number(quote.total)).toBe(1180);
      expect(quote.number).toMatch(new RegExp(`^TQUO${run}/26-27/\\d{4}$`));

      const blocked = await convertToInvoiceCore(gstOrg, userId, q.id);
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.error).toMatch(/owner approval/i);

      await approveQuotationCore(gstOrg.id, userId, q.id);
      const converted = await convertToInvoiceCore(gstOrg, userId, q.id);
      expect(converted.ok).toBe(true);
      if (!converted.ok) return;

      const [invRow] = await db.select().from(invoices).where(eq(invoices.id, converted.invoiceId));
      expect(Number(invRow.total)).toBe(1180);
      const [quoteAfter] = await db.select().from(quotations).where(eq(quotations.id, q.id));
      expect(quoteAfter.status).toBe("converted");
      expect(quoteAfter.convertedInvoiceId).toBe(converted.invoiceId);
    });
  });
});
