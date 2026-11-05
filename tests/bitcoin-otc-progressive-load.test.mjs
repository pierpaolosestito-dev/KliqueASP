import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sandbox = await readFile(new URL("../src/routes/Sandbox/+page.svelte", import.meta.url), "utf8");
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const exportPanel = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");

test("Bitcoin OTC shows its exact initial window before fetching the remaining rating shards", () => {
  assert.match(sandbox, /bitcoinOtcManifest\.bootstrapPath/);
  assert.match(sandbox, /datasetText = JSON\.stringify\(bootstrap\)/);
  assert.match(sandbox, /void continueBitcoinOtcLoading\(0\)/);
  assert.match(sandbox, /for \(let index = startIndex; index < bitcoinOtcManifest\.shards\.length/);
  assert.match(sandbox, /bitcoinLoadedEdges = bitcoinEdges\.length/);
  assert.match(sandbox, /const fullDataset = \{ \.\.\.graphData, edges: fullEdges \}/);
  assert.match(sandbox, /<progress[\s\S]*?max=\{bitcoinOtcManifest\.edgeCount\}[\s\S]*?value=\{bitcoinLoadedEdges\}/);
  assert.match(sandbox, /bitcoinLoadStatus === "failed"[\s\S]*?retryBitcoinOtcLoading/);
  assert.match(sandbox, /onOpen: \(\) => \{\s*if \(bitcoinLoadStatus === "loading" \|\| bitcoinLoadStatus === "failed"\) \{\s*bitcoinLoadNotice = "[^"]+";\s*return;/);
  assert.match(sandbox, /Attendi il caricamento completo di Bitcoin OTC prima di esportare il progetto/);
});

test("the timeline unlocks only after all records arrive, while the bootstrap projection stays stable", () => {
  assert.match(sandbox, /datasetIsComplete=\{bitcoinLoadStatus === "idle" \|\| bitcoinLoadStatus === "complete"\}/);
  assert.match(graphApp, /\$:\s*timelineControlEnabled = datasetIsComplete && isTimelineControlAvailable/);
  assert.match(graphApp, /syncIncrementalGraphDataset\(\)/);
  assert.match(graphApp, /The bootstrap already contains every record in the active initial window/);
  assert.match(graphApp, /if \(datasetIsComplete\) updateTimelineBoundsFromDataIfNeeded\(\)/);
  assert.match(graphApp, /allowSampledProjectionPreview=\{graphData\?\.datasetMetadata\?\.id === "bitcoin-otc"\}/);
});

test("Bitcoin's oversized full-range view gets a sampled preview but never a sampled file download", () => {
  assert.match(exportPanel, /allowSampledProjectionPreview = false/);
  assert.match(exportPanel, /mode === "projection" && exportTooLarge/);
  assert.match(exportPanel, /Anteprima campionata deterministica/);
  assert.match(exportPanel, /SVG e PNG completi restano disattivati/);
  assert.match(exportPanel, /disabled=\{!svg \|\| exportTooLarge \|\| Boolean\(dimensionBlocker\)\}/);
});
