import test from "node:test";
import assert from "node:assert/strict";
import { collectGraphFieldPaths, GRAPH_FIELD_DISCOVERY_SAMPLE_LIMIT, updateGraphAttributeMapping, updateGraphFieldMapping } from "../src/lib/kliqueasp/graph/graphFieldMapping.ts";

const dataset = {
  nodes: [
    { id: "a", label: "Alpha", type: "person", affiliations: [{ group: "A" }], role: "author" },
    { id: "b", label: "Beta", type: "person", affiliations: [{ group: "B" }], role: "editor" }
  ],
  edges: [
    { id: "e1", source: "a", target: "b", type: "coauthor", sign: 1, weight: 2.5, validFrom: 10, validTo: 20 },
    { id: "e2", source: "b", target: "a", type: "coauthor", sign: -1, weight: 1, validFrom: 20, validTo: 30 }
  ]
};

test("field discovery includes nested paths and arrays", () => {
  assert.deepEqual(collectGraphFieldPaths(dataset, "nodes"), [
    "$.affiliations[*].group", "$.id", "$.label", "$.role", "$.type"
  ]);
  assert.deepEqual(collectGraphFieldPaths(dataset, "edges"), [
    "$.id", "$.sign", "$.source", "$.target", "$.type", "$.validFrom", "$.validTo", "$.weight"
  ]);
  assert.deepEqual(collectGraphFieldPaths(dataset, "links"), []);
});

test("field discovery distributes its bounded sample across the entire collection", () => {
  const nodes = Array.from({ length: GRAPH_FIELD_DISCOVERY_SAMPLE_LIMIT * 3 }, (_, index) =>
    index === GRAPH_FIELD_DISCOVERY_SAMPLE_LIMIT * 3 - 1
      ? { id: `n${index}`, lateField: "preserved" }
      : { id: `n${index}` }
  );
  assert.deepEqual(collectGraphFieldPaths({ nodes, edges: [] }, "nodes"), ["$.id", "$.lateField"]);
});

test("first mapping upgrade preserves inferred legacy IDs, types, groups, and config", () => {
  const legacy = {
    schemaVersion: 1,
    features: { timeline: true },
    nodeTypes: { person: { group: "$.affiliations[*].group", timeline: { startField: "$.from" } } }
  };
  const updated = updateGraphFieldMapping(legacy, dataset, "node", "idField", "$.id");
  assert.equal(updated.schemaVersion, 2);
  assert.deepEqual(updated.graphMapping.node, {
    idField: "$.id",
    labelField: "$.label",
    typeField: "$.type",
    groupFields: ["$.affiliations[*].group"]
  });
  assert.deepEqual(updated.graphMapping.edge, {
    idField: "$.id",
    sourceField: "$.source",
    targetField: "$.target",
    typeField: "$.type",
    direction: "undirected",
    identity: "simple"
  });
  assert.deepEqual(updated.features, legacy.features);
  assert.deepEqual(updated.nodeTypes, legacy.nodeTypes);
  assert.equal(legacy.schemaVersion, 1);
});

test("edge mapping updates direction, identity, and temporal paths without dropping other fields", () => {
  const initial = updateGraphFieldMapping({}, dataset, "edge", "identity", "multigraph");
  const directed = updateGraphFieldMapping(initial, dataset, "edge", "direction", "directed");
  const withFrom = updateGraphFieldMapping(directed, dataset, "edge", "validity.fromField", "$.validFrom");
  const complete = updateGraphFieldMapping(withFrom, dataset, "edge", "validity.toField", "$.validTo");
  assert.equal(complete.graphMapping.edge.identity, "multigraph");
  assert.equal(complete.graphMapping.edge.direction, "directed");
  assert.deepEqual(complete.graphMapping.edge.validity, { fromField: "$.validFrom", toField: "$.validTo" });
  assert.equal(complete.graphMapping.edge.sourceField, "$.source");
  assert.equal(complete.graphMapping.edge.idField, "$.id");
});

test("attribute mappings can be added, edited, and removed without mutating prior config", () => {
  const base = updateGraphFieldMapping({}, dataset, "edge", "typeField", "$.type");
  const mapped = updateGraphAttributeMapping(base, dataset, "edge", "polarity", "$.sign");
  const edited = updateGraphAttributeMapping(mapped, dataset, "edge", "polarity", "$.weight");
  const removed = updateGraphAttributeMapping(edited, dataset, "edge", "polarity", "");
  assert.deepEqual(mapped.graphMapping.edge.attributes, { polarity: "$.sign" });
  assert.deepEqual(edited.graphMapping.edge.attributes, { polarity: "$.weight" });
  assert.equal(removed.graphMapping.edge.attributes, undefined);
  assert.equal(base.graphMapping.edge.attributes, undefined);
});
