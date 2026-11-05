import test from "node:test";
import assert from "node:assert/strict";
import { buildIntegrityViolationVisualization } from "../src/lib/kliqueasp/graph/integrityVisualization.ts";

test("maps a record-level integrity witness to source nodes and edge identity", () => {
  const result = buildIntegrityViolationVisualization({
    kind: "missing_edge_type",
    subjectId: "source-edge",
    nodeIds: [],
    edgeIds: []
  }, [
    { id: "n1", sourceId: "source-node-1" },
    { id: "n2", sourceId: "source-node-2" }
  ], [
    { source: "n1", target: "n2", sourceId: "source-edge" }
  ]);

  assert.deepEqual(result.nodeIds.sort(), ["n1", "n2"]);
  assert.deepEqual(result.edgeIds, ["source:source-edge"]);
  assert.match(result.nodeAnnotations.n1, /Tipo arco richiesto ma assente/);
  assert.deepEqual(result.edgeAnnotations["source:source-edge"], {
    label: "Violazione · Tipo arco richiesto ma assente",
    color: "#b4233c",
    dashPattern: "dotted"
  });
  assert.equal(result.hasWitness, true);
});

test("uses explicit node witnesses without inventing incident edges", () => {
  const result = buildIntegrityViolationVisualization({
    kind: "missing_node_type",
    subjectId: "source-node-1",
    nodeIds: ["source-node-1"],
    edgeIds: []
  }, [
    { id: "n1", sourceId: "source-node-1" },
    { id: "n2", sourceId: "source-node-2" }
  ], [
    { source: "n1", target: "n2", sourceId: "e1" }
  ]);

  assert.deepEqual(result.nodeIds, ["n1"]);
  assert.deepEqual(result.edgeIds, []);
  assert.equal(result.hasWitness, true);
});

test("does not fabricate a graph witness for a global constraint violation", () => {
  const result = buildIntegrityViolationVisualization({
    kind: "cardinality_min",
    subjectId: "",
    nodeIds: [],
    edgeIds: []
  }, [
    { id: "n1" },
    { id: "n2" }
  ], [
    { source: "n1", target: "n2", sourceId: "e1" }
  ]);

  assert.deepEqual(result.nodeIds, []);
  assert.deepEqual(result.edgeIds, []);
  assert.equal(result.hasWitness, false);
  assert.match(result.resultLabel, /nessun testimone nel grafo/);
});
