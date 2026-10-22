import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAspFactsFromGraph,
  buildCliqueProgram,
  normalizeGraphData,
  parseWitnessCliqueResults
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("le spiegazioni di clique sono opt-in e non alterano il programma predefinito", () => {
  const legacyProgram = buildCliqueProgram("maximal", "");
  assert.match(legacyProgram, /#show in\/1\./);
  assert.doesNotMatch(legacyProgram, /clique_edge_support/);

  const explanationProgram = buildCliqueProgram("maximal", "", { enabled: true });
  assert.match(explanationProgram, /#show clique_edge_support\/2\./);
});

test("la spiegazione ASP della clique conserva gli ID di tutti i record che sostengono le coppie", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", label: "Ada", kind: "person" },
      { id: "b", label: "Bruno", kind: "person" },
      { id: "c", label: "Carla", kind: "person" }
    ],
    edges: [
      { id: "ab-primary", from: "a", to: "b", kind: "knows" },
      { id: "ab-secondary", from: "b", to: "a", kind: "knows" },
      { from: "a", to: "c", kind: "knows" },
      { id: "bc", from: "b", to: "c", kind: "knows" }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", labelField: "$.label", typeField: "$.kind" },
      edge: {
        idField: "$.id",
        sourceField: "$.from",
        targetField: "$.to",
        typeField: "$.kind",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  });
  const facts = buildAspFactsFromGraph(graph);
  const program = buildCliqueProgram("all", "", { enabled: true, includeEdgeRecords: true });
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${program}`, ["--opt-mode=enum"]);
  assert.ok(["SATISFIABLE", "OPTIMUM FOUND"].includes(result.Result), result.Error ?? JSON.stringify(result));
  const cliques = parseWitnessCliqueResults(
    result.Call?.[0]?.Witnesses,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    facts.reverseGeneratedEdgeIndex
  );

  assert.equal(cliques.length, 1);
  assert.deepEqual(cliques[0].nodeIds.sort(), ["a", "b", "c"]);
  assert.equal(cliques[0].supportingEdges.length, 4);
  assert.deepEqual(cliques[0].supportingEdges.map((edge) => edge.edgeId).sort(), [
    "ab-primary", "ab-secondary", "bc", "edge_3"
  ]);
  assert.equal(cliques[0].supportingEdges.find((edge) => edge.edgeId === "edge_3")?.edgeIdGenerated, true);
  assert.ok(cliques[0].supportingEdges.filter((edge) => edge.edgeId !== "edge_3")
    .every((edge) => edge.edgeIdGenerated !== true));
  assert.deepEqual(new Set(cliques[0].supportingEdges.map((edge) =>
    [edge.sourceNodeId, edge.targetNodeId].sort().join("-")
  )), new Set(["a-b", "a-c", "b-c"]));
});

test("la spiegazione dei fatti legacy restituisce le coppie ASP senza inventare ID d'arco", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", label: "Ada" },
      { id: "b", label: "Bruno" },
      { id: "c", label: "Carla" }
    ],
    edges: [
      { source: "a", target: "b" },
      { source: "a", target: "c" },
      { source: "b", target: "c" }
    ]
  });
  const facts = buildAspFactsFromGraph(graph);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${buildCliqueProgram("all", "", { enabled: true })}`,
    ["--opt-mode=enum"]
  );
  const cliques = parseWitnessCliqueResults(
    result.Call?.[0]?.Witnesses,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );

  assert.ok(["SATISFIABLE", "OPTIMUM FOUND"].includes(result.Result), result.Error ?? JSON.stringify(result));
  assert.equal(cliques.length, 1);
  assert.equal(cliques[0].supportingEdges.length, 3);
  assert.ok(cliques[0].supportingEdges.every((edge) => edge.edgeId === undefined));
});
