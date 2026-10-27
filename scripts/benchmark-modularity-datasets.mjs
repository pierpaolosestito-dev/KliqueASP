import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import psychologyDataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import psychologyConfig from "../src/lib/kliqueasp/config/graph.config.json" with { type: "json" };
import davisDataset from "../src/lib/kliqueasp/data/examples/davis-southern-women.json" with { type: "json" };
import karateDataset from "../src/lib/kliqueasp/data/examples/karate-club.json" with { type: "json" };
import karateConfig from "../src/lib/kliqueasp/data/examples/karate-club.config.json" with { type: "json" };
import {
  buildAspFactsFromGraph,
  normalizeGraphData
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildMaximumModularityProgram,
  buildExperimentalIncrementalModularityProgram,
  buildExperimentalModularityEquivalenceProgram,
  buildExperimentalModularityThresholdProgram,
  buildModularityFacts,
  getStructuralSolverOptions,
  parseWitnessModularityPartitions,
  selectMaximumModularityPartitions
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";
import {
  buildGreedyModularityIncumbent,
  buildModularityIncumbentBound,
  buildModularityIncumbentHeuristic,
  scorePartition
} from "./modularityGreedyIncumbent.mjs";
import { findGraphologyLouvainBaseline } from "./modularityGraphologyBaseline.mjs";

const defaultTimeoutMs = 20_000;
const maximumTimeoutMs = 600_000;
const maxGroundingProbeNodes = 400;
const allDatasets = [
  { key: "psychology", name: "Psychology History Graph", dataset: psychologyDataset, config: psychologyConfig },
  { key: "davis", name: "Davis Southern Women", dataset: davisDataset, config: {} },
  { key: "karate", name: "Zachary Karate Club (topology only)", dataset: karateDataset, config: karateConfig }
];

function evaluatePartition(graph, communities) {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const assigned = communities.flat();
  const assignedSet = new Set(assigned);
  if (assignedSet.size !== assigned.length || assignedSet.size !== nodeIds.size ||
    [...nodeIds].some((nodeId) => !assignedSet.has(nodeId)) ||
    assigned.some((nodeId) => !nodeIds.has(nodeId))) {
    return { valid: false, scaledScore: null };
  }

  const communityByNode = new Map();
  communities.forEach((community, index) => community.forEach((nodeId) => communityByNode.set(nodeId, index)));
  const degree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const edge of graph.links) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  let scaledScore = 0;
  const details = communities.map((community, index) => {
    const members = new Set(community);
    const internalEdgeCount = graph.links.filter((edge) =>
      members.has(edge.source) && members.has(edge.target)
    ).length;
    const volume = community.reduce((total, nodeId) => total + (degree.get(nodeId) ?? 0), 0);
    const scaledContribution = 4 * graph.links.length * internalEdgeCount - volume ** 2;
    scaledScore += scaledContribution;
    return { index, internalEdgeCount, volume, scaledContribution };
  });

  return {
    valid: communityByNode.size === nodeIds.size,
    scaledScore,
    modularity: graph.links.length === 0 ? null : scaledScore / (4 * graph.links.length ** 2),
    details
  };
}

function readCommunityWitness(result, reverseIndex) {
  const value = result?.Call?.[0]?.Witnesses?.[0]?.Value;
  if (!Array.isArray(value)) return null;
  const membersByCommunity = new Map();
  for (const atom of value) {
    if (typeof atom !== "string") continue;
    const match = /^community\((\d+),(\d+)\)$/.exec(atom);
    if (!match) continue;
    const nodeId = reverseIndex[Number(match[1])];
    if (nodeId === undefined) continue;
    const communityId = Number(match[2]);
    const members = membersByCommunity.get(communityId) ?? [];
    members.push(nodeId);
    membersByCommunity.set(communityId, members);
  }
  return membersByCommunity.size > 0 ? [...membersByCommunity.values()] : null;
}

async function runDataset(key, strategy = "default", encoding = "aggregate") {
  const item = allDatasets.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`Dataset sconosciuto: ${key}; usa psychology, davis, karate o all.`);
  const graph = normalizeGraphData(item.dataset, item.config);
  if (!graph.valid || graph.direction !== "undirected" || graph.links.length === 0) {
    throw new Error(`${item.name}: il benchmark richiede un grafo non orientato valido con archi.`);
  }
  if (encoding !== "aggregate" && encoding !== "grounding-probe" && graph.nodes.length > 50) {
    throw new Error(`L'encoding ${encoding} di benchmark è limitato a 50 nodi per circoscrivere il grounding.`);
  }
  if (encoding === "grounding-probe" && graph.nodes.length > maxGroundingProbeNodes) {
    throw new Error(`La sonda di grounding è limitata a ${maxGroundingProbeNodes} nodi per circoscrivere l'uso di memoria WASM.`);
  }
  if ((encoding === "threshold-search" || encoding === "grounding-probe") && strategy !== "default") {
    throw new Error(`L'encoding ${encoding} richiede strategy=default; usa opzioni di ottimizzazione solo per i benchmark che la eseguono.`);
  }
  const incumbentBuildStartedAt = performance.now();
  const incumbent = encoding === "threshold-search" || encoding === "graphology-seed"
    ? findGraphologyLouvainBaseline(graph.nodes.map((node) => node.id), graph.links, {
        restarts: 16,
        seed: 20261022
      })
    : encoding === "incumbent" || encoding === "seed-heuristic"
      ? buildGreedyModularityIncumbent(graph.nodes.map((node) => node.id), graph.links)
      : undefined;
  const incumbentAlgorithm = encoding === "threshold-search" || encoding === "graphology-seed"
    ? "Graphology Louvain multi-start"
    : incumbent ? "multi-start local greedy" : null;
  const incumbentBuildMs = incumbent ? performance.now() - incumbentBuildStartedAt : null;
  if (incumbent) {
    const independentlyScored = evaluatePartition(graph, incumbent.communities);
    const helperScored = scorePartition(graph.nodes.map((node) => node.id), graph.links, incumbent.communities);
    if (!independentlyScored.valid || independentlyScored.scaledScore !== incumbent.scaledScore ||
      helperScored !== incumbent.scaledScore) {
      throw new Error("Il limite inferiore euristico non coincide con il punteggio indipendente della partizione.");
    }
  }

  const aspFacts = buildAspFactsFromGraph(graph);
  const modularityFacts = buildModularityFacts(
    graph.nodes.map((node) => aspFacts.indexByNodeId.get(node.id)),
    graph.links.map((edge) => ({
      source: aspFacts.indexByNodeId.get(edge.source),
      target: aspFacts.indexByNodeId.get(edge.target)
    })),
    { includePairwiseObjective: encoding === "pairwise" || encoding === "equivalence" }
  );
  if (encoding === "grounding-probe") {
    const solverProgram = [
      aspFacts.facts,
      modularityFacts.facts,
      buildMaximumModularityProgram()
    ].join("\n") + "\n";
    const runner = await createClingoWasmRunner({ captureWasmMemory: true, includeExceptionDetails: true });
    console.log(JSON.stringify({
      dataset: item.name,
      phase: "grounding-probe-start",
      nodes: graph.nodes.length,
      edges: graph.links.length,
      aspInputBytes: Buffer.byteLength(solverProgram, "utf8"),
      solverMode: "--opt-mode=ignore",
      claim: "grounding-and-feasibility-cost-only; no optimum search"
    }));
    const startedAt = performance.now();
    const result = await runner.run(solverProgram, ["--stats=2", "--opt-mode=ignore"], 1);
    const elapsedWallMs = performance.now() - startedAt;
    const communities = readCommunityWitness(result, aspFacts.reverseIndex);
    const independent = communities
      ? evaluatePartition(graph, communities)
      : { valid: false, scaledScore: null, modularity: null };
    const valid = result?.Result === "SATISFIABLE" && independent.valid;
    const totalSeconds = Number(result?.Time?.Total);
    const solveSeconds = Number(result?.Time?.Solve);
    console.log(JSON.stringify({
      dataset: item.name,
      nodes: graph.nodes.length,
      undirectedEdges: graph.links.length,
      aspInputBytes: Buffer.byteLength(solverProgram, "utf8"),
      solverMode: "--opt-mode=ignore",
      solverStatus: result?.Result ?? "NO_RESULT",
      solverError: typeof result?.Error === "string" ? result.Error : null,
      optimumProven: false,
      feasibleWitnessOnly: true,
      witnessPartitionValid: independent.valid,
      witnessScaledScore: independent.scaledScore,
      witnessModularity: independent.modularity,
      elapsedWallMs: Number(elapsedWallMs.toFixed(2)),
      clingoTimeMs: {
        total: Number.isFinite(totalSeconds) ? Number((totalSeconds * 1000).toFixed(2)) : null,
        solve: Number.isFinite(solveSeconds) ? Number((solveSeconds * 1000).toFixed(2)) : null,
        preSolveEstimate: Number.isFinite(totalSeconds) && Number.isFinite(solveSeconds)
          ? Number((Math.max(0, totalSeconds - solveSeconds) * 1000).toFixed(2))
          : null
      },
      groundAtoms: result?.Stats?.LP?.Atoms ?? null,
      groundRulesOriginal: result?.Stats?.LP?.Rules?.Original ?? null,
      groundRulesFinal: result?.Stats?.LP?.Rules?.Final ?? null,
      solverVariables: result?.Stats?.Problem?.Variables ?? null,
      wasmLinearMemoryBytes: runner.getWasmLinearMemoryStats(),
      valid
    }));
    return valid;
  }
  if (encoding === "threshold-search") {
    const nodeIds = graph.nodes.map((node) => node.id);
    const independentIncumbent = evaluatePartition(graph, incumbent.communities);
    if (!independentIncumbent.valid || independentIncumbent.scaledScore !== incumbent.scaledScore) {
      throw new Error("L'incumbent della ricerca per soglia non coincide con la valutazione indipendente.");
    }
    // With resolution 1 and nonnegative unweighted edges, every partition has
    // score 4*M*L - sum(D^2) <= 4*M^2 because L <= M. This is an infeasible
    // exclusive endpoint for the exact integer threshold search.
    const upperExclusive = 4 * modularityFacts.totalWeight ** 2 + 1;
    if (!Number.isSafeInteger(upperExclusive) || incumbent.scaledScore >= upperExclusive) {
      throw new Error("Limiti della ricerca per soglia fuori dal dominio intero sicuro.");
    }
    const runner = await createClingoWasmRunner({ captureWasmMemory: true });
    const facts = [aspFacts.facts, modularityFacts.facts].join("\n");
    const startedAt = performance.now();
    let feasibleLowerBound = incumbent.scaledScore;
    let infeasibleUpperBound = upperExclusive;
    let thresholdQueries = 0;
    let satQueries = 0;
    let unsatQueries = 0;
    let totalClingoMs = 0;
    let solveClingoMs = 0;
    let maximumGroundAtoms = null;
    let maximumGroundRules = null;
    let maximumQueryBytes = 0;
    const queryRecords = [];
    console.log(JSON.stringify({
      dataset: item.name,
      phase: "threshold-search-start",
      nodes: graph.nodes.length,
      edges: graph.links.length,
      heuristicIncumbentAlgorithm: incumbentAlgorithm,
      heuristicIncumbentScaledScore: incumbent.scaledScore,
      heuristicIncumbentModularity: Number((incumbent.scaledScore / (4 * graph.links.length ** 2)).toFixed(6)),
      heuristicIncumbentBuildMs: Number(incumbentBuildMs.toFixed(2)),
      heuristicIncumbentRestarts: incumbent.restarts,
      heuristicIncumbentLevels: incumbent.levels,
      analyticUpperBoundExclusive: upperExclusive,
      aspFactsBytes: Buffer.byteLength(facts, "utf8")
    }));

    // Prove that the incumbent score is represented by the ASP search space before
    // using it as the feasible endpoint of the exact SAT/UNSAT interval.
    const incumbentProgram = `${facts}\n${buildExperimentalModularityThresholdProgram(feasibleLowerBound)}\n`;
    maximumQueryBytes = Math.max(maximumQueryBytes, Buffer.byteLength(incumbentProgram, "utf8"));
    const incumbentResult = await runner.run(incumbentProgram, ["--stats=2"], 1);
    thresholdQueries += 1;
    const incumbentTotalMs = Number(incumbentResult?.Time?.Total);
    const incumbentSolveMs = Number(incumbentResult?.Time?.Solve);
    if (Number.isFinite(incumbentTotalMs)) totalClingoMs += incumbentTotalMs * 1000;
    if (Number.isFinite(incumbentSolveMs)) solveClingoMs += incumbentSolveMs * 1000;
    const incumbentAtoms = Number(incumbentResult?.Stats?.LP?.Atoms);
    const incumbentRules = Number(incumbentResult?.Stats?.LP?.Rules?.Final);
    if (Number.isFinite(incumbentAtoms)) maximumGroundAtoms = Math.max(maximumGroundAtoms ?? 0, incumbentAtoms);
    if (Number.isFinite(incumbentRules)) maximumGroundRules = Math.max(maximumGroundRules ?? 0, incumbentRules);
    if (incumbentResult?.Result !== "SATISFIABLE") {
      throw new Error(`L'ASP non ammette il limite inferiore verificato ${feasibleLowerBound}: ${incumbentResult?.Error ?? JSON.stringify(incumbentResult)}`);
    }
    const incumbentQueryMs = Number(incumbentResult?.Time?.Total);
    satQueries += 1;
    const incumbentWitness = parseWitnessModularityPartitions(
      incumbentResult?.Call?.[0]?.Witnesses,
      aspFacts.reverseIndex
    )[0];
    const incumbentWitnessScore = incumbentWitness
      ? evaluatePartition(graph, incumbentWitness.communities)
      : { valid: false, scaledScore: null };
    if (!incumbentWitness || !incumbentWitnessScore.valid ||
      incumbentWitness.scaledScore !== incumbentWitnessScore.scaledScore ||
      incumbentWitnessScore.scaledScore < feasibleLowerBound ||
      incumbentWitnessScore.scaledScore >= infeasibleUpperBound) {
      throw new Error(`Testimone ASP non valido sul limite inferiore ${feasibleLowerBound}: ${incumbentResult?.Error ?? JSON.stringify(incumbentResult)}`);
    }
    feasibleLowerBound = incumbentWitnessScore.scaledScore;
    queryRecords.push({
      threshold: incumbent.scaledScore,
      result: "SATISFIABLE",
      witnessScaledScore: incumbentWitnessScore.scaledScore,
      role: "verified-feasible-lower-bound"
    });
    console.log(JSON.stringify({
      dataset: item.name,
      phase: "threshold-query",
      threshold: incumbent.scaledScore,
      result: "SATISFIABLE",
      witnessScaledScore: incumbentWitnessScore.scaledScore,
      clingoTotalMs: Number.isFinite(incumbentQueryMs) ? Number((incumbentQueryMs * 1000).toFixed(2)) : null
    }));

    while (infeasibleUpperBound - feasibleLowerBound > 1) {
      const threshold = Math.floor((feasibleLowerBound + infeasibleUpperBound) / 2);
      const solverProgram = `${facts}\n${buildExperimentalModularityThresholdProgram(threshold)}\n`;
      maximumQueryBytes = Math.max(maximumQueryBytes, Buffer.byteLength(solverProgram, "utf8"));
      const queryStartedAt = performance.now();
      const result = await runner.run(solverProgram, ["--stats=2"], 1);
      thresholdQueries += 1;
      const totalMs = Number(result?.Time?.Total);
      const solveMs = Number(result?.Time?.Solve);
      if (Number.isFinite(totalMs)) totalClingoMs += totalMs * 1000;
      if (Number.isFinite(solveMs)) solveClingoMs += solveMs * 1000;
      const atoms = Number(result?.Stats?.LP?.Atoms);
      const rules = Number(result?.Stats?.LP?.Rules?.Final);
      if (Number.isFinite(atoms)) maximumGroundAtoms = Math.max(maximumGroundAtoms ?? 0, atoms);
      if (Number.isFinite(rules)) maximumGroundRules = Math.max(maximumGroundRules ?? 0, rules);

      if (result?.Result === "SATISFIABLE") {
        satQueries += 1;
        const partition = parseWitnessModularityPartitions(
          result?.Call?.[0]?.Witnesses,
          aspFacts.reverseIndex
        )[0];
        const independentlyScored = partition
          ? evaluatePartition(graph, partition.communities)
          : { valid: false, scaledScore: null };
        if (!partition || !independentlyScored.valid || partition.scaledScore !== independentlyScored.scaledScore ||
          independentlyScored.scaledScore < threshold || independentlyScored.scaledScore >= infeasibleUpperBound) {
          throw new Error(`Testimone SAT non valido alla soglia ${threshold}: ${result?.Error ?? JSON.stringify(result)}`);
        }
        feasibleLowerBound = Math.max(feasibleLowerBound, independentlyScored.scaledScore);
        queryRecords.push({ threshold, result: "SATISFIABLE", witnessScaledScore: independentlyScored.scaledScore });
        console.log(JSON.stringify({
          dataset: item.name,
          phase: "threshold-query",
          threshold,
          result: "SATISFIABLE",
          witnessScaledScore: independentlyScored.scaledScore,
          feasibleLowerBound,
          infeasibleUpperBoundExclusive: infeasibleUpperBound,
          queryWallMs: Number((performance.now() - queryStartedAt).toFixed(2))
        }));
      } else if (result?.Result === "UNSATISFIABLE") {
        unsatQueries += 1;
        infeasibleUpperBound = threshold;
        queryRecords.push({ threshold, result: "UNSATISFIABLE" });
        console.log(JSON.stringify({
          dataset: item.name,
          phase: "threshold-query",
          threshold,
          result: "UNSATISFIABLE",
          feasibleLowerBound,
          infeasibleUpperBoundExclusive: infeasibleUpperBound,
          queryWallMs: Number((performance.now() - queryStartedAt).toFixed(2))
        }));
      } else {
        throw new Error(`Il solver non ha concluso la decisione alla soglia ${threshold}: ${result?.Error ?? JSON.stringify(result)}`);
      }
    }

    const elapsedWallMs = performance.now() - startedAt;
    const optimumProven = infeasibleUpperBound - feasibleLowerBound === 1;
    const valid = optimumProven;
    console.log(JSON.stringify({
      dataset: item.name,
      nodes: graph.nodes.length,
      undirectedEdges: graph.links.length,
      aspInputBytes: Buffer.byteLength(facts, "utf8"),
      maximumThresholdQueryBytes: maximumQueryBytes,
      solverStrategy: "decision-threshold",
      encoding,
      solverStatus: optimumProven ? "OPTIMUM PROVEN BY SAT/UNSAT BOUNDS" : "INCOMPLETE",
      optimumProven,
      scaledOptimum: optimumProven ? feasibleLowerBound : null,
      feasibleLowerBound,
      infeasibleUpperBoundExclusive: infeasibleUpperBound,
      communityCount: incumbent.communities.length,
      heuristicIncumbentAlgorithm: incumbentAlgorithm,
      heuristicIncumbentScaledScore: incumbent.scaledScore,
      heuristicIncumbentModularity: Number((incumbent.scaledScore / (4 * graph.links.length ** 2)).toFixed(6)),
      thresholdQueries,
      satQueries,
      unsatQueries,
      queryRecords,
      elapsedWallMs: Number(elapsedWallMs.toFixed(2)),
      clingoTimeMs: {
        total: Number(totalClingoMs.toFixed(2)),
        solve: Number(solveClingoMs.toFixed(2))
      },
      maximumGroundAtoms,
      maximumGroundRules,
      wasmLinearMemoryBytes: runner.getWasmLinearMemoryStats(),
      valid
    }));
    return valid;
  }
  if ((encoding === "pairwise" || encoding === "equivalence") &&
    (modularityFacts.pairwiseObjectiveFacts === undefined || modularityFacts.pairwiseObjectiveOffset === undefined)) {
    throw new Error(`Encoding ${encoding} non disponibile: ${modularityFacts.pairwiseObjectiveUnavailableReason ?? "causa sconosciuta"}`);
  }
  const objectiveProgram = encoding === "equivalence"
    ? buildExperimentalModularityEquivalenceProgram({ pairwiseObjectiveOffset: modularityFacts.pairwiseObjectiveOffset })
    : encoding === "incremental"
      ? buildExperimentalIncrementalModularityProgram()
      : encoding === "connected"
        ? buildMaximumModularityProgram({ enforceConnectedPositiveVolumeCommunities: true })
      : buildMaximumModularityProgram(encoding === "pairwise"
        ? { pairwiseObjectiveOffset: modularityFacts.pairwiseObjectiveOffset }
        : {});
  const program = [
    aspFacts.facts,
    modularityFacts.facts,
    encoding === "pairwise" || encoding === "equivalence" ? modularityFacts.pairwiseObjectiveFacts : "",
    objectiveProgram
  ].filter(Boolean).join("\n") + "\n";
  const solverProgram = encoding === "incumbent"
    ? `${program}\n${buildModularityIncumbentBound(incumbent.scaledScore)}\n`
    : encoding === "seed-heuristic" || encoding === "graphology-seed"
      ? `${program}\n${buildModularityIncumbentHeuristic(aspFacts.indexByNodeId, incumbent.communities)}\n`
    : program;
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  console.log(JSON.stringify({
    dataset: item.name,
    phase: "start",
    nodes: graph.nodes.length,
    edges: graph.links.length,
    aspInputBytes: Buffer.byteLength(solverProgram, "utf8"),
    solverStrategy: strategy,
    encoding,
    heuristicIncumbentAlgorithm: incumbentAlgorithm,
    heuristicIncumbentScaledScore: incumbent?.scaledScore ?? null,
    heuristicIncumbentModularity: incumbent ? Number((incumbent.scaledScore / (4 * graph.links.length ** 2)).toFixed(6)) : null,
    heuristicIncumbentCommunities: incumbent?.communities.length ?? null,
    heuristicIncumbentMoves: incumbent?.moves ?? null,
    heuristicIncumbentStarts: incumbent?.starts ?? null,
    heuristicIncumbentRestarts: incumbent?.restarts ?? null
  }));

  const startedAt = performance.now();
  const strategyOptions = strategy === "default" ? [] : [`--opt-strategy=${strategy}`];
  const result = await runner.run(solverProgram, ["--stats=2", ...getStructuralSolverOptions("communities"), ...strategyOptions]);
  const elapsedWallMs = performance.now() - startedAt;
  const partitions = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(result?.Call?.[0]?.Witnesses, aspFacts.reverseIndex)
  );
  const partition = partitions[0];
  const independent = partition ? evaluatePartition(graph, partition.communities) : { valid: false, scaledScore: null };
  const optimumProven = result?.Result === "OPTIMUM FOUND" && partition !== undefined;
  const valid = optimumProven && independent.valid && independent.scaledScore === partition.scaledScore;

  console.log(JSON.stringify({
    dataset: item.name,
    nodes: graph.nodes.length,
    undirectedEdges: graph.links.length,
    aspInputBytes: Buffer.byteLength(program, "utf8"),
    solverStrategy: strategy,
    encoding,
    solverStatus: result?.Result ?? "NO_RESULT",
    optimumProven,
    communityCount: partition?.communities.length ?? null,
    communitySizes: partition?.communities.map((community) => community.length) ?? null,
    reportedScaledScore: partition?.scaledScore ?? null,
    independentlyComputedScaledScore: independent.scaledScore,
    incumbentBoundSatisfied: encoding === "incumbent" && partition ? independent.scaledScore >= incumbent.scaledScore : null,
    independentModularity: independent.modularity,
    witnessPartitionValid: independent.valid,
    elapsedWallMs: Number(elapsedWallMs.toFixed(2)),
    clingoTimeMs: result?.Time
      ? {
          total: Number.isFinite(Number(result.Time.Total))
            ? Number((Number(result.Time.Total) * 1000).toFixed(2))
            : null,
          solve: Number.isFinite(Number(result.Time.Solve))
            ? Number((Number(result.Time.Solve) * 1000).toFixed(2))
            : null
        }
      : null,
    groundAtoms: result?.Stats?.LP?.Atoms ?? null,
    groundRules: result?.Stats?.LP?.Rules?.Final ?? null,
    wasmLinearMemoryBytes: runner.getWasmLinearMemoryStats(),
    valid
  }));
  return valid;
}

const args = process.argv.slice(2);
const childIndex = args.indexOf("--child");
if (childIndex >= 0) {
  const valid = await runDataset(
    args[childIndex + 1] ?? "",
    args[childIndex + 2] ?? "default",
    args[childIndex + 3] ?? "aggregate"
  );
  if (!valid) process.exitCode = 1;
} else {
  const requestedDataset = args[0] ?? "all";
  const strategy = args[1] ?? "default";
  const encoding = args[2] ?? "aggregate";
  const timeoutOptions = args.filter((argument) => argument.startsWith("--timeout-ms="));
  if (timeoutOptions.length > 1) throw new Error("Specifica --timeout-ms una sola volta.");
  const timeoutMs = timeoutOptions.length === 0
    ? defaultTimeoutMs
    : Number(timeoutOptions[0].slice("--timeout-ms=".length));
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > maximumTimeoutMs) {
    throw new Error(`--timeout-ms deve essere un intero tra 1 e ${maximumTimeoutMs}.`);
  }
  if (args.slice(3).some((argument) => !argument.startsWith("--timeout-ms="))) {
    throw new Error("Opzione benchmark non riconosciuta; supportata: --timeout-ms=<ms>.");
  }
  if (!["default", "usc", "bb"].includes(strategy)) {
    throw new Error(`Strategia sconosciuta: ${strategy}; usa default, usc o bb.`);
  }
  if (!["aggregate", "pairwise", "equivalence", "incremental", "incumbent", "seed-heuristic", "graphology-seed", "connected", "threshold-search", "grounding-probe"].includes(encoding)) {
    throw new Error(`Encoding sconosciuto: ${encoding}; usa aggregate, pairwise, equivalence, incremental, incumbent, seed-heuristic, graphology-seed, connected, threshold-search o grounding-probe.`);
  }
  if ((encoding === "threshold-search" || encoding === "grounding-probe") && strategy !== "default") {
    throw new Error(`L'encoding ${encoding} richiede la strategia default.`);
  }
  const requestedDatasets = requestedDataset === "all"
    ? allDatasets.map((item) => item.key)
    : [requestedDataset];
  if (requestedDatasets.some((key) => !allDatasets.some((item) => item.key === key))) {
    throw new Error(`Dataset sconosciuto: ${requestedDataset}; usa psychology, davis, karate o all.`);
  }
  if (encoding !== "aggregate" && encoding !== "grounding-probe" && requestedDatasets.some((key) =>
    (allDatasets.find((item) => item.key === key)?.dataset?.nodes?.length ?? 0) > 50
  )) {
    throw new Error(`Seleziona un dataset fino a 50 nodi per misurare l'encoding ${encoding}; non è ammesso su psychology o all.`);
  }
  if (encoding === "grounding-probe" && requestedDatasets.some((key) =>
    (allDatasets.find((item) => item.key === key)?.dataset?.nodes?.length ?? 0) > maxGroundingProbeNodes
  )) {
    throw new Error(`Seleziona un dataset fino a ${maxGroundingProbeNodes} nodi per la sonda di grounding.`);
  }

  for (const key of requestedDatasets) {
    let timedOut = false;
    const child = spawn(process.execPath, [
      "--experimental-strip-types",
      fileURLToPath(import.meta.url),
      "--child",
      key,
      strategy,
      encoding
    ], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    clearTimeout(timeout);

    if (timedOut) {
      console.log(JSON.stringify({
        dataset: key,
        solverStrategy: strategy,
        solverStatus: "TIMEOUT",
        optimumProven: false,
        timeoutMs,
        valid: false
      }));
      process.exitCode = 1;
    } else if (exitCode !== 0) {
      process.exitCode = 1;
    }
  }
}
