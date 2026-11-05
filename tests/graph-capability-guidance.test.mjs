import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";

test("i prerequisiti delle capability guidano la mappatura senza esporre chiavi interne", () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ id: "ab", source: "a", target: "b" }]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: { idField: "$.id", sourceField: "$.source", targetField: "$.target" }
    }
  });

  assert.equal(graph.valid, true);
  assert.equal(graph.capabilities.edgeTypes.available, false);
  assert.equal(graph.capabilities.edgeTypes.reason,
    "In Dati → Mappatura rapida, associa il campo che contiene il tipo di ogni arco.");

  const reasons = Object.values(graph.capabilities)
    .filter(({ available }) => !available)
    .map(({ reason }) => reason);
  assert.ok(reasons.every((reason) => typeof reason === "string" && reason.length > 0));
  for (const reason of reasons) {
    assert.doesNotMatch(reason, /(?:graphMapping\.|graphAnalysis\.|typeField|idField|identity:|confidenceRange)/,
      "il messaggio di prerequisito deve descrivere il passo utente, non una chiave di configurazione");
  }
});
