import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const route = await readFile(
  new URL("../src/routes/PsychologyHistoryGraph/+page.svelte", import.meta.url),
  "utf8"
);

test("psychology case study ships its large dataset as a separate URL asset", async () => {
  const dataset = await stat(new URL("../src/lib/kliqueasp/data/my-dataset.json", import.meta.url));

  assert.ok(dataset.size > 1_000_000, "fixture should continue to cover the large case-study dataset");
  assert.match(route, /import graphDataUrl from ["'][^"']*my-dataset\.json\?url["']/);
  assert.doesNotMatch(route, /import graphData from ["'][^"']*my-dataset\.json["']/);
});

test("case study validates the fetched graph and passes it unchanged to GraphApp", () => {
  assert.match(route, /fetch\(graphDataUrl\)/);
  assert.match(route, /!Array\.isArray\(data\.nodes\)/);
  assert.match(route, /!Array\.isArray\(data\.edges\)/);
  assert.match(route, /import\("\$lib\/kliqueasp\/GraphApp\.svelte"\)/);
  assert.match(route, /<svelte:component this=\{GraphAppComponent\} \{graphConfig\} \{graphData\} \/>/);
  assert.match(route, /Promise\.all\(\[[\s\S]*fetch\(graphDataUrl\)[\s\S]*import\(/);
});

test("case study exposes accessible loading, error, and retry states", () => {
  assert.match(route, /role="status" aria-live="polite"/);
  assert.match(route, /role="alert"/);
  assert.match(route, /onclick=\{loadGraphData\}/);
  assert.match(route, /Caricamento del grafo del caso psicologi/);
  assert.match(route, /Non è stato possibile preparare il caso studio/);
});
