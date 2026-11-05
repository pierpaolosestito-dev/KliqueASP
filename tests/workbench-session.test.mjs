import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkbenchSession } from "../src/lib/kliqueasp/graph/workbenchSession.ts";

const validSnapshot = {
  version: 1,
  draftConfigText: JSON.stringify({ schemaVersion: 2 }),
  draftDatasetText: JSON.stringify({ nodes: [{ id: "a" }], edges: [] }),
  projectDirty: true,
  nodeLabelsVisible: false,
  savedAt: "2026-10-27T09:00:00.000Z"
};

test("ripristina un draft valido e usa il draft quando manca il grafo applicato", () => {
  const parsed = parseWorkbenchSession(validSnapshot);
  assert.equal(parsed.version, 3);
  assert.equal(parsed.draftConfigText, validSnapshot.draftConfigText);
  assert.equal(parsed.draftDatasetText, validSnapshot.draftDatasetText);
  assert.equal(parsed.appliedConfigText, undefined);
  assert.equal(parsed.appliedDatasetText, undefined);
  assert.equal(parsed.projectDirty, true);
  assert.equal(parsed.nodeLabelsVisible, false);
  assert.deepEqual(parsed.history, []);
});

test("mantiene draft e ultimo grafo applicato distinti", () => {
  const appliedConfigText = JSON.stringify({ schemaVersion: 1 });
  const appliedDatasetText = JSON.stringify({ nodes: [{ id: "old" }], edges: [] });
  const parsed = parseWorkbenchSession({
    ...validSnapshot,
    appliedConfigText,
    appliedDatasetText
  });
  assert.equal(parsed.appliedConfigText, appliedConfigText);
  assert.equal(parsed.appliedDatasetText, appliedDatasetText);
});

test("ripristina il nome del progetto e normalizza metadati vuoti o troppo lunghi", () => {
  const named = parseWorkbenchSession({ ...validSnapshot, projectName: "  Rete\n psicologi  " });
  assert.equal(named.projectName, "Rete psicologi");

  const empty = parseWorkbenchSession({ ...validSnapshot, projectName: " \u0000 " });
  assert.equal(empty.projectName, "Progetto senza nome");

  const long = parseWorkbenchSession({ ...validSnapshot, projectName: "x".repeat(200) });
  assert.equal(long.projectName?.length, 100);
  assert.equal(parseWorkbenchSession(validSnapshot).projectName, undefined);
});

test("conserva un draft JSON ancora incompleto mantenendo il grafo applicato valido", () => {
  const partial = parseWorkbenchSession({
    ...validSnapshot,
    draftDatasetText: '{"nodes": [',
    appliedDatasetText: validSnapshot.draftDatasetText
  });
  assert.equal(partial.draftDatasetText, '{"nodes": [');
  assert.equal(partial.appliedDatasetText, validSnapshot.draftDatasetText);
});

test("rifiuta versioni, JSON e dataset non validi", () => {
  assert.throws(() => parseWorkbenchSession({ ...validSnapshot, version: 4 }), /versione supportata/);
  assert.throws(() => parseWorkbenchSession({ ...validSnapshot, draftConfigText: null }), /JSON del draft/);
  assert.throws(() => parseWorkbenchSession({ ...validSnapshot, draftDatasetText: JSON.stringify({ nodes: [] }) }), /array 'nodes'/);
  assert.throws(() => parseWorkbenchSession({ ...validSnapshot, appliedDatasetText: "null" }), /Grafo applicato salvato/);
});

test("migra una sessione precedente e conserva solo un'analisi JSON compatibile", async () => {
  const { createWorkbenchGraphKey } = await import("../src/lib/kliqueasp/graph/workbenchSession.ts");
  const graphKey = createWorkbenchGraphKey(validSnapshot.draftConfigText, validSnapshot.draftDatasetText);
  const parsed = parseWorkbenchSession({
    ...validSnapshot,
    version: 2,
    analysis: {
      version: 1,
      graphKey,
      state: { panel: "clique", results: [["a"]], histogram: [[3, 1]] }
    }
  });
  assert.equal(parsed.analysis?.graphKey, graphKey);
  assert.deepEqual(parsed.analysis?.state, { panel: "clique", results: [["a"]], histogram: [[3, 1]] });
  assert.equal(parseWorkbenchSession(validSnapshot).analysis, undefined);
  assert.equal(parseWorkbenchSession({
    ...validSnapshot,
    version: 2,
    analysis: { version: 1, graphKey, state: { unsupported: Number.POSITIVE_INFINITY } }
  }).analysis, undefined);
  assert.notEqual(graphKey, createWorkbenchGraphKey(validSnapshot.draftConfigText, `${validSnapshot.draftDatasetText} `));
});

test("ripristina le analisi archiviate solo per il grafo esatto e applica i limiti", async () => {
  const {
    createWorkbenchGraphKey,
    MAX_WORKBENCH_ANALYSIS_ARCHIVE_ENTRIES
  } = await import("../src/lib/kliqueasp/graph/workbenchSession.ts");
  const graphKey = createWorkbenchGraphKey(validSnapshot.draftConfigText, validSnapshot.draftDatasetText);
  const entries = Array.from({ length: MAX_WORKBENCH_ANALYSIS_ARCHIVE_ENTRIES + 2 }, (_, index) => ({
    id: `analysis-${index}`,
    label: `Analisi ${index}`,
    savedAt: `2026-10-27T09:${String(index % 60).padStart(2, "0")}:00.000Z`,
    state: { panel: "clique", maximumCliques: [["a"]] }
  }));
  const parsed = parseWorkbenchSession({
    ...validSnapshot,
    version: 3,
    analysisArchive: { version: 1, graphKey, entries }
  });

  assert.equal(parsed.analysisArchive?.graphKey, graphKey);
  assert.equal(parsed.analysisArchive?.entries.length, MAX_WORKBENCH_ANALYSIS_ARCHIVE_ENTRIES);
  assert.deepEqual(parsed.analysisArchive?.entries.map((entry) => entry.id), entries.slice(0, MAX_WORKBENCH_ANALYSIS_ARCHIVE_ENTRIES).map((entry) => entry.id));
  assert.equal(parseWorkbenchSession({
    ...validSnapshot,
    version: 3,
    analysisArchive: { version: 1, graphKey: "different-graph", entries }
  }).analysisArchive, undefined);
});

test("normalizza i flag mancanti e richiede una data di salvataggio", () => {
  const parsed = parseWorkbenchSession({ ...validSnapshot, projectDirty: "yes", nodeLabelsVisible: 0 });
  assert.equal(parsed.projectDirty, false);
  assert.equal(parsed.nodeLabelsVisible, true);
  assert.throws(() => parseWorkbenchSession({ ...validSnapshot, savedAt: "ieri" }), /data valida/);
});

test("ripristina una cronologia di navigazione valida e scarta voci malformate", () => {
  const parsed = parseWorkbenchSession({
    ...validSnapshot,
    history: [
      { id: "a", label: "Nodo A" },
      { id: "", label: "ID mancante" },
      { id: "b", label: "Nodo B" },
      { id: "c", label: 3 }
    ]
  });

  assert.deepEqual(parsed.history, [
    { id: "a", label: "Nodo A" },
    { id: "b", label: "Nodo B" }
  ]);
});

test("limita la cronologia salvata alle voci più recenti", async () => {
  const { MAX_WORKBENCH_HISTORY_ENTRIES } = await import("../src/lib/kliqueasp/graph/workbenchSession.ts");
  const history = Array.from({ length: MAX_WORKBENCH_HISTORY_ENTRIES + 3 }, (_, index) => ({
    id: String(index),
    label: `Nodo ${index}`
  }));
  const parsed = parseWorkbenchSession({ ...validSnapshot, history });

  assert.equal(parsed.history.length, MAX_WORKBENCH_HISTORY_ENTRIES);
  assert.equal(parsed.history[0].id, "3");
  assert.equal(parsed.history.at(-1).id, String(MAX_WORKBENCH_HISTORY_ENTRIES + 2));
});

test("scarta dalla cronologia salvata i nodi che non esistono più nel grafo ripristinato", async () => {
  const { filterWorkbenchHistoryForNodeIds } = await import("../src/lib/kliqueasp/graph/workbenchSession.ts");
  const history = [
    { id: "a", label: "Nodo A" },
    { id: "removed", label: "Nodo non più presente" },
    { id: "b", label: "Nodo B" }
  ];

  assert.deepEqual(filterWorkbenchHistoryForNodeIds(history, new Set(["a", "b"])), [
    { id: "a", label: "Nodo A" },
    { id: "b", label: "Nodo B" }
  ]);
});
