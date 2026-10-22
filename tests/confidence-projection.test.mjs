import assert from "node:assert/strict";
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  filterLinksByMinimumConfidence,
  parseMinimumConfidenceThreshold
} from "../src/lib/kliqueasp/graph/confidenceProjection.ts";
import { filterLinksByProvenanceScenario } from "../src/lib/kliqueasp/graph/provenance.ts";

test("la soglia di confidenza accetta solo valori finiti nel dominio dichiarato [0,1]", () => {
  assert.equal(parseMinimumConfidenceThreshold(0), 0);
  assert.equal(parseMinimumConfidenceThreshold(1), 1);
  assert.equal(parseMinimumConfidenceThreshold("0.65"), 0.65);
  for (const invalid of [null, undefined, "", "high", Number.NaN, Infinity, -0.01, 1.01, true]) {
    assert.equal(parseMinimumConfidenceThreshold(invalid), null, `input=${String(invalid)}`);
  }
});

test("il mapping dichiara il dominio sorgente dei punteggi non normalizzati", () => {
  const range = { min: 0, max: 100 };
  assert.equal(parseMinimumConfidenceThreshold(0, range), 0);
  assert.equal(parseMinimumConfidenceThreshold(50, range), 50);
  assert.equal(parseMinimumConfidenceThreshold(100, range), 100);
  for (const invalid of [-0.01, 100.01, "", Number.NaN, Infinity]) {
    assert.equal(parseMinimumConfidenceThreshold(invalid, range), null, `input=${String(invalid)}`);
  }
});

test("la soglia minima filtra gli archi prima della serializzazione ASP e conserva il default legacy", () => {
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id })),
    edges: [
      { id: "ab", source: "a", target: "b", confidence: 0.9 },
      { id: "bc", source: "b", target: "c", confidence: "0.5" },
      { id: "cd", source: "c", target: "d", confidence: 0.1 }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph",
        confidenceField: "$.confidence"
      }
    }
  });

  assert.equal(graph.valid, true);
  assert.equal(graph.capabilities.edgeConfidence.available, true);
  assert.deepEqual(
    filterLinksByMinimumConfidence(graph.links, 0.5).map((link) => link.sourceId),
    ["ab", "bc"],
    "la soglia è inclusiva e accetta confidenze numeriche o stringhe numeriche mappate"
  );
  assert.equal(
    filterLinksByMinimumConfidence(graph.links, 0.91).length,
    0
  );
  assert.equal(
    filterLinksByMinimumConfidence(graph.links, 0)[0],
    graph.links[0],
    "la soglia predefinita zero conserva tutti i record, anche quelli non mappati"
  );

  const filteredAsp = buildAspFactsFromGraph({
    ...graph,
    links: filterLinksByMinimumConfidence(graph.links, 0.5)
  }).facts;
  assert.match(filteredAsp, /edge\(1,2\)\./);
  assert.match(filteredAsp, /edge\(2,1\)\./);
  assert.match(filteredAsp, /edge\(2,3\)\./);
  assert.doesNotMatch(filteredAsp, /edge\(3,4\)\./);
  assert.doesNotMatch(filteredAsp, /edge\(4,3\)\./);

  const legacyGraph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ source: "a", target: "b" }]
  });
  assert.deepEqual(
    filterLinksByMinimumConfidence(legacyGraph.links, null),
    legacyGraph.links,
    "assenza del mapping non filtra il grafo legacy"
  );
});

test("una mappatura di confidenza incompleta o fuori dominio non abilita il filtro", () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { id: "e1", source: "a", target: "b", confidence: 0.9 },
      { id: "e2", source: "a", target: "b", confidence: 1.1 },
      { id: "e3", source: "b", target: "a" }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph",
        confidenceField: "$.confidence"
      }
    }
  });

  assert.equal(graph.capabilities.edgeConfidence.available, false);
  assert.deepEqual(
    filterLinksByMinimumConfidence(graph.links, null),
    graph.links,
    "senza un valore valido per ogni arco il filtro non altera la proiezione"
  );
});

test("i punteggi percentuali restano nelle unità sorgente e usano la soglia dichiarata", () => {
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id })),
    edges: [
      { id: "ab", source: "a", target: "b", confidence: 90 },
      { id: "bc", source: "b", target: "c", confidence: "50" },
      { id: "bc-quarter", source: "b", target: "c", confidence: 50.25 },
      { id: "cd", source: "c", target: "d", confidence: 10 }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph",
        confidenceField: "$.confidence",
        confidenceRange: { min: 0, max: 100 }
      }
    }
  });

  assert.equal(graph.valid, true);
  assert.equal(graph.capabilities.edgeConfidence.available, true);
  assert.deepEqual(graph.capabilities.edgeConfidence.range, { min: 0, max: 100 });
  assert.deepEqual(
    filterLinksByMinimumConfidence(graph.links, 50, graph.capabilities.edgeConfidence.range).map((link) => link.sourceId),
    ["ab", "bc", "bc-quarter"],
    "la soglia opera direttamente sulle unità del dato mappato"
  );
  assert.equal(parseMinimumConfidenceThreshold(50.25, graph.capabilities.edgeConfidence.range), 50.25);
  assert.deepEqual(
    filterLinksByMinimumConfidence(graph.links, 50.25, graph.capabilities.edgeConfidence.range).map((link) => link.sourceId),
    ["ab", "bc-quarter"],
    "la soglia numerica può usare la precisione decimale dei punteggi sorgente"
  );
  assert.deepEqual(
    filterLinksByMinimumConfidence(graph.links, 0, graph.capabilities.edgeConfidence.range),
    graph.links,
    "il minimo dichiarato conserva ogni record della proiezione"
  );
  assert.match(buildAspFactsFromGraph(graph).facts, /edge_confidence\(1,90\)\./);
  assert.match(buildAspFactsFromGraph(graph).facts, /edge_confidence\(2,50\)\./);
  assert.match(buildAspFactsFromGraph(graph).facts, /edge_confidence\(3,decimal\(201,4\)\)\./);
});

test("un intervallo con minimo non nullo conserva tutti gli archi al valore iniziale e al reset", () => {
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id })),
    edges: [
      { id: "ab", source: "a", target: "b", confidence: 10 },
      { id: "bc", source: "b", target: "c", confidence: 15 },
      { id: "cd", source: "c", target: "d", confidence: 20 }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph",
        confidenceField: "$.confidence",
        confidenceRange: { min: 10, max: 20 }
      }
    }
  });
  const range = graph.capabilities.edgeConfidence.range;

  assert.equal(graph.capabilities.edgeConfidence.available, true);
  assert.deepEqual(range, { min: 10, max: 20 });
  assert.equal(parseMinimumConfidenceThreshold(range.min, range), range.min);
  assert.deepEqual(
    filterLinksByMinimumConfidence(graph.links, range.min, range).map((link) => link.sourceId),
    ["ab", "bc", "cd"]
  );
  assert.deepEqual(
    filterLinksByMinimumConfidence(graph.links, 15, range).map((link) => link.sourceId),
    ["bc", "cd"],
    "il confronto inclusivo conserva anche il valore uguale alla soglia"
  );
});

test("un dominio di confidenza malformato o senza confidenceField invalida la configurazione", () => {
  const nodes = [{ id: "a" }, { id: "b" }];
  const edges = [{ id: "ab", source: "a", target: "b", confidence: 50 }];
  for (const confidenceRange of [
    { min: 1, max: 1 },
    { min: 2, max: 1 },
    { min: "0", max: 100 },
    { min: 0, max: Infinity },
    { min: 0, max: 100, step: 10 }
  ]) {
    const graph = normalizeGraphData({ nodes, edges }, {
      schemaVersion: 2,
      graphMapping: { edge: { confidenceField: "$.confidence", confidenceRange } }
    });
    assert.equal(graph.valid, false, JSON.stringify(confidenceRange));
    assert.ok(graph.diagnostics.some((diagnostic) =>
      diagnostic.code === "invalid-edge-confidence-range" || diagnostic.code === "unknown-graph-config-property"
    ));
  }

  const missingField = normalizeGraphData({ nodes, edges }, {
    schemaVersion: 2,
    graphMapping: { edge: { confidenceRange: { min: 0, max: 100 } } }
  });
  assert.equal(missingField.valid, false);
  assert.ok(missingField.diagnostics.some((diagnostic) => diagnostic.code === "invalid-edge-confidence-range"));
});

test("la proiezione per fonte precede la soglia di confidenza nei fatti destinati ad ASP", () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph",
        confidenceField: "$.confidence",
        confidenceRange: { min: 0, max: 100 },
        provenanceField: "$.sources"
      }
    },
    graphAnalysis: {
      provenanceScenarios: {
        scenarios: [{ id: "archive-a", label: "Archive A", sources: ["A"] }],
        unattributedEdges: "exclude"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id })),
    edges: [
      { id: "ab", source: "a", target: "b", confidence: 90, sources: ["A"] },
      { id: "bc", source: "b", target: "c", confidence: 75, sources: ["A"] },
      { id: "cd", source: "c", target: "d", confidence: 50, sources: ["A"] },
      { id: "ad", source: "a", target: "d", confidence: 80, sources: ["A", "B"] },
      { id: "bd", source: "b", target: "d", confidence: 95, sources: ["B"] }
    ]
  }, config);

  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  const scenario = {
    sources: config.graphAnalysis.provenanceScenarios.scenarios[0].sources,
    unattributedEdges: config.graphAnalysis.provenanceScenarios.unattributedEdges
  };
  const projectAndBuildFacts = (referenceMatching) => {
    const sourceLinks = filterLinksByProvenanceScenario(graph.links, {
      ...scenario,
      ...(referenceMatching ? { referenceMatching } : {})
    });
    const visibleLinks = filterLinksByMinimumConfidence(
      sourceLinks,
      80,
      graph.capabilities.edgeConfidence.range
    );
    const facts = buildAspFactsFromGraph({ ...graph, links: visibleLinks }).facts;
    return { sourceLinks, visibleLinks, facts };
  };

  const any = projectAndBuildFacts(undefined);
  assert.deepEqual(any.sourceLinks.map((link) => link.sourceId), ["ab", "bc", "cd", "ad"]);
  assert.deepEqual(any.visibleLinks.map((link) => link.sourceId), ["ab", "ad"]);
  assert.equal(any.facts.split("\n").filter((fact) => fact.startsWith("edge_record(")).length, 2);
  assert.ok(any.facts.includes('edge_id(1,"ab").'));
  assert.ok(any.facts.includes('edge_id(2,"ad").'));
  assert.ok(!any.facts.includes('"bd"'));

  const all = projectAndBuildFacts("all");
  assert.deepEqual(all.sourceLinks.map((link) => link.sourceId), ["ab", "bc", "cd"]);
  assert.deepEqual(all.visibleLinks.map((link) => link.sourceId), ["ab"]);
  assert.equal(all.facts.split("\n").filter((fact) => fact.startsWith("edge_record(")).length, 1);
  assert.ok(all.facts.includes('edge_id(1,"ab").'));
  assert.ok(!all.facts.includes('"ad"'));
});
