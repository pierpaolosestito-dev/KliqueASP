import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import presetConfig from "../src/lib/kliqueasp/data/examples/sociopatterns-invs-full.config.json" with { type: "json" };
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { createTypedMotifCountPartitionPlan } from "../src/lib/kliqueasp/graph/motifCountTask.ts";
import {
  getGraphNeighborhoodNodeIds,
  prepareGraphDisplayLinks
} from "../src/lib/kliqueasp/graph/graphVisualization.ts";
import {
  buildKCoreProgram,
  computeKCoreNumbers,
  getStructuralEdgeIdentity,
  getStructuralSolverOptions,
  parseWitnessNodeSets,
  selectMaximumNodeSets
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("il preset Sandbox InVS completo conserva tutti i record e configura il conteggio partizionato", async () => {
  const [source, fullDatasetText] = await Promise.all([
    readFile(new URL("./fixtures/sociopatterns-invs13-tij.dat", import.meta.url), "utf8"),
    readFile(new URL("../static/examples/sociopatterns-invs-full.json", import.meta.url), "utf8")
  ]);
  const presetDataset = JSON.parse(fullDatasetText);
  const expectedEdges = source.trim().split(/\r?\n/).map((line, index) => {
    const [time, sourceId, targetId] = line.trim().split(/\s+/).map(Number);
    return {
      id: `invs13-row-${index + 1}`,
      source: String(sourceId),
      target: String(targetId),
      type: "face-to-face-contact",
      validFrom: time - 20,
      validTo: time
    };
  });
  const expectedNodeIds = [...new Set(expectedEdges.flatMap((edge) => [edge.source, edge.target]))]
    .sort((left, right) => Number(left) - Number(right));
  const expectedNodes = expectedNodeIds.map((id) => ({ id, label: `Participant ${id}`, type: "person" }));

  assert.deepEqual(presetDataset.nodes, expectedNodes);
  assert.deepEqual(presetDataset.edges, expectedEdges);
  assert.equal(presetDataset.nodes.length, 92);
  assert.equal(presetDataset.edges.length, 9_827);
  assert.equal(presetConfig.schemaVersion, 2);
  assert.equal(presetConfig.features.aggregateParallelEdgesForDisplay, true);
  assert.equal(presetConfig.node.iconSize, 7);
  assert.equal(presetConfig.node.ring.scale, 4.5);
  assert.equal(presetConfig.forces.nodeCollisionRadius, 7.5);
  assert.equal(presetConfig.graph.linkOpacity, 0.18);
  assert.equal(presetConfig.graph.linkWidth, 0.4);
  assert.equal(presetConfig.features.fitGraphToView, true);
  assert.equal(presetConfig.graphMapping.edge.direction, "undirected");
  assert.equal(presetConfig.graphMapping.edge.identity, "multigraph");
  assert.equal(presetConfig.graphMapping.edge.validity.numericUnit, "seconds");
  assert.equal(presetConfig.graphAnalysis.motifCount.partitionSize, 8);
  assert.equal(presetConfig.graphAnalysis.motifCount.maxDurationMs, 1_800_000);

  const graph = normalizeGraphData(presetDataset, presetConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.nodes.length, 92);
  assert.equal(graph.links.length, 9_827);
  assert.equal(graph.capabilities.edgeIntervals.available, true);

  const partitions = createTypedMotifCountPartitionPlan(
    presetDataset.edges.length,
    presetConfig.graphAnalysis.motifCount.partitionSize
  );
  assert.equal(partitions.length, 1_229);
  assert.equal(partitions.flat().length, presetDataset.edges.length);
  assert.deepEqual(partitions.flat(), Array.from({ length: 9_827 }, (_, index) => index + 1));
});

test("il preset InVS aggrega solo la vista e mantiene i 9.827 ID sui 755 legami visuali", async () => {
  const fullDatasetText = await readFile(new URL("../static/examples/sociopatterns-invs-full.json", import.meta.url), "utf8");
  const graph = normalizeGraphData(JSON.parse(fullDatasetText), presetConfig);
  assert.equal(graph.valid, true);
  assert.equal(graph.links.length, 9827);

  const visualLinks = prepareGraphDisplayLinks(graph.links, {
    aggregateParallelEdges: presetConfig.features.aggregateParallelEdgesForDisplay,
    defaultDirection: graph.direction,
    getIdentity: getStructuralEdgeIdentity
  });

  assert.equal(visualLinks.length, 755);
  assert.equal(visualLinks.reduce((total, link) => total + link.visualRecordCount, 0), 9827);
  assert.equal(visualLinks.flatMap((link) => link.visualSourceIds).length, 9827);
  assert.equal(new Set(visualLinks.flatMap((link) => link.visualSourceEdgeIdentities)).size, 9827);
  assert.equal(graph.links.every((link) => typeof link.source === "string" && typeof link.target === "string"), true);
});

test("il focus display-only InVS conta correttamente i raggi 1, 2 e 3 senza ridurre il grafo analitico", async () => {
  const fullDatasetText = await readFile(
    new URL("../static/examples/sociopatterns-invs-full.json", import.meta.url),
    "utf8"
  );
  const graph = normalizeGraphData(JSON.parse(fullDatasetText), presetConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  const originalLinks = graph.links;
  const expectedByRadius = [
    { radius: 1, nodes: 5, records: 37, lines: 7 },
    { radius: 2, nodes: 46, records: 2_969, lines: 287 },
    { radius: 3, nodes: 92, records: 9_827, lines: 755 }
  ];

  for (const expected of expectedByRadius) {
    const focusedNodeIds = getGraphNeighborhoodNodeIds(
      graph.nodes.map((node) => node.id),
      graph.links,
      "210",
      { maxHops: expected.radius, direction: "weak", defaultGraphDirection: graph.direction }
    );
    const focusedLinks = graph.links.filter((link) => focusedNodeIds.has(link.source) && focusedNodeIds.has(link.target));
    const focusedDisplayLinks = prepareGraphDisplayLinks(focusedLinks, {
      aggregateParallelEdges: presetConfig.features.aggregateParallelEdgesForDisplay,
      defaultDirection: graph.direction,
      getIdentity: getStructuralEdgeIdentity
    });

    assert.equal(focusedNodeIds.size, expected.nodes, `raggio ${expected.radius}: nodi raggiunti`);
    assert.equal(focusedLinks.length, expected.records, `raggio ${expected.radius}: record indotti`);
    assert.equal(focusedDisplayLinks.length, expected.lines, `raggio ${expected.radius}: linee visuali`);
    assert.equal(
      focusedDisplayLinks.reduce((total, link) => total + link.visualRecordCount, 0),
      expected.records,
      `raggio ${expected.radius}: i record ASP restano rappresentati senza perdita`
    );
  }

  assert.equal(graph.nodes.length, 92);
  assert.equal(graph.links.length, 9_827);
  assert.equal(graph.links, originalLinks, "il focus non sostituisce né muta la proiezione usata dall'analisi");
});

test("il k-core ASP sullo scheletro full-period InVS coincide col profilo indipendente", async () => {
  const fullDatasetText = await readFile(
    new URL("../static/examples/sociopatterns-invs-full.json", import.meta.url),
    "utf8"
  );
  const graph = normalizeGraphData(JSON.parse(fullDatasetText), presetConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));

  const nodeIds = graph.nodes.map((node) => node.id);
  const coreNumbers = computeKCoreNumbers(nodeIds, graph.links);
  const maximumCoreNumber = Math.max(...coreNumbers.values());
  assert.ok(maximumCoreNumber > 0);
  const expectedCore = nodeIds.filter((id) => (coreNumbers.get(id) ?? -1) >= maximumCoreNumber).sort();
  const distinctPairs = new Set(graph.links.map(({ source, target }) =>
    source < target ? `${source}:${target}` : `${target}:${source}`
  ));
  assert.equal(distinctPairs.size, 755, "la rete statica conta coppie di partecipanti distinte, non record ripetuti");
  assert.equal(maximumCoreNumber, 11);
  assert.equal(expectedCore.length, 64);
  const facts = buildAspFactsFromGraph(graph, undefined, { compact: true });
  const runner = await createClingoWasmRunner();
  const result = await runner.run(
    `${facts.facts}\n\n${buildKCoreProgram(maximumCoreNumber)}\n`,
    getStructuralSolverOptions("kCore")
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));

  const actualCore = selectMaximumNodeSets(
    parseWitnessNodeSets(result.Call?.[0]?.Witnesses, facts.reverseIndex)
  );
  assert.equal(actualCore.length, 1, "il k-core massimo del grafo InVS è unico");
  assert.deepEqual(actualCore[0].sort(), expectedCore,
    "ASP deve restituire gli stessi partecipanti del core number indipendente");
});
