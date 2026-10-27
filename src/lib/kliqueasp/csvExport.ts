/** Quotes one CSV cell and neutralizes spreadsheet formulas from graph data. */
export function csvCell(value: unknown): string {
  const text = String(value ?? "");
  const safeText = typeof value !== "number" && /^[\s\uFEFF]*[=+\-@]/.test(text)
    ? `'${text}`
    : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

/** Serializes rows as UTF-8-compatible CSV while preserving embedded line breaks. */
export function serializeCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

/** Downloads CSV text and defers object-URL revocation until the browser has handled the click. */
export function downloadCsvText(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
