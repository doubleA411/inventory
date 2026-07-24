// Industry presets for self-serve signup. Units are largely universal, so all
// industries share the standard unit library; categories vary per industry.
import { CATERING_UNIT_PRESET } from "./units";

export const DEFAULT_UNIT_PRESET = CATERING_UNIT_PRESET;

export type Industry = {
  value: string;
  label: string;
  categories: string[];
};

export const INDUSTRIES: Industry[] = [
  {
    value: "catering",
    label: "Catering / Food Service",
    categories: [
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
    ],
  },
  {
    value: "restaurant",
    label: "Restaurant / Cloud Kitchen",
    categories: [
      "Vegetables",
      "Dairy",
      "Meat & Seafood",
      "Grains & Pulses",
      "Spices & Sauces",
      "Bakery",
      "Frozen",
      "Beverages",
      "Disposables",
      "Other",
    ],
  },
  {
    value: "grocery",
    label: "Grocery / Retail",
    categories: [
      "Groceries",
      "Dairy",
      "Snacks",
      "Beverages",
      "Personal Care",
      "Household",
      "Frozen",
      "Stationery",
      "Other",
    ],
  },
  {
    value: "pharmacy",
    label: "Pharmacy / Medical",
    categories: [
      "Tablets & Capsules",
      "Syrups",
      "Injectables",
      "Surgical & Disposables",
      "OTC",
      "Cosmetics",
      "Supplements",
      "Other",
    ],
  },
  {
    value: "manufacturing",
    label: "Manufacturing",
    categories: [
      "Raw Materials",
      "Components",
      "Consumables",
      "Packaging",
      "Finished Goods",
      "Spares",
      "Other",
    ],
  },
  {
    value: "other",
    label: "Other",
    categories: ["General", "Supplies", "Equipment", "Other"],
  },
];

export function getIndustry(value?: string | null): Industry {
  return INDUSTRIES.find((i) => i.value === value) ?? INDUSTRIES[INDUSTRIES.length - 1];
}
