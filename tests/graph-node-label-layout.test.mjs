import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getNonOverlappingGraphNodeLabelIds } from "../src/lib/kliqueasp/graph/nodeLabelLayout.ts";

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

test("il grafo aggiorna l'anti-sovrapposizione mentre si muovono vista e puntatore", () => {
  assert.match(graphApp, /getNonOverlappingGraphNodeLabelIds\(candidates, 7\)/);
  assert.match(graphApp, /nodeLabelLayoutInterval = setInterval\(refreshNodeLabelLayout, 160\)/);
  assert.match(graphApp, /onNodeHover\(\(node: any\) =>/);
  assert.match(graphApp, /clearInterval\(nodeLabelLayoutInterval\)/);
  assert.match(graphApp, /I nomi vicini si alternano per evitare sovrapposizioni/);
});

test("Adatta alla rete lascia margine per nodi, etichette e toolbar sovrapposta", () => {
  assert.match(graphApp, /const graphViewFitPadding = 32/);
  assert.match(graphApp, /const graphViewFitScale = 1\.1/);
  const fitHelper = graphApp.match(/function fitGraphToView\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(fitHelper, /\.zoomToFit\(graphTransitionDuration\(0\), graphViewFitPadding\)/);
  assert.match(fitHelper, /cameraPosition\.x \* graphViewFitScale/);
  assert.match(fitHelper, /cameraPosition\.y \* graphViewFitScale/);
  assert.match(fitHelper, /cameraPosition\.z \* graphViewFitScale/);
});

test("mantiene leggibili le etichette e usa un ingombro prudente per evitare contatti visivi", () => {
  assert.match(graphApp, /font: "22px sans-serif"/);
  assert.match(graphApp, /scale: \[14, 6\]/);
  assert.match(graphApp, /width: labelWidth \* pixelsPerWorldUnit \* 1\.15/);
  assert.match(graphApp, /height: labelHeight \* pixelsPerWorldUnit \* 1\.2/);
});
