// Shared content for the onboarding tour and the help center.

export type TourStep = {
  // CSS selector of the element to spotlight (omit for a centered popover).
  selector?: string;
  title: string;
  description: string;
  side?: "top" | "bottom" | "left" | "right";
};

export const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to StockKitchen 👋",
    description:
      "A quick 60-second tour of how to manage your inventory. You can replay this anytime from the “Take a tour” button.",
  },
  {
    selector: '[data-tour="nav-dashboard"]',
    title: "Dashboard",
    description:
      "Your at-a-glance view: total products, low-stock and out-of-stock counts, items expiring soon, and recent activity.",
    side: "right",
  },
  {
    selector: '[data-tour="nav-products"]',
    title: "Products",
    description:
      "Your catalogue. Add items manually or import a list. Click any product to restock it, log usage, and see its history.",
    side: "right",
  },
  {
    selector: '[data-tour="nav-movements"]',
    title: "Stock History",
    description:
      "A full audit trail of every restock, usage, waste and adjustment across all products. Filter by type and export it.",
    side: "right",
  },
  {
    selector: '[data-tour="nav-units"]',
    title: "Units",
    description:
      "The plug-and-play part. Define your own units (kg, litre, dozen, bag…) and how they convert, so you can buy in one unit and use in another.",
    side: "right",
  },
  {
    selector: '[data-tour="nav-import"]',
    title: "Import / Export",
    description:
      "Bulk-load your product list from CSV or Excel with a guided column mapper, or export your inventory and history.",
    side: "right",
  },
  {
    selector: '[data-tour="nav-team"]',
    title: "Team",
    description:
      "Invite your staff. Admins manage products and settings; Staff can log stock and view. Everyone sees the same live inventory.",
    side: "right",
  },
  {
    selector: '[data-tour="nav-help"]',
    title: "Need help?",
    description:
      "Answers to common questions live in the Help Center. That’s it — you’re ready to go! Start by adding a product.",
    side: "right",
  },
];

export type FaqItem = {
  q: string;
  a: string;
  tags: string[];
};

export type FaqCategory = {
  category: string;
  items: FaqItem[];
};

export const FAQ: FaqCategory[] = [
  {
    category: "Getting started",
    items: [
      {
        q: "How do I add my first products?",
        a: "Go to Products → “Add product” to create one manually, or use Import / Export to upload a CSV or Excel file of your whole list at once. Each product needs a name and a stock unit (like kg or piece).",
        tags: ["add", "product", "create", "start"],
      },
      {
        q: "What is a “stock unit”?",
        a: "It’s the unit a product’s stock is counted in — e.g. Onion in kilograms, Eggs in pieces. You can still record restocks and usage in other units of the same type (e.g. grams for onion) and the app converts automatically.",
        tags: ["unit", "stock unit", "measure"],
      },
      {
        q: "Can I change the sample company name and currency?",
        a: "Yes — those come from your setup. Currency defaults to INR and the timezone to Asia/Kolkata. Contact your admin to change organisation-level settings.",
        tags: ["currency", "settings", "organisation", "inr"],
      },
    ],
  },
  {
    category: "Restocking & usage",
    items: [
      {
        q: "Where do I restock or record usage?",
        a: "Open a product (Products → click its name). On the right you’ll see a panel with Restock, Use, Waste and Adjust tabs. Enter a quantity, pick the unit, and press “Record movement”.",
        tags: ["restock", "usage", "use", "movement", "record"],
      },
      {
        q: "Why does “Use” say there isn’t enough stock?",
        a: "A new product starts at 0. You must Restock it before you can log usage. The app won’t let you use more than you have on hand.",
        tags: ["use", "not enough", "error", "stock"],
      },
      {
        q: "Can I restock in one unit and use in another?",
        a: "Yes, as long as both units are the same type. For example, stock a product in kg and log a 500 g usage — it converts to 0.5 kg automatically. You can’t convert across types (e.g. kg to pieces).",
        tags: ["convert", "unit", "kg", "grams"],
      },
      {
        q: "What’s the difference between Waste and Adjust?",
        a: "Use Waste for stock that was thrown away or spoiled (with a reason). Use Adjust to correct a count when the system total doesn’t match a physical count — you can adjust up or down.",
        tags: ["waste", "adjust", "spoilage", "correction"],
      },
    ],
  },
  {
    category: "Expiry & batches",
    items: [
      {
        q: "How does expiry tracking work?",
        a: "When you restock, you can set an expiry date. Each restock creates a “batch”. When you log usage, stock is taken from the batch that expires soonest first (FEFO — first-expiry-first-out).",
        tags: ["expiry", "batch", "fefo", "expire"],
      },
      {
        q: "Where do I see items about to expire?",
        a: "The Dashboard shows “Expiring soon (7 days)” and “Expired stock” panels. Each product’s page also lists its open batches with expiry dates, colour-coded when they’re close or past due.",
        tags: ["expiring", "expired", "dashboard", "alert"],
      },
    ],
  },
  {
    category: "Units",
    items: [
      {
        q: "How do I add a new unit, like a 25 kg bag?",
        a: "Go to Units → “Add a unit”. Pick the type (e.g. Weight), give it a name and symbol, and enter how many base units it equals. If the base unit is gram, a 25 kg bag = 25000.",
        tags: ["unit", "add", "bag", "convert", "factor"],
      },
      {
        q: "What are unit “types”?",
        a: "Types group units that can convert to each other — Weight, Volume and Count come built in. You can only convert within a type. Add your own type (e.g. Length) from the Units page.",
        tags: ["unit type", "group", "weight", "volume", "count"],
      },
    ],
  },
  {
    category: "Import & export",
    items: [
      {
        q: "What format should my import file be?",
        a: "CSV or Excel (.xlsx/.xls). Download the template from the Import page for the right columns: name, code, category, unit, opening_stock, reorder_level, expiry_date, cost_price. Only name and unit are required.",
        tags: ["import", "csv", "excel", "template", "format"],
      },
      {
        q: "The importer says my unit is unknown — why?",
        a: "The unit in your file must match an existing unit’s name or symbol (e.g. “kg” or “Kilogram”). Add any missing units under Units first, then re-import. Rows with issues are skipped and listed for you.",
        tags: ["import", "unknown unit", "error"],
      },
      {
        q: "How do I export my data?",
        a: "On the Import / Export page use the export buttons for Products (CSV/XLSX) or Stock History (CSV). The Stock History page also has its own export button.",
        tags: ["export", "download", "csv", "backup"],
      },
    ],
  },
  {
    category: "Team & roles",
    items: [
      {
        q: "How do I add my staff?",
        a: "Go to Team → “Invite a team member”. Set their name, email, a temporary password and a role. Share the password with them; they can sign in and change it.",
        tags: ["team", "invite", "staff", "user", "add"],
      },
      {
        q: "What can each role do?",
        a: "Owner and Admin have full access — products, units, imports and team. Staff can log stock movements (restock/use/waste) and view everything, but can’t edit products, units or team.",
        tags: ["role", "permission", "admin", "staff", "owner"],
      },
    ],
  },
];
