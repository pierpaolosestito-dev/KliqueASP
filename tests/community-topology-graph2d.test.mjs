import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph2DScene,
  buildGraph2DSvg
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildCommunityTopologyGraph2DOverlay } from "../src/lib/kliqueasp/graph/communityTopologyGraph2D.ts";
import {
  searchMinimumCostCommunityTopologyCounterfactual
} from "../src/lib/kliqueasp/graph/communityTopologyCounterfactual.ts";
import {
  buildCommunityPairMembershipPrograms,
  buildModularityFacts,
  getStructuralSolverOptions,
  parseWitnessModularityPartitions,
  selectMaximumModularityPartitions
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("community topology edits map source IDs to a complete 2D witness and SVG", () => {
  const nodes = [
    { id: "a", sourceId: "node-a", label: "A" },
    { id: "b", sourceId: "node-b", label: "B" },
    { id: "c", sourceId: "node-c", label: "C" }
  ];
  const links = [
    { source: "a", target: "b", analysis: { id: "removed-through-analysis-id" } },
    { source: "a", target: "b", sourceId: "parallel-edge-to-keep" },
    { source: "c", target: "c", sourceId: "generated-record", sourceIdGenerated: true }
  ];
  const result = {
    nodeIds: ["a", "b"],
    requestedRelation: "never",
    relation: "always",
    selectedEdits: [
      { id: "remove-ab", action: "remove", edgeId: "removed-through-analysis-id", cost: 2 },
      { id: "add-bc", action: "add", sourceNodeId: "node-b", targetNodeId: "node-c", cost: 3 }
    ],
    candidateCount: 2,
    totalEditCost: 5,
    testedEditSets: 4,
    globalScaledScore: 100,
    togetherScaledScore: 100,
    separateScaledScore: 80,
    modularityDenominator: "20"
  };

  const overlay = buildCommunityTopologyGraph2DOverlay(result, nodes, links);
  assert.deepEqual(overlay.nodeIds, ["a", "b"]);
  assert.deepEqual([...overlay.edgeIds], ["source:removed-through-analysis-id"]);
  assert.equal(overlay.edgeAnnotations["source:removed-through-analysis-id"].label, "Arco da rimuovere nell'ipotesi");
  assert.match(overlay.edgeAnnotations["source:removed-through-analysis-id"].description, /costo di rimozione 2/);
  assert.equal(overlay.hypotheticalLinks.length, 1);
  assert.equal(overlay.hypotheticalLinks[0].source, "b");
  assert.equal(overlay.hypotheticalLinks[0].target, "c");
  assert.equal(overlay.hypotheticalLinks[0].hypothetical, true);
  assert.equal(overlay.nodeAnnotations.a, "Primo nodo della coppia valutata \u00b7 Estremo di una relazione da rimuovere");
  assert.equal(overlay.nodeAnnotations.c, "Estremo di una relazione da aggiungere");

  const scene = buildGraph2DScene(nodes, [...links, ...overlay.hypotheticalLinks], {
    mode: "witness",
    graphDirection: "undirected",
    highlightedNodeIds: overlay.nodeIds,
    highlightedEdgeIds: overlay.edgeIds,
    nodeAnnotations: overlay.nodeAnnotations,
    edgeAnnotations: overlay.edgeAnnotations
  });
  assert.deepEqual(scene.nodes.map(({ id }) => id), ["a", "b", "c"]);
  assert.deepEqual(scene.links.map(({ id }) => id), [
    "removed-through-analysis-id",
    "hypothetical:community-topology:add-bc"
  ]);
  assert.equal(scene.links[0].annotation?.label, "Arco da rimuovere nell'ipotesi");
  assert.equal(scene.links[1].annotation?.description, "Costo candidato 3");
  const svg = buildGraph2DSvg(scene, {
    showLegend: true,
    showAnnotations: true,
    resultLabel: overlay.resultLabel,
    completionLabel: overlay.completionLabel
  });
  assert.match(svg, /Scenario di modularit\u00e0 \u00b7 sempre insieme \u00b7 2 modifiche/);
  assert.match(svg, /Costo minimo verificato \u00b7 una proposta tra eventuali pari merito \u00b7 4 ipotesi esaminate/);
  assert.match(svg, /removed-through-analysis-id/);
  assert.match(svg, /hypothetical:community-topology:add-bc/);
  assert.match(svg, /Arco da rimuovere nell&apos;ipotesi/);
});

test("un controfattuale di modularità provato da clingo arriva all'SVG con ID e costo dell'edit", async () => {
  const graph = {
    nodes: [
      { id: "a", sourceId: "source-a", label: "Ada" },
      { id: "b", sourceId: "source-b", label: "Bruno" },
      { id: "c", sourceId: "source-c", label: "Carla" }
    ],
    links: [{ source: "a", target: "b", sourceId: "observed-ab" }]
  };
  const nodeIds = ["a", "b", "c"];
  const aspIndexByNodeId = new Map(nodeIds.map((id, index) => [id, index + 1]));
  const reverseIndex = Object.fromEntries(nodeIds.map((id, index) => [index + 1, id]));
  const edits = [{
    id: "candidate-bc",
    action: "add",
    sourceNodeId: "source-b",
    targetNodeId: "source-c",
    cost: 1
  }];
  const runner = await createClingoWasmRunner();
  const outcome = await searchMinimumCostCommunityTopologyCounterfactual({
    edits,
    nodeIds: ["a", "c"],
    requestedRelation: "always",
    solveSelection: (program) => runner.run(program, ["--opt-mode=opt"]),
    evaluateGraph: async (editIndexes) => {
      const edgeRecords = [{ source: 1, target: 2 }];
      for (const editIndex of editIndexes) {
        const edit = edits[editIndex];
        if (edit.action === "add") {
          edgeRecords.push({
            source: aspIndexByNodeId.get("b"),
            target: aspIndexByNodeId.get("c")
          });
        }
      }

      const facts = buildModularityFacts([1, 2, 3], edgeRecords, { includePairwiseObjective: true });
      const pairwiseOptions = facts.pairwiseObjectiveOffset === undefined
        ? {}
        : { pairwiseObjectiveOffset: facts.pairwiseObjectiveOffset };
      const programs = buildCommunityPairMembershipPrograms(pairwiseOptions, [1, 3]);
      const input = [facts.facts, facts.pairwiseObjectiveFacts].filter(Boolean).join("\n");
      const solvePair = async (program) => {
        const result = await runner.run(`${input}\n${program}\n`, getStructuralSolverOptions("communities"));
        if (result.Result === "UNSATISFIABLE") return null;
        assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
        const partitions = selectMaximumModularityPartitions(
          parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, reverseIndex)
        );
        assert.ok(partitions.length > 0, "la modularità deve restituire almeno una partizione ottima");
        return partitions[0].scaledScore;
      };

      const togetherScaledScore = await solvePair(programs.together);
      const separateScaledScore = await solvePair(programs.separate);
      return {
        togetherScaledScore,
        separateScaledScore,
        modularityDenominator: String(4n * BigInt(facts.totalWeight) ** 2n * BigInt(facts.resolutionDenominator))
      };
    }
  });

  assert.equal(outcome.status, "found");
  assert.equal(outcome.result.relation, "always");
  assert.deepEqual(outcome.result.selectedEdits.map(({ id }) => id), ["candidate-bc"]);
  assert.equal(outcome.result.totalEditCost, 1);
  assert.equal(outcome.result.testedEditSets, 2);

  const overlay = buildCommunityTopologyGraph2DOverlay(outcome.result, graph.nodes, graph.links);
  const scene = buildGraph2DScene(graph.nodes, [...graph.links, ...overlay.hypotheticalLinks], {
    mode: "witness",
    graphDirection: "undirected",
    highlightedNodeIds: overlay.nodeIds,
    highlightedEdgeIds: overlay.edgeIds,
    nodeAnnotations: overlay.nodeAnnotations,
    edgeAnnotations: overlay.edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showLabels: true,
    showLegend: true,
    showAnnotations: true,
    resultLabel: overlay.resultLabel,
    completionLabel: overlay.completionLabel
  });

  assert.deepEqual(scene.nodes.map(({ id }) => id).sort(), ["a", "b", "c"]);
  assert.deepEqual(scene.links.map(({ id }) => id), ["hypothetical:community-topology:candidate-bc"]);
  assert.equal(scene.links[0].hypothetical, true);
  assert.match(svg, /candidate-bc/);
  assert.match(svg, /Costo candidato 1/);
  assert.match(svg, /Costo minimo verificato/);
  assert.match(svg, /Bruno/);
  assert.match(svg, /Carla/);
});
