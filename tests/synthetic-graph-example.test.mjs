import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";
import { buildContextualCliqueIncidenceIndex, buildContextualCliqueProgram, parseContextualCliqueResults } from "../src/lib/kliqueasp/graph/contextualCliqueTask.ts";
import { buildGraphIntegrityProgram, parseIntegrityViolations } from "../src/lib/kliqueasp/graph/integrityTask.ts";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildTypedMotifProgram } from "../src/lib/kliqueasp/graph/motifTask.ts";
import { prepareSignedTriads, buildSignedTriadProgram, parseSignedTriadResults, summarizeSignedTriads } from "../src/lib/kliqueasp/graph/signedTriadTask.ts";
import { hasCompleteModelEnumeration, hasCompleteOptimalModelEnumeration } from "../src/lib/kliqueasp/graph/structuralTasks.ts";

const data = JSON.parse(await readFile(new URL("../src/lib/kliqueasp/data/examples/synthetic-graph.json", import.meta.url), "utf8"));
const undirectedConfig = JSON.parse(await readFile(new URL("../src/lib/kliqueasp/data/examples/synthetic-graph.config.json", import.meta.url), "utf8"));
const directedConfig = JSON.parse(await readFile(new URL("../src/lib/kliqueasp/data/examples/synthetic-graph-directed.config.json", import.meta.url), "utf8"));

function normalize(config) {
  const graph = normalizeGraphData(data, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.deepEqual(graph.diagnostics, []);
  return graph;
}

test("Synthetic Graph is substantial, deterministic, and deliberately preserves parallel event records", () => {
  assert.equal(data.nodes.length, 162);
  assert.equal(data.edges.length, 745);
  assert.equal(new Set(data.nodes.map(({ id }) => id)).size, data.nodes.length);
  assert.equal(new Set(data.edges.map(({ id }) => id)).size, data.edges.length);
  assert.equal(data.edges.filter(({ id }) => id.includes("membership-mismatch")).length, 1);
  assert.ok(data.edges.some(({ source, target }, index) => data.edges.slice(index + 1)
    .some((other) => other.source === source && other.target === target)), "same endpoint pair must retain distinct event records");
  assert.deepEqual(new Set(data.nodes.map(({ type }) => type)), new Set(["person", "unit", "project"]));
  assert.deepEqual(new Set(data.edges.map(({ type }) => type)), new Set([
    "social-tie", "mentoring", "collaboration", "member-of", "participates-in"
  ]));
});

test("both declared direction profiles map every optional graph capability without input warnings", () => {
  for (const [config, direction] of [[undirectedConfig, "undirected"], [directedConfig, "directed"]]) {
    const graph = normalize(config);
    assert.equal(graph.direction, direction);
    for (const capability of [
      "nodeTypes", "nodeRoles", "nodeGroups", "nodeAttributes", "nodeRemovalCosts",
      "edgeTypes", "edgeAttributes", "edgeIntervals", "edgeWeights", "modularityWeights",
      "edgeRemovalCosts", "edgeConfidence", "edgeProvenance", "edgeIdentity"
    ]) {
      assert.equal(graph.capabilities[capability]?.available, true, `${direction}: ${capability}`);
    }
    assert.equal(graph.capabilities.undirectedAdjacency.available, direction === "undirected");
    assert.equal(graph.capabilities.directedEdges.available, direction === "directed");
  }
});

test("configured mentoring and time-ordered motif templates compile for both declared graph directions", () => {
  for (const [config, direction] of [[undirectedConfig, "undirected"], [directedConfig, "directed"]]) {
    const graph = normalize(config);
    const facts = buildAspFactsFromGraph(graph);
    const motifs = config.graphAnalysis.motifs.map((template) =>
      buildTypedMotifProgram(template, direction, "", false, false, facts.temporalEncoding)
    );
    assert.equal(motifs.length, 2);
    assert.match(motifs[0].program, /motif_edge\(/);
    assert.equal(motifs[1].temporalSemantics, "orderedByStart");
    assert.equal(motifs[1].strictTemporalOrder, true);
  }
});

test("contextual clique solves from configured membership incidence and returns source evidence", async () => {
  const graph = normalize(undirectedConfig);
  const facts = buildAspFactsFromGraph(graph);
  const task = undirectedConfig.graphAnalysis.contextualClique;
  const incidenceIndex = buildContextualCliqueIncidenceIndex(graph, task, facts.indexByNodeId);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${buildContextualCliqueProgram(task, graph.direction)}`,
    ["--opt-mode=optN"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteOptimalModelEnumeration(result), true);
  const groups = parseContextualCliqueResults(
    result.Call?.[0]?.Witnesses,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    incidenceIndex,
    task.minimumSize
  );
  assert.equal(groups.length, 12);
  assert.ok(groups.every(({ nodeIds, pairWitnesses }) => nodeIds.length === 12 && pairWitnesses.length === 66));
  assert.ok(groups.every(({ sourceNodeIds }) => sourceNodeIds.every((nodeId) => data.nodes.find(({ id }) => id === nodeId)?.type === "person")));
});

test("signed triads use stable dyad polarity and clingo classifies the complete cohort triangles", async () => {
  const graph = normalize(undirectedConfig);
  const facts = buildAspFactsFromGraph(graph);
  const preparation = prepareSignedTriads(
    undirectedConfig.graphAnalysis.signedTriads,
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(Object.keys(undirectedConfig.graphMapping.edge.attributes)),
    undefined,
    "cohort-01",
    true
  );
  assert.equal(preparation.available, true, preparation.reasons.join("; "));
  assert.ok(preparation.dyads.some(({ polarity }) => polarity === "positive"));
  assert.ok(preparation.dyads.some(({ polarity }) => polarity === "negative"));
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${buildSignedTriadProgram(preparation)}`
  );
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteModelEnumeration(result), true);
  const triads = parseSignedTriadResults(result.Call?.[0]?.Witnesses, facts.reverseIndex, preparation.dyads);
  const summary = summarizeSignedTriads(triads);
  assert.ok(summary.completeTriadCount > 0);
  assert.equal(summary.completeTriadCount, summary.balancedTriadCount + summary.unbalancedTriadCount);
  assert.ok(triads.every(({ dyads }) => dyads.every(({ edgeRecords }) => edgeRecords.length > 0)));
});

test("integrity analysis reports exactly the two documented synthetic data issues", async () => {
  const integrityNodeIds = new Set([
    ...Array.from({ length: 12 }, (_, index) => `person-${String(index + 1).padStart(3, "0")}`),
    "unit-01",
    "project-01"
  ]);
  const integrityData = {
    nodes: data.nodes.filter(({ id }) => integrityNodeIds.has(id)),
    edges: data.edges.filter(({ source, target }) => integrityNodeIds.has(source) && integrityNodeIds.has(target))
  };
  const graph = normalizeGraphData(integrityData, undirectedConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  const facts = buildAspFactsFromGraph(graph);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${buildGraphIntegrityProgram(undirectedConfig.graphIntegrity, graph.direction)}`
  );
  assert.equal(result.Result, "SATISFIABLE", result.Error || `Il solver ha restituito ${result.Result}.`);
  assert.equal(hasCompleteModelEnumeration(result), true);
  const violations = parseIntegrityViolations(
    result.Call?.[0]?.Witnesses,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    facts.temporalEncoding.decode
  );
  assert.ok(violations.some(({ kind, subjectId }) => kind === "edge_endpoint_type" && subjectId === "synthetic-membership-mismatch"));
  assert.ok(violations.some(({ kind, subjectId, attribute }) => kind === "node_attribute_out_of_domain" && subjectId === "person-001" && attribute === "qualityStatus"));
  assert.equal(violations.length, 2, violations.map(({ kind, subjectId }) => `${kind}:${subjectId}`).join(", "));
});
