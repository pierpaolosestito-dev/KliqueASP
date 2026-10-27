import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommunityConstraintDiagnosisCsv,
  buildCommunityConstraintRelaxationProgram,
  parseCommunityConstraintDiagnosisResult
} from "../src/lib/kliqueasp/graph/communityConstraintDiagnosis.ts";
import {
  buildMaximumModularityProgram,
  buildModularityFacts,
  getStructuralSolverOptions
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

let runnerPromise;
function getRunner() {
  runnerPromise ??= createClingoWasmRunner();
  return runnerPromise;
}

const nodeIds = ["a", "b", "c"];
const reverseIndex = { 1: "a", 2: "b", 3: "c" };
const facts = buildModularityFacts([1, 2, 3], [
  { source: 1, target: 2 },
  { source: 2, target: 3 }
]);

function enumeratePartitions(nodeCount) {
  const partitions = [];
  function extend(nextNode, communities) {
    if (nextNode > nodeCount) {
      partitions.push(communities.map((community) => [...community]));
      return;
    }
    for (let community = 0; community <= communities.length; community += 1) {
      const next = communities.map((members) => [...members]);
      if (community === communities.length) next.push([nextNode]);
      else next[community].push(nextNode);
      extend(nextNode + 1, next);
    }
  }
  extend(1, []);
  return partitions;
}

const allThreeNodePartitions = enumeratePartitions(3);

function satisfies(partition, constraints) {
  const communityByNode = new Map(partition.flatMap((community, index) => community.map((node) => [node, index])));
  return constraints.every((constraint) => {
    if (constraint.kind === "minimumCommunityCount") return partition.length >= constraint.count;
    if (constraint.kind === "maximumCommunityCount") return partition.length <= constraint.count;
    if (constraint.kind === "mustLink") return communityByNode.get(constraint.pair[0]) === communityByNode.get(constraint.pair[1]);
    if (constraint.kind === "cannotLink") return communityByNode.get(constraint.pair[0]) !== communityByNode.get(constraint.pair[1]);
    const members = new Set(constraint.nodeIndexes);
    return partition.every((community) => {
      const count = community.filter((node) => members.has(node)).length;
      return (constraint.minPerCommunity === undefined || count >= constraint.minPerCommunity) &&
        (constraint.maxPerCommunity === undefined || count <= constraint.maxPerCommunity);
    });
  });
}

function referenceMinimumRelaxations(partitions, constraints) {
  if (partitions.some((partition) => satisfies(partition, constraints))) return null;
  let minimum = Infinity;
  const diagnoses = [];
  for (let mask = 0; mask < 2 ** constraints.length; mask += 1) {
    const relaxed = constraints.filter((_, index) => (mask & (1 << index)) !== 0);
    const cost = relaxed.reduce((sum, constraint) => sum + constraint.relaxationCost, 0);
    if (cost > minimum) continue;
    const active = constraints.filter((_, index) => (mask & (1 << index)) === 0);
    if (!partitions.some((partition) => satisfies(partition, active))) continue;
    if (cost < minimum) {
      minimum = cost;
      diagnoses.length = 0;
    }
    diagnoses.push(relaxed.map((constraint) => constraint.id).sort((a, b) => a - b));
  }
  return diagnoses.map((ids) => JSON.stringify(ids)).sort();
}

test("la diagnosi ASP propone tutti i rilassamenti minimi del conflitto must-link/cannot-link", async () => {
  const options = { mustLinkPairs: [[1, 2]], cannotLinkPairs: [[2, 1]] };
  const built = buildCommunityConstraintRelaxationProgram(options);
  const primary = await (await getRunner()).run(
    `${facts.facts}\n${buildMaximumModularityProgram(options)}\n`,
    getStructuralSolverOptions("communities")
  );
  assert.equal(primary.Result, "UNSATISFIABLE");

  const result = await (await getRunner()).run(
    `${facts.facts}\n${built.program}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const diagnoses = parseCommunityConstraintDiagnosisResult(result, reverseIndex, built.constraints, { requireAllOptima: true });
  assert.equal((result.Warnings ?? []).filter(Boolean).length, 0, "la codifica non deve produrre warning di grounding per vincoli assenti");
  assert.equal(diagnoses.length, 2);
  assert.deepEqual(diagnoses.map((diagnosis) => diagnosis.relaxationCost), [1, 1]);
  assert.deepEqual(diagnoses.map((diagnosis) => diagnosis.relaxedConstraints[0].kind).sort(), ["cannotLink", "mustLink"]);
  for (const diagnosis of diagnoses) {
    assert.equal(diagnosis.partition.communities.flat().length, 3);
    assert.equal(new Set(diagnosis.partition.communities.flat()).size, 3);
  }
});

test("pesi configurati cambiano la diagnosi minima senza confondere costo e numero di regole", async () => {
  const options = {
    mustLinkPairs: [[1, 2]],
    cannotLinkPairs: [[1, 2]],
    diagnosisCosts: { mustLink: 7, cannotLink: 2 }
  };
  const built = buildCommunityConstraintRelaxationProgram(options);
  const result = await (await getRunner()).run(
    `${facts.facts}\n${built.program}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const diagnoses = parseCommunityConstraintDiagnosisResult(result, reverseIndex, built.constraints, { requireAllOptima: true });
  assert.equal(diagnoses.length, 1);
  assert.equal(diagnoses[0].relaxationCost, 2);
  assert.equal(diagnoses[0].relaxedConstraintCount, 1);
  assert.deepEqual(diagnoses[0].relaxedConstraints.map(({ kind, relaxationCost }) => ({ kind, relaxationCost })), [
    { kind: "cannotLink", relaxationCost: 2 }
  ]);

  const forged = structuredClone(result);
  forged.Models.Costs = [3];
  forged.Call[0].Witnesses[0].Costs = [3];
  forged.Call[0].Witnesses[0].Value = forged.Call[0].Witnesses[0].Value.map((atom) =>
    atom === "relaxation_cost(2)" ? "relaxation_cost(3)" : atom
  );
  assert.throws(
    () => parseCommunityConstraintDiagnosisResult(forged, reverseIndex, built.constraints),
    /somma indipendente/
  );
});

test("diagnosi pesata coincide con l'enumerazione indipendente delle 64 configurazioni di coppie", async () => {
  const diagnosisCosts = { mustLink: 4, cannotLink: 2 };
  for (let code = 0; code < 4 ** 3; code += 1) {
    let remainder = code;
    const mustLinkPairs = [];
    const cannotLinkPairs = [];
    for (const pair of [[1, 2], [1, 3], [2, 3]]) {
      const state = ["none", "must", "cannot", "both"][remainder % 4];
      remainder = Math.floor(remainder / 4);
      if (state === "must" || state === "both") mustLinkPairs.push(pair);
      if (state === "cannot" || state === "both") cannotLinkPairs.push(pair);
    }
    const built = buildCommunityConstraintRelaxationProgram({ mustLinkPairs, cannotLinkPairs, diagnosisCosts });
    const reference = referenceMinimumRelaxations(allThreeNodePartitions, built.constraints);
    if (reference === null) continue;
    const result = await (await getRunner()).run(
      `${facts.facts}\n${built.program}\n`,
      getStructuralSolverOptions("communities", true)
    );
    assert.equal(result.Result, "OPTIMUM FOUND", `config=${JSON.stringify({ mustLinkPairs, cannotLinkPairs })}`);
    const actual = parseCommunityConstraintDiagnosisResult(result, reverseIndex, built.constraints, { requireAllOptima: true })
      .map((diagnosis) => JSON.stringify(diagnosis.relaxedConstraints.map((constraint) => constraint.id).sort((a, b) => a - b)))
      .sort();
    assert.deepEqual(actual, reference, `config=${JSON.stringify({ mustLinkPairs, cannotLinkPairs })}`);
  }
});

test("i costi configurati si applicano anche ai conteggi e ai bound attributo", async () => {
  const cases = [
    {
      options: {
        maxCount: 2,
        cannotLinkPairs: [[1, 2], [1, 3], [2, 3]],
        diagnosisCosts: { maximumCommunityCount: 1, cannotLink: 5 }
      },
      expectedCost: 1,
      expectedKind: "maximumCommunityCount"
    },
    {
      options: {
        minCount: 3,
        mustLinkPairs: [[1, 2], [2, 3]],
        diagnosisCosts: { minimumCommunityCount: 5, mustLink: 3 }
      },
      expectedCost: 5,
      expectedKind: "minimumCommunityCount"
    },
    {
      options: {
        mustLinkPairs: [[1, 2], [2, 3]],
        attributeBounds: [{ nodeIndexes: [1, 2, 3], attributeName: "role", attributeValue: "clinician", maxPerCommunity: 1 }],
        diagnosisCosts: { mustLink: 3, attributeBound: 2 }
      },
      expectedCost: 2,
      expectedKind: "attributeBound"
    },
    {
      options: {
        mustLinkPairs: [[1, 2], [2, 3]],
        attributeBounds: [{ nodeIndexes: [1, 2, 3], attributeName: "role", attributeValue: "clinician", maxPerCommunity: 1 }],
        diagnosisCosts: { mustLink: 3, attributeBound: 9 }
      },
      expectedCost: 6,
      expectedKind: "mustLink"
    }
  ];
  for (const { options, expectedCost, expectedKind } of cases) {
    const built = buildCommunityConstraintRelaxationProgram(options);
    const result = await (await getRunner()).run(
      `${facts.facts}\n${built.program}\n`,
      getStructuralSolverOptions("communities", true)
    );
    assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
    const diagnoses = parseCommunityConstraintDiagnosisResult(result, reverseIndex, built.constraints, { requireAllOptima: true });
    assert.ok(diagnoses.length > 0);
    assert.ok(diagnoses.every((diagnosis) => diagnosis.relaxationCost === expectedCost));
    assert.ok(diagnoses.every((diagnosis) => diagnosis.relaxedConstraints.every((constraint) => constraint.kind === expectedKind)));
  }
});

test("min/max e bound di composizione sono rilassati come singole regole configurate", async () => {
  const cases = [
    {
      options: { minCount: 4 },
      kinds: ["minimumCommunityCount"]
    },
    {
      options: { attributeBounds: [{ nodeIndexes: [1], attributeName: "role", attributeValue: "clinician", minPerCommunity: 2 }] },
      kinds: ["attributeBound"]
    }
  ];
  for (const item of cases) {
    const built = buildCommunityConstraintRelaxationProgram(item.options);
    const primary = await (await getRunner()).run(
      `${facts.facts}\n${buildMaximumModularityProgram(item.options)}\n`,
      getStructuralSolverOptions("communities")
    );
    assert.equal(primary.Result, "UNSATISFIABLE");
    const result = await (await getRunner()).run(
      `${facts.facts}\n${built.program}\n`,
      getStructuralSolverOptions("communities")
    );
    assert.equal(result.Result, "OPTIMUM FOUND");
    const diagnoses = parseCommunityConstraintDiagnosisResult(result, reverseIndex, built.constraints);
    assert.equal(diagnoses.length, 1);
    assert.deepEqual(diagnoses[0].relaxedConstraints.map((constraint) => constraint.kind), item.kinds);
    assert.equal(diagnoses[0].relaxationCost, 1);
  }
});

test("maxCount contribuisce alle diagnosi minime insieme ai cannot-link incompatibili", async () => {
  const options = {
    maxCount: 2,
    cannotLinkPairs: [[1, 2], [1, 3], [2, 3]]
  };
  const built = buildCommunityConstraintRelaxationProgram(options);
  const primary = await (await getRunner()).run(
    `${facts.facts}\n${buildMaximumModularityProgram(options)}\n`,
    getStructuralSolverOptions("communities")
  );
  assert.equal(primary.Result, "UNSATISFIABLE");

  const result = await (await getRunner()).run(
    `${facts.facts}\n${built.program}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(result.Result, "OPTIMUM FOUND");
  const diagnoses = parseCommunityConstraintDiagnosisResult(result, reverseIndex, built.constraints, { requireAllOptima: true });
  assert.equal(diagnoses.length, 4);
  assert.deepEqual(diagnoses.map((diagnosis) => diagnosis.relaxationCost), [1, 1, 1, 1]);
  assert.deepEqual(
    diagnoses.map((diagnosis) => diagnosis.relaxedConstraints[0].kind).sort(),
    ["cannotLink", "cannotLink", "cannotLink", "maximumCommunityCount"]
  );
});

test("diagnosi ASP coincide con il minimo di rilassamenti per ogni insieme di relazioni su tre nodi", async () => {
  const pairStates = ["none", "must", "cannot", "both"];
  for (let code = 0; code < pairStates.length ** 3; code += 1) {
    let remainder = code;
    const mustLinkPairs = [];
    const cannotLinkPairs = [];
    for (const pair of [[1, 2], [1, 3], [2, 3]]) {
      const state = pairStates[remainder % pairStates.length];
      remainder = Math.floor(remainder / pairStates.length);
      if (state === "must" || state === "both") mustLinkPairs.push(pair);
      if (state === "cannot" || state === "both") cannotLinkPairs.push(pair);
    }
    const options = { mustLinkPairs, cannotLinkPairs };
    const built = buildCommunityConstraintRelaxationProgram(options);
    const reference = referenceMinimumRelaxations(allThreeNodePartitions, built.constraints);
    if (reference === null) continue;

    const primary = await (await getRunner()).run(
      `${facts.facts}\n${buildMaximumModularityProgram(options)}\n`,
      getStructuralSolverOptions("communities")
    );
    assert.equal(primary.Result, "UNSATISFIABLE", `config=${JSON.stringify(options)}`);
    const result = await (await getRunner()).run(
      `${facts.facts}\n${built.program}\n`,
      getStructuralSolverOptions("communities", true)
    );
    assert.equal(result.Result, "OPTIMUM FOUND", `diagnosi=${JSON.stringify(options)}`);
    const actual = parseCommunityConstraintDiagnosisResult(result, reverseIndex, built.constraints, { requireAllOptima: true })
      .map((diagnosis) => JSON.stringify(diagnosis.relaxedConstraints.map((constraint) => constraint.id).sort((a, b) => a - b)))
      .sort();
    assert.deepEqual(actual, reference, `diagnosi=${JSON.stringify(options)}`);
  }
});

test("parser rifiuta risposte non ottime e CSV conserva vincoli, nodi e partizione", async () => {
  const built = buildCommunityConstraintRelaxationProgram({ mustLinkPairs: [[1, 2]], cannotLinkPairs: [[1, 2]] });
  const result = await (await getRunner()).run(
    `${facts.facts}\n${built.program}\n`,
    getStructuralSolverOptions("communities", true)
  );
  const diagnoses = parseCommunityConstraintDiagnosisResult(result, reverseIndex, built.constraints);
  assert.throws(() => parseCommunityConstraintDiagnosisResult({ ...result, Result: "SATISFIABLE" }, reverseIndex, built.constraints), /non ha provato/);
  assert.throws(() => parseCommunityConstraintDiagnosisResult({ ...result, Result: "TIMEOUT" }, reverseIndex, built.constraints), /non ha provato/);
  assert.throws(() => parseCommunityConstraintDiagnosisResult({
    ...result,
    Models: { ...result.Models, More: "yes" }
  }, reverseIndex, built.constraints, { requireAllOptima: true }), /non è completa/);

  const csv = buildCommunityConstraintDiagnosisCsv({
    diagnoses,
    sourceIdByNodeId: { a: "=source-a", b: "source-b", c: "source-c" },
    nodeLabels: { a: "Alpha", b: "Beta", c: "Gamma" },
    selectedGroup: "Tutti i nodi"
  });
  assert.match(csv, /=source-a/);
  assert.match(csv, /mustLink|cannotLink/);
  assert.match(csv, /"Tutti i nodi"/);
  assert.match(csv, /"feasible_partition_json"/);
  assert.match(csv, /"minimum_relaxation_cost"/);
  assert.match(csv, /relaxed_constraint_count/);
  assert.match(csv, /"Alpha"/);
});

test("il builder rifiuta costi di diagnosi non positivi, non sicuri e totali non rappresentabili", () => {
  assert.throws(() => buildCommunityConstraintRelaxationProgram({ diagnosisCosts: { mustLink: 0 } }), /intero positivo sicuro/);
  assert.throws(() => buildCommunityConstraintRelaxationProgram({ diagnosisCosts: { cannotLink: Number.MAX_SAFE_INTEGER + 1 } }), /intero positivo sicuro/);
  assert.throws(() => buildCommunityConstraintRelaxationProgram({
    minCount: 1,
    maxCount: 2,
    diagnosisCosts: {
      minimumCommunityCount: Number.MAX_SAFE_INTEGER,
      maximumCommunityCount: Number.MAX_SAFE_INTEGER
    }
  }), /dominio intero sicuro/);
});
