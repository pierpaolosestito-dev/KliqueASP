const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

interface ExactRational {
  numerator: bigint;
  denominator: bigint;
}

export interface ScaledDecimalWeights {
  values: number[];
  total: number;
  scaleFactor: number;
  displayTotal: string;
}

export type DecimalWeightScaleResult =
  | { ok: true; value: ScaledDecimalWeights }
  | { ok: false; reason: "invalid" | "negative" | "unsafe" };

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function parseExactDecimal(value: unknown): ExactRational | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const text = String(value).trim();
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) return null;
  if ((match[2]?.length ?? 0) + (match[3]?.length ?? match[4]?.length ?? 0) > 1000) return null;

  const exponent = Number(match[5] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) return null;
  const fraction = match[3] ?? match[4] ?? "";
  let numerator = BigInt(`${match[2] ?? "0"}${fraction}` || "0");
  let denominator = 10n ** BigInt(fraction.length);
  if (match[1] === "-") numerator = -numerator;
  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  if (exponent < 0) denominator *= 10n ** BigInt(-exponent);

  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function formatFiniteDecimal(numerator: bigint, denominator: bigint): string {
  if (numerator === 0n) return "0";
  let remaining = denominator;
  let twos = 0;
  let fives = 0;
  while (remaining % 2n === 0n) {
    remaining /= 2n;
    twos += 1;
  }
  while (remaining % 5n === 0n) {
    remaining /= 5n;
    fives += 1;
  }
  if (remaining !== 1n) return `${numerator}/${denominator}`;

  const decimalPlaces = Math.max(twos, fives);
  const scaled = numerator * (10n ** BigInt(decimalPlaces)) / denominator;
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(decimalPlaces + 1, "0");
  if (decimalPlaces === 0) return `${negative ? "-" : ""}${digits}`;
  const integerPart = digits.slice(0, -decimalPlaces);
  const fractionalPart = digits.slice(-decimalPlaces).replace(/0+$/, "");
  return `${negative ? "-" : ""}${integerPart}${fractionalPart ? `.${fractionalPart}` : ""}`;
}

export function formatScaledDecimal(value: number, scaleFactor: number): string {
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(scaleFactor) || scaleFactor < 1) {
    throw new RangeError("Il valore e il fattore di scala devono essere interi sicuri; la scala deve essere positiva");
  }
  return formatFiniteDecimal(BigInt(value), BigInt(scaleFactor));
}

/** Converts finite non-negative decimal weights into a shared exact integer unit. */
export function scaleNonNegativeDecimalWeights(values: readonly unknown[]): DecimalWeightScaleResult {
  const rationals: ExactRational[] = [];
  for (const value of values) {
    const rational = parseExactDecimal(value);
    if (!rational) return { ok: false, reason: "invalid" };
    if (rational.numerator < 0n) return { ok: false, reason: "negative" };
    rationals.push(rational);
  }

  let scaleFactor = 1n;
  for (const { denominator } of rationals) {
    scaleFactor = scaleFactor / greatestCommonDivisor(scaleFactor, denominator) * denominator;
    if (scaleFactor > MAX_SAFE_INTEGER_BIGINT) return { ok: false, reason: "unsafe" };
  }

  const scaledBigInts = rationals.map(({ numerator, denominator }) => numerator * (scaleFactor / denominator));
  const total = scaledBigInts.reduce((sum, value) => sum + value, 0n);
  if (scaledBigInts.some((value) => value > MAX_SAFE_INTEGER_BIGINT) ||
    total > MAX_SAFE_INTEGER_BIGINT ||
    4n * total * total > MAX_SAFE_INTEGER_BIGINT) {
    return { ok: false, reason: "unsafe" };
  }

  return {
    ok: true,
    value: {
      values: scaledBigInts.map(Number),
      total: Number(total),
      scaleFactor: Number(scaleFactor),
      displayTotal: formatFiniteDecimal(total, scaleFactor)
    }
  };
}
