import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import presetConfig from "../src/lib/kliqueasp/data/examples/sociopatterns-invs-100-minute.config.json" with { type: "json" };
import presetDataset from "../src/lib/kliqueasp/data/examples/sociopatterns-invs-100-minute.json" with { type: "json" };
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildTypedMotifCountProgram,
  buildTypedMotifTemporalNearMatchProgram,
  parseTypedMotifCount,
  parseTypedMotifNearMatches
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";
import {
  buildMaximumModularityProgram,
  buildModularityFacts,
  factorModularityFactsByPositiveWeightComponents,
  getStructuralSolverOptions,
  hasCompleteModelEnumeration,
  parseWitnessModularityPartitions,
  selectMaximumModularityPartitions,
  solveModularityByPositiveWeightComponents
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";

test("il preset Sandbox SocioPatterns conserva la proiezione reale e conta le catene con ASP", async () => {
  const source = await readFile(new URL("./fixtures/sociopatterns-invs13-tij.dat", import.meta.url), "utf8");
  const allEdges = source.trim().split(/\r?\n/).map((line, index) => {
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
  const expectedEdges = allEdges.filter((edge) => edge.validFrom <= 34_800 && edge.validTo >= 28_800);
  const expectedNodeIds = [...new Set(expectedEdges.flatMap((edge) => [edge.source, edge.target]))]
    .sort((left, right) => Number(left) - Number(right));
  const expectedNodes = expectedNodeIds.map((id) => ({ id, label: `Participant ${id}`, type: "person" }));

  assert.equal(presetConfig.schemaVersion, 2);
  assert.deepEqual(presetDataset.nodes, expectedNodes);
  assert.deepEqual(presetDataset.edges, expectedEdges);
  assert.equal(presetDataset.nodes.length, 45);
  assert.equal(presetDataset.edges.length, 134);
  assert.equal(presetConfig.graphMapping.edge.direction, "undirected");
  assert.equal(presetConfig.graphMapping.edge.identity, "multigraph");
  assert.equal(presetConfig.graphMapping.edge.validity.numericUnit, "seconds");
  assert.equal(presetConfig.graphAnalysis.motifs.length, 2);

  const graph = normalizeGraphData(presetDataset, presetConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.nodes.length, 45);
  assert.equal(graph.links.length, 134);
  assert.equal(graph.capabilities.edgeIntervals.available, true);
  assert.equal(graph.capabilities.nodeAttributes.available, true);

  const motif = presetConfig.graphAnalysis.motifs[0];
  const adjacency = new Map();
  for (const edge of expectedEdges) {
    for (const [sourceId, targetId] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      const outgoing = adjacency.get(sourceId) ?? [];
      outgoing.push({ edge, targetId });
      adjacency.set(sourceId, outgoing);
    }
  }
  let expectedCount = 0;
  for (const first of expectedEdges) {
    for (const [firstRole, secondRole] of [[first.source, first.target], [first.target, first.source]]) {
      if (firstRole === secondRole) continue;
      for (const second of adjacency.get(secondRole) ?? []) {
        if (second.targetId === firstRole || second.targetId === secondRole ||
          first.validFrom >= second.edge.validFrom) continue;
        for (const third of adjacency.get(second.targetId) ?? []) {
          if (third.targetId === firstRole || third.targetId === secondRole ||
            third.targetId === second.targetId || second.edge.validFrom >= third.edge.validFrom) continue;
          expectedCount += 1;
        }
      }
    }
  }
  assert.equal(expectedCount, 2_101, "oracolo indipendente sulla finestra di 100 minuti");

  const facts = buildAspFactsFromGraph(graph, undefined, { compact: true });
  const compiled = buildTypedMotifCountProgram(motif, graph.direction);
  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${facts.facts}\n${compiled.program}`, ["--stats=2"], 1);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteModelEnumeration(result), true);
  assert.equal(parseTypedMotifCount(result.Call?.[0]?.Witnesses), String(expectedCount));

  const selectedMotif = presetConfig.graphAnalysis.motifs[1];
  const selectedCompiled = buildTypedMotifTemporalNearMatchProgram(
    selectedMotif,
    graph.direction,
    "",
    facts.temporalEncoding
  );
  const whyNotResult = await runner.run(
    `${facts.facts}\n${selectedCompiled.program}`,
    ["--opt-mode=optN"]
  );
  assert.equal(whyNotResult.Result, "OPTIMUM FOUND", whyNotResult.Error ?? JSON.stringify(whyNotResult));
  assert.equal(whyNotResult.Models?.More, "no");
  const nearMatches = parseTypedMotifNearMatches(
    whyNotResult.Call?.[0]?.Witnesses,
    selectedCompiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    facts.temporalEncoding.decode
  );
  const getPairRecords = (left, right) => expectedEdges.filter((edge) =>
    (edge.source === left && edge.target === right) || (edge.source === right && edge.target === left));
  const expectedTies = new Set();
  for (const first of getPairRecords("80", "95")) {
    for (const second of getPairRecords("95", "118")) {
      if (first.validFrom < second.validFrom) expectedTies.add(JSON.stringify([first.id, second.id]));
    }
  }
  assert.equal(getPairRecords("118", "15").length, 0,
    "la coppia finale è assente nella finestra proiettata, non dichiarata assente dall'intero dataset");
  assert.equal(expectedTies.size, 5, "l'oracolo trova cinque supporti temporali ottimi nella finestra");
  const actualTies = new Set();
  for (const match of nearMatches) {
    assert.deepEqual(Object.fromEntries(Object.entries(match.roles).map(([role, value]) => [role, value.sourceId])), {
      first: "80",
      second: "95",
      third: "118",
      fourth: "15"
    });
    assert.deepEqual(match.missingRoles, []);
    assert.deepEqual(match.missingPatterns.map(({ index }) => index), [3]);
    assert.deepEqual(match.temporalEvidence.orderViolations, []);
    const [first, second, third] = match.temporalEvidence.supportingEdges;
    assert.equal(first.edgeIds.length, 1);
    assert.equal(second.edgeIds.length, 1);
    assert.deepEqual(third.edgeIds, []);
    actualTies.add(JSON.stringify([first.edgeIds[0], second.edgeIds[0]]));
  }
  assert.equal(nearMatches.length, expectedTies.size);
  assert.deepEqual(actualTies, expectedTies,
    "ASP restituisce tutti e soli i record di contatto indipendentemente ordinati");
});

test("la modularità fattorizzata conserva l'ottimo ASP su una finestra disconnessa del dataset reale InVS", async () => {
  const windowFrom = 30_000;
  const windowTo = 30_300;
  const projectedEdges = presetDataset.edges.filter((edge) =>
    edge.validFrom <= windowTo && edge.validTo >= windowFrom
  );
  assert.equal(projectedEdges.length, 8);

  const graph = normalizeGraphData({ ...presetDataset, edges: projectedEdges }, presetConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  const aspFacts = buildAspFactsFromGraph(graph, undefined, { compact: true });
  const nodeIndexes = graph.nodes.map((node) => aspFacts.indexByNodeId.get(String(node.id)));
  const modularityEdges = projectedEdges.map((edge) => ({
    source: aspFacts.indexByNodeId.get(String(edge.source)),
    target: aspFacts.indexByNodeId.get(String(edge.target))
  }));
  const modularityFacts = buildModularityFacts(nodeIndexes, modularityEdges);
  assert.equal(modularityFacts.candidateCount, 45);
  assert.equal(modularityFacts.edgeCount, 8);
  assert.equal(modularityFacts.connectedComponentCount, 38,
    "the full participant domain includes 35 isolated participants");

  const components = factorModularityFactsByPositiveWeightComponents(modularityFacts, true, true);
  assert.deepEqual(components?.map(({ facts }) => facts.candidateCount), [4, 3, 3, 35]);
  const runner = await createClingoWasmRunner();
  const fullProgram = [
    modularityFacts.facts.trim(),
    modularityFacts.connectedComponentFacts.trim(),
    buildMaximumModularityProgram({ separateDisconnectedComponents: true, includeContributions: true })
  ].join("\n\n");
  const aggregateResult = await runner.run(fullProgram, getStructuralSolverOptions("communities"));
  assert.equal(aggregateResult.Result, "OPTIMUM FOUND", aggregateResult.Error ?? JSON.stringify(aggregateResult));
  const aggregatePartition = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(aggregateResult.Call?.[0]?.Witnesses, aspFacts.reverseIndex)
  )[0];
  assert.ok(aggregatePartition);

  const factored = await solveModularityByPositiveWeightComponents(
    modularityFacts,
    aspFacts.reverseIndex,
    {
      enumerateAllOptima: false,
      includeContributions: true,
      solve: (program, options) => runner.run(program, options)
    }
  );
  assert.ok(factored);
  assert.equal(factored.result.Result, "OPTIMUM FOUND");
  assert.equal(factored.result.Models.More, "yes",
    "the decomposition returns one proven optimum, not a claim to enumerate neutral assignments");
  const factoredPartition = factored.partitions[0];
  assert.ok(factoredPartition);
  assert.equal(factoredPartition.scaledScore, aggregatePartition.scaledScore);
  assert.deepEqual(factoredPartition.communities.flat().sort(),
    graph.nodes.map((node) => String(node.id)).sort());

  const degreeByIndex = new Map(modularityFacts.nodeDegrees.map(({ nodeIndex, degree }) => [nodeIndex, degree]));
  const independentScore = factoredPartition.communities.reduce((score, community) => {
    const members = new Set(community.map((nodeId) => aspFacts.indexByNodeId.get(nodeId)));
    const internalEdgeCount = modularityFacts.normalizedEdges.filter((edge) =>
      members.has(edge.source) && members.has(edge.target)
    ).length;
    const volume = [...members].reduce((sum, nodeIndex) => sum + (degreeByIndex.get(nodeIndex) ?? 0), 0);
    return score + 4 * modularityFacts.totalWeight * internalEdgeCount - volume ** 2;
  }, 0);
  assert.equal(factoredPartition.scaledScore, independentScore,
    "the recomposed witness independently satisfies the exact scaled modularity objective");

  assert.equal(await solveModularityByPositiveWeightComponents(modularityFacts, aspFacts.reverseIndex, {
    enumerateAllOptima: true,
    solve: async () => { throw new Error("complete enumeration must use the aggregate neutral-assignment domain"); }
  }), null);
});
