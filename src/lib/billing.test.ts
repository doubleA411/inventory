import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
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
  reverseInvoicePaymentCore,
  deleteQuotationCore,
  deleteInvoiceCore,
  saveQuotationCore,
  setQuotationStatusCore,
  approveQuotationCore,
  convertToInvoiceCore,
  recordQuotationAdvanceCore,
  markQuotationTakenCore,
  unmarkQuotationTakenCore,
} from "@/lib/billing";
import { listUpcomingEvents } from "@/lib/billing-queries";
import { eventExpenseTotal } from "@/lib/expenses";

const run = Date.now();
const ITEM = {
  description: "Catering service",
  hsnSac: "996332",
  quantity: 10,
  unit: "plate",
  rate: 100,
  taxRate: 18,
};

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

    it("reversing a payment gives the due back and steps a paid invoice back to sent", async () => {
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
      const { payments } = await import("@/lib/db/schema");
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, created.id));

      const result = await reverseInvoicePaymentCore(gstOrg.id, userId, payment.id);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.amount).toBe(1180);

      const [inv] = await db.select().from(invoices).where(eq(invoices.id, created.id));
      expect(inv.status).toBe("sent"); // stepped back from "paid", not to "draft"
      expect(Number(inv.amountPaid)).toBe(0);

      const remaining = await db
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, created.id));
      expect(remaining).toHaveLength(0);
    });

    it("reports a payment that is already gone instead of throwing", async () => {
      const created = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      await recordPaymentCore(gstOrg.id, userId, {
        invoiceId: created.id,
        amount: 500,
        method: "cash",
      });
      const { payments } = await import("@/lib/db/schema");
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, created.id));
      expect((await reverseInvoicePaymentCore(gstOrg.id, userId, payment.id)).ok).toBe(true);

      const again = await reverseInvoicePaymentCore(gstOrg.id, userId, payment.id);
      expect(again.ok).toBe(false);
      if (!again.ok) expect(again.error).toMatch(/no longer recorded/i);
    });

    it("refuses to delete an invoice that has payments recorded against it", async () => {
      const created = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      // Deletable while nothing has been collected.
      await recordPaymentCore(gstOrg.id, userId, {
        invoiceId: created.id,
        amount: 500,
        method: "cash",
      });

      // payments.invoiceId is ON DELETE CASCADE, so this would take the
      // payment row with it and wipe the money from the books silently.
      const blocked = await deleteInvoiceCore(gstOrg.id, created.id);
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) expect(blocked.error).toMatch(/cancel it instead/i);
      const [stillThere] = await db.select().from(invoices).where(eq(invoices.id, created.id));
      expect(stillThere).toBeTruthy();
    });

    it("deletes an invoice that never took any money", async () => {
      const created = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const del = await deleteInvoiceCore(gstOrg.id, created.id);
      expect(del.ok).toBe(true);
      const rows = await db.select().from(invoices).where(eq(invoices.id, created.id));
      expect(rows).toHaveLength(0);
    });

    it("refuses a payment above the balance due unless explicitly allowed", async () => {
      const created = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM], // total 1180
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const tooMuch = await recordPaymentCore(gstOrg.id, userId, {
        invoiceId: created.id,
        amount: 11800,
        method: "cash",
      });
      expect(tooMuch.ok).toBe(false);
      if (tooMuch.ok) throw new Error("expected refusal");
      expect(tooMuch.overpayment).toEqual({ due: 1180, amount: 11800 });

      // The refusal must not have banked anything on the way out.
      const [untouched] = await db.select().from(invoices).where(eq(invoices.id, created.id));
      expect(Number(untouched.amountPaid)).toBe(0);

      const forced = await recordPaymentCore(
        gstOrg.id,
        userId,
        { invoiceId: created.id, amount: 11800, method: "cash" },
        { allowOverpayment: true },
      );
      expect(forced.ok).toBe(true);
    });

    it("logs who reversed a payment and when, after the payment row is gone", async () => {
      const created = await saveInvoiceCore(gstOrg, userId, {
        customerId: null,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      await recordPaymentCore(gstOrg.id, userId, {
        invoiceId: created.id,
        amount: 1180,
        method: "upi",
      });
      const { payments, activityLog } = await import("@/lib/db/schema");
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, created.id));
      expect((await reverseInvoicePaymentCore(gstOrg.id, userId, payment.id)).ok).toBe(true);

      const entries = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.invoiceId, created.id));
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe("payment_reversed");
      expect(entries[0].userId).toBe(userId);
      expect(Number(entries[0].amount)).toBe(1180);
      // The name is denormalised so the entry still reads correctly if the
      // user is later removed.
      expect(entries[0].userName).toBeTruthy();
      expect(entries[0].createdAt).toBeInstanceOf(Date);
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

      // Frozen once converted: editing it would leave the issued invoice
      // saying one price and the quotation another, with nothing flagging it.
      const edit = await saveQuotationCore(gstOrg, userId, {
        id: q.id,
        customerId: sameStateCustomerId,
        issueDate: "2026-07-24",
        items: [{ ...ITEM, rate: 500 }],
      });
      expect(edit.ok).toBe(false);
      if (!edit.ok) expect(edit.error).toMatch(/already been turned into an invoice/i);

      const [unchanged] = await db.select().from(quotations).where(eq(quotations.id, q.id));
      expect(Number(unchanged.total)).toBe(1180);

      // Nor deletable: the FKs are ON DELETE SET NULL, so this would silently
      // cut the invoice loose and drop the expense-to-event links behind the
      // profitability figures rather than failing.
      const del = await deleteQuotationCore(gstOrg.id, q.id);
      expect(del.ok).toBe(false);
      if (!del.ok) expect(del.error).toMatch(/can't be deleted/i);
      const [stillThere] = await db.select().from(quotations).where(eq(quotations.id, q.id));
      expect(stillThere).toBeTruthy();
    });

    it("attributes ingredients to a function that has not been invoiced yet", async () => {
      // The order caterers actually work in: quote the job, cook on the day,
      // bill afterwards. Attribution used to run only through the invoice, so
      // everything used before invoicing was orphaned and the event reported a
      // 100% margin it never earned.
      const q = await saveQuotationCore(gstOrg, userId, {
        customerId: sameStateCustomerId,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(q.ok).toBe(true);
      if (!q.ok) return;

      const { products, units, stockMovements } = await import("@/lib/db/schema");
      const [kg] = await db
        .select()
        .from(units)
        .where(and(eq(units.organizationId, gstOrg.id), eq(units.symbol, "kg")))
        .limit(1);
      if (!kg) return; // seeded units are required for this path

      const [product] = await db
        .insert(products)
        .values({
          organizationId: gstOrg.id,
          name: `S1 test ${run}`,
          stockUnitId: kg.id,
        })
        .returning();

      const { applyMovement } = await import("@/lib/stock");
      const restocked = await applyMovement({
        organizationId: gstOrg.id,
        productId: product.id,
        type: "restock",
        quantity: 10,
        unitId: kg.id,
        unitCost: 50,
      });
      expect(restocked.ok).toBe(true);

      // No invoice exists — this is the case that used to be unrecordable.
      const used = await applyMovement({
        organizationId: gstOrg.id,
        productId: product.id,
        type: "usage",
        quantity: 4,
        unitId: kg.id,
        quotationId: q.id,
      });
      expect(used.ok).toBe(true);

      const summary = await eventExpenseTotal(gstOrg.id, q.id);
      expect(summary.total).toBe(200); // 4 kg drawn at ₹50
      expect(summary.count).toBe(1);

      await db.delete(stockMovements).where(eq(stockMovements.productId, product.id));
      await db.delete(products).where(eq(products.id, product.id));
    });

    it("deletes a quotation that never became an invoice", async () => {
      const q = await saveQuotationCore(gstOrg, userId, {
        customerId: sameStateCustomerId,
        issueDate: "2026-07-24",
        items: [ITEM],
      });
      expect(q.ok).toBe(true);
      if (!q.ok) return;

      const del = await deleteQuotationCore(gstOrg.id, q.id);
      expect(del.ok).toBe(true);
      const rows = await db.select().from(quotations).where(eq(quotations.id, q.id));
      expect(rows).toHaveLength(0);
    });
  });

  describe("booking status + upcoming events", () => {
    function daysFromNow(n: number): string {
      return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
    }

    /** A quotation with its own eventDate — the primary, always-there field. */
    async function makeQuotation(eventDate: string | null) {
      const q = await saveQuotationCore(gstOrg, userId, {
        customerId: sameStateCustomerId,
        issueDate: "2026-07-24",
        eventDate,
        items: [ITEM],
      });
      expect(q.ok).toBe(true);
      if (!q.ok) throw new Error(q.error);
      return q.id;
    }

    it("falls back to the earliest line-item date when the quotation has no eventDate of its own", async () => {
      const q = await saveQuotationCore(gstOrg, userId, {
        customerId: sameStateCustomerId,
        issueDate: "2026-07-24",
        // No top-level eventDate — only the per-line-item one (how quotations
        // created before that column existed, or via the menu editor only,
        // still carry a date).
        items: [{ ...ITEM, eventDate: daysFromNow(6) }],
      });
      expect(q.ok).toBe(true);
      if (!q.ok) return;
      await markQuotationTakenCore(gstOrg.id, userId, q.id);

      const upcoming = await listUpcomingEvents(gstOrg.id, 20);
      const row = upcoming.find((e) => e.id === q.id);
      expect(row?.nextEventDate).toBe(daysFromNow(6));
    });

    it("recording an advance sets the timestamp; clearing it nulls both fields", async () => {
      const id = await makeQuotation(daysFromNow(5));

      const rejected = await recordQuotationAdvanceCore(gstOrg.id, id, -100);
      expect(rejected.ok).toBe(false);

      const recorded = await recordQuotationAdvanceCore(gstOrg.id, id, 500);
      expect(recorded.ok).toBe(true);
      const [after] = await db.select().from(quotations).where(eq(quotations.id, id));
      expect(Number(after.advanceAmount)).toBe(500);
      expect(after.advanceRecordedAt).not.toBeNull();

      await recordQuotationAdvanceCore(gstOrg.id, id, null);
      const [cleared] = await db.select().from(quotations).where(eq(quotations.id, id));
      expect(cleared.advanceAmount).toBeNull();
      expect(cleared.advanceRecordedAt).toBeNull();
    });

    it("refuses an advance above the quotation total unless explicitly allowed", async () => {
      const id = await makeQuotation(daysFromNow(5));
      // ITEM is 10 x 100 + 18% GST = 1180.
      const tooMuch = await recordQuotationAdvanceCore(gstOrg.id, id, 11800);
      expect(tooMuch.ok).toBe(false);
      if (tooMuch.ok) throw new Error("expected refusal");
      expect(tooMuch.overAdvance).toEqual({ total: 1180, amount: 11800 });

      // Nothing was written — a refused advance must not leave the booking
      // looking half-confirmed.
      const [untouched] = await db.select().from(quotations).where(eq(quotations.id, id));
      expect(untouched.advanceAmount).toBeNull();

      const forced = await recordQuotationAdvanceCore(gstOrg.id, id, 11800, {
        allowOverAdvance: true,
      });
      expect(forced.ok).toBe(true);
      const [after] = await db.select().from(quotations).where(eq(quotations.id, id));
      expect(Number(after.advanceAmount)).toBe(11800);
    });

    it("marking taken and unmarking clears both takenAt and takenBy", async () => {
      const id = await makeQuotation(daysFromNow(5));

      await markQuotationTakenCore(gstOrg.id, userId, id);
      const [taken] = await db.select().from(quotations).where(eq(quotations.id, id));
      expect(taken.takenAt).not.toBeNull();
      expect(taken.takenBy).toBe(userId);

      await unmarkQuotationTakenCore(gstOrg.id, id);
      const [unmarked] = await db.select().from(quotations).where(eq(quotations.id, id));
      expect(unmarked.takenAt).toBeNull();
      expect(unmarked.takenBy).toBeNull();
    });

    it("only surfaces bookings that are taken up, with a future date, nearest first", async () => {
      const untaken = await makeQuotation(daysFromNow(3)); // future, but never taken up
      const takenSoon = await makeQuotation(daysFromNow(10));
      const takenLater = await makeQuotation(daysFromNow(20));
      const advancePast = await makeQuotation(daysFromNow(-2)); // taken, but date already passed
      const rejectedButTaken = await makeQuotation(daysFromNow(7));

      await markQuotationTakenCore(gstOrg.id, userId, takenLater);
      await recordQuotationAdvanceCore(gstOrg.id, takenSoon, 1000);
      await recordQuotationAdvanceCore(gstOrg.id, advancePast, 1000);
      await recordQuotationAdvanceCore(gstOrg.id, rejectedButTaken, 1000);
      await setQuotationStatusCore(gstOrg.id, rejectedButTaken, "rejected");

      const upcoming = await listUpcomingEvents(gstOrg.id, 20);
      const ids = upcoming.map((e) => e.id);

      expect(ids).toContain(takenSoon);
      expect(ids).toContain(takenLater);
      expect(ids).not.toContain(untaken); // never taken up
      expect(ids).not.toContain(advancePast); // date already passed
      expect(ids).not.toContain(rejectedButTaken); // rejected

      // Nearest date first.
      const soonIdx = ids.indexOf(takenSoon);
      const laterIdx = ids.indexOf(takenLater);
      expect(soonIdx).toBeLessThan(laterIdx);
    });

    it("carries the recorded advance over as the invoice's opening payment on conversion", async () => {
      const q = await saveQuotationCore(gstOrg, userId, {
        customerId: sameStateCustomerId,
        issueDate: "2026-07-24",
        eventDate: daysFromNow(15),
        items: [ITEM], // total 1180
      });
      expect(q.ok).toBe(true);
      if (!q.ok) return;
      await recordQuotationAdvanceCore(gstOrg.id, q.id, 300);
      await approveQuotationCore(gstOrg.id, userId, q.id);

      const converted = await convertToInvoiceCore(gstOrg, userId, q.id);
      expect(converted.ok).toBe(true);
      if (!converted.ok) return;

      const [inv] = await db.select().from(invoices).where(eq(invoices.id, converted.invoiceId));
      expect(Number(inv.total)).toBe(1180); // full price, unchanged
      expect(Number(inv.amountPaid)).toBe(300); // advance already applied
      expect(inv.status).toBe("sent"); // partially paid, not fully

      const { payments } = await import("@/lib/db/schema");
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, converted.invoiceId));
      expect(Number(payment.amount)).toBe(300);
      expect(payment.note).toMatch(/advance/i);
    });
  });
});
