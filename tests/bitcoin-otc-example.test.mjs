import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { inspectGraphInput } from "../src/lib/kliqueasp/graph/graphInputValidation.ts";
import {
  buildTypedMotifCountProgram,
  buildTypedMotifProgram,
  parseTypedMotifMatches,
  parseTypedMotifCount
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import { buildGraph2DScene, buildGraph2DSvg, sampleGraph2DProjectionPreview } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import {
  getStructuralEdgeIdentity,
  hasCompleteModelEnumeration,
  mapSourceEdgeIdsToStructuralIdentities
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { graphDisplayLinkMatchesIdentities } from "../src/lib/kliqueasp/graph/graphVisualization.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const config = JSON.parse(await readFile(new URL("../src/lib/kliqueasp/data/examples/bitcoin-otc.config.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../src/lib/kliqueasp/data/examples/bitcoin-otc.manifest.json", import.meta.url), "utf8"));
const bootstrapText = await readFile(new URL(`../static/examples/${manifest.bootstrapPath}`, import.meta.url), "utf8");
const bootstrap = JSON.parse(bootstrapText);
const shardPayloads = await Promise.all(manifest.shards.map(async ({ path }) =>
  JSON.parse(await readFile(new URL(`../static/examples/${path}`, import.meta.url), "utf8"))
));
const dataset = {
  ...bootstrap,
  edges: [...bootstrap.edges, ...shardPayloads.flatMap(({ edges }) => edges)]
    .sort((left, right) => Number(left.validFrom) - Number(right.validFrom))
};
const datasetText = JSON.stringify(dataset);
const sourceCsv = await readFile(new URL("../datasets/real-benchmarks/bitcoin-otc/soc-sign-bitcoinotc.csv", import.meta.url), "utf8");
const sourceRows = sourceCsv.trimEnd().split(/\r?\n/).map((line) => line.split(","));

function createInitialProjection() {
  const initialWindow = config.timeline.initialWindow;
  const edges = dataset.edges.filter(({ validFrom, validTo }) =>
    validFrom <= initialWindow.end && validTo >= initialWindow.start);
  const nodeIds = new Set(edges.flatMap(({ source, target }) => [source, target]));
  return {
    nodes: dataset.nodes.filter(({ id }) => nodeIds.has(id)),
    edges
  };
}

test("Bitcoin OTC preserves the source network's full scale, rating signs, direction, and event order", () => {
  assert.equal(dataset.nodes.length, 5_881);
  assert.equal(dataset.edges.length, 35_592);
  assert.equal(sourceRows.length, dataset.edges.length);
  assert.equal(new Set(dataset.edges.map(({ id }) => id)).size, dataset.edges.length);
  assert.deepEqual(dataset.edges.map(({ sourceTimeSeconds }) => sourceTimeSeconds), sourceRows.map((row) => row[3]));
  assert.ok(dataset.edges.every(({ validFrom, validTo }, index) =>
    validFrom === validTo && validFrom === Math.round(Number(sourceRows[index][3]) * 1_000)));
  assert.ok(dataset.edges.every(({ validFrom }, index) => index === 0 || validFrom > dataset.edges[index - 1].validFrom),
    "nearest-millisecond projection must preserve every source event order");
  assert.equal(dataset.edges.filter(({ rating }) => rating > 0).length, 32_029);
  assert.equal(dataset.edges.filter(({ rating }) => rating < 0).length, 3_563);
  assert.ok(dataset.edges.every(({ polarity, rating, type }) => polarity === Math.sign(rating) &&
    type === (rating > 0 ? "positive-rating" : "negative-rating")));
});

test("the fast bootstrap contains the complete initial window and shards partition every remaining rating", () => {
  const initialWindow = manifest.initialWindow;
  const expectedWindowEdges = dataset.edges.filter(({ validFrom, validTo }) =>
    validFrom <= initialWindow.end && validTo >= initialWindow.start);
  assert.equal(manifest.nodeCount, 5_881);
  assert.equal(manifest.edgeCount, 35_592);
  assert.equal(bootstrap.nodes.length, manifest.nodeCount, "node directory is available before the rating shards");
  assert.deepEqual(bootstrap.edges, expectedWindowEdges);
  assert.equal(bootstrap.edges.length, 2_698);
  assert.equal(shardPayloads.length, 6);
  assert.deepEqual(manifest.shards.map(({ edgeCount }) => edgeCount), shardPayloads.map(({ edges }) => edges.length));
  assert.equal(shardPayloads.reduce((sum, { edges }) => sum + edges.length, 0), manifest.edgeCount - bootstrap.edges.length);
  assert.equal(dataset.edges.length, manifest.edgeCount);
  assert.equal(new Set(dataset.edges.map(({ id }) => id)).size, manifest.edgeCount);
  assert.equal(Buffer.byteLength(bootstrapText) < Buffer.byteLength(datasetText) / 2, true,
    "the first request must be materially smaller than the previous monolithic JSON");
});

test("Bitcoin full-range 2D overview remains within the declared deterministic sample budget", () => {
  const sample = sampleGraph2DProjectionPreview(dataset.nodes, dataset.edges);
  assert.equal(sample.nodes.length, 2_400);
  assert.equal(sample.links.length, 7_374);
  assert.equal(sample.totalNodeCount, dataset.nodes.length);
  assert.equal(sample.totalEdgeCount, dataset.edges.length);
});

test("Bitcoin OTC config validates as a directed weighted temporal graph and ASP retains the mapped source facts", () => {
  const firstTime = dataset.edges[0].validFrom;
  const lastTime = dataset.edges.at(-1).validTo;
  const report = inspectGraphInput(JSON.stringify(config), datasetText);
  assert.equal(report.status, "ready", JSON.stringify(report.diagnostics.slice(0, 10)));
  assert.equal(report.nodeCount, 5_881);
  assert.equal(report.edgeCount, 35_592);
  assert.equal(report.direction, "directed");
  assert.deepEqual(config.timeline, {
    start: firstTime,
    end: lastTime,
    initialWindow: { start: 1_305_543_359_824, end: 1_308_135_359_824 },
    debounceMs: 180
  });

  const graph = normalizeGraphData(dataset, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics.slice(0, 10)));
  assert.equal(graph.direction, "directed");
  assert.equal(graph.links.length, dataset.edges.length);
  assert.equal(graph.capabilities.directedEdges.available, true);
  assert.equal(graph.capabilities.edgeIdentity.available, true);
  assert.equal(graph.capabilities.edgeIntervals.available, true);
  assert.equal(graph.capabilities.edgeWeights.available, true);
  assert.equal(graph.capabilities.modularityWeights.available, false);

  const first = graph.links[0];
  assert.equal(first.sourceId, "bitcoin-otc-record-1");
  assert.equal(first.analysis.direction, "directed");
  assert.equal(first.analysis.weight, dataset.edges[0].rating);
  assert.equal(first.analysis.attributes.sourceTimeSeconds, sourceRows[0][3]);

  const facts = buildAspFactsFromGraph(graph);
  assert.match(facts.facts, /edge_direction\(1,directed\)\./);
  assert.match(facts.facts, /edge_id\(1,"bitcoin-otc-record-1"\)\./);
  assert.ok(facts.facts.includes('edge_attribute(1,"sourceTimeSeconds",decimal('), "source timestamp remains an exact ASP rational attribute");
  assert.equal(facts.reverseEdgeIndex[1], "bitcoin-otc-record-1");
  assert.equal(facts.temporalEncoding.encode(dataset.edges[0].validFrom), 1);
  assert.equal(facts.temporalEncoding.encode(dataset.edges.at(-1).validTo), 35_592);
});

test("the derived example retains roles only from each user's observed rater/ratee positions", () => {
  const outgoing = new Set(dataset.edges.map(({ source }) => source));
  const incoming = new Set(dataset.edges.map(({ target }) => target));
  assert.ok(dataset.nodes.every(({ id, roles }) => {
    const expected = [
      ...(outgoing.has(id) ? ["rater"] : []),
      ...(incoming.has(id) ? ["ratee"] : [])
    ].sort();
    return JSON.stringify(roles) === JSON.stringify(expected);
  }));
});

test("Bitcoin OTC motif counts match independent references in the initial 30-day projection", async () => {
  const projectedDataset = createInitialProjection();
  const windowEdges = projectedDataset.edges;
  assert.equal(projectedDataset.edges.length, 2_698);
  assert.equal(projectedDataset.nodes.length, 823);

  const graph = normalizeGraphData(projectedDataset, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics.slice(0, 10)));
  const facts = buildAspFactsFromGraph(graph, undefined, { compact: true });
  const motifs = config.graphAnalysis.motifs;

  assert.equal(motifs.length, 3);
  assert.equal(motifs[0].id, "negative-rating");
  assert.equal(motifs[1].id, "opposed-reciprocal-ratings");
  assert.equal(motifs[2].id, "ordered-negative-rating-chain");
  for (const motif of motifs) {
    const compiled = buildTypedMotifCountProgram(motif, graph.direction, "", {
      temporalEncoding: facts.temporalEncoding
    });
    assert.ok(compiled.program.includes("#count {"), `${motif.id} must compile to an exact aggregate`);
  }

  const distinctNegativePairs = new Set(windowEdges
    .filter(({ rating }) => rating < 0)
    .map(({ source, target }) => JSON.stringify([source, target])));
  const positivePairs = new Set(windowEdges
    .filter(({ rating }) => rating > 0)
    .map(({ source, target }) => JSON.stringify([source, target])));
  const negativePairs = distinctNegativePairs;
  const expectedOpposedPairs = [...positivePairs].filter((pair) => {
    const [source, target] = JSON.parse(pair);
    return negativePairs.has(JSON.stringify([target, source]));
  }).length;
  const negativeOutgoing = new Map();
  for (const edge of windowEdges.filter(({ rating }) => rating < 0)) {
    const outgoing = negativeOutgoing.get(edge.source) ?? [];
    outgoing.push(edge);
    negativeOutgoing.set(edge.source, outgoing);
  }
  let expectedOrderedChains = 0;
  for (const first of windowEdges.filter(({ rating }) => rating < 0)) {
    for (const second of negativeOutgoing.get(first.target) ?? []) {
      if (first.source !== first.target && first.target !== second.target && first.source !== second.target &&
        first.validFrom < second.validFrom) {
        expectedOrderedChains += 1;
      }
    }
  }

  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const expectedCounts = [distinctNegativePairs.size, expectedOpposedPairs, expectedOrderedChains];
  assert.deepEqual(expectedCounts, [45, 12, 1], "the documented initial window and independent oracles must stay aligned");
  for (const [index, motif] of motifs.entries()) {
    const counted = buildTypedMotifCountProgram(motif, graph.direction, "", {
      temporalEncoding: facts.temporalEncoding
    });
    const result = await runner.run(`${facts.facts}\n${counted.program}`, [], 1);
    assert.equal(result.Result, "SATISFIABLE", JSON.stringify({
      motif: motif.id,
      result: result.Result,
      error: result.Error,
      factBytes: Buffer.byteLength(facts.facts, "utf8"),
      wasmMemory: runner.getWasmLinearMemoryStats()
    }));
    assert.equal(result.Models?.More, "no", `${motif.id} aggregate must be complete`);
    assert.equal(
      parseTypedMotifCount(result.Call?.[0]?.Witnesses),
      String(expectedCounts[index]),
      `${motif.id} ASP count must match its independent source-data oracle`
    );
  }
});

test("Bitcoin OTC motif witness reaches the selected 2D SVG with source direction and record identity", async () => {
  const graph = normalizeGraphData(createInitialProjection(), config);
  const facts = buildAspFactsFromGraph(graph, undefined, { compact: true });
  const compiled = buildTypedMotifProgram(config.graphAnalysis.motifs[0], graph.direction);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);

  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteModelEnumeration(result), true);
  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.equal(matches.length, 45);

  const witness = matches[0];
  const supportingEdgeIds = witness.supportingEdges.flatMap(({ edgeIds }) => edgeIds);
  const edgeIdentities = mapSourceEdgeIdsToStructuralIdentities(supportingEdgeIds, graph.links);
  const threeDHighlightedEdges = graph.links.filter((link) =>
    graphDisplayLinkMatchesIdentities(link, edgeIdentities, getStructuralEdgeIdentity));
  const nodeAnnotations = Object.fromEntries(Object.entries(witness.roles).map(([role, assignment]) => [
    assignment.nodeId,
    `Ruolo ${role}`
  ]));
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: witness.nodeIds,
    highlightedEdgeIds: [...edgeIdentities],
    nodeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: "Rating negativo selezionato",
    completionLabel: "Enumerazione completa · 45 rating negativi"
  });

  assert.equal(scene.nodes.length, 2);
  assert.equal(scene.links.length, 1);
  assert.equal(scene.links[0].directed, true);
  assert.equal(scene.links[0].selected, true);
  assert.deepEqual(threeDHighlightedEdges.map(({ sourceId }) => sourceId), supportingEdgeIds);
  assert.deepEqual(scene.links.map(({ id }) => id), supportingEdgeIds);
  assert.match(svg, /Rating negativo selezionato/);
  assert.match(svg, /Enumerazione completa · 45 rating negativi/);
  assert.match(svg, /Ruolo rater/);
  assert.match(svg, /Ruolo ratee/);
  assert.ok(svg.includes(supportingEdgeIds[0]), "SVG must retain the source record ID as evidence");
});
