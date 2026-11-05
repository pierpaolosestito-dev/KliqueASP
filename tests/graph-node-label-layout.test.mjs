import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getNonOverlappingGraphNodeLabelIds, getReadableGraphNodeLabelSize } from "../src/lib/kliqueasp/graph/nodeLabelLayout.ts";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("mantiene le etichette separate e risolve le collisioni in modo deterministico", () => {
  const nodes = [
    { id: "a", x: 20, y: 20, width: 30, height: 12 },
    { id: "b", x: 20, y: 20, width: 30, height: 12 },
    { id: "c", x: 90, y: 20, width: 30, height: 12 }
  ];

  assert.deepEqual([...getNonOverlappingGraphNodeLabelIds(nodes)], ["a", "c"]);
  assert.deepEqual([...getNonOverlappingGraphNodeLabelIds([...nodes].reverse())], ["a", "c"]);
});

test("dà precedenza al nodo selezionato quando due etichette si accavallano", () => {
  const visibleIds = getNonOverlappingGraphNodeLabelIds([
    { id: "centrale", x: 10, y: 10, width: 40, height: 14, priority: 4 },
    { id: "selezionato", x: 12, y: 10, width: 40, height: 14, priority: 1_000_004 },
    { id: "lontano", x: 100, y: 10, width: 40, height: 14, priority: 0 }
  ]);

  assert.deepEqual([...visibleIds], ["selezionato", "lontano"]);
});

test("ignora dimensioni non valide e ID duplicati senza bloccare le etichette vicine", () => {
  const visibleIds = getNonOverlappingGraphNodeLabelIds([
    { id: "invalido", x: 0, y: 0, width: Number.NaN, height: 10 },
    { id: "nodo", x: 30, y: 30, width: 20, height: 10, priority: 1 },
    { id: "nodo", x: 80, y: 30, width: 20, height: 10, priority: 0 },
    { id: "altro", x: 80, y: 30, width: 20, height: 10, priority: 2 }
  ]);

  assert.deepEqual([...visibleIds], ["altro", "nodo"]);
});

test("non colloca le etichette sopra i controlli e gli overlay della vista", () => {
  const labels = getNonOverlappingGraphNodeLabelIds([
    { id: "sotto-toolbar", x: 30, y: 30, width: 40, height: 12 },
    { id: "libera", x: 140, y: 30, width: 40, height: 12 }
  ], 7, 48, [
    { id: "toolbar", x: 30, y: 30, width: 70, height: 40 }
  ]);

  assert.deepEqual([...labels], ["libera"]);
});

test("mantiene la proporzione del testo e ingrandisce le etichette piccole alla scala d'insieme", () => {
  const size = getReadableGraphNodeLabelSize(18, 8, 4, 0.5);

  assert.deepEqual(size, { width: 128, height: 32, scaleFactor: 4 });
  assert.ok(size.height * 0.5 >= 16);
});

test("limita l'ingrandimento e ignora misure non valide senza produrre scale non finite", () => {
  assert.deepEqual(getReadableGraphNodeLabelSize(18, 8, 4, 0.01), {
    width: 256,
    height: 64,
    scaleFactor: 8
  });
  assert.deepEqual(getReadableGraphNodeLabelSize(Number.NaN, Number.NaN, Number.NaN, Number.NaN), {
    width: 12,
    height: 5,
    scaleFactor: 1
  });
});

test("il grafo aggiorna l'anti-sovrapposizione mentre si muovono vista e puntatore", () => {
  assert.match(graphApp, /getNonOverlappingGraphNodeLabelIds\(\s*candidates,\s*7,\s*48,/);
  assert.match(graphApp, /nodeLabelLayoutInterval = setInterval\(refreshNodeLabelLayout, 160\)/);
  assert.match(graphApp, /onNodeHover\(\(node: any\) =>/);
  assert.match(graphApp, /clearInterval\(nodeLabelLayoutInterval\)/);
  assert.doesNotMatch(graphApp, /class="label-layout-hint"/);
});

test("Adatta alla rete corregge il fit conservando margine per nodi, etichette e toolbar", () => {
  assert.match(graphApp, /const graphViewFitPadding = 32/);
  const fitHelper = graphApp.match(/function fitGraphToView\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(fitHelper, /\.zoomToFit\(graphTransitionDuration\(0\), graphViewFitPadding\)/);
  assert.match(fitHelper, /camera\.updateMatrixWorld\(true\)/);
  assert.match(fitHelper, /new THREE\.Vector3\(x, y, z\)\.project\(camera\)/);
  assert.match(fitHelper, /getGraphFitZoomFactor\(maxAbsScreenX, maxAbsScreenY\)/);
  assert.match(fitHelper, /cameraPosition\.x \/ zoomFactor/);
  assert.match(fitHelper, /cameraPosition\.y \/ zoomFactor/);
  assert.match(fitHelper, /cameraPosition\.z \/ zoomFactor/);
  assert.doesNotMatch(graphApp, /graphViewFitScale/);
});

test("mantiene leggibili le etichette e usa un ingombro prudente per evitare contatti visivi", () => {
  assert.match(graphApp, /font: "22px Arial, Helvetica, sans-serif"/);
  assert.match(graphApp, /scale: \[14, 6\]/);
  assert.match(graphApp, /getReadableGraphNodeLabelSize\(/);
  assert.match(graphApp, /width: labelSize\.width \* pixelsPerWorldUnit \* 1\.15/);
  assert.match(graphApp, /height: labelSize\.height \* pixelsPerWorldUnit \* 1\.2/);
});
