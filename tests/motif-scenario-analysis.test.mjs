import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProvenanceScenarioMotifCsv,
  summarizeProvenanceScenarioMotifs
} from "../src/lib/kliqueasp/graph/motifScenarioAnalysis.ts";
import { filterLinksByProvenanceScenario } from "../src/lib/kliqueasp/graph/provenance.ts";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildTypedMotifProgram, parseTypedMotifMatches } from "../src/lib/kliqueasp/graph/motifTask.ts";
import { hasCompleteModelEnumeration } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const roles = ["personA", "personB"];
const match = (personA, personB) => ({
  templateId: "pair",
  label: "Pair",
  nodeIds: [personA, personB],
  roles: {
    personA: { sourceId: personA },
    personB: { sourceId: personB }
  },
  supportingEdges: []
});
const queryScope = (overrides = {}) => ({
  selectedGroup: "",
  graphDirection: "undirected",
  timelineWindow: "",
  minimumEdgeConfidence: null,
  viewFilters: { types: [], groups: [] },
  ...overrides
});

test("finite motif worlds classify ordered role assignments and deduplicate edge witnesses", () => {
  const comparison = summarizeProvenanceScenarioMotifs("shared-place", "Persone nello stesso luogo", roles, [
    {
      scenarioId: "world-a",
      scenarioLabel: "Mondo A",
      nodesCount: 3,
      linksCount: 2,
      timeMs: 4.5,
      enumerationComplete: true,
      // Two ASP witnesses can support the same node/role instance.
      matches: [match("ada", "bruno"), match("ada", "bruno"), match("ada", "carla")]
    },
    {
      scenarioId: "world-b",
      scenarioLabel: "Mondo B",
      nodesCount: 3,
      linksCount: 1,
      timeMs: 6,
      enumerationComplete: true,
      matches: [match("ada", "bruno"), match("bruno", "carla")]
    }
  ], queryScope());

  assert.equal(comparison.worldAssumption, "finite-exhaustive-worlds");
  assert.deepEqual(comparison.scenarios.map(({ distinctRoleAssignments }) => distinctRoleAssignments), [2, 2]);
  assert.deepEqual(comparison.memberships.map(({ evidenceByScenario, ...membership }) => membership), [
    {
      roleAssignments: { personA: "ada", personB: "bruno" },
      scenarioIds: ["world-a", "world-b"],
      scenariosPresent: 2,
      totalScenarios: 2,
      status: "brave-and-cautious"
    },
    {
      roleAssignments: { personA: "ada", personB: "carla" },
      scenarioIds: ["world-a"],
      scenariosPresent: 1,
      totalScenarios: 2,
      status: "brave-only"
    },
    {
      roleAssignments: { personA: "bruno", personB: "carla" },
      scenarioIds: ["world-b"],
      scenariosPresent: 1,
      totalScenarios: 2,
      status: "brave-only"
    }
  ]);
  assert.deepEqual(comparison.memberships[0].evidenceByScenario.map(({ scenarioId }) => scenarioId), ["world-a", "world-b"]);
});

test("finite motif CSV names the assumed worlds and avoids probability language", () => {
  const comparison = summarizeProvenanceScenarioMotifs("pair", "Coppia tipizzata", roles, [
    {
      scenarioId: "w1",
      scenarioLabel: "W1",
      nodesCount: 2,
      linksCount: 1,
      timeMs: 1,
      enumerationComplete: true,
      matches: [match("x", "y")]
    },
    {
      scenarioId: "w2",
      scenarioLabel: "W2",
      nodesCount: 2,
      linksCount: 0,
      timeMs: 1,
      enumerationComplete: true,
      matches: []
    }
  ], queryScope({
    selectedGroup: "researchers",
    graphDirection: "directed",
    timelineWindow: "1900–1920",
    minimumEdgeConfidence: 0.7,
    viewFilters: { types: ["person"], groups: ["north", "south"] }
  }));
  const csv = buildProvenanceScenarioMotifCsv(comparison);
  assert.match(csv, /"record_type","motif_id","motif_label","role_names"/);
  assert.match(csv, /"finite-exhaustive-worlds","directed","researchers"/);
  assert.match(csv, /"brave-only","1","2","true"/);
  assert.ok(csv.includes('"[""w1""]","[""w2""]"'));
  assert.doesNotMatch(csv, /probability|likelihood/i);
});

test("empty finite motif comparison exports query scope and complete world summaries", () => {
  const comparison = summarizeProvenanceScenarioMotifs("pair", "Typed pair", roles, [
    {
      scenarioId: "w-empty",
      scenarioLabel: "Empty world",
      nodesCount: 3,
      linksCount: 0,
      timeMs: 2.25,
      enumerationComplete: true,
      matches: []
    }
  ], queryScope({ selectedGroup: "psychology", viewFilters: { types: ["person"], groups: [] } }));

  const csv = buildProvenanceScenarioMotifCsv(comparison);
  assert.equal(comparison.memberships.length, 0);
  assert.match(csv, /"record_type".*"scenario_summary_json"/);
  assert.match(csv, /"summary","pair","Typed pair"/);
  assert.match(csv, /"psychology"/);
  assert.match(csv, /w-empty/);
  assert.match(csv, /"nodes_count"":3/);
  assert.match(csv, /"links_count"":0/);
  assert.match(csv, /"distinct_role_assignments"":0/);
  assert.match(csv, /"enumeration_complete"":true/);
  assert.match(csv, /"solver_time_ms"":2\.25/);
});

test("finite motif CSV preserves scenario IDs and filter values containing the display separator", () => {
  const comparison = summarizeProvenanceScenarioMotifs("pair", "Typed pair", roles, [
    {
      scenarioId: "world|one",
      scenarioLabel: "World one",
      nodesCount: 2,
      linksCount: 1,
      timeMs: 1,
      enumerationComplete: true,
      matches: [match("x", "y")]
    },
    {
      scenarioId: "world-two",
      scenarioLabel: "World two",
      nodesCount: 2,
      linksCount: 0,
      timeMs: 1,
      enumerationComplete: true,
      matches: []
    }
  ], queryScope({ viewFilters: { types: ["person|research"], groups: ["group|north", "south"] } }));

  const csv = buildProvenanceScenarioMotifCsv(comparison);
  assert.match(csv, /"view_types_json","view_groups_json"/);
  assert.match(csv, /"worlds_present_json","worlds_absent_json"/);
  assert.ok(csv.includes('"[""person|research""]","[""group|north"",""south""]"'));
  assert.ok(csv.includes('"[""world|one""]","[""world-two""]"'));
});

test("motif scenario comparison rejects incomplete role assignments and repeated worlds", () => {
  const input = (scenarioId, matches = []) => ({
    scenarioId,
    scenarioLabel: scenarioId,
    nodesCount: 0,
    linksCount: 0,
    timeMs: 0,
    enumerationComplete: true,
    matches
  });

  assert.throws(() => summarizeProvenanceScenarioMotifs("m", "M", roles, []), /almeno uno scenario/);
  assert.throws(() => summarizeProvenanceScenarioMotifs("m", "M", roles, [
    input("same"), input("same")
  ], queryScope()), /ID scenario duplicato/);
  assert.throws(() => summarizeProvenanceScenarioMotifs("m", "M", roles, [
    { ...input("partial"), enumerationComplete: false }
  ], queryScope()), /non è completa/);
  assert.throws(() => summarizeProvenanceScenarioMotifs("m", "M", roles, [
    input("w", [{ roles: { personA: { sourceId: "a" } } }])
  ], queryScope()), /personB.sourceId/);
  assert.throws(() => summarizeProvenanceScenarioMotifs("m", "M", roles, [
    input("w", [{ roles: { personA: { sourceId: "a" }, personB: { sourceId: "b" }, extra: { sourceId: "c" } } }])
  ], queryScope()), /non coincide con i ruoli/);
});

test("scenario motif membership matches complete clingo enumerations and ignores parallel witness multiplicity", async () => {
  const graphConfig = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", typeField: "$.type" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        provenanceField: "$.sourceRef",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  };
  const data = {
    nodes: [
      { id: "a", type: "person" },
      { id: "b", type: "person" },
      { id: "c", type: "person" }
    ],
    edges: [
      { id: "ab-a1", source: "a", target: "b", type: "knows", sourceRef: "A" },
      { id: "ab-a2", source: "a", target: "b", type: "knows", sourceRef: "A" },
      { id: "bc-a", source: "b", target: "c", type: "knows", sourceRef: "A" },
      { id: "ab-b", source: "a", target: "b", type: "knows", sourceRef: "B" }
    ]
  };
  const normalized = normalizeGraphData(data, graphConfig);
  assert.equal(normalized.valid, true, JSON.stringify(normalized.diagnostics));
  const template = {
    id: "knows-pair",
    roles: {
      personA: { nodeTypes: ["person"] },
      personB: { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "personA", targetRole: "personB", edgeType: "knows" }],
    symmetricRoles: [["personA", "personB"]]
  };
  const runner = await createClingoWasmRunner();
  const scenarioInputs = [];
  for (const source of ["A", "B"]) {
    const scenarioLinks = filterLinksByProvenanceScenario(normalized.links, {
      sources: [source],
      unattributedEdges: "exclude",
      referenceMatching: "any"
    });
    const graph = { ...normalized, links: scenarioLinks };
    const facts = buildAspFactsFromGraph(graph, undefined, { compact: true });
    const compiled = buildTypedMotifProgram(template, normalized.direction);
    const result = await runner.run(`${facts.facts}\n${compiled.program}`);
    assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
    assert.equal(hasCompleteModelEnumeration(result), true);
    const matches = parseTypedMotifMatches(
      result.Call[0].Witnesses,
      compiled,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      facts.reverseEdgeIndex,
      new Set(),
      facts.temporalEncoding.decode
    );
    scenarioInputs.push({
      scenarioId: source,
      scenarioLabel: `Mondo ${source}`,
      nodesCount: graph.nodes.length,
      linksCount: graph.links.length,
      timeMs: 1,
      enumerationComplete: true,
      matches
    });
  }

  const comparison = summarizeProvenanceScenarioMotifs(
    template.id,
    template.id,
    Object.keys(template.roles),
    scenarioInputs,
    queryScope({ viewFilters: { types: ["person"], groups: [] } })
  );
  assert.deepEqual(comparison.memberships.map(({ roleAssignments, status }) => ({ roleAssignments, status })), [
    { roleAssignments: { personA: "a", personB: "b" }, status: "brave-and-cautious" },
    { roleAssignments: { personA: "b", personB: "c" }, status: "brave-only" }
  ]);
  assert.equal(comparison.scenarios[0].distinctRoleAssignments, 2);
  assert.equal(comparison.scenarios[1].distinctRoleAssignments, 1);
  const cautiousWitnesses = comparison.memberships[0].evidenceByScenario;
  assert.deepEqual(cautiousWitnesses.map(({ scenarioId }) => scenarioId), ["A", "B"]);
  assert.ok(cautiousWitnesses[0].match.supportingEdges.flatMap(({ edgeIds }) => edgeIds)
    .some((edgeId) => ["ab-a1", "ab-a2"].includes(edgeId)));
  assert.ok(cautiousWitnesses[1].match.supportingEdges.flatMap(({ edgeIds }) => edgeIds).includes("ab-b"));
  assert.match(buildProvenanceScenarioMotifCsv(comparison), /world_witnesses_json/);
  assert.match(buildProvenanceScenarioMotifCsv(comparison), /ab-b/);
});
