import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAspFactsFromGraph,
  normalizeGraphData
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import { deepMergeConfig } from "../src/lib/kliqueasp/config/deepMergeConfig.ts";
import {
  buildTypedMotifNearMatchProgram,
  buildTypedMotifProgram,
  parseTypedMotifMatches,
  parseTypedMotifNearMatches
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import {
  buildProvenanceScenarioMotifCsv,
  summarizeProvenanceScenarioMotifs
} from "../src/lib/kliqueasp/graph/motifScenarioAnalysis.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const reservedRole = "__proto__";

test("JSON mapping aliases and ASP motif roles preserve the own key __proto__", async () => {
  const graphConfig = deepMergeConfig({
    schemaVersion: 1,
    graphMapping: { node: { attributes: {} }, edge: { attributes: {} } }
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: {
        idField: "$.id",
        typeField: "$.type",
        attributes: Object.fromEntries([[reservedRole, "$.tag"]])
      },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        direction: "undirected",
        identity: "multigraph",
        attributes: Object.fromEntries([[reservedRole, "$.type"]])
      }
    }
  });

  const graph = normalizeGraphData({
    nodes: [
      { id: "person-origin", type: "person", tag: "origin" },
      { id: "person-other", type: "person", tag: "other" },
      { id: "place-1", type: "place", tag: "place" }
    ],
    edges: [
      { id: "origin-loc", source: "person-origin", target: "place-1", type: "located" },
      { id: "other-loc", source: "person-other", target: "place-1", type: "located" }
    ]
  }, graphConfig);

  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  const person = graph.nodes.find((node) => node.sourceId === "person-origin");
  const edge = graph.links.find((link) => link.sourceId === "origin-loc");
  assert.equal(Object.hasOwn(person.analysis.attributes, reservedRole), true);
  assert.equal(person.analysis.attributes[reservedRole], "origin");
  assert.equal(Object.hasOwn(edge.analysis.attributes, reservedRole), true);
  assert.equal(edge.analysis.attributes[reservedRole], "located");

  const facts = buildAspFactsFromGraph(graph);
  assert.ok(facts.facts.includes('node_attribute(1,"__proto__","origin").'));
  assert.ok(facts.facts.includes('edge_attribute(1,"__proto__","located").'));

  const template = {
    id: "reserved-role",
    roles: Object.fromEntries([
      [reservedRole, {
        nodeTypes: ["person"],
        attributes: Object.fromEntries([[reservedRole, "origin"]])
      }],
      ["place", { nodeTypes: ["place"] }]
    ]),
    edges: [{ sourceRole: reservedRole, targetRole: "place", edgeType: "located" }]
  };
  const runner = await createClingoWasmRunner();
  const compiled = buildTypedMotifProgram(template, graph.direction);
  const result = await runner.run(`${facts.facts}\n${compiled.program}`);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.equal(matches.length, 1, "the reserved alias still filters candidates in ASP");
  assert.equal(Object.hasOwn(matches[0].roles, reservedRole), true);
  assert.equal(matches[0].roles[reservedRole].sourceId, "person-origin");

  const missingTemplate = {
    ...template,
    id: "reserved-role-near-match",
    edges: [{ sourceRole: reservedRole, targetRole: "place", edgeType: "missing" }]
  };
  const nearMatchProgram = buildTypedMotifNearMatchProgram(missingTemplate, graph.direction);
  const nearMatchResult = await runner.run(`${facts.facts}\n${nearMatchProgram.program}`);
  assert.equal(nearMatchResult.Result, "OPTIMUM FOUND", nearMatchResult.Error ?? JSON.stringify(nearMatchResult));
  const nearMatches = parseTypedMotifNearMatches(
    nearMatchResult.Call?.[0]?.Witnesses,
    nearMatchProgram,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.equal(nearMatches.length, 1);
  assert.equal(Object.hasOwn(nearMatches[0].roles, reservedRole), true);
  assert.equal(nearMatches[0].roles[reservedRole].sourceId, "person-origin");
});

test("finite-world motif comparison and CSV preserve reserved role names", () => {
  const roles = [reservedRole, "place"];
  const match = {
    templateId: "reserved-role",
    label: "Reserved role",
    nodeIds: ["person-origin", "place-1"],
    roles: Object.fromEntries([
      [reservedRole, { sourceId: "person-origin" }],
      ["place", { sourceId: "place-1" }]
    ]),
    supportingEdges: []
  };
  const comparison = summarizeProvenanceScenarioMotifs("reserved-role", "Reserved role", roles, [
    {
      scenarioId: "world-present",
      scenarioLabel: "Present",
      nodesCount: 2,
      linksCount: 1,
      timeMs: 1,
      enumerationComplete: true,
      matches: [match]
    },
    {
      scenarioId: "world-absent",
      scenarioLabel: "Absent",
      nodesCount: 2,
      linksCount: 0,
      timeMs: 1,
      enumerationComplete: true,
      matches: []
    }
  ], {
    selectedGroup: "",
    graphDirection: "undirected",
    timelineWindow: "",
    minimumEdgeConfidence: null,
    viewFilters: { types: [], groups: [] }
  });

  assert.equal(comparison.memberships.length, 1);
  const membership = comparison.memberships[0];
  assert.equal(Object.hasOwn(membership.roleAssignments, reservedRole), true);
  assert.equal(membership.roleAssignments[reservedRole], "person-origin");
  assert.equal(membership.status, "brave-only");
  const csv = buildProvenanceScenarioMotifCsv(comparison);
  assert.ok(csv.includes('""__proto__"":""person-origin""'));
});
