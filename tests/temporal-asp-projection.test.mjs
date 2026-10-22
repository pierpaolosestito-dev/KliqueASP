import assert from "node:assert/strict";
import dataset from "../src/lib/kliqueasp/data/examples/temporal-edge-projection.json" with { type: "json" };
import graphConfig from "../src/lib/kliqueasp/data/examples/temporal-edge-projection.config.json" with { type: "json" };
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { filterLinksByTemporalWindow } from "../src/lib/kliqueasp/graph/temporalProjection.ts";
import {
  buildMaximumKPlexProgram,
  parseWitnessNodeSets,
  selectMaximumNodeSets
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

function enumerateMaximumKPlexes(nodes, links, s) {
  const adjacent = new Set();
  for (const link of links) {
    const source = String(link.source);
    const target = String(link.target);
    adjacent.add(`${source}\u0000${target}`);
    adjacent.add(`${target}\u0000${source}`);
  }

  const valid = (candidate) => candidate.every((node) => {
    const nonNeighbors = candidate.filter((other) =>
      other !== node && !adjacent.has(`${node}\u0000${other}`)
    ).length;
    return nonNeighbors <= s - 1;
  });

  let maximumSize = 0;
  const maximumSets = [];
  for (let mask = 1; mask < 1 << nodes.length; mask += 1) {
    const candidate = nodes
      .filter((_, index) => mask & (1 << index))
      .map((node) => String(node.id))
      .sort();
    if (!valid(candidate)) continue;
    if (candidate.length > maximumSize) {
      maximumSize = candidate.length;
      maximumSets.length = 0;
    }
    if (candidate.length === maximumSize) maximumSets.push(candidate);
  }

  return maximumSets;
}

let runnerPromise;
function getRunner() {
  runnerPromise ??= createClingoWasmRunner();
  return runnerPromise;
}

test("la timeline schema v2 proietta gli stessi archi nei fatti ASP e conserva i massimi k-plex", async () => {
  const normalized = normalizeGraphData(dataset, graphConfig);
  assert.equal(normalized.valid, true, JSON.stringify(normalized.diagnostics));
  assert.equal(normalized.capabilities.edgeIntervals.available, true);
  assert.deepEqual(
    normalized.links.map((link) => [link.analysis.id, Number(link.analysis.validity.from), Number(link.analysis.validity.to)]),
    [["ab", 1990, 1999], ["bd", 2000, 2009], ["dc", 2010, 2014], ["ca", 2015, 2020], ["bc", 2005, 2015]]
  );

  const queries = [
    { start: 1990, end: 1999, edgeIds: ["ab"] },
    { start: 2000, end: 2009, edgeIds: ["bd", "bc"] },
    { start: 2015, end: 2020, edgeIds: ["ca", "bc"] }
  ];
  const runner = await getRunner();

  for (const { start, end, edgeIds } of queries) {
    const links = filterLinksByTemporalWindow(
      normalized.links,
      (link) => ({
        start: Number(link.analysis.validity.from),
        end: Number(link.analysis.validity.to)
      }),
      start,
      end
    );
    assert.deepEqual(links.map((link) => link.analysis.id).sort(), [...edgeIds].sort(), `${start}–${end}`);

    const projectedGraph = { ...normalized, links };
    const { facts, reverseIndex } = buildAspFactsFromGraph(projectedGraph);
    const factEdgeIds = [...facts.matchAll(/edge_id\(\d+,"([^"]+)"\)\./g)]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(factEdgeIds, [...edgeIds].sort(), `gli stessi archi temporali devono arrivare ai fatti ASP in ${start}–${end}`);

    const aspResult = await runner.run(
      `${facts.trim()}\n\n${buildMaximumKPlexProgram(2)}\n`,
      ["--opt-mode=optN"]
    );
    assert.equal(aspResult.Result, "OPTIMUM FOUND", `finestra ${start}–${end}`);
    const aspMaximumSets = selectMaximumNodeSets(
      parseWitnessNodeSets(aspResult.Call?.[0]?.Witnesses, reverseIndex)
    ).map((set) => [...set].sort());
    const expectedMaximumSets = enumerateMaximumKPlexes(projectedGraph.nodes, links, 2);
    assert.deepEqual(
      aspMaximumSets.sort((left, right) => left.join("\u0000").localeCompare(right.join("\u0000"))),
      expectedMaximumSets.sort((left, right) => left.join("\u0000").localeCompare(right.join("\u0000"))),
      `k-plex ASP e riferimento esaustivo devono coincidere in ${start}–${end}`
    );
  }
});
