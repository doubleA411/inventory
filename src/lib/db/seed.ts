import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { db } from "./index";
import {
  organizations,
  users,
  memberships,
  unitGroups,
  units,
  categories,
} from "./schema";
import {
  CATERING_UNIT_PRESET,
  CATERING_CATEGORY_PRESET,
} from "../units";
import { eq } from "drizzle-orm";

const DEFAULT_OWNER = {
  email: "owner@catering.local",
  password: "password123",
  name: "Catering Owner",
};

async function main() {
  const orgName = process.env.APP_ORG_NAME ?? "Sample Caterers";
  const currency = process.env.APP_CURRENCY ?? "INR";
  const timezone = process.env.APP_TIMEZONE ?? "Asia/Kolkata";

  // Idempotent: bail if an org already exists.
  const existing = await db.select().from(organizations).limit(1);
  if (existing.length > 0) {
    console.log(`✔ Org already seeded ("${existing[0].name}"). Nothing to do.`);
    return;
  }

  console.log(`→ Seeding organization "${orgName}"...`);
  const [org] = await db
    .insert(organizations)
    .values({ name: orgName, currency, timezone })
    .returning();

  // Owner user
  const passwordHash = await bcrypt.hash(DEFAULT_OWNER.password, 10);
  const [owner] = await db
    .insert(users)
    .values({
      email: DEFAULT_OWNER.email,
      passwordHash,
      name: DEFAULT_OWNER.name,
    })
    .returning();
  await db.insert(memberships).values({
    userId: owner.id,
    organizationId: org.id,
    role: "owner",
  });

  // Units
  for (const g of CATERING_UNIT_PRESET) {
    const [group] = await db
      .insert(unitGroups)
      .values({ organizationId: org.id, name: g.group })
      .returning();
    await db.insert(units).values(
      g.units.map((u) => ({
        organizationId: org.id,
        groupId: group.id,
        name: u.name,
        symbol: u.symbol,
        factorToBase: String(u.factorToBase),
        isBase: u.isBase ?? false,
      })),
    );
  }

  // Categories
  await db.insert(categories).values(
    CATERING_CATEGORY_PRESET.map((name) => ({
      organizationId: org.id,
      name,
    })),
  );

  const unitCount = await db
    .select()
    .from(units)
    .where(eq(units.organizationId, org.id));

  console.log("✔ Seed complete.");
  console.log(`  Organization: ${org.name} (${currency}, ${timezone})`);
  console.log(`  Units seeded: ${unitCount.length}`);
  console.log(`  Categories:   ${CATERING_CATEGORY_PRESET.length}`);
  console.log("");
  console.log("  Login with:");
  console.log(`    Email:    ${DEFAULT_OWNER.email}`);
  console.log(`    Password: ${DEFAULT_OWNER.password}`);
  console.log("  (change this after first login)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
