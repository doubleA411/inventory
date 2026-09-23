import { config } from "dotenv";
config({ path: ".env.local" });

import { vi } from "vitest";

// Audit events are append-only — the database refuses to delete them — so any
// test that wrote real ones would leave them in the dev database for good.
// Tests get a no-op audit module; src/lib/audit.test.ts exercises the real one
// against a throwaway organization.
vi.mock("@/lib/audit", () => ({
  writeAuditEvent: async () => {},
  recordAudit: async () => {},
  recordUserAudit: async () => {},
  auditLabel: async () => null,
}));
