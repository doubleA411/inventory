// Pure GST tax + document math. No DB / server deps, so it's easy to unit-test.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Indian financial year label (Apr–Mar), e.g. 2026-05-xx -> "26-27". */
export function financialYear(d = new Date()): string {
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1; // month 3 = April
  const yy = (n: number) => String(n).slice(-2).padStart(2, "0");
  return `${yy(startYear)}-${yy(startYear + 1)}`;
}

export function formatDocNumber(prefix: string, fy: string, seq: number): string {
  return `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
}

export type LineInput = {
  quantity: number;
  rate: number;
  taxRate: number; // percent; ignored when gstEnabled is false
};

export type LineTax = {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  amount: number; // taxable + line tax
};

export type DocTotals = {
  lines: LineTax[];
  subtotal: number; // sum of taxable values
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  roundOff: number;
  total: number; // rounded grand total
};

/**
 * Compute per-line and document totals.
 * - `gstEnabled`: false → bill of supply (no tax).
 * - `intraState`: true → CGST+SGST split; false → IGST.
 */
export function computeTotals(
  items: LineInput[],
  opts: { gstEnabled: boolean; intraState: boolean },
): DocTotals {
  const lines: LineTax[] = items.map((it) => {
    const taxable = round2(it.quantity * it.rate);
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (opts.gstEnabled && it.taxRate > 0) {
      if (opts.intraState) {
        cgst = round2((taxable * it.taxRate) / 200);
        sgst = cgst;
      } else {
        igst = round2((taxable * it.taxRate) / 100);
      }
    }
    return { taxable, cgst, sgst, igst, amount: round2(taxable + cgst + sgst + igst) };
  });

  const sum = (f: (l: LineTax) => number) => round2(lines.reduce((s, l) => s + f(l), 0));
  const subtotal = sum((l) => l.taxable);
  const cgst = sum((l) => l.cgst);
  const sgst = sum((l) => l.sgst);
  const igst = sum((l) => l.igst);
  const taxTotal = round2(cgst + sgst + igst);
  const grand = round2(subtotal + taxTotal);
  const total = Math.round(grand);
  const roundOff = round2(total - grand);

  return { lines, subtotal, cgst, sgst, igst, taxTotal, roundOff, total };
}

// --- amount in words (Indian numbering: crore / lakh / thousand) -----------
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigit(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}

function threeDigit(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return (
    (h ? ONES[h] + " Hundred" + (rest ? " " : "") : "") + (rest ? twoDigit(rest) : "")
  );
}

export function numberToIndianWords(num: number): string {
  if (num === 0) return "Zero";
  let words = "";
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = num;
  if (crore) words += numberToIndianWords(crore) + " Crore ";
  if (lakh) words += twoDigit(lakh) + " Lakh ";
  if (thousand) words += twoDigit(thousand) + " Thousand ";
  if (hundred) words += threeDigit(hundred);
  return words.trim();
}

/** e.g. 1234.50 -> "One Thousand Two Hundred Thirty Four Rupees and Fifty Paise Only" */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let s = numberToIndianWords(rupees) + " Rupees";
  if (paise > 0) s += " and " + twoDigit(paise) + " Paise";
  return s + " Only";
}
