import { unitGroups, units, categories } from "./schema";
import { DEFAULT_UNIT_PRESET, getIndustry } from "../industries";

type DbClient = typeof import("./index")["db"];

/**
 * Seed a freshly created organization with the default unit library and the
 * category preset for its industry. Shared by the demo seed and signup.
 */
export async function seedOrgDefaults(
  db: DbClient,
  organizationId: string,
  industryValue?: string | null,
): Promise<void> {
  // Unit groups + units (universal library).
  for (const g of DEFAULT_UNIT_PRESET) {
    const [group] = await db
      .insert(unitGroups)
      .values({ organizationId, name: g.group })
      .returning();
    await db.insert(units).values(
      g.units.map((u) => ({
        organizationId,
        groupId: group.id,
        name: u.name,
        symbol: u.symbol,
        factorToBase: String(u.factorToBase),
        isBase: u.isBase ?? false,
      })),
    );
  }

  // Industry-specific categories.
  const industry = getIndustry(industryValue);
  await db.insert(categories).values(
    industry.categories.map((name) => ({ organizationId, name })),
  );
}
