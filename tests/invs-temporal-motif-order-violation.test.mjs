import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildTypedMotifTemporalNearMatchProgram,
  parseTypedMotifNearMatches
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("InVS: il why-not ASP certifica l'inversione temporale quando tutti gli archi esistono", async () => {
  const source = await readFile(new URL("./fixtures/sociopatterns-invs13-tij.dat", import.meta.url), "utf8");
  const edges = source.trim().split(/\r?\n/).map((line, index) => {
    const values = line.trim().split(/\s+/).map(Number);
    assert.equal(values.length, 3, `record InVS ${index + 1}`);
    assert.ok(values.every(Number.isSafeInteger), `valori interi sicuri nel record InVS ${index + 1}`);
    const [time, sourceId, targetId] = values;
    return {
      id: `invs13-row-${index + 1}`,
      source: String(sourceId),
      target: String(targetId),
      kind: "face-to-face-contact",
      validFrom: time - 20,
      validTo: time
    };
  });
  assert.equal(edges.length, 9_827, "versione del fixture InVS attesa");

  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: {
        idField: "$.id",
        typeField: "$.kind",
        attributes: { participant: "$.id" }
      },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.kind",
        direction: "undirected",
        identity: "multigraph",
        validity: { fromField: "$.validFrom", toField: "$.validTo", numericUnit: "seconds" }
      }
    }
  };
  const nodeIds = [...new Set(edges.flatMap((edge) => [edge.source, edge.target]))];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id, kind: "person" })),
    edges
  }, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.capabilities.edgeIntervals.available, true);
  assert.equal(graph.capabilities.nodeAttributes.available, true);
  assert.equal(graph.nodes.length, 92);
  assert.equal(graph.links.length, edges.length);

  const participants = { first: "15", second: "29", third: "95", fourth: "80" };
  const pairRecords = new Map();
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join(":");
    const records = pairRecords.get(key) ?? [];
    records.push(edge);
    pairRecords.set(key, records);
  }
  const edgePair = (sourceId, targetId) => [sourceId, targetId].sort().join(":");
  const firstRecords = pairRecords.get(edgePair(participants.first, participants.second)) ?? [];
  const secondRecords = pairRecords.get(edgePair(participants.second, participants.third)) ?? [];
  const thirdRecords = pairRecords.get(edgePair(participants.third, participants.fourth)) ?? [];
  assert.ok(firstRecords.length > 0 && secondRecords.length > 0 && thirdRecords.length > 0,
    "tutte e tre le coppie richieste sono presenti nel dataset");

  // Independent oracle: enumerate every record triple and count strict-order violations.
  const combinations = [];
  for (const first of firstRecords) {
    for (const second of secondRecords) {
      for (const third of thirdRecords) {
        const orderViolations = [];
        if (first.validFrom >= second.validFrom) orderViolations.push([1, 2]);
        if (second.validFrom >= third.validFrom) orderViolations.push([2, 3]);
        combinations.push({
          edgeIds: [first.id, second.id, third.id],
          orderViolations
        });
      }
    }
  }
  const minimumViolations = Math.min(...combinations.map(({ orderViolations }) => orderViolations.length));
  assert.equal(minimumViolations, 1, "la query ha un'unica inversione temporale minima");
  const expected = new Map(combinations
    .filter(({ orderViolations }) => orderViolations.length === minimumViolations)
    .map((combination) => [JSON.stringify(combination.edgeIds), combination]));
  assert.equal(expected.size, 59, "oracolo indipendente dei testimoni temporalmente ottimi");

  const motif = {
    id: "invs-observed-but-out-of-order-chain",
    label: "Catena osservata senza ordine temporale stretto",
    temporal: { semantics: "orderedByStart", strict: true },
    roles: Object.fromEntries(Object.entries(participants).map(([role, participant]) => [
      role,
      { nodeTypes: ["person"], attributes: { participant } }
    ])),
    edges: [
      { sourceRole: "first", targetRole: "second", edgeType: "face-to-face-contact" },
      { sourceRole: "second", targetRole: "third", edgeType: "face-to-face-contact" },
      { sourceRole: "third", targetRole: "fourth", edgeType: "face-to-face-contact" }
    ]
  };
  const facts = buildAspFactsFromGraph(graph, undefined, { compact: true });
  const compiled = buildTypedMotifTemporalNearMatchProgram(
    motif,
    graph.direction,
    "",
    facts.temporalEncoding
  );
  const program = `${facts.facts}\n${compiled.program}\n`;
  assert.ok(Buffer.byteLength(program, "utf8") < 1_000_000);

  const runner = await createClingoWasmRunner();
  const result = await runner.run(program, ["--opt-mode=optN", "--stats=2"]);
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? "ASP deve provare il costo minimo");
  assert.equal(result.Models?.More, "no", "ASP deve enumerare tutti i pareggi ottimi");
  const witnesses = result.Call?.[0]?.Witnesses ?? [];
  assert.ok(witnesses.length >= expected.size, "l'output grezzo deve includere tutti i testimoni ottimi");

  const matches = parseTypedMotifNearMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    facts.temporalEncoding.decode
  );
  assert.equal(matches.length, expected.size, "il parser deduplica i witness ASP e conserva ogni supporto distinto");
  const actual = new Map();
  for (const match of matches) {
    assert.deepEqual(Object.fromEntries(Object.entries(match.roles).map(([role, value]) => [role, value.sourceId])),
      participants);
    assert.deepEqual(match.missingRoles, []);
    assert.deepEqual(match.missingPatterns, []);
    assert.deepEqual(match.unresolvedPatterns, []);
    const supportIds = match.temporalEvidence.supportingEdges.map(({ edgeIds }) => {
      assert.equal(edgeIds.length, 1, "ogni pattern ha un solo record di supporto");
      return edgeIds[0];
    });
    const key = JSON.stringify(supportIds);
    const expectedCombination = expected.get(key);
    assert.ok(expectedCombination, `supporti ASP non ottimi o non previsti: ${key}`);
    assert.deepEqual(match.temporalEvidence.orderViolations, expectedCombination.orderViolations.map(
      ([firstIndex, secondIndex]) => ({ firstIndex, secondIndex })
    ));
    actual.set(key, match);
  }
  assert.deepEqual(new Set(actual.keys()), new Set(expected.keys()),
    "il why-not ASP deve restituire tutti e soli i testimoni con inversione minima");
});
