import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");
const headerStart = source.indexOf('<header>');
const headerEnd = source.indexOf('</header>', headerStart);
const header = headerStart >= 0 && headerEnd > headerStart ? source.slice(headerStart, headerEnd) : "";

test("typed-motif induced edge types use a compact summary and progressive disclosure", () => {
  assert.notEqual(header, "", "intestazione del pannello motivi non trovata");
  assert.match(header, /controllo del motivo considera \$\{selectedInducedEdgeTypes\.length\}/);
  assert.match(header, /<details class="induced-edge-types">[\s\S]*?<summary>Tipi di arco controllati/);
  assert.match(header, /<ProgressiveList items=\{selectedInducedEdgeTypes\} label="tipi di arco"/);
  assert.doesNotMatch(header, /selectedInducedEdgeTypes\.join\(/,
    "il vocabolario arbitrario dei tipi non deve allungare il testo sempre visibile");
});
