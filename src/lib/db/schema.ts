import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  date,
  timestamp,
  unique,
  index,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const roleEnum = pgEnum("role", ["owner", "admin", "staff"]);
export const movementTypeEnum = pgEnum("movement_type", [
  "restock",
  "usage",
  "adjustment",
  "waste",
]);

// ---------------------------------------------------------------------------
// Tenancy (single org in v1, but every table carries organization_id so this
// generalises to multi-tenant SaaS later without a schema rewrite).
// ---------------------------------------------------------------------------
export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("INR"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  industry: text("industry"),

  // Legal / contact profile (used on quotations & bills)
  legalName: text("legal_name"),
  addressLine: text("address_line"),
  city: text("city"),
  state: text("state"),
  stateCode: text("state_code"), // GST state code, e.g. "33" for Tamil Nadu
  pincode: text("pincode"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),

  // GST settings
  gstRegistered: boolean("gst_registered").notNull().default(false),
  gstin: text("gstin"),
  defaultTaxRate: numeric("default_tax_rate", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  defaultSac: text("default_sac"), // e.g. 996332 for outdoor catering

  // Branding / documents
  logoUrl: text("logo_url"),
  letterheadUrl: text("letterhead_url"),
  // Content-safe margins (px on an A4 page) so text clears the letterhead art.
  letterheadMarginTop: numeric("letterhead_margin_top").notNull().default("170"),
  letterheadMarginBottom: numeric("letterhead_margin_bottom").notNull().default("120"),
  // Menu-page customer/venue block sits closer to the true top of the page
  // than letterheadMarginTop — beside the logo rather than below it — so it
  // needs its own, independently configurable offset (px).
  customerBlockTop: numeric("customer_block_top").notNull().default("40"),
  // Same idea for the invoice title/meta + seller-details block, which also
  // sits beside the logo rather than below it.
  docTitleTop: numeric("doc_title_top").notNull().default("40"),
  signatureUrl: text("signature_url"),
  // Printed document text appearance
  docHeadingColor: text("doc_heading_color").notNull().default("#1f2937"),
  docBodyColor: text("doc_body_color").notNull().default("#4b5563"),
  docFontSize: integer("doc_font_size").notNull().default(12), // px, base body size

  // Bank details (invoice footer)
  bankName: text("bank_name"),
  bankAccountName: text("bank_account_name"),
  bankAccount: text("bank_account"),
  bankIfsc: text("bank_ifsc"),
  bankUpi: text("bank_upi"),

  // Document numbering & defaults
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  quotePrefix: text("quote_prefix").notNull().default("QUO"),
  purchaseBillPrefix: text("purchase_bill_prefix").notNull().default("PB"),
  purchaseListPrefix: text("purchase_list_prefix").notNull().default("PL"),
  // Last invoice number issued outside this app, if migrating from another
  // system — the next generated invoice's seq will be this + 1.
  invoiceStartingNumber: integer("invoice_starting_number").notNull().default(0),
  defaultTerms: text("default_terms"),
  defaultNotes: text("default_notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // SHA-256 hex digest of the raw token — the raw token is only ever sent
    // by email and never stored, so a DB read can't be used to reset a password.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("staff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("memberships_user_org_uq").on(t.userId, t.organizationId)],
);

// ---------------------------------------------------------------------------
// Units & conversions
// ---------------------------------------------------------------------------
export const unitGroups = pgTable(
  "unit_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // Weight, Volume, Count
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("unit_groups_org_name_uq").on(t.organizationId, t.name)],
);

export const units = pgTable(
  "units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => unitGroups.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // Kilogram
    symbol: text("symbol").notNull(), // kg
    // How many base units one of this unit equals (kg -> 1000 when base = gram).
    factorToBase: numeric("factor_to_base", { precision: 20, scale: 6 })
      .notNull()
      .default("1"),
    isBase: boolean("is_base").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("units_org_symbol_uq").on(t.organizationId, t.symbol)],
);

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("categories_org_name_uq").on(t.organizationId, t.name)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"), // SKU / internal code
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    // The unit stock is tracked/displayed in for this product.
    stockUnitId: uuid("stock_unit_id")
      .notNull()
      .references(() => units.id),
    // Denormalised running balance in stockUnit (== sum of batch remaining).
    currentStock: numeric("current_stock", { precision: 20, scale: 6 })
      .notNull()
      .default("0"),
    reorderLevel: numeric("reorder_level", { precision: 20, scale: 6 })
      .notNull()
      .default("0"),
    costPrice: numeric("cost_price", { precision: 20, scale: 2 }),
    // Convenience default only — a product is never locked to one supplier,
    // this just pre-fills the vendor picker on Restock. Always overridable.
    preferredVendorId: uuid("preferred_vendor_id").references(
      (): AnyPgColumn => vendors.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("products_org_code_uq").on(t.organizationId, t.code),
    index("products_org_idx").on(t.organizationId),
  ],
);

// ---------------------------------------------------------------------------
// Stock: batches (for FEFO + expiry) and an append-only movement ledger
// ---------------------------------------------------------------------------
export const stockBatches = pgTable(
  "stock_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // Remaining quantity in the product's stock unit.
    quantityRemaining: numeric("quantity_remaining", { precision: 20, scale: 6 })
      .notNull()
      .default("0"),
    expiryDate: date("expiry_date"), // nullable — not everything expires
    receivedDate: date("received_date").notNull().defaultNow(),
    // What this batch actually cost per stock unit (restock price at the time
    // it was received). Null for batches created before this existed, or for
    // adjustment-created batches with no real purchase price.
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
    note: text("note"),
    // Set when this batch was received via a purchase bill line item (either
    // the full editor or the vendor+amount fields on a quick restock) — null
    // for batches created by a plain restock/adjustment with no vendor.
    purchaseBillItemId: uuid("purchase_bill_item_id").references(
      (): AnyPgColumn => purchaseBillItems.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("batches_product_idx").on(t.productId)],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    type: movementTypeEnum("type").notNull(),
    // Quantity in the *movement* unit (may differ from the product stock unit).
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    // Signed delta actually applied, in the product's stock unit.
    deltaInStockUnit: numeric("delta_in_stock_unit", { precision: 20, scale: 6 }).notNull(),
    // Product balance (stock unit) after this movement was applied.
    balanceAfter: numeric("balance_after", { precision: 20, scale: 6 }).notNull(),
    batchId: uuid("batch_id").references(() => stockBatches.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    // Cost snapshot at movement time: unitCost = product cost price, costAmount
    // = |deltaInStockUnit| * unitCost (value of stock moved).
    unitCost: numeric("unit_cost", { precision: 14, scale: 2 }),
    costAmount: numeric("cost_amount", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    // For usage: which bill/invoice this stock was consumed for (optional).
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    // For usage: which function the ingredients were cooked for.
    //
    // This is the one that matters for profitability. Attribution used to run
    // only through invoiceId, which meant an event's ingredient cost could not
    // be recorded until the invoice existed — but caterers cook first and bill
    // afterwards, so everything used before invoicing was orphaned into the
    // day's stock-usage total and never reached the function it paid for. A
    // booking that never converted could never receive costs at all.
    //
    // Set directly from the "which function is this for?" picker, which offers
    // every quotation including drafts — the same list the expense form uses,
    // so both finally answer the same question the same way.
    quotationId: uuid("quotation_id").references(() => quotations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("movements_product_idx").on(t.productId),
    index("movements_org_created_idx").on(t.organizationId, t.createdAt),
    index("movements_quotation_idx").on(t.quotationId),
  ],
);

// ---------------------------------------------------------------------------
// Relations (for typed relational queries)
// ---------------------------------------------------------------------------
export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  stockUnit: one(units, {
    fields: [products.stockUnitId],
    references: [units.id],
  }),
  batches: many(stockBatches),
  movements: many(stockMovements),
}));

export const unitsRelations = relations(units, ({ one }) => ({
  group: one(unitGroups, {
    fields: [units.groupId],
    references: [unitGroups.id],
  }),
}));

export const stockBatchesRelations = relations(stockBatches, ({ one }) => ({
  product: one(products, {
    fields: [stockBatches.productId],
    references: [products.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id],
  }),
  unit: one(units, { fields: [stockMovements.unitId], references: [units.id] }),
  user: one(users, { fields: [stockMovements.userId], references: [users.id] }),
}));

// Convenience type exports
export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type UnitGroup = typeof unitGroups.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type StockBatch = typeof stockBatches.$inferSelect;
export type StockMovement = typeof stockMovements.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type MovementType = (typeof movementTypeEnum.enumValues)[number];

// ===========================================================================
// Billing: customers, quotations, invoices, payments
// ===========================================================================
export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "converted",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "cancelled",
]);
export const docTypeEnum = pgEnum("doc_type", ["tax_invoice", "bill_of_supply"]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "upi",
  "bank_transfer",
  "cheque",
  "card",
  "other",
]);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    gstin: text("gstin"),
    addressLine: text("address_line"),
    district: text("district").notNull().default("Chennai"),
    location: text("location"), // area/locality within the district
    stateCode: text("state_code"), // GST state code — drives place of supply; always Tamil Nadu, not user-editable
    pincode: text("pincode"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customers_org_idx").on(t.organizationId)],
);

export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(), // e.g. QUO/25-26/0001
    seq: integer("seq").notNull(),
    fy: text("fy").notNull(), // "25-26"
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    status: quoteStatusEnum("status").notNull().default("draft"),
    issueDate: date("issue_date").notNull().defaultNow(),
    validUntil: date("valid_until"),
    // Mandapam / event venue — specific to this booking, not the customer.
    venue: text("venue"),
    // The function date itself — distinct from the per-line-item eventDate
    // (quotationItems.eventDate), which groups a multi-day function's menu
    // pages by session and is optional/opt-in. This is the one always-there
    // date the "upcoming events" widget sorts and filters on; falls back to
    // the earliest item-level date for quotations created before this
    // existed (see listUpcomingEvents).
    eventDate: date("event_date"),
    placeOfSupplyStateCode: text("place_of_supply_state_code"),
    // Totals (stored in the org currency)
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    terms: text("terms"),
    // Per-quotation override of the org's GST default, same idea as an
    // invoice's applyGst — a quotation isn't a legal tax document either way,
    // but some customers still want the GST lines hidden on the estimate.
    // Ignored if the org isn't registered.
    applyGst: boolean("apply_gst").notNull().default(true),
    convertedInvoiceId: uuid("converted_invoice_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    // A quotation becomes a real booking — not just a maybe — one of two
    // ways: money changes hands (advanceAmount) or staff say so outright
    // (takenAt). Neither implies "accepted": a customer can accept a price
    // without committing to the date, so the "upcoming events" widget gates
    // on this, not on status. Null means no advance recorded; a set value
    // is always > 0 (see recordQuotationAdvanceCore) — clearing a mistaken
    // entry nulls it out rather than setting it to 0.
    advanceAmount: numeric("advance_amount", { precision: 14, scale: 2 }),
    advanceRecordedAt: timestamp("advance_recorded_at", { withTimezone: true }),
    takenAt: timestamp("taken_at", { withTimezone: true }),
    takenBy: uuid("taken_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Public view link token (e.g. for WhatsApp) — null until generated,
    // cleared on revoke. Not a foreign key; just a random opaque credential.
    shareToken: text("share_token").unique(),
  },
  (t) => [
    unique("quotations_org_number_uq").on(t.organizationId, t.number),
    index("quotations_org_idx").on(t.organizationId),
  ],
);

export const quotationItems = pgTable("quotation_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  quotationId: uuid("quotation_id")
    .notNull()
    .references(() => quotations.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  description: text("description").notNull(),
  hsnSac: text("hsn_sac"),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
  unit: text("unit"),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  // Menu dish names under this line item — catering menu page, printed ahead
  // of the priced tariff. Not used for pricing.
  menuItems: jsonb("menu_items").$type<string[]>(),
  // Event/function date this line's menu items belong to — groups the
  // printed menu page. Not shown on the priced tariff itself.
  eventDate: date("event_date"),
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    seq: integer("seq").notNull(),
    fy: text("fy").notNull(),
    docType: docTypeEnum("doc_type").notNull().default("tax_invoice"),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "set null",
    }),
    quotationId: uuid("quotation_id").references(() => quotations.id, {
      onDelete: "set null",
    }),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    issueDate: date("issue_date").notNull().defaultNow(),
    dueDate: date("due_date"),
    // Mandapam / event venue — carried over from the quotation on conversion.
    venue: text("venue"),
    placeOfSupplyStateCode: text("place_of_supply_state_code"),
    reverseCharge: boolean("reverse_charge").notNull().default(false),
    // Totals
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    cgst: numeric("cgst", { precision: 14, scale: 2 }).notNull().default("0"),
    sgst: numeric("sgst", { precision: 14, scale: 2 }).notNull().default("0"),
    igst: numeric("igst", { precision: 14, scale: 2 }).notNull().default("0"),
    roundOff: numeric("round_off", { precision: 8, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    notes: text("notes"),
    terms: text("terms"),
    // Whether the printed menu page (dish lists under each line item) is
    // included — off by default doesn't make sense for a catering app, so
    // this defaults to shown, same as it always was before it was optional.
    showMenuList: boolean("show_menu_list").notNull().default(true),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    shareToken: text("share_token").unique(),
  },
  (t) => [
    unique("invoices_org_number_uq").on(t.organizationId, t.number),
    index("invoices_org_idx").on(t.organizationId),
  ],
);

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  description: text("description").notNull(),
  hsnSac: text("hsn_sac"),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
  unit: text("unit"),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxableValue: numeric("taxable_value", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  cgst: numeric("cgst", { precision: 14, scale: 2 }).notNull().default("0"),
  sgst: numeric("sgst", { precision: 14, scale: 2 }).notNull().default("0"),
  igst: numeric("igst", { precision: 14, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
  menuItems: jsonb("menu_items").$type<string[]>(),
  eventDate: date("event_date"),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    method: paymentMethodEnum("method").notNull().default("cash"),
    reference: text("reference"),
    paidAt: date("paid_at").notNull().defaultNow(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId)],
);

export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  customer: one(customers, {
    fields: [quotations.customerId],
    references: [customers.id],
  }),
  items: many(quotationItems),
}));
export const quotationItemsRelations = relations(quotationItems, ({ one }) => ({
  quotation: one(quotations, {
    fields: [quotationItems.quotationId],
    references: [quotations.id],
  }),
}));
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  items: many(invoiceItems),
  payments: many(payments),
}));
export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

// ---------------------------------------------------------------------------
// Expenses: everything spent that isn't ingredient stock usage — kitchen
// labor (per-cuisine masters), service staff, rentals, transport, etc.
// Deliberately separate from stock_movements (which already tracks ingredient
// cost via FEFO batches) — the two are combined at query time, never merged
// into one table, so editing an expense can never desync the stock ledger.
// ---------------------------------------------------------------------------

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("expense_categories_org_name_uq").on(t.organizationId, t.name)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => expenseCategories.id, {
      onDelete: "set null",
    }),
    // Optional — an expense can belong to a specific event, or be a
    // standalone day-to-day cost (e.g. diesel, general salaries).
    quotationId: uuid("quotation_id").references(() => quotations.id, {
      onDelete: "set null",
    }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    expenseDate: date("expense_date").notNull().defaultNow(),
    description: text("description").notNull(),
    // For labor-style entries: headcount * rate = amount (still editable).
    headcount: numeric("headcount", { precision: 10, scale: 2 }),
    rate: numeric("rate", { precision: 14, scale: 2 }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expenses_org_date_idx").on(t.organizationId, t.expenseDate),
    index("expenses_quotation_idx").on(t.quotationId),
  ],
);

export const expensesRelations = relations(expenses, ({ one }) => ({
  category: one(expenseCategories, {
    fields: [expenses.categoryId],
    references: [expenseCategories.id],
  }),
  quotation: one(quotations, {
    fields: [expenses.quotationId],
    references: [quotations.id],
  }),
  invoice: one(invoices, {
    fields: [expenses.invoiceId],
    references: [invoices.id],
  }),
}));

// ===========================================================================
// Vendors & purchasing: what was bought, from whom, and what's still owed.
// A product is never tied to one fixed vendor — vendor is recorded per
// purchase (bill), same reasoning as customers not being tied to one venue.
// ===========================================================================
/**
 * Where one chunk of a vendor payment landed. A single "I paid them ₹5,000"
 * can split across several of these (see recordVendorPaymentCore): some onto
 * open bills, some onto the carried-over opening balance, the remainder left
 * as credit with the vendor.
 */
export const paymentAppliedToEnum = pgEnum("payment_applied_to", [
  "bill",
  "opening_balance",
  "credit",
]);

export const purchaseBillStatusEnum = pgEnum("purchase_bill_status", [
  "active",
  "cancelled",
]);

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    gstin: text("gstin"),
    addressLine: text("address_line"),
    district: text("district").notNull().default("Chennai"),
    location: text("location"), // area/locality within the district
    stateCode: text("state_code"), // always Tamil Nadu, not user-editable — kept for symmetry with customers
    pincode: text("pincode"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    // Amount already owed to this vendor before they were added to the
    // system (a carried-over balance), separate from anything billed here.
    //
    // This is the figure the caterer typed at onboarding and it is never
    // written to again. It used to be decremented as it was paid off, which
    // meant the number on screen drifted away from what they entered and the
    // original was lost for good — a mistyped ₹15,000 could not be traced back
    // once part of it had been paid. How much of it is still outstanding is
    // derived instead, from the payments allocated to it (appliedTo =
    // "opening_balance"); see vendorBalance() in purchase-queries.ts.
    openingBalance: numeric("opening_balance", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vendors_org_idx").on(t.organizationId)],
);

export const purchaseBills = pgTable(
  "purchase_bills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(), // e.g. PB/25-26/0001
    seq: integer("seq").notNull(),
    fy: text("fy").notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    billDate: date("bill_date").notNull().defaultNow(),
    status: purchaseBillStatusEnum("status").notNull().default("active"),
    // No GST breakdown — most vendors here don't issue tax invoices; this is
    // a plain bill, not a tax document.
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("purchase_bills_org_number_uq").on(t.organizationId, t.number),
    index("purchase_bills_org_idx").on(t.organizationId),
    index("purchase_bills_vendor_idx").on(t.vendorId),
  ],
);

export const purchaseBillItems = pgTable("purchase_bill_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  purchaseBillId: uuid("purchase_bill_id")
    .notNull()
    .references(() => purchaseBills.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  // Null for a freeform charge line (delivery, packing…) that doesn't touch
  // inventory. Set for a product line, which creates a stock batch.
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull().default("1"),
  unit: text("unit"),
  rate: numeric("rate", { precision: 14, scale: 2 }).notNull().default("0"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
});

export const purchaseBillPayments = pgTable(
  "purchase_bill_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Payments are recorded against the vendor as a whole and auto-allocated
    // across their oldest open bills (see recordVendorPaymentCore) — this is
    // always set. purchaseBillId is only set for the portion of the payment
    // that landed on a specific bill; a row with no bill is an unapplied
    // advance/credit (paid more than was due at the time).
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    purchaseBillId: uuid("purchase_bill_id").references(() => purchaseBills.id, {
      onDelete: "cascade",
    }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    // What this chunk of money was put against. Previously this had to be
    // inferred — a bill payment by purchaseBillId, an opening-balance payment
    // by searching the free-text note for a magic phrase — which meant a
    // caterer who happened to type that phrase into their own note had their
    // payment silently misfiled. Stated outright instead, so every rupee can
    // be counted exactly once and none of it falls between the buckets.
    appliedTo: paymentAppliedToEnum("applied_to").notNull().default("bill"),
    method: paymentMethodEnum("method").notNull().default("cash"),
    reference: text("reference"),
    paidAt: date("paid_at").notNull().defaultNow(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("purchase_bill_payments_bill_idx").on(t.purchaseBillId),
    index("purchase_bill_payments_vendor_idx").on(t.vendorId),
  ],
);

// ---------------------------------------------------------------------------
// Purchase lists: what to ask a vendor to supply, sent to them ahead of
// buying anything. Deliberately separate from purchase_bills — a list is a
// request, it never touches stock or vendor dues (no rate/amount at all);
// a bill is a receipt of what was actually bought. No conversion between the
// two in v1 — see purchase_bill_status_enum's own "no edit after creation"
// note for why bills stay append-only regardless.
// ---------------------------------------------------------------------------
export const purchaseListStatusEnum = pgEnum("purchase_list_status", ["draft", "sent"]);

export const purchaseLists = pgTable(
  "purchase_lists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    number: text("number").notNull(), // e.g. PL/25-26/0001
    seq: integer("seq").notNull(),
    fy: text("fy").notNull(),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    listDate: date("list_date").notNull().defaultNow(),
    status: purchaseListStatusEnum("status").notNull().default("draft"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("purchase_lists_org_number_uq").on(t.organizationId, t.number),
    index("purchase_lists_org_idx").on(t.organizationId),
    index("purchase_lists_vendor_idx").on(t.vendorId),
  ],
);

export const purchaseListItems = pgTable("purchase_list_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  purchaseListId: uuid("purchase_list_id")
    .notNull()
    .references(() => purchaseLists.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  // Null for an ad-hoc item added on top of the vendor's preferred-product
  // list (not one of their usual products, or not in the catalogue at all).
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull().default("1"),
  unit: text("unit"),
});

export const purchaseListsRelations = relations(purchaseLists, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [purchaseLists.vendorId],
    references: [vendors.id],
  }),
  items: many(purchaseListItems),
}));
export const purchaseListItemsRelations = relations(purchaseListItems, ({ one }) => ({
  purchaseList: one(purchaseLists, {
    fields: [purchaseListItems.purchaseListId],
    references: [purchaseLists.id],
  }),
  product: one(products, {
    fields: [purchaseListItems.productId],
    references: [products.id],
  }),
}));

export const vendorsRelations = relations(vendors, ({ many }) => ({
  purchaseBills: many(purchaseBills),
  purchaseLists: many(purchaseLists),
}));
export const purchaseBillsRelations = relations(purchaseBills, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [purchaseBills.vendorId],
    references: [vendors.id],
  }),
  items: many(purchaseBillItems),
  payments: many(purchaseBillPayments),
}));
export const purchaseBillItemsRelations = relations(purchaseBillItems, ({ one }) => ({
  purchaseBill: one(purchaseBills, {
    fields: [purchaseBillItems.purchaseBillId],
    references: [purchaseBills.id],
  }),
  product: one(products, {
    fields: [purchaseBillItems.productId],
    references: [products.id],
  }),
}));

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------

/**
 * An append-only record of actions that take money back off the books.
 *
 * Reversing a payment deletes the payment row outright — that's the point, the
 * balance has to go back to being due — which means without this table the
 * money simply vanishes from history and nobody can answer "who undid this,
 * and when". Staff share a device in practice, so "the owner did it" is not a
 * safe assumption; the user is recorded per action.
 *
 * Deliberately not a general event bus: rows are written only where something
 * irreversible happens to a recorded amount, so the log stays short enough to
 * read as a list rather than needing its own search.
 */
export const activityActionEnum = pgEnum("activity_action", [
  "payment_reversed",
  "vendor_payment_reversed",
]);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    action: activityActionEnum("action").notNull(),
    // What the action happened to. Kept as a loose (type, id) pair rather than
    // a foreign key because the row it describes is usually gone by the time
    // this is written — that's what made it worth logging.
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    // Where to send someone reading the log. Survives the entity itself.
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    amount: numeric("amount", { precision: 14, scale: 2 }),
    // Plain-language sentence, written at log time. Stored rather than
    // rebuilt on read so the entry still makes sense after the thing it
    // describes has been renamed or deleted.
    summary: text("summary").notNull(),
    // Who and when. userId is set null rather than cascading if the staff
    // member is later removed — the action still happened.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userName: text("user_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_log_org_idx").on(t.organizationId, t.createdAt),
    index("activity_log_invoice_idx").on(t.invoiceId),
    index("activity_log_vendor_idx").on(t.vendorId),
  ],
);

export type Customer = typeof customers.$inferSelect;
export type Quotation = typeof quotations.$inferSelect;
export type QuotationItem = typeof quotationItems.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type QuoteStatus = (typeof quoteStatusEnum.enumValues)[number];
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
export type DocType = (typeof docTypeEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type Vendor = typeof vendors.$inferSelect;
export type PurchaseBill = typeof purchaseBills.$inferSelect;
export type PurchaseBillItem = typeof purchaseBillItems.$inferSelect;
export type PurchaseBillPayment = typeof purchaseBillPayments.$inferSelect;
export type PurchaseBillStatus = (typeof purchaseBillStatusEnum.enumValues)[number];
export type PurchaseList = typeof purchaseLists.$inferSelect;
export type PurchaseListItem = typeof purchaseListItems.$inferSelect;
export type PurchaseListStatus = (typeof purchaseListStatusEnum.enumValues)[number];
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type ActivityAction = (typeof activityActionEnum.enumValues)[number];
