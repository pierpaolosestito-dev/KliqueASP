export type SearchableNodeOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it-IT");
}

/** Describes search counts for a persistent live region without adding visible copy. */
export function describeSearchableNodeResults(query: string, totalCount: number, visibleCount: number): string {
  const total = Number.isFinite(totalCount) ? Math.max(0, Math.floor(totalCount)) : 0;
  const visible = Number.isFinite(visibleCount) ? Math.min(total, Math.max(0, Math.floor(visibleCount))) : 0;
  if (total === 0) {
    return query.trim() ? "Nessun nodo corrisponde alla ricerca." : "Nessun nodo disponibile.";
  }
  const nodeLabel = total === 1 ? "nodo trovato" : "nodi trovati";
  const optionLabel = visible === 1 ? "opzione mostrata" : "opzioni mostrate";
  return `${total} ${nodeLabel}. ${visible} ${optionLabel}.`;
}

/** Filters node choices by their visible label or stable source/internal ID. */
export function filterSearchableNodeOptions(
  options: SearchableNodeOption[],
  query: string
): SearchableNodeOption[] {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) return options;

  return options.filter((option) =>
    normalizeSearchText(`${option.label} ${option.value}`).includes(normalizedQuery)
  );
}

/** Finds the next enabled suggestion, wrapping through the currently rendered page. */
export function getNextEnabledNodeOptionIndex(
  options: SearchableNodeOption[],
  currentIndex: number,
  direction: 1 | -1
): number {
  const count = options.length;
  if (count === 0) return -1;
  const startIndex = currentIndex < 0 || currentIndex >= count
    ? (direction === 1 ? -1 : 0)
    : currentIndex;
  for (let distance = 1; distance <= count; distance += 1) {
    const index = (startIndex + direction * distance + count) % count;
    if (!options[index].disabled) return index;
  }
  return -1;
}

/** Extends the rendered suggestions when keyboard navigation reaches the current page boundary. */
export function getNextSearchableNodeOptionPage(
  options: SearchableNodeOption[],
  currentIndex: number,
  visibleLimit: number,
  pageSize: number
): { visibleLimit: number; activeIndex: number } {
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 30;
  const currentLimit = Math.min(options.length, Math.max(0, Math.trunc(visibleLimit)));
  const shouldExtend = currentLimit < options.length &&
    (currentIndex < 0 || currentIndex >= currentLimit - 1);
  const nextLimit = shouldExtend ? Math.min(options.length, currentLimit + safePageSize) : currentLimit;
  const activeIndex = getNextEnabledNodeOptionIndex(options.slice(0, nextLimit), currentIndex, 1);
  return { visibleLimit: nextLimit, activeIndex };
}

/** Returns the listbox scroll delta needed to bring an active option into view. */
export function getActiveNodeOptionScrollAdjustment(
  optionTop: number,
  optionBottom: number,
  listTop: number,
  listBottom: number
): number {
  if (optionTop < listTop) return Math.floor(optionTop - listTop);
  if (optionBottom > listBottom) return Math.ceil(optionBottom - listBottom);
  return 0;
}
