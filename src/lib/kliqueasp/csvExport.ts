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

export const CSV_DOWNLOAD_REQUESTED_EVENT = "kliqueasp:csv-download-requested";

/** Downloads CSV text and defers object-URL revocation until the browser has handled the click. */
export function downloadCsvText(filename: string, csv: string): void {
  // Spreadsheet apps on Windows often need the UTF-8 signature to detect accents reliably.
  // Keep serializeCsv() BOM-free so generated strings remain convenient for parsers and APIs.
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(CSV_DOWNLOAD_REQUESTED_EVENT, { detail: { filename } }));
    }
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
