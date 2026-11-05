import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { displayNodeResultLabel } from "../src/lib/kliqueasp/graph/nodeResultLabel.ts";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");

test("i risultati strutturali mostrano etichetta leggibile e ID sorgente", () => {
  assert.equal(displayNodeResultLabel("n1", { n1: "Alice Rossi" }, { n1: "node-17" }), "Alice Rossi (node-17)");
  assert.equal(displayNodeResultLabel("n1", { n1: "node-17" }, { n1: "node-17" }), "node-17");
  assert.equal(displayNodeResultLabel("n1", {}, { n1: "node-17" }), "node-17");
  assert.equal(displayNodeResultLabel("n1", { n1: "   " }, { n1: "node-17" }), "node-17");
});

test("gli ID con chiavi speciali restano testo letterale e non leggono proprieta ereditate", () => {
  const inherited = Object.create({ constructor: "etichetta ereditata", ghost: "ID ereditato" });
  assert.equal(displayNodeResultLabel("constructor", inherited, inherited), "constructor");

  const labels = JSON.parse('{"__proto__":"Nodo speciale"}');
  const sourceIds = JSON.parse('{"__proto__":"__proto__"}');
  assert.equal(displayNodeResultLabel("__proto__", labels, sourceIds), "Nodo speciale (__proto__)");
  assert.equal(Object.prototype.polluted, undefined);
});

test("le righe dei risultati usano etichette per nodi e mantengono gli ID sorgente degli archi", () => {
  assert.match(panel, /nodeSet\.slice\(0, 20\)\.map\(\(id\) => displayNodeResultLabel\(id, nodeLabelById, sourceIdByNodeId\)\)/);
  assert.match(panel, /sourceIdByEdgeId\[id\] \?\? id/);
  assert.match(panel, /displayNodeResultLabel\(item, nodeLabelById, sourceIdByNodeId\)/);
});
