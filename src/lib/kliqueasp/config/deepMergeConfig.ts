type ConfigRecord = Record<string, unknown>;

function isMergeableObject(value: unknown): value is ConfigRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Recursively merges JSON config objects while preserving every own string key. */
export function deepMergeConfig<T>(base: T, override: unknown): T {
  if (!isMergeableObject(base)) return (override ?? base) as T;
  if (!isMergeableObject(override)) return base;

  const entries: Array<[string, unknown]> = Object.entries(base);
  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = Object.prototype.hasOwnProperty.call(base, key) ? base[key] : undefined;
    const value = isMergeableObject(baseValue) && isMergeableObject(overrideValue)
      ? deepMergeConfig(baseValue, overrideValue)
      : overrideValue;
    entries.push([key, value]);
  }

  return Object.fromEntries(entries) as T;
}
