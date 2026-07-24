import { describe, it, expect } from "vitest";
import {
  financialYear,
  formatDocNumber,
  computeTotals,
  amountInWords,
  numberToIndianWords,
} from "@/lib/tax";

describe("financialYear", () => {
  it("April onwards starts a new FY", () => {
    expect(financialYear(new Date("2026-05-10"))).toBe("26-27");
    expect(financialYear(new Date("2026-04-01"))).toBe("26-27");
  });
  it("Jan–Mar belongs to the previous FY", () => {
    expect(financialYear(new Date("2026-02-10"))).toBe("25-26");
    expect(financialYear(new Date("2026-03-31"))).toBe("25-26");
  });
});

describe("formatDocNumber", () => {
  it("zero-pads the sequence", () => {
    expect(formatDocNumber("INV", "25-26", 1)).toBe("INV/25-26/0001");
    expect(formatDocNumber("QUO", "25-26", 42)).toBe("QUO/25-26/0042");
  });
});

describe("computeTotals", () => {
  const item = { quantity: 10, rate: 100, taxRate: 5 };

  it("intra-state splits into CGST + SGST", () => {
    const t = computeTotals([item], { gstEnabled: true, intraState: true });
    expect(t.subtotal).toBe(1000);
    expect(t.cgst).toBe(25);
    expect(t.sgst).toBe(25);
    expect(t.igst).toBe(0);
    expect(t.taxTotal).toBe(50);
    expect(t.total).toBe(1050);
  });

  it("inter-state uses IGST", () => {
    const t = computeTotals([item], { gstEnabled: true, intraState: false });
    expect(t.igst).toBe(50);
    expect(t.cgst).toBe(0);
    expect(t.sgst).toBe(0);
    expect(t.total).toBe(1050);
  });

  it("bill of supply (no GST) has no tax", () => {
    const t = computeTotals([item], { gstEnabled: false, intraState: true });
    expect(t.taxTotal).toBe(0);
    expect(t.total).toBe(1000);
  });

  it("rounds the grand total to the nearest rupee", () => {
    const t = computeTotals([{ quantity: 1, rate: 99.5, taxRate: 18 }], {
      gstEnabled: true,
      intraState: false,
    });
    // taxable 99.5, igst 17.91, grand 117.41 -> 117, roundOff -0.41
    expect(t.subtotal).toBe(99.5);
    expect(t.igst).toBe(17.91);
    expect(t.total).toBe(117);
    expect(t.roundOff).toBe(-0.41);
  });
});

describe("amountInWords", () => {
  it("plain rupees", () => {
    expect(amountInWords(1050)).toBe("One Thousand Fifty Rupees Only");
  });
  it("with paise", () => {
    expect(amountInWords(1234.5)).toBe(
      "One Thousand Two Hundred Thirty Four Rupees and Fifty Paise Only",
    );
  });
  it("indian grouping: lakh & crore", () => {
    expect(numberToIndianWords(2500000)).toBe("Twenty Five Lakh");
    expect(numberToIndianWords(12345678)).toBe(
      "One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight",
    );
  });
});
