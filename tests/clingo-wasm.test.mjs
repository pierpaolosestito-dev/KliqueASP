import assert from "node:assert/strict";
import dataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import graphConfig from "../src/lib/kliqueasp/config/graph.config.json" with { type: "json" };
import test from "node:test";
import {
  buildAspFactsFromGraph,
  buildCliqueProgram,
  graphPathValues,
  getCliqueModeOptions,
  normalizeGraphData,
  parseWitnessCliqueResults,
  parseWitnessCliques,
  selectMaximumCliques
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";
import {
  hasCompleteModelEnumeration,
  hasCompleteOptimalModelEnumeration
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import {
  getClingoInvocationOptions,
  parseClingoInvocationStats,
  parseClingoInvocationTiming
} from "../src/lib/kliqueasp/workerDiagnostics.ts";

let runnerPromise;

function getRunner() {
  runnerPromise ??= createClingoWasmRunner();
  return runnerPromise;
}

function normalizeCliques(cliques) {
  return cliques.map((clique) => [...clique].sort()).sort((a, b) => a.join("|").localeCompare(b.join("|")));
}

test("il worker clingo espone tempo totale e solving, non un timer isolato del grounding", async () => {
  const result = await (await getRunner()).run("{ timing_probe }.", ["--stats=2"], 1);
  assert.notEqual(result.Result, "ERROR", result.Error);
  assert.equal(Number.isFinite(result.Time?.Total), true);
  assert.equal(Number.isFinite(result.Time?.Solve), true);
  assert.equal(Object.hasOwn(result.Time, "Ground"), false);
  assert.equal(Object.hasOwn(result.Stats ?? {}, "Ground"), false);
  assert.ok(Number.isFinite(result.Stats?.LP?.Atoms));

  const timing = parseClingoInvocationTiming(result);
  assert.ok(timing);
  assert.equal(timing.totalMs !== null, true);
  assert.equal(timing.solveMs !== null, true);
  assert.equal(timing.preSolveMs !== null, timing.totalMs >= timing.solveMs);

  const stats = parseClingoInvocationStats(result);
  assert.deepEqual(stats, {
    groundAtoms: result.Stats.LP.Atoms,
    groundRulesOriginal: result.Stats.LP.Rules.Original,
    groundRulesFinal: result.Stats.LP.Rules.Final,
    solverVariables: result.Stats.Problem.Variables,
    choices: result.Stats.Core.Choices,
    conflicts: result.Stats.Core.Conflicts
  });
});

test("richiedere statistiche clingo dettagliate non cambia gli answer set", async () => {
  const runner = await getRunner();
  const program = "node(a;b).\n{ chosen(X) : node(X) }.\n#show chosen/1.";
  const baseline = await runner.run(program);
  const diagnostic = await runner.run(program, getClingoInvocationOptions([], true));

  assert.equal(diagnostic.Result, baseline.Result);
  assert.deepEqual(
    diagnostic.Call?.[0]?.Witnesses?.map((witness) => witness.Value),
    baseline.Call?.[0]?.Witnesses?.map((witness) => witness.Value)
  );
  assert.deepEqual(parseClingoInvocationStats(diagnostic), {
    groundAtoms: diagnostic.Stats.LP.Atoms,
    groundRulesOriginal: diagnostic.Stats.LP.Rules.Original,
    groundRulesFinal: diagnostic.Stats.LP.Rules.Final,
    solverVariables: diagnostic.Stats.Problem.Variables,
    choices: diagnostic.Stats.Core.Choices,
    conflicts: diagnostic.Stats.Core.Conflicts
  });
});

test("il worker clingo-WASM esegue le tre semantiche clique dell'app", async () => {
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d", "e"].map((id) => ({ id, label: id.toUpperCase() })),
    edges: [
      ["a", "b"], ["a", "c"], ["a", "d"],
      ["b", "c"], ["b", "d"], ["c", "d"],
      ["a", "e"]
    ].map(([source, target]) => ({ source, target }))
  });
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const clingo = await getRunner();

  for (const mode of ["maximal", "all", "maximum"]) {
    const program = `${facts.trim()}\n\n${buildCliqueProgram(mode, "")}\n`;
    const result = await clingo.run(program, getCliqueModeOptions(mode));

    assert.notEqual(result.Result, "ERROR", `${mode}: ${result.Error ?? "solver error"}`);
    assert.equal(result.Solver, "clingo version 5.8.0");
    assert.equal(mode === "maximum"
      ? hasCompleteOptimalModelEnumeration(result)
      : hasCompleteModelEnumeration(result), true,
    `${mode}: l'app può pubblicare l'elenco solo se l'enumerazione è completa (${JSON.stringify({ Result: result.Result, Models: result.Models })})`);

    const parsedCliques = parseWitnessCliques(result.Call?.[0]?.Witnesses, reverseIndex);
    const cliques = mode === "maximum" ? selectMaximumCliques(parsedCliques) : parsedCliques;
    const expected = mode === "all"
      ? [["a", "b", "c"], ["a", "b", "d"], ["a", "c", "d"], ["b", "c", "d"], ["a", "b", "c", "d"]]
      : [["a", "b", "c", "d"]];
    assert.deepEqual(normalizeCliques(cliques), normalizeCliques(expected), `${mode}: risultati inattesi`);
  }
});

test("il parser clique mantiene il minimo legacy e consente witness di taglia 1 o 2 per analisi dedicate", async () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [{ source: "a", target: "b" }]
  });
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const result = await (await getRunner()).run(
    `${facts.trim()}\n\n${buildCliqueProgram("maximum", "")}\n`,
    getCliqueModeOptions("maximum")
  );

  assert.equal(result.Result, "OPTIMUM FOUND");
  const witnesses = result.Call?.[0]?.Witnesses;
  assert.deepEqual(parseWitnessCliques(witnesses, reverseIndex), []);
  const smallWitnessCliques = parseWitnessCliques(witnesses, reverseIndex, 1);
  assert.deepEqual(normalizeCliques(smallWitnessCliques), normalizeCliques([["a"], ["a", "b"]]));
  assert.deepEqual(normalizeCliques(selectMaximumCliques(smallWitnessCliques)), normalizeCliques([["a", "b"]]));
});

test("il worker clingo-WASM riproduce la baseline maximal del grafo psicologico", async () => {
  const graph = normalizeGraphData(dataset, graphConfig);
  const start = Number(graphConfig.timeline.start);
  const end = Number(graphConfig.timeline.end);
  const nodes = graph.nodes.filter((node) => {
    const timeline = graphConfig.nodeTypes?.[node.type]?.timeline;
    if (!timeline) return true;

    const from = Number(node.data?.[timeline.startField] ?? 0);
    const to = Number(node.data?.[timeline.endField] ?? 9999);
    return from <= end && to >= start;
  });
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const links = graph.links.filter((link) =>
    visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target)
  );
  const visibleGraph = { ...graph, nodes, links };
  const groupExtractor = (node) => {
    const groupPath = graphConfig.nodeTypes?.[node.type]?.group;
    if (!groupPath) return [];
    const path = groupPath.startsWith("$") || groupPath.startsWith("data.")
      ? groupPath
      : `data.${groupPath}`;
    return graphPathValues(node, path)
      .map((value) => String(value).trim())
      .filter(Boolean);
  };
  const { facts, reverseIndex } = buildAspFactsFromGraph(visibleGraph, groupExtractor);
  const mode = graphConfig.solver?.cliqueMode ?? "maximal";
  const result = await (await getRunner()).run(
    `${facts.trim()}\n\n${buildCliqueProgram(mode, "")}\n`,
    getCliqueModeOptions(mode)
  );

  assert.equal(graph.valid, true);
  assert.equal(nodes.length, 335, "proiezione temporale predefinita dell'app");
  assert.equal(links.length, 989, "proiezione legacy non orientata dell'app");
  assert.equal(result.Result, "SATISFIABLE");
  assert.equal(result.Solver, "clingo version 5.8.0");

  const cliques = parseWitnessCliques(result.Call?.[0]?.Witnesses, reverseIndex);
  const histogram = cliques.reduce((counts, clique) => {
    counts[clique.length] = (counts[clique.length] ?? 0) + 1;
    return counts;
  }, {});

  assert.equal(cliques.length, 308);
  assert.equal(Math.max(...cliques.map((clique) => clique.length)), 5);
  assert.deepEqual(histogram, { 3: 255, 4: 52, 5: 1 });

  const explainedResult = await (await getRunner()).run(
    `${facts.trim()}\n\n${buildCliqueProgram(mode, "", { enabled: true })}\n`,
    getCliqueModeOptions(mode)
  );
  assert.equal(explainedResult.Result, "SATISFIABLE");
  const explainedCliques = parseWitnessCliqueResults(
    explainedResult.Call?.[0]?.Witnesses,
    reverseIndex
  );
  assert.deepEqual(normalizeCliques(explainedCliques.map((clique) => clique.nodeIds)), normalizeCliques(cliques));
  assert.ok(explainedCliques.every((clique) =>
    clique.supportingEdges.length === clique.nodeIds.length * (clique.nodeIds.length - 1) / 2 &&
    clique.supportingEdges.every((edge) => edge.edgeId === undefined)
  ));

  const allMode = "all";
  async function countAllCliques(projectionNodes, projectionLinks, group = "") {
    const projection = { ...graph, nodes: projectionNodes, links: projectionLinks };
    const { facts: projectionFacts, reverseIndex: projectionReverseIndex } =
      buildAspFactsFromGraph(projection, groupExtractor);
    const allResult = await (await getRunner()).run(
      `${projectionFacts.trim()}\n\n${buildCliqueProgram(allMode, group)}\n`,
      getCliqueModeOptions(allMode)
    );
    assert.equal(allResult.Result, "OPTIMUM FOUND");
    return parseWitnessCliques(allResult.Call?.[0]?.Witnesses, projectionReverseIndex).length;
  }

  const personNodes = graph.nodes.filter((node) => node.type === "person");
  const personIds = new Set(personNodes.map((node) => node.id));
  const personLinks = graph.links.filter((link) =>
    personIds.has(link.source) && personIds.has(link.target)
  );

  // These four counts are the all-clique figures in the original case study.
  // They are kept separate from the app's current maximal-clique default.
  assert.equal(await countAllCliques(nodes, links), 505);
  assert.equal(await countAllCliques(personNodes, personLinks), 192);
  assert.equal(await countAllCliques(personNodes, personLinks, "Medicina"), 45);
  assert.equal(await countAllCliques(nodes, links, "Medicina"), 146);
});
