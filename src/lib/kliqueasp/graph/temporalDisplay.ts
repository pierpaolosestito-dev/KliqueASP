/** Formats a decoded graph-time value without inventing a unit for numeric timelines. */
export function displayMappedGraphTime(value: number): string {
  if (Math.abs(value) < 100_000_000_000) return String(value);
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}

/** Keeps timeline controls compact while retaining a full timestamp in their title. */
export function displayMappedTimelineValue(value: number): string {
  if (Math.abs(value) < 100_000_000_000) return String(value);
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : String(value);
}

export function displayMappedTimelineRange(start: number, end: number): string {
  return `${displayMappedTimelineValue(start)}–${displayMappedTimelineValue(end)}`;
}
