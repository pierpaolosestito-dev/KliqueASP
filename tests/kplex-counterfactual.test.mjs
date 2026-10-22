import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKCoreMembershipCompletionCounterfactualProgram,
  buildKCoreCompletionCounterfactualProgram,
  buildKPlexCompletionCounterfactualProgram,
  getStructuralCounterfactualSolverOptions,
  getKCoreMembershipCounterfactualSolverOptions,
  parseKCoreMembershipCompletionCounterfactuals,
  parseKCoreCompletionCounterfactuals,
  parseKPlexCompletionCounterfactuals,
  validateKPlexCompletionCandidates
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("the structural counterfactual runner proves one or all minimum-cost proposals", () => {
  assert.deepEqual(getStructuralCounterfactualSolverOptions(), ["--opt-mode=opt"]);
  assert.deepEqual(getStructuralCounterfactualSolverOptions(true), ["--opt-mode=optN"]);
});

const nodes = [1, 2, 3, 4];
const pairs = nodes.flatMap((source, index) => nodes.slice(index + 1).map((target) => [source, target]));
const candidates = pairs.map(([source, target], index) => ({
  id: `hyp-${source}-${target}`,
  sourceNodeId: `n-${source}`,
  targetNodeId: `n-${target}`,
  sourceNode: source,
  targetNode: target,
  edgeType: "contact",
  cost: index + 1,
  recordIndex: index + 101
}));

function graphFacts(edgeMask) {
  const facts = nodes.map((node) => `node(${node}).`);
  pairs.forEach(([source, target], index) => {
    if ((edgeMask & (1 << index)) !== 0) {
      facts.push(`edge(${source},${target}).`, `edge(${target},${source}).`);
    }
  });
  return facts.join("\n");
}

function referenceMinimum(s, edgeMask) {
  let minimum = Number.POSITIVE_INFINITY;
  const solutions = [];
  for (let additionMask = 0; additionMask < 1 << pairs.length; additionMask += 1) {
    let feasible = true;
    for (const node of nodes) {
      let missing = 0;
      pairs.forEach(([source, target], index) => {
        if (source !== node && target !== node) return;
        if ((edgeMask & (1 << index)) === 0 && (additionMask & (1 << index)) === 0) missing += 1;
      });
      if (missing >= s) feasible = false;
    }
    if (!feasible) continue;
    const cost = candidates.reduce((sum, candidate, index) =>
      sum + ((additionMask & (1 << index)) === 0 ? 0 : candidate.cost), 0);
    if (cost < minimum) {
      minimum = cost;
      solutions.length = 0;
    }
    if (cost === minimum) {
      solutions.push(candidates.filter((_, index) => (additionMask & (1 << index)) !== 0).map((candidate) => candidate.id).sort());
    }
  }
  return Number.isFinite(minimum) ? { minimum, solutions } : null;
}

function referenceMinimumKCore(k, edgeMask) {
  let minimum = Number.POSITIVE_INFINITY;
  const solutions = [];
  for (let additionMask = 0; additionMask < 1 << pairs.length; additionMask += 1) {
    const degrees = new Map(nodes.map((node) => [node, 0]));
    pairs.forEach(([source, target], index) => {
      if (((edgeMask | additionMask) & (1 << index)) === 0) return;
      degrees.set(source, degrees.get(source) + 1);
      degrees.set(target, degrees.get(target) + 1);
    });
    if ([...degrees.values()].some((degree) => degree < k)) continue;
    const cost = candidates.reduce((sum, candidate, index) =>
      sum + ((additionMask & (1 << index)) === 0 ? 0 : candidate.cost), 0);
    if (cost < minimum) {
      minimum = cost;
      solutions.length = 0;
    }
    if (cost === minimum) {
      solutions.push(candidates.filter((_, index) => (additionMask & (1 << index)) !== 0).map((candidate) => candidate.id).sort());
    }
  }
  return Number.isFinite(minimum) ? { minimum, solutions } : null;
}

function referenceMinimumKCoreMembership(k, edgeMask, target) {
  const candidatePairs = pairs.filter((_, index) => (edgeMask & (1 << index)) === 0);
  let minimum = Number.POSITIVE_INFINITY;
  const solutions = [];
  for (let additionMask = 0; additionMask < 1 << candidatePairs.length; additionMask += 1) {
    const activeEdges = pairs.filter((_, index) => (edgeMask & (1 << index)) !== 0);
    const addedEdges = candidatePairs.filter((_, index) => (additionMask & (1 << index)) !== 0);
    const allEdges = [...activeEdges, ...addedEdges];
    const active = new Set(nodes);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of [...active]) {
        const degree = allEdges.filter(([source, target]) =>
          (source === node && active.has(target)) || (target === node && active.has(source))
        ).length;
        if (degree < k) {
          active.delete(node);
          changed = true;
        }
      }
    }
    if (!active.has(target)) continue;
    const cost = addedEdges.reduce((sum, [source, target]) => {
      const pairIndex = pairs.findIndex(([a, b]) => a === source && b === target);
      return sum + candidates[pairIndex].cost;
    }, 0);
    if (cost < minimum) {
      minimum = cost;
      solutions.length = 0;
    }
    if (cost === minimum) {
      solutions.push(addedEdges.map(([source, target]) => {
        const pairIndex = pairs.findIndex(([a, b]) => a === source && b === target);
        return candidates[pairIndex].id;
      }).sort());
    }
  }
  return Number.isFinite(minimum) ? { minimum, solutions } : null;
}

test("il completamento ASP del k-plex minimizza archi candidati su tutte le topologie a quattro nodi", async () => {
  const runner = await createClingoWasmRunner();
  for (let edgeMask = 0; edgeMask < 1 << pairs.length; edgeMask += 1) {
    for (let s = 1; s <= 3; s += 1) {
      const expected = referenceMinimum(s, edgeMask);
      const compiled = buildKPlexCompletionCounterfactualProgram(s, nodes, candidates);
      const result = await runner.run(`${graphFacts(edgeMask)}\n${compiled.program}`, ["--opt-mode=optN"]);
      if (!expected) {
        assert.equal(result.Result, "UNSATISFIABLE", `mask=${edgeMask}, s=${s}`);
        continue;
      }
      assert.equal(result.Result, "OPTIMUM FOUND", `mask=${edgeMask}, s=${s}`);
      const proposals = parseKPlexCompletionCounterfactuals(result.Call?.[0]?.Witnesses, compiled.candidates);
      assert.equal(proposals.length, expected.solutions.length, `numero soluzioni mask=${edgeMask}, s=${s}`);
      assert.deepEqual(proposals.map((proposal) => proposal.totalCost), Array(proposals.length).fill(expected.minimum));
      assert.deepEqual(
        proposals.map((proposal) => proposal.addedEdges.map((edge) => edge.id).sort()).sort((a, b) => a.join("|").localeCompare(b.join("|"))),
        expected.solutions.sort((a, b) => a.join("|").localeCompare(b.join("|"))),
        `ottimi mask=${edgeMask}, s=${s}`
      );
    }
  }
});

test("il completamento ASP del k-core minimizza archi candidati su tutte le topologie a quattro nodi", async () => {
  const runner = await createClingoWasmRunner();
  for (let edgeMask = 0; edgeMask < 1 << pairs.length; edgeMask += 1) {
    for (let k = 1; k <= 3; k += 1) {
      const expected = referenceMinimumKCore(k, edgeMask);
      const compiled = buildKCoreCompletionCounterfactualProgram(k, nodes, candidates);
      const result = await runner.run(`${graphFacts(edgeMask)}\n${compiled.program}`, ["--opt-mode=optN"]);
      if (!expected) {
        assert.equal(result.Result, "UNSATISFIABLE", `mask=${edgeMask}, k=${k}`);
        continue;
      }
      assert.equal(result.Result, "OPTIMUM FOUND", `mask=${edgeMask}, k=${k}`);
      const proposals = parseKCoreCompletionCounterfactuals(result.Call?.[0]?.Witnesses, compiled.candidates);
      assert.equal(proposals.length, expected.solutions.length, `numero soluzioni mask=${edgeMask}, k=${k}`);
      assert.deepEqual(proposals.map((proposal) => proposal.totalCost), Array(proposals.length).fill(expected.minimum));
      assert.deepEqual(
        proposals.map((proposal) => proposal.addedEdges.map((edge) => edge.id).sort()).sort((a, b) => a.join("|").localeCompare(b.join("|"))),
        expected.solutions.sort((a, b) => a.join("|").localeCompare(b.join("|"))),
        `ottimi mask=${edgeMask}, k=${k}`
      );
    }
  }
});

test("il controfattuale di membership k-core minimizza le aggiunte e restituisce un certificato per tutte le topologie", async () => {
  const runner = await createClingoWasmRunner();
  const candidateNodeIndices = nodes;
  const nodeIdByIndex = new Map(nodes.map((node) => [node, `n-${node}`]));
  for (let edgeMask = 0; edgeMask < 1 << pairs.length; edgeMask += 1) {
    const candidatesForGraph = candidates.filter((_, index) => (edgeMask & (1 << index)) === 0);
    for (const target of [nodes[0], nodes[3]]) {
      for (let k = 0; k <= 3; k += 1) {
        const expected = referenceMinimumKCoreMembership(k, edgeMask, target);
        const compiled = buildKCoreMembershipCompletionCounterfactualProgram(
          k,
          target,
          candidateNodeIndices,
          candidatesForGraph
        );
        const result = await runner.run(
          `${graphFacts(edgeMask)}\n${compiled.program}`,
          getKCoreMembershipCounterfactualSolverOptions(true)
        );
        if (!expected) {
          assert.equal(result.Result, "UNSATISFIABLE", `mask=${edgeMask}, target=${target}, k=${k}`);
          continue;
        }
        const emptyCandidateOptimum = compiled.candidates.length === 0 && result.Result === "SATISFIABLE";
        assert.ok(result.Result === "OPTIMUM FOUND" || emptyCandidateOptimum,
          `mask=${edgeMask}, target=${target}, k=${k}, status=${result.Result}`);
        const proposals = parseKCoreMembershipCompletionCounterfactuals(
          result.Call?.[0]?.Witnesses,
          compiled.candidates,
          nodeIdByIndex,
          `n-${target}`
        );
        assert.equal(proposals.length, expected.solutions.length,
          `numero set di aggiunte ottime mask=${edgeMask}, target=${target}, k=${k}: ${JSON.stringify({ proposals, expected })}`);
        assert.deepEqual(proposals.map(({ totalCost }) => totalCost),
          Array(proposals.length).fill(expected.minimum));
        assert.deepEqual(
          proposals.map((proposal) => proposal.addedEdges.map((edge) => edge.id).sort())
            .sort((left, right) => left.join("|").localeCompare(right.join("|"))),
          expected.solutions.sort((left, right) => left.join("|").localeCompare(right.join("|"))),
          `aggiunte ottime mask=${edgeMask}, target=${target}, k=${k}`
        );
        for (const proposal of proposals) {
          const witnessNodeIds = new Set(proposal.coreWitnessNodeIds);
          assert.ok(witnessNodeIds.has(`n-${target}`), "il certificato include il nodo obiettivo");
          const witnessEdges = [
            ...pairs.filter((_, index) => (edgeMask & (1 << index)) !== 0)
              .map(([sourceNodeId, targetNodeId]) => ({ sourceNodeId: `n-${sourceNodeId}`, targetNodeId: `n-${targetNodeId}` })),
            ...proposal.addedEdges
          ];
          for (const nodeId of witnessNodeIds) {
            const degree = witnessEdges.filter((edge) =>
              (edge.sourceNodeId === nodeId && witnessNodeIds.has(edge.targetNodeId)) ||
              (edge.targetNodeId === nodeId && witnessNodeIds.has(edge.sourceNodeId))
            ).length;
            assert.ok(degree >= k, `il witness ${nodeId} ha grado ${degree}, target k=${k}`);
          }
        }
      }
    }
  }
});

test("la validazione del controfattuale rifiuta costi, ID e indici non verificabili", () => {
  assert.equal(validateKPlexCompletionCandidates(candidates).length, pairs.length);
  assert.throws(() => validateKPlexCompletionCandidates({}), /deve essere un array/);
  assert.throws(() => validateKPlexCompletionCandidates([{ ...candidates[0], cost: 0 }]), /intero positivo sicuro/);
  assert.throws(() => validateKPlexCompletionCandidates([{ ...candidates[0], recordIndex: 0 }]), /indice ASP positivo/);
  assert.throws(() => validateKPlexCompletionCandidates([{ ...candidates[0], id: " " }]), /stringa non vuota/);
  assert.throws(() => validateKPlexCompletionCandidates([candidates[0], { ...candidates[1], id: candidates[0].id }]), /ID duplicato/);
  assert.throws(() => validateKPlexCompletionCandidates([
    { ...candidates[0], cost: Number.MAX_SAFE_INTEGER },
    { ...candidates[1], cost: 1 }
  ]), /somma dei costi/);
  assert.throws(() => buildKPlexCompletionCounterfactualProgram(0, nodes, candidates), /s deve essere/);
  assert.throws(() => buildKPlexCompletionCounterfactualProgram(1, [1, 2], [candidates[1]]), /cohort selezionato/);
  assert.throws(() => buildKCoreMembershipCompletionCounterfactualProgram(2, 1, [2, 3, 4], candidates), /nodo obiettivo.*dominio candidato/);
  assert.throws(() => buildKCoreMembershipCompletionCounterfactualProgram(2, 1, [1, 2], [candidates[5]]), /nodi del dominio candidato/);
});

test("un dominio senza archi candidati distingue il completamento vuoto dall'infeasibilità", async () => {
  const runner = await createClingoWasmRunner();
  const program = buildKPlexCompletionCounterfactualProgram(1, [1, 2], []);
  const alreadyClique = await runner.run("node(1..2). edge(1,2). edge(2,1).\n" + program.program);
  const missingTie = await runner.run("node(1..2).\n" + program.program);
  assert.equal(alreadyClique.Result, "SATISFIABLE", JSON.stringify(alreadyClique));
  assert.deepEqual(parseKPlexCompletionCounterfactuals(alreadyClique.Call?.[0]?.Witnesses, []), [{ totalCost: 0, addedEdges: [] }]);
  assert.equal(missingTie.Result, "UNSATISFIABLE", JSON.stringify(missingTie));
});

test("il parser restituisce solo soluzioni minime e distingue gli archi ipotetici per ID", () => {
  const [first, second] = candidates;
  const witnesses = [
    { Value: [`cf_add_edge(${first.recordIndex})`], Costs: [first.cost] },
    { Value: [`cf_add_edge(${second.recordIndex})`], Costs: [second.cost] },
    { Value: [], Costs: [0] },
    { Value: [`cf_add_edge(${first.recordIndex})`] }
  ];
  assert.deepEqual(parseKPlexCompletionCounterfactuals(witnesses, [first, second]), [{ totalCost: 0, addedEdges: [] }]);
});
