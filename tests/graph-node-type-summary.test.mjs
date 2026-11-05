import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getGraphNodeTypeSummary } from "../src/lib/kliqueasp/graph/graphVisualization.ts";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("node type summary counts analysis overrides, source types, and untyped nodes", () => {
  assert.deepEqual(getGraphNodeTypeSummary([
    { id: "a", type: "actor" },
    { id: "b", type: "actor", analysis: { type: "researcher" } },
    { id: "c", type: "event" },
    { id: "d", type: "  " },
    { id: "e" }
  ]), [
    { type: "actor", label: "actor", count: 1 },
    { type: "event", label: "event", count: 1 },
    { type: "researcher", label: "researcher", count: 1 },
    { type: "default", label: "Senza tipo", count: 2 }
  ]);
});

test("node type counts use a Map and safely accept prototype-like input values", () => {
  assert.deepEqual(getGraphNodeTypeSummary([
    { type: "__proto__" },
    { type: "constructor" },
    { type: "__proto__" }
  ]), [
    { type: "__proto__", label: "__proto__", count: 2 },
    { type: "constructor", label: "constructor", count: 1 }
  ]);
});

test("the status row shows a compact, accessible sample of node types", () => {
  assert.match(graphApp, /\$: graphNodeTypeSummary = getGraphNodeTypeSummary\(data\?\.nodes \?\? \[\]\)/);
  assert.match(graphApp, /class="node-type-summary" aria-label=\{`Tipi di nodo:/);
  assert.match(graphApp, /graphNodeTypeSummary\.slice\(0, 3\)/);
  assert.match(graphApp, /node-type-overflow/);
});
