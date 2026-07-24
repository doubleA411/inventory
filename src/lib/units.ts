import type { Unit } from "@/lib/db/schema";

/**
 * Convert a quantity from one unit to another *within the same unit group*.
 *
 * Every unit stores `factorToBase` = how many base-group units it equals
 * (e.g. base = gram, so kg.factorToBase = 1000, g.factorToBase = 1).
 * Converting is therefore: qty * from.factorToBase / to.factorToBase.
 *
 * Throws if the two units belong to different groups (not convertible).
 */
export function convertQuantity(
  quantity: number,
  from: Pick<Unit, "groupId" | "factorToBase" | "symbol">,
  to: Pick<Unit, "groupId" | "factorToBase" | "symbol">,
): number {
  if (from.groupId !== to.groupId) {
    throw new Error(
      `Cannot convert between ${from.symbol} and ${to.symbol}: different unit types.`,
    );
  }
  const fromFactor = Number(from.factorToBase);
  const toFactor = Number(to.factorToBase);
  if (!(toFactor > 0)) {
    throw new Error(`Invalid conversion factor for unit ${to.symbol}.`);
  }
  return (quantity * fromFactor) / toFactor;
}

/** Round to the schema's stored scale (6 dp) to avoid float noise. */
export function roundQty(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e6) / 1e6;
}

/** Catering-oriented default unit library, seeded per organization. */
export const CATERING_UNIT_PRESET: {
  group: string;
  units: { name: string; symbol: string; factorToBase: number; isBase?: boolean }[];
}[] = [
  {
    group: "Weight",
    units: [
      { name: "Gram", symbol: "g", factorToBase: 1, isBase: true },
      { name: "Kilogram", symbol: "kg", factorToBase: 1000 },
      { name: "Quintal", symbol: "qtl", factorToBase: 100000 },
    ],
  },
  {
    group: "Volume",
    units: [
      { name: "Millilitre", symbol: "ml", factorToBase: 1, isBase: true },
      { name: "Litre", symbol: "L", factorToBase: 1000 },
    ],
  },
  {
    group: "Count",
    units: [
      { name: "Piece", symbol: "pc", factorToBase: 1, isBase: true },
      { name: "Dozen", symbol: "dz", factorToBase: 12 },
      { name: "Packet", symbol: "pkt", factorToBase: 1 },
      { name: "Box", symbol: "box", factorToBase: 1 },
    ],
  },
];

export const CATERING_CATEGORY_PRESET = [
  "Vegetables",
  "Fruits",
  "Dairy",
  "Spices & Masala",
  "Grains & Pulses",
  "Meat & Poultry",
  "Oils & Ghee",
  "Beverages",
  "Packaging & Disposables",
  "Other",
];
