export type GraphTemporalValueDomain = "integer" | "date";

export interface GraphTemporalValue {
  value: number;
  domain: GraphTemporalValueDomain;
}

export function isValidGraphCalendarDate(year: number, month: number, day: number): boolean {
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthLengths[month - 1];
}

/**
 * Parses the common graph-time contract: safe integer values, ISO calendar dates
 * (UTC midnight), and ISO date-times with an explicit timezone. Locale-dependent
 * date strings and timezone-free date-times are rejected.
 */
export function parseGraphTemporalValue(value: unknown): GraphTemporalValue | null {
  if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))) {
    const numericValue = Number(value);
    return Number.isSafeInteger(numericValue) ? { value: numericValue, domain: "integer" } : null;
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const dateTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(trimmed);
  const match = dateOnly ?? dateTime;
  if (!match) return null;

  const [, rawYear, rawMonth, rawDay] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  if (!isValidGraphCalendarDate(year, month, day)) return null;

  if (dateTime) {
    const hour = Number(dateTime[4]);
    const minute = Number(dateTime[5]);
    const second = Number(dateTime[6]);
    const zoneHour = Number(dateTime[10] ?? 0);
    const zoneMinute = Number(dateTime[11] ?? 0);
    if (hour > 23 || minute > 59 || second > 59 || zoneHour > 14 || zoneMinute > 59 ||
      (zoneHour === 14 && zoneMinute !== 0)) return null;
  }

  const timestamp = Date.parse(trimmed);
  return Number.isSafeInteger(timestamp) ? { value: timestamp, domain: "date" } : null;
}

export function parseGraphTimeValue(value: unknown): number | null {
  return parseGraphTemporalValue(value)?.value ?? null;
}
