import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import gahukuGamaConfig from "../src/lib/kliqueasp/data/examples/gahuku-gama-signed.config.json" with { type: "json" };
import gahukuGamaDataset from "../src/lib/kliqueasp/data/examples/gahuku-gama-signed.json" with { type: "json" };
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildSignedTriadProgram,
  parseSignedTriadResults,
  prepareSignedTriads,
  summarizeSignedTriads
} from "../src/lib/kliqueasp/graph/signedTriadTask.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";
import { hasCompleteModelEnumeration } from "../src/lib/kliqueasp/graph/structuralTasks.ts";

const signedConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.label", groupFields: ["$.groups"] },
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      direction: "undirected",
      identity: "multigraph",
      attributes: { polarity: "$.sign" }
    }
  },
  graphAnalysis: {
    signedTriads: { attribute: "polarity", positiveValues: ["+"], negativeValues: ["-"] }
  }
};

function graphFromSigns(nodes, dyads, mask, overrides = {}) {
  return normalizeGraphData({
    nodes: nodes.map((id) => ({ id, label: id, groups: [id.startsWith("x") ? "x" : "y"] })),
    edges: dyads.map(([from, to], index) => ({
      id: `e-${from}-${to}`,
      from,
      to,
      sign: (mask & (1 << index)) === 0 ? "+" : "-"
    }))
  }, { ...signedConfig, ...overrides });
}

test("la classificazione ASP delle triadi firmate coincide con la parità indipendente su tutti i segni di K4", async () => {
  const nodes = ["a", "b", "c", "d"];
  const dyads = [["a", "b"], ["a", "c"], ["a", "d"], ["b", "c"], ["b", "d"], ["c", "d"]];
  const runner = await createClingoWasmRunner();

  for (let mask = 0; mask < 2 ** dyads.length; mask += 1) {
    const graph = graphFromSigns(nodes, dyads, mask);
    assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
    const facts = buildAspFactsFromGraph(graph);
    const preparation = prepareSignedTriads(
      signedConfig.graphAnalysis.signedTriads,
      graph.schemaVersion,
      graph.direction,
      graph.nodes,
      graph.links,
      new Set(["polarity"])
    );
    assert.equal(preparation.available, true, JSON.stringify(preparation.reasons));
    const result = await runner.run(`${facts.facts}\n${buildSignedTriadProgram(preparation)}`);
    assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
    assert.equal(hasCompleteModelEnumeration(result), true, "tutte le triadi della proiezione devono essere classificate");
    const actual = parseSignedTriadResults(result.Call?.[0]?.Witnesses, facts.reverseIndex, preparation.dyads);
    const expected = [
      ["a", "b", "c"], ["a", "b", "d"], ["a", "c", "d"], ["b", "c", "d"]
    ].map((triple) => {
      const pairSigns = [[triple[0], triple[1]], [triple[0], triple[2]], [triple[1], triple[2]]].map(([left, right]) => {
        const index = dyads.findIndex(([from, to]) => from === left && to === right);
        return (mask & (1 << index)) === 0 ? "+" : "-";
      });
      const negativeDyadCount = pairSigns.filter((sign) => sign === "-").length;
      return { nodeIds: triple, balanced: negativeDyadCount % 2 === 0, negativeDyadCount };
    });
    assert.deepEqual(actual.map(({ nodeIds, balanced, negativeDyadCount }) => ({ nodeIds, balanced, negativeDyadCount })), expected);
  }
});

test("i paralleli concordi formano una sola dyade e conservano tutti gli ID sorgente", async () => {
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c"].map((id) => ({ id, label: id })),
    edges: [
      { id: "ab-1", from: "a", to: "b", sign: "+" },
      { id: "ab-2", from: "b", to: "a", sign: "+" },
      { id: "ac", from: "a", to: "c", sign: "-" },
      { id: "bc", from: "b", to: "c", sign: "-" }
    ]
  }, signedConfig);
  const facts = buildAspFactsFromGraph(graph);
  const preparation = prepareSignedTriads(
    signedConfig.graphAnalysis.signedTriads,
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(["polarity"])
  );
  assert.equal(preparation.available, true, JSON.stringify(preparation.reasons));
  assert.equal(preparation.dyads.length, 3);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${buildSignedTriadProgram(preparation)}`);
  const [triad] = parseSignedTriadResults(result.Call?.[0]?.Witnesses, facts.reverseIndex, preparation.dyads);
  assert.equal(triad.balanced, true);
  const ab = triad.dyads.find((dyad) => dyad.sourceNodeId === "a" && dyad.targetNodeId === "b");
  assert.deepEqual(ab.edgeRecords.map((record) => record.id), ["ab-1", "ab-2"]);
});

test("i valori di polarità numerici e stringa restano distinti", async () => {
  const config = {
    ...signedConfig,
    graphAnalysis: {
      signedTriads: { attribute: "polarity", positiveValues: [1], negativeValues: ["1"] }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c"].map((id) => ({ id, label: id })),
    edges: [
      { id: "ab", from: "a", to: "b", sign: 1 },
      { id: "ac", from: "a", to: "c", sign: "1" },
      { id: "bc", from: "b", to: "c", sign: 1 }
    ]
  }, config);
  const facts = buildAspFactsFromGraph(graph);
  const preparation = prepareSignedTriads(
    config.graphAnalysis.signedTriads,
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(["polarity"])
  );
  assert.equal(preparation.available, true, JSON.stringify(preparation.reasons));
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${buildSignedTriadProgram(preparation)}`);
  const [triad] = parseSignedTriadResults(result.Call?.[0]?.Witnesses, facts.reverseIndex, preparation.dyads);
  assert.equal(triad.balanced, false);
  assert.equal(triad.negativeDyadCount, 1);
});

test("blocca polarità mancanti, non dichiarate o discordanti sulla stessa coppia", () => {
  const nodes = ["a", "b", "c"].map((id) => ({ id, label: id }));
  const baseEdges = [
    { id: "ab", from: "a", to: "b", sign: "+" },
    { id: "ac", from: "a", to: "c", sign: "-" },
    { id: "bc", from: "b", to: "c", sign: "+" }
  ];
  for (const invalidValue of [undefined, "0", { value: "+" }]) {
    const edges = baseEdges.map((edge, index) => index === 1 ? { ...edge, sign: invalidValue } : edge);
    const graph = normalizeGraphData({ nodes, edges }, signedConfig);
    const preparation = prepareSignedTriads(
      signedConfig.graphAnalysis.signedTriads,
      graph.schemaVersion,
      graph.direction,
      graph.nodes,
      graph.links,
      new Set(["polarity"])
    );
    assert.equal(preparation.available, false);
    assert.match(preparation.reasons.join(" "), /polarità/);
  }

  const graph = normalizeGraphData({
    nodes,
    edges: [...baseEdges, { id: "ab-conflict", from: "b", to: "a", sign: "-" }]
  }, signedConfig);
  const preparation = prepareSignedTriads(
    signedConfig.graphAnalysis.signedTriads,
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(["polarity"])
  );
  assert.equal(preparation.available, false);
  assert.match(preparation.reasons.join(" "), /paralleli con polarità discordanti/);
  assert.match(preparation.reasons.join(" "), /ab-conflict/);
});

test("il mapping di triadi firmate richiede schema v2, alias dichiarato e direzione non orientata esplicita", () => {
  const graph = { nodes: [{ id: "a" }], edges: [] };
  const missingDirection = normalizeGraphData(graph, {
    ...signedConfig,
    graphMapping: { ...signedConfig.graphMapping, edge: { ...signedConfig.graphMapping.edge, direction: undefined } }
  });
  assert.equal(missingDirection.valid, false);
  assert.match(missingDirection.diagnostics.map((item) => item.message).join(" "), /direction.*undirected/i);

  const unmappedAlias = normalizeGraphData(graph, {
    ...signedConfig,
    graphMapping: { ...signedConfig.graphMapping, edge: { ...signedConfig.graphMapping.edge, attributes: {} } }
  });
  assert.equal(unmappedAlias.valid, false);
  assert.match(unmappedAlias.diagnostics.map((item) => item.message).join(" "), /deve essere mappato/);

  const wrongVersion = normalizeGraphData(graph, { ...signedConfig, schemaVersion: 1, graphMapping: {} });
  assert.equal(wrongVersion.valid, false);
  assert.match(wrongVersion.diagnostics.map((item) => item.message).join(" "), /schemaVersion: 2/);
});

test("la preparazione può limitare la query a un gruppo senza reinterpretare i legami", () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", label: "a", groups: ["x"] },
      { id: "b", label: "b", groups: ["x"] },
      { id: "c", label: "c", groups: ["x"] },
      { id: "d", label: "d", groups: ["y"] }
    ],
    edges: [
      { id: "ab", from: "a", to: "b", sign: "+" },
      { id: "ac", from: "a", to: "c", sign: "-" },
      { id: "bc", from: "b", to: "c", sign: "+" },
      { id: "ad", from: "a", to: "d", sign: "unmapped-outside-group" }
    ]
  }, signedConfig);
  const preparation = prepareSignedTriads(
    signedConfig.graphAnalysis.signedTriads,
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(["polarity"]),
    (node) => Array.isArray(node.analysis?.groups) ? node.analysis.groups : [],
    "x"
  );
  assert.equal(preparation.available, true, JSON.stringify(preparation.reasons));
  assert.deepEqual(preparation.candidateNodeIndices, [1, 2, 3]);
  assert.equal(preparation.dyads.length, 3);
});

test("il filtro opzionale per edge type restringe la rete firmata e mantiene il default su tutti i tipi", async () => {
  const typedConfig = {
    ...signedConfig,
    graphMapping: {
      ...signedConfig.graphMapping,
      edge: { ...signedConfig.graphMapping.edge, typeField: "$.kind" }
    },
    graphAnalysis: {
      signedTriads: { ...signedConfig.graphAnalysis.signedTriads, edgeTypes: ["friendship"] }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id, label: id })),
    edges: [
      { id: "ab-friendship", from: "a", to: "b", kind: "friendship", sign: "+" },
      { id: "ac-friendship", from: "a", to: "c", kind: "friendship", sign: "+" },
      { id: "bc-friendship", from: "b", to: "c", kind: "friendship", sign: "-" },
      { id: "ab-contact", from: "a", to: "b", kind: "contact" },
      { id: "cd-contact", from: "c", to: "d", kind: "contact", sign: "not-a-polarity" }
    ]
  }, typedConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));

  const invalidTypeScopes = [
    [{
      ...typedConfig,
      graphMapping: { ...typedConfig.graphMapping, edge: { ...typedConfig.graphMapping.edge, typeField: undefined } }
    }, /richiede graphMapping\.edge\.typeField/],
    [{
      ...typedConfig,
      graphAnalysis: { signedTriads: { ...typedConfig.graphAnalysis.signedTriads, edgeTypes: [] } }
    }, /edgeTypes deve contenere stringhe non vuote/],
    [{
      ...typedConfig,
      graphAnalysis: { signedTriads: { ...typedConfig.graphAnalysis.signedTriads, edgeTypes: ["friendship", "friendship"] } }
    }, /edgeTypes non deve contenere duplicati/]
  ];
  for (const [invalidConfig, expectedMessage] of invalidTypeScopes) {
    const invalidGraph = normalizeGraphData({ nodes: [{ id: "a" }], edges: [] }, invalidConfig);
    assert.equal(invalidGraph.valid, false, JSON.stringify(invalidGraph.diagnostics));
    assert.match(invalidGraph.diagnostics.map((diagnostic) => diagnostic.message).join(" "), expectedMessage);
  }

  const filteredPreparation = prepareSignedTriads(
    typedConfig.graphAnalysis.signedTriads,
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(["polarity"]),
    undefined,
    "",
    true
  );
  assert.equal(filteredPreparation.available, true, JSON.stringify(filteredPreparation.reasons));
  assert.equal(filteredPreparation.dyads.length, 3);
  assert.ok(filteredPreparation.dyads.every((dyad) =>
    dyad.edgeRecords.every((record) => record.id.endsWith("friendship"))));

  const unfilteredPreparation = prepareSignedTriads(
    { ...typedConfig.graphAnalysis.signedTriads, edgeTypes: undefined },
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(["polarity"]),
    undefined,
    "",
    true
  );
  assert.equal(unfilteredPreparation.available, false);
  assert.match(unfilteredPreparation.reasons.join(" "), /polarità positiva o negativa riconosciuta/);

  const noMappedType = prepareSignedTriads(
    typedConfig.graphAnalysis.signedTriads,
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(["polarity"])
  );
  assert.equal(noMappedType.available, false);
  assert.match(noMappedType.reasons.join(" "), /richiede graphMapping\.edge\.typeField/);

  const facts = buildAspFactsFromGraph(graph);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${buildSignedTriadProgram(filteredPreparation)}`
  );
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteModelEnumeration(result), true);
  const triads = parseSignedTriadResults(result.Call?.[0]?.Witnesses, facts.reverseIndex, filteredPreparation.dyads);
  assert.equal(triads.length, 1);
  assert.deepEqual(triads[0].nodeIds, ["a", "b", "c"]);
  assert.equal(triads[0].balanced, false);
});

test("configurazioni firmate non valide vengono disabilitate senza eccezioni nel readiness", () => {
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c"].map((id) => ({ id, label: id })),
    edges: [{ id: "e", from: "a", to: "b", sign: "+" }]
  }, signedConfig);
  for (const invalid of [
    undefined,
    {},
    { attribute: "polarity", positiveValues: "+", negativeValues: ["-"] },
    { attribute: "polarity", positiveValues: [{ sign: "+" }], negativeValues: ["-"] }
  ]) {
    const preparation = prepareSignedTriads(
      invalid,
      graph.schemaVersion,
      graph.direction,
      graph.nodes,
      graph.links,
      new Set(["polarity"])
    );
    assert.equal(preparation.available, false);
    assert.ok(preparation.reasons.length > 0);
  }
});

test("il parser respinge una classificazione che non coincide con il witness dei segni", () => {
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c"].map((id) => ({ id, label: id })),
    edges: [
      { id: "ab", from: "a", to: "b", sign: "+" },
      { id: "ac", from: "a", to: "c", sign: "+" },
      { id: "bc", from: "b", to: "c", sign: "+" }
    ]
  }, signedConfig);
  const preparation = prepareSignedTriads(
    signedConfig.graphAnalysis.signedTriads,
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(["polarity"])
  );
  assert.throws(() => parseSignedTriadResults(
    [{ Value: ["signed_triad(1,2,3,1,2,3,unbalanced)"] }],
    { 1: "a", 2: "b", 3: "c" },
    preparation.dyads
  ), /Classificazione ASP non coerente/);
});

test("il riepilogo usa i triangoli completi come denominatore e lascia indefinita la quota sul vuoto", () => {
  assert.deepEqual(summarizeSignedTriads([]), {
    completeTriadCount: 0,
    balancedTriadCount: 0,
    unbalancedTriadCount: 0,
    balancedShare: null
  });
  assert.deepEqual(summarizeSignedTriads([
    { balanced: true },
    { balanced: false },
    { balanced: true },
    { balanced: true }
  ]), {
    completeTriadCount: 4,
    balancedTriadCount: 3,
    unbalancedTriadCount: 1,
    balancedShare: 0.75
  });
});

test("la rete Gahuku-Gama indipendente produce le triadi ASP attese senza trasformare i segni", async () => {
  const sourceText = await readFile(new URL("./fixtures/highland-tribes/ucidata-gama.edges", import.meta.url), "utf8");
  const lines = sourceText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const metadata = lines.find((line) => /^%\s+\d+\s+\d+\s+\d+$/.test(line));
  assert.ok(metadata, "l'edge list conserva il conteggio dichiarato della fonte");
  const [, expectedEdgeCountText, nodeCountText] = metadata.match(/^%\s+(\d+)\s+(\d+)\s+(\d+)$/);
  const expectedEdgeCount = Number(expectedEdgeCountText);
  const nodeCount = Number(nodeCountText);
  const sourceEdges = lines.filter((line) => !line.startsWith("%")).map((line, index) => {
    const fields = line.split(",").map(Number);
    assert.equal(fields.length, 3, `riga sorgente ${index + 1}`);
    const [source, target, sign] = fields;
    assert.ok(Number.isInteger(source) && source >= 1 && source <= nodeCount);
    assert.ok(Number.isInteger(target) && target >= 1 && target <= nodeCount);
    assert.notEqual(source, target, "il fixture non contiene cappi");
    assert.ok(sign === 1 || sign === -1, "la polarità sorgente deve essere +1 o -1");
    return { source, target, sign };
  });
  assert.equal(sourceEdges.length, expectedEdgeCount);
  assert.equal(sourceEdges.filter((edge) => edge.sign === 1).length, 29);
  assert.equal(sourceEdges.filter((edge) => edge.sign === -1).length, 29);

  const expectedPresetDataset = {
    nodes: Array.from({ length: nodeCount }, (_, index) => ({
      id: String(index + 1),
      label: `Sub-tribe ${index + 1}`,
      type: "subtribe"
    })),
    edges: sourceEdges.map((edge, index) => ({
      id: `gama-${index + 1}`,
      source: String(edge.source),
      target: String(edge.target),
      type: edge.sign === 1 ? "rova" : "hina",
      sign: edge.sign
    }))
  };
  assert.deepEqual(gahukuGamaDataset, expectedPresetDataset, "il preset conserva ciascun record e segno della fonte");
  assert.equal(gahukuGamaConfig.graphAnalysis.signedTriads.edgeTypes.length, 2);
  const graph = normalizeGraphData(gahukuGamaDataset, gahukuGamaConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.direction, "undirected");
  assert.equal(graph.links.length, 58);
  assert.equal(graph.links.filter((edge) => edge.type === "rova").length, 29);
  assert.equal(graph.links.filter((edge) => edge.type === "hina").length, 29);

  const preparation = prepareSignedTriads(
    gahukuGamaConfig.graphAnalysis.signedTriads,
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(["polarity"]),
    undefined,
    "",
    true
  );
  assert.equal(preparation.available, true, JSON.stringify(preparation.reasons));
  assert.equal(preparation.dyads.length, 58);

  const signsByPair = new Map(sourceEdges.map(({ source, target, sign }) => {
    const lower = Math.min(source, target);
    const upper = Math.max(source, target);
    return [`${lower}:${upper}`, sign];
  }));
  const expected = [];
  for (let first = 1; first <= nodeCount; first += 1) {
    for (let second = first + 1; second <= nodeCount; second += 1) {
      for (let third = second + 1; third <= nodeCount; third += 1) {
        const signs = [
          signsByPair.get(`${first}:${second}`),
          signsByPair.get(`${first}:${third}`),
          signsByPair.get(`${second}:${third}`)
        ];
        if (signs.some((sign) => sign === undefined)) continue;
        const negativeDyadCount = signs.filter((sign) => sign === -1).length;
        expected.push({
          nodeIds: [String(first), String(second), String(third)],
          balanced: negativeDyadCount % 2 === 0,
          negativeDyadCount
        });
      }
    }
  }
  assert.equal(expected.length, 68);
  assert.equal(expected.filter((triad) => triad.balanced).length, 59);
  assert.equal(expected.filter((triad) => !triad.balanced).length, 9);

  const facts = buildAspFactsFromGraph(graph);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${buildSignedTriadProgram(preparation)}`
  );
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.equal(Number(result.Models?.Number), 1);
  assert.equal(result.Models?.More, "no");
  const actual = parseSignedTriadResults(result.Call?.[0]?.Witnesses, facts.reverseIndex, preparation.dyads)
    .map(({ nodeIds, balanced, negativeDyadCount }) => ({ nodeIds, balanced, negativeDyadCount }))
    .sort((left, right) => Number(left.nodeIds[0]) - Number(right.nodeIds[0]) ||
      Number(left.nodeIds[1]) - Number(right.nodeIds[1]) || Number(left.nodeIds[2]) - Number(right.nodeIds[2]));
  assert.deepEqual(actual, expected);
  assert.deepEqual(summarizeSignedTriads(actual), {
    completeTriadCount: 68,
    balancedTriadCount: 59,
    unbalancedTriadCount: 9,
    balancedShare: 59 / 68
  });
});
