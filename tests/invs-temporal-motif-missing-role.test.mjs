import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildTypedMotifTemporalNearMatchProgram,
  parseTypedMotifNearMatches
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("InVS: il why-not distingue un ruolo senza candidati dagli archi mancanti", async () => {
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
  assert.equal(nodeIds.length, 92);
  assert.equal(nodeIds.includes("999"), false, "l'ID fissato al quarto ruolo non appare nel grafo");

  const pairRecords = new Map();
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join(":");
    const records = pairRecords.get(key) ?? [];
    records.push(edge);
    pairRecords.set(key, records);
  }
  const firstPair = pairRecords.get("15:29") ?? [];
  const secondPair = pairRecords.get("29:95") ?? [];
  assert.equal(firstPair.length, 2, "la prima relazione richiesta è osservata due volte");
  assert.equal(secondPair.length, 32, "la seconda relazione richiesta è osservata 32 volte");

  // Independent oracle for the two observable contact records and their strict order.
  const expectedSupports = new Set();
  for (const first of firstPair) {
    for (const second of secondPair) {
      if (first.validFrom < second.validFrom) {
        expectedSupports.add(JSON.stringify([first.id, second.id]));
      }
    }
  }
  assert.equal(expectedSupports.size, 59, "oracolo indipendente dei supporti strettamente ordinati");

  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id, kind: "person" })),
    edges
  }, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.capabilities.edgeIntervals.available, true);
  assert.equal(graph.capabilities.nodeAttributes.available, true);

  const participants = { first: "15", second: "29", third: "95", fourth: "999" };
  const motif = {
    id: "invs-chain-with-unobserved-role-filter",
    label: "Catena con un ID senza candidato nel grafo",
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
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? "ASP deve provare la diagnosi minima");
  assert.equal(result.Models?.More, "no", "optN deve enumerare tutti i supporti ottimi");
  const witnesses = result.Call?.[0]?.Witnesses ?? [];
  assert.ok(witnesses.length >= expectedSupports.size, "l'output grezzo deve contenere ogni supporto ottimo");

  const matches = parseTypedMotifNearMatches(
    witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    facts.temporalEncoding.decode
  );
  assert.equal(matches.length, expectedSupports.size,
    "il parser conserva i supporti distinti e rimuove le duplicazioni ASP");
  const actualSupports = new Set();
  for (const match of matches) {
    assert.deepEqual(Object.fromEntries(Object.entries(match.roles).map(([role, value]) => [role, value.sourceId])), {
      first: "15",
      second: "29",
      third: "95"
    });
    assert.deepEqual(match.missingRoles, ["fourth"], "solo il ruolo filtrato sull'ID assente è senza candidato");
    assert.deepEqual(match.missingPatterns, [], "nessun pattern tra ruoli assegnati è privo di arco");
    assert.deepEqual(match.unresolvedPatterns.map(({ index }) => index), [3],
      "il terzo pattern non è valutabile finché il ruolo fourth resta senza assegnazione");
    assert.deepEqual(match.temporalEvidence.orderViolations, [], "i due supporti scelti sono in ordine stretto");
    assert.deepEqual(match.temporalEvidence.supportingEdges[2].edgeIds, [],
      "il parser non inventa un supporto per il pattern irrisolto");
    const [first, second] = match.temporalEvidence.supportingEdges;
    assert.equal(first.edgeIds.length, 1);
    assert.equal(second.edgeIds.length, 1);
    const support = JSON.stringify([first.edgeIds[0], second.edgeIds[0]]);
    assert.ok(expectedSupports.has(support), `supporti non previsti dall'oracolo: ${support}`);
    actualSupports.add(support);
  }
  assert.deepEqual(actualSupports, expectedSupports,
    "ASP restituisce esattamente tutti i supporti ordinati delle relazioni valutabili");
});
