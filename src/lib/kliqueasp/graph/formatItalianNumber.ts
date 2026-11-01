/** Formats visible numeric values with Italian decimal and grouping separators. */
export function formatItalianNumber(value: number | null | undefined, fractionDigits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/d";

  const digits = Number.isInteger(fractionDigits)
    ? Math.min(20, Math.max(0, fractionDigits))
    : 1;

  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}
