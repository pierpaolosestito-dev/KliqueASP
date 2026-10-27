/** Reads a key only when it is an own property of a record. */
export function getOwnRecordValue<T = unknown>(record: unknown, key: string): T | undefined {
  if (!record || typeof record !== "object" || Array.isArray(record)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined;
  return (record as Record<string, T>)[key];
}
