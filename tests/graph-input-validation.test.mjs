import test from "node:test";
import assert from "node:assert/strict";
import { buildGraphInputPreview, formatGraphDiagnostic, inspectGraphInput } from "../src/lib/kliqueasp/graph/graphInputValidation.ts";

const config = JSON.stringify({});

test("draft inspection reports valid input and raw collection counts", () => {
  const inspection = inspectGraphInput(config, JSON.stringify({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ source: "a", target: "b" }]
  }));
  assert.equal(inspection.status, "ready");
  assert.equal(inspection.nodeCount, 2);
  assert.equal(inspection.edgeCount, 1);
  assert.equal(inspection.direction, "undirected");
  assert.equal(inspection.nodeTypeCount, 0);
  assert.equal(inspection.edgeTypeCount, 0);
  assert.equal(inspection.mappedAttributeCount, 0);
  assert.deepEqual(inspection.diagnostics, []);
  assert.deepEqual(inspection.previewNodes.map(({ id }) => id), ["a", "b"]);
  assert.deepEqual(inspection.previewLinks.map(({ source, target, directed }) => ({ source, target, directed })), [
    { source: "a", target: "b", directed: false }
  ]);
});

test("draft summary reflects only mapped types, attributes, and edge direction", () => {
  const configText = JSON.stringify({
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", typeField: "$.kind", attributes: { role: "$.role" } },
      edge: {
        sourceField: "$.from",
        targetField: "$.to",
        typeField: "$.kind",
        direction: "directed",
        attributes: { confidence: "$.confidence" }
      }
    }
  });
  const inspection = inspectGraphInput(configText, JSON.stringify({
    nodes: [{ id: "a", kind: "person", role: "therapist" }, { id: "b", kind: "person", role: "patient" }],
    edges: [{ from: "a", to: "b", kind: "referral", confidence: 0.8 }]
  }));
  assert.equal(inspection.status, "ready");
  assert.equal(inspection.direction, "directed");
  assert.equal(inspection.nodeTypeCount, 1);
  assert.equal(inspection.edgeTypeCount, 1);
  assert.equal(inspection.mappedAttributeCount, 2);
  assert.deepEqual(inspection.previewNodes.map(({ id, type }) => ({ id, type })), [
    { id: "a", type: "person" },
    { id: "b", type: "person" }
  ]);
  assert.deepEqual(inspection.previewLinks.map(({ source, target, type, directed }) => ({ source, target, type, directed })), [
    { source: "a", target: "b", type: "referral", directed: true }
  ]);
});

test("draft inspection points to the invalid node record before apply", () => {
  const mappedConfig = JSON.stringify({
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: { sourceField: "$.source", targetField: "$.target" }
    }
  });
  const inspection = inspectGraphInput(mappedConfig, JSON.stringify({
    nodes: [{ id: "a" }, { label: "missing id" }],
    edges: []
  }));
  assert.equal(inspection.status, "error");
  assert.ok(inspection.errorCount > 0);
  assert.deepEqual(inspection.previewNodes, []);
  assert.deepEqual(inspection.previewLinks, []);
  assert.ok(inspection.diagnostics.some((diagnostic) => diagnostic.recordIndex === 1 && /nodo 2/.test(diagnostic.message)));
  const indexedConflict = { code: "conflicting-edge-id", severity: "error", message: "ID arco riutilizzato", recordIndex: 3 };
  assert.equal(formatGraphDiagnostic(indexedConflict), "arco 4: ID arco riutilizzato");
});

test("draft inspection explains malformed JSON and a missing edge collection", () => {
  const malformed = inspectGraphInput(config, "{\"nodes\":[");
  assert.equal(malformed.status, "error");
  assert.match(malformed.diagnostics[0].message, /Dataset JSON non valido/);
  assert.equal(malformed.nodeCount, null);
  assert.equal(malformed.edgeCount, null);

  const missingEdges = inspectGraphInput(config, JSON.stringify({ nodes: [] }));
  assert.equal(missingEdges.status, "error");
  assert.match(missingEdges.diagnostics[0].message, /edges.*links/);
});

test("draft inspection distinguishes recoverable warnings from blocking errors", () => {
  const multigraphConfig = JSON.stringify({
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: { sourceField: "$.source", targetField: "$.target", identity: "multigraph" }
    }
  });
  const inspection = inspectGraphInput(multigraphConfig, JSON.stringify({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ source: "a", target: "b", type: "collaboration" }]
  }));
  assert.equal(inspection.status, "warning");
  assert.equal(inspection.errorCount, 0);
  assert.ok(inspection.warningCount > 0);
});

test("large draft preview samples nodes across the dataset and reports every visual cap", () => {
  const nodes = Array.from({ length: 120 }, (_, index) => ({
    id: `n${index}`,
    label: `Node ${index}`,
    type: "person"
  }));
  const links = nodes.flatMap((source, sourceIndex) =>
    nodes.slice(sourceIndex + 1).map((target, targetIndex) => ({
      id: `e${sourceIndex}-${sourceIndex + targetIndex + 1}`,
      source: source.id,
      target: target.id,
      type: "tie",
      directed: false
    }))
  );
  const preview = buildGraphInputPreview(nodes, links, links.length);
  assert.equal(preview.totalNodeCount, 120);
  assert.equal(preview.nodes.length, 80);
  assert.equal(preview.nodes[0].id, "n0");
  assert.equal(preview.nodes.at(-1).id, "n119");
  assert.equal(preview.links.length, 500);
  assert.ok(preview.sampleLinkCount > preview.links.length);
  assert.equal(preview.datasetEdgeCount, links.length);
  const includedIds = new Set(preview.nodes.map(({ id }) => id));
  assert.ok(preview.links.every((link) => includedIds.has(link.source) && includedIds.has(link.target)));
  assert.deepEqual(buildGraphInputPreview(nodes, links, links.length), preview);
});

test("small draft preview keeps every node and mapped link", () => {
  const nodes = [{ id: "a", label: "A", type: "" }, { id: "b", label: "B", type: "" }];
  const links = [{ id: "e1", source: "a", target: "b", type: "", directed: false }];
  const preview = buildGraphInputPreview(nodes, links, 1);
  assert.equal(preview.nodes.length, 2);
  assert.deepEqual(preview.links, links);
  assert.equal(preview.sampleLinkCount, 1);
});

test("large draft preview falls back to safe bounds for non-finite limits", () => {
  const nodes = Array.from({ length: 120 }, (_, index) => ({
    id: `n${index}`,
    label: `Node ${index}`,
    type: "person"
  }));
  const links = nodes.flatMap((source, sourceIndex) =>
    nodes.slice(sourceIndex + 1).map((target) => ({
      id: `${source.id}-${target.id}`,
      source: source.id,
      target: target.id,
      type: "tie",
      directed: false
    }))
  );

  const preview = buildGraphInputPreview(nodes, links, links.length, Number.NaN, Number.POSITIVE_INFINITY);
  assert.equal(preview.nodes.length, 80);
  assert.equal(preview.links.length, 500);
});
