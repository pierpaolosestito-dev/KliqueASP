import assert from "node:assert/strict";
import dataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import graphConfig from "../src/lib/kliqueasp/config/graph.config.json" with { type: "json" };
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildKCoreMembershipCompletionCounterfactualProgram,
  buildKCoreMembershipCompletionWhyNotProgram,
  buildKCoreCompletionCounterfactualProgram,
  buildKCoreCompletionWhyNotProgram,
  buildKPlexCompletionCounterfactualProgram,
  buildKPlexCompletionWhyNotProgram,
  getStructuralCounterfactualSolverOptions,
  getKCoreMembershipCounterfactualSolverOptions,
  parseKCoreMembershipCompletionCounterfactuals,
  parseKCoreMembershipCompletionWhyNot,
  solveKCoreMembershipCompletionWhyNotByRounds,
  parseKCoreCompletionCounterfactuals,
  parseKCoreCompletionWhyNot,
  parseKPlexCompletionWhyNot,
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

function referenceWhyNot(s, edgeMask, candidateMask, candidateEdgeIds = candidates
  .filter((_, index) => (candidateMask & (1 << index)) !== 0)
  .map((candidate) => candidate.id)) {
  const unfillablePairs = pairs.filter((_, index) =>
    (edgeMask & (1 << index)) === 0 && (candidateMask & (1 << index)) === 0
  );
  const blockers = nodes.flatMap((node) => {
    const unfillableMissingNeighborIds = unfillablePairs.flatMap(([source, target]) =>
      source === node ? [`n-${target}`] : target === node ? [`n-${source}`] : []
    );
    return unfillableMissingNeighborIds.length >= s
      ? [{ nodeId: `n-${node}`, unfillableMissingNeighborIds: unfillableMissingNeighborIds.sort() }]
      : [];
  });
  return {
    targetS: s,
    cohortNodeIds: nodes.map((node) => `n-${node}`),
    candidateEdgeIds,
    unfillableMissingPairs: unfillablePairs.map(([source, target]) => [`n-${source}`, `n-${target}`]),
    blockers
  };
}

function referenceCompletionExists(s, edgeMask, candidateMask) {
  for (let additionMask = 0; additionMask < 1 << pairs.length; additionMask += 1) {
    if ((additionMask & ~candidateMask) !== 0) continue;
    const valid = nodes.every((node) => {
      let missing = 0;
      pairs.forEach(([source, target], index) => {
        if (source !== node && target !== node) return;
        if (((edgeMask | additionMask) & (1 << index)) === 0) missing += 1;
      });
      return missing < s;
    });
    if (valid) return true;
  }
  return false;
}

test("il certificato why-not del k-plex coincide con la definizione su tutti i grafi e domini candidati a quattro nodi", () => {
  for (let edgeMask = 0; edgeMask < 1 << pairs.length; edgeMask += 1) {
    for (let candidateMask = 0; candidateMask < 1 << pairs.length; candidateMask += 1) {
      for (let s = 1; s <= 3; s += 1) {
        const certificate = referenceWhyNot(s, edgeMask, candidateMask);
        assert.equal(certificate.blockers.length > 0,
          !referenceCompletionExists(s, edgeMask, candidateMask),
          `caratterizzazione why-not mask=${edgeMask}, candidates=${candidateMask}, s=${s}`);
      }
    }
  }
});

test("clingo produce un certificato why-not completo e indipendentemente verificato", async () => {
  const runner = await createClingoWasmRunner();
  const nodeIdByIndex = new Map(nodes.map((node) => [node, `n-${node}`]));
  const cases = [
    { edgeMask: 0, candidateMask: 0, s: 1 },
    { edgeMask: 1, candidateMask: 0b000010, s: 2 },
    { edgeMask: 0b001001, candidateMask: 0b010010, s: 1, reversedDuplicate: true },
    { edgeMask: 0b101101, candidateMask: 0b000010, s: 1 }
  ];
  for (const { edgeMask, candidateMask, s, reversedDuplicate } of cases) {
    const candidatesForGraph = candidates.filter((_, index) => (candidateMask & (1 << index)) !== 0);
    if (reversedDuplicate) {
      const candidate = candidatesForGraph[0];
      candidatesForGraph.push({
        ...candidate,
        id: `${candidate.id}-reverse`,
        sourceNodeId: candidate.targetNodeId,
        targetNodeId: candidate.sourceNodeId,
        sourceNode: candidate.targetNode,
        targetNode: candidate.sourceNode,
        recordIndex: 999
      });
    }
    const completion = buildKPlexCompletionCounterfactualProgram(s, nodes, candidatesForGraph);
    const completionResult = await runner.run(`${graphFacts(edgeMask)}\n${completion.program}`);
    assert.equal(completionResult.Result, "UNSATISFIABLE", `completamento mask=${edgeMask}, s=${s}`);

    const diagnostic = buildKPlexCompletionWhyNotProgram(s, nodes, candidatesForGraph);
    const diagnosticResult = await runner.run(`${graphFacts(edgeMask)}\n${diagnostic.program}`);
    assert.equal(diagnosticResult.Result, "SATISFIABLE", `diagnostica mask=${edgeMask}, s=${s}`);
    assert.equal(diagnosticResult.Models?.More, "no", "il witness deterministico deve essere completo");
    const observedEdges = pairs.flatMap(([sourceNode, targetNode], index) =>
      (edgeMask & (1 << index)) !== 0
        ? [{ sourceNode, targetNode }, { sourceNode: targetNode, targetNode: sourceNode }]
        : []
    );
    const certificate = parseKPlexCompletionWhyNot(
      diagnosticResult.Call?.[0]?.Witnesses,
      s,
      nodes,
      observedEdges,
      diagnostic.candidates,
      nodeIdByIndex
    );
    const firstWitness = diagnosticResult.Call?.[0]?.Witnesses?.[0];
    if (edgeMask === cases[0].edgeMask && s === cases[0].s) {
      const damagedWitnesses = [{
        ...firstWitness,
        Value: firstWitness.Value.filter((atom) => !atom.startsWith("cf_plex_diag_unfillable_pair("))
      }];
      assert.throws(() => parseKPlexCompletionWhyNot(
        damagedWitnesses,
        s,
        nodes,
        observedEdges,
        diagnostic.candidates,
        nodeIdByIndex
      ), /non elenca esattamente tutte le coppie mancanti non completabili/);
    }
    assert.deepEqual(certificate, referenceWhyNot(
      s,
      edgeMask,
      candidateMask,
      candidatesForGraph.map((candidate) => candidate.id)
    ));
  }
});

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

function referenceKCoreWhyNot(k, edgeMask, candidateMask, candidateEdgeIds = candidates
  .filter((_, index) => (candidateMask & (1 << index)) !== 0)
  .map((candidate) => candidate.id)) {
  const currentNeighbors = new Map(nodes.map((node) => [node, new Set()]));
  const maximumNeighbors = new Map(nodes.map((node) => [node, new Set()]));
  pairs.forEach(([source, target], index) => {
    if ((edgeMask & (1 << index)) === 0) return;
    currentNeighbors.get(source).add(target);
    currentNeighbors.get(target).add(source);
    maximumNeighbors.get(source).add(target);
    maximumNeighbors.get(target).add(source);
  });
  pairs.forEach(([source, target], index) => {
    if ((candidateMask & (1 << index)) === 0) return;
    maximumNeighbors.get(source).add(target);
    maximumNeighbors.get(target).add(source);
  });
  return {
    targetK: k,
    cohortNodeIds: nodes.map((node) => `n-${node}`),
    candidateEdgeIds,
    blockers: nodes.flatMap((node) => {
      const current = currentNeighbors.get(node);
      const maximum = maximumNeighbors.get(node);
      return maximum.size < k
        ? [{
            nodeId: `n-${node}`,
            currentNeighborIds: [...current].sort((left, right) => left - right).map((neighbor) => `n-${neighbor}`),
            additionalCandidateNeighborIds: [...maximum].filter((neighbor) => !current.has(neighbor))
              .sort((left, right) => left - right).map((neighbor) => `n-${neighbor}`),
            maximumAchievableDegree: maximum.size
          }]
        : [];
    })
  };
}

test("la caratterizzazione why-not k-core coincide con la fattibilita su tutte le topologie e i domini candidati", () => {
  for (let edgeMask = 0; edgeMask < 1 << pairs.length; edgeMask += 1) {
    for (let candidateMask = 0; candidateMask < 1 << pairs.length; candidateMask += 1) {
      for (let k = 0; k <= 4; k += 1) {
        const certificate = referenceKCoreWhyNot(k, edgeMask, candidateMask);
        const candidateRestrictedCompletionExists = (() => {
          for (let additionMask = 0; additionMask < 1 << pairs.length; additionMask += 1) {
            if ((additionMask & ~candidateMask) !== 0) continue;
            const degrees = new Map(nodes.map((node) => [node, 0]));
            pairs.forEach(([source, target], index) => {
              if (((edgeMask | additionMask) & (1 << index)) === 0) return;
              degrees.set(source, degrees.get(source) + 1);
              degrees.set(target, degrees.get(target) + 1);
            });
            if ([...degrees.values()].every((degree) => degree >= k)) return true;
          }
          return false;
        })();
        assert.equal(certificate.blockers.length > 0, !candidateRestrictedCompletionExists,
          `caratterizzazione why-not mask=${edgeMask}, candidates=${candidateMask}, k=${k}`);
      }
    }
  }
});

test("clingo certifica e il parser verifica i blocker del completamento k-core", async () => {
  const runner = await createClingoWasmRunner();
  const nodeIdByIndex = new Map(nodes.map((node) => [node, `n-${node}`]));
  const cases = [
    { edgeMask: 0, candidateMask: 0, k: 1 },
    { edgeMask: 1, candidateMask: 0b000010, k: 2 },
    { edgeMask: 0b001001, candidateMask: 0b010010, k: 2, reversedDuplicate: true },
    { edgeMask: 0b101101, candidateMask: 0, k: 3 }
  ];
  for (const { edgeMask, candidateMask, k, reversedDuplicate } of cases) {
    const candidatesForGraph = candidates.filter((_, index) => (candidateMask & (1 << index)) !== 0);
    if (reversedDuplicate) {
      const candidate = candidatesForGraph[0];
      candidatesForGraph.push({
        ...candidate,
        id: `${candidate.id}-reverse`,
        sourceNodeId: candidate.targetNodeId,
        targetNodeId: candidate.sourceNodeId,
        sourceNode: candidate.targetNode,
        targetNode: candidate.sourceNode,
        recordIndex: 999
      });
    }
    const completion = buildKCoreCompletionCounterfactualProgram(k, nodes, candidatesForGraph);
    const completionResult = await runner.run(`${graphFacts(edgeMask)}\n${completion.program}`);
    assert.equal(completionResult.Result, "UNSATISFIABLE", `completamento mask=${edgeMask}, k=${k}`);

    const diagnostic = buildKCoreCompletionWhyNotProgram(k, nodes, candidatesForGraph);
    const diagnosticResult = await runner.run(`${graphFacts(edgeMask)}\n${diagnostic.program}`);
    assert.equal(diagnosticResult.Result, "SATISFIABLE", `diagnostica mask=${edgeMask}, k=${k}`);
    assert.equal(diagnosticResult.Models?.More, "no", "il witness deterministico deve essere completo");
    const observedEdges = pairs.flatMap(([sourceNode, targetNode], index) =>
      (edgeMask & (1 << index)) !== 0
        ? [{ sourceNode, targetNode }, { sourceNode: targetNode, targetNode: sourceNode }]
        : []
    );
    const certificate = parseKCoreCompletionWhyNot(
      diagnosticResult.Call?.[0]?.Witnesses,
      k,
      nodes,
      observedEdges,
      diagnostic.candidates,
      nodeIdByIndex
    );
    assert.deepEqual(certificate, referenceKCoreWhyNot(
      k,
      edgeMask,
      candidateMask,
      candidatesForGraph.map((candidate) => candidate.id)
    ));
    if (edgeMask === cases[0].edgeMask && k === cases[0].k) {
      const witness = diagnosticResult.Call?.[0]?.Witnesses?.[0];
      const damagedWitnesses = [{
        ...witness,
        Value: witness.Value.filter((atom) => !atom.startsWith("cf_core_diag_maximum_degree("))
      }];
      assert.throws(() => parseKCoreCompletionWhyNot(
        damagedWitnesses,
        k,
        nodes,
        observedEdges,
        diagnostic.candidates,
        nodeIdByIndex
      ), /gradi non coerenti/);
    }
  }
});

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

function referenceKCoreMembershipPeeling(k, edgeMask, candidateMask) {
  const neighbors = new Map(nodes.map((node) => [node, new Set()]));
  pairs.forEach(([source, target], index) => {
    if (((edgeMask | candidateMask) & (1 << index)) === 0) return;
    neighbors.get(source).add(target);
    neighbors.get(target).add(source);
  });
  const active = new Set(nodes);
  const peeling = [];
  for (let round = 1; round <= nodes.length; round += 1) {
    const wave = [...active].filter((node) =>
      [...neighbors.get(node)].filter((neighbor) => active.has(neighbor)).length < k
    ).sort((left, right) => left - right);
    if (wave.length === 0) break;
    for (const node of wave) {
      peeling.push({
        nodeId: `n-${node}`,
        round,
        survivingNeighborIds: [...neighbors.get(node)].filter((neighbor) => active.has(neighbor))
          .sort((left, right) => left - right).map((neighbor) => `n-${neighbor}`)
      });
    }
    for (const node of wave) active.delete(node);
  }
  return { active, peeling };
}

function referenceMembershipExists(k, edgeMask, candidateMask, target) {
  for (let additionMask = 0; additionMask < 1 << pairs.length; additionMask += 1) {
    if ((additionMask & ~candidateMask) !== 0) continue;
    if (referenceKCoreMembershipPeeling(k, edgeMask, additionMask).active.has(target)) return true;
  }
  return false;
}

test("il peeling del grafo con tutti i candidati caratterizza esattamente l'UNSAT di membership", () => {
  for (let edgeMask = 0; edgeMask < 1 << pairs.length; edgeMask += 1) {
    for (let candidateMask = 0; candidateMask < 1 << pairs.length; candidateMask += 1) {
      for (let k = 0; k <= 3; k += 1) {
        const fullGraphPeeling = referenceKCoreMembershipPeeling(k, edgeMask, candidateMask);
        for (const target of nodes) {
          assert.equal(fullGraphPeeling.active.has(target),
            referenceMembershipExists(k, edgeMask, candidateMask, target),
            `monotonia per tutti i candidati mask=${edgeMask}, candidates=${candidateMask}, target=${target}, k=${k}`);
        }
      }
    }
  }
});

test("clingo produce un certificato why-not completo per l'appartenenza controfattuale al k-core", async () => {
  const runner = await createClingoWasmRunner();
  const nodeIdByIndex = new Map(nodes.map((node) => [node, `n-${node}`]));
  const cases = [
    { edgeMask: 0, candidateMask: 0, target: 1, k: 1 },
    { edgeMask: 0b001001, candidateMask: 0, target: 2, k: 2 },
    { edgeMask: 0b100001, candidateMask: 0b000010, target: 1, k: 2, reversedDuplicate: true },
    { edgeMask: 0b001001, candidateMask: 0, target: 4, k: 2 }
  ];
  for (const { edgeMask, candidateMask, target, k, reversedDuplicate } of cases) {
    const candidatesForGraph = candidates.filter((_, index) => (candidateMask & (1 << index)) !== 0);
    if (reversedDuplicate) {
      const candidate = candidatesForGraph[0];
      candidatesForGraph.push({
        ...candidate,
        id: `${candidate.id}-reverse`,
        sourceNodeId: candidate.targetNodeId,
        targetNodeId: candidate.sourceNodeId,
        sourceNode: candidate.targetNode,
        targetNode: candidate.sourceNode,
        recordIndex: 999
      });
    }
    const completion = buildKCoreMembershipCompletionCounterfactualProgram(k, target, nodes, candidatesForGraph);
    const completionResult = await runner.run(`${graphFacts(edgeMask)}\n${completion.program}`);
    assert.equal(completionResult.Result, "UNSATISFIABLE", `membership mask=${edgeMask}, target=${target}, k=${k}`);

    const diagnostic = buildKCoreMembershipCompletionWhyNotProgram(k, target, nodes, candidatesForGraph);
    const diagnosticResult = await runner.run(`${graphFacts(edgeMask)}\n${diagnostic.program}`);
    assert.equal(diagnosticResult.Result, "SATISFIABLE", `diagnostica mask=${edgeMask}, target=${target}, k=${k}`);
    assert.equal(diagnosticResult.Models?.More, "no", "il peeling deterministico deve essere completo");
    const observedEdges = pairs.flatMap(([sourceNode, targetNode], index) =>
      (edgeMask & (1 << index)) !== 0
        ? [{ sourceNode, targetNode }, { sourceNode: targetNode, targetNode: sourceNode }]
        : []
    );
    const certificate = parseKCoreMembershipCompletionWhyNot(
      diagnosticResult.Call?.[0]?.Witnesses,
      k,
      target,
      nodes,
      observedEdges,
      diagnostic.candidates,
      nodeIdByIndex
    );
    let roundQueryCount = 0;
    const iterativeCertificate = await solveKCoreMembershipCompletionWhyNotByRounds(
      k,
      target,
      nodes,
      observedEdges,
      diagnostic.candidates,
      nodeIdByIndex,
      async (program) => {
        roundQueryCount += 1;
        return runner.run(program);
      }
    );
    assert.ok(roundQueryCount >= 1, "il certificato scalabile deve usare query ASP per round");
    assert.deepEqual(iterativeCertificate, certificate, "il peeling ASP per round deve coincidere col certificato monolitico");
    assert.deepEqual(certificate, {
      targetK: k,
      targetNodeId: `n-${target}`,
      candidateNodeIds: nodes.map((node) => `n-${node}`),
      candidateEdgeIds: candidatesForGraph.map((candidate) => candidate.id),
      peelingScope: "full",
      peeling: referenceKCoreMembershipPeeling(k, edgeMask, candidateMask).peeling
    });
    if (edgeMask === cases[0].edgeMask && target === cases[0].target) {
      const witness = diagnosticResult.Call?.[0]?.Witnesses?.[0];
      const damagedWitnesses = [{
        ...witness,
        Value: witness.Value.filter((atom) => !atom.startsWith("cf_kcm_diag_peeled_at("))
      }];
      assert.throws(() => parseKCoreMembershipCompletionWhyNot(
        damagedWitnesses,
        k,
        target,
        nodes,
        observedEdges,
        diagnostic.candidates,
        nodeIdByIndex
      ), /intera sequenza indipendente di peeling/);
    }
  }
});

test("il why-not k-core puo fermarsi al round che elimina il target", async () => {
  const runner = await createClingoWasmRunner();
  let roundQueryCount = 0;
  const certificate = await solveKCoreMembershipCompletionWhyNotByRounds(
    2,
    2,
    [1, 2, 3, 4],
    [
      { sourceNode: 1, targetNode: 2 },
      { sourceNode: 2, targetNode: 3 },
      { sourceNode: 3, targetNode: 4 }
    ],
    [],
    new Map([[1, "a"], [2, "b"], [3, "c"], [4, "d"]]),
    async (program) => {
      roundQueryCount += 1;
      return runner.run(program);
    },
    { stopAfterTargetRemoval: true, maxRoundsPerQuery: 4 }
  );

  assert.equal(roundQueryCount, 1, "un batch certifica entrambi i round necessari e si arresta al target");
  assert.equal(certificate.peelingScope, "target_prefix");
  assert.deepEqual(certificate.peeling, [
    { nodeId: "a", round: 1, survivingNeighborIds: ["b"] },
    { nodeId: "d", round: 1, survivingNeighborIds: ["c"] },
    { nodeId: "b", round: 2, survivingNeighborIds: ["c"] },
    { nodeId: "c", round: 2, survivingNeighborIds: ["b"] }
  ]);
});

test("il why-not k-core conserva i round profondi del target nel prefisso ASP", async () => {
  const runner = await createClingoWasmRunner();
  const candidateNodeIndices = Array.from({ length: 12 }, (_, index) => index + 1);
  const observedEdges = [
    { sourceNode: 1, targetNode: 2 },
    { sourceNode: 2, targetNode: 3 },
    { sourceNode: 1, targetNode: 3 }
  ];
  for (let node = 3; node < 12; node += 1) {
    observedEdges.push({ sourceNode: node, targetNode: node + 1 });
  }
  const candidate = {
    id: "benchmark-chord",
    sourceNodeId: "n1",
    targetNodeId: "n5",
    sourceNode: 1,
    targetNode: 5,
    edgeType: "benchmark-only",
    cost: 1,
    recordIndex: 1
  };
  let roundQueryCount = 0;
  const certificate = await solveKCoreMembershipCompletionWhyNotByRounds(
    2,
    6,
    candidateNodeIndices,
    observedEdges,
    [candidate],
    new Map(candidateNodeIndices.map((node) => [node, `n${node}`])),
    async (program) => {
      roundQueryCount += 1;
      return runner.run(program);
    },
    { stopAfterTargetRemoval: true, maxRoundsPerQuery: 3 }
  );

  assert.equal(certificate.peelingScope, "target_prefix");
  assert.equal(roundQueryCount, 3, "tre batch da tre round coprono i sette round necessari");
  assert.equal(certificate.peeling.length, 7);
  assert.deepEqual(certificate.peeling.find((step) => step.nodeId === "n6"), {
    nodeId: "n6",
    round: 7,
    survivingNeighborIds: ["n5"]
  });

  let fullRoundQueryCount = 0;
  const fullCertificate = await solveKCoreMembershipCompletionWhyNotByRounds(
    2,
    6,
    candidateNodeIndices,
    observedEdges,
    [candidate],
    new Map(candidateNodeIndices.map((node) => [node, `n${node}`])),
    async (program) => {
      fullRoundQueryCount += 1;
      return runner.run(program);
    },
    { maxRoundsPerQuery: 3 }
  );
  assert.equal(fullCertificate.peelingScope, "full");
  assert.equal(fullRoundQueryCount, 3);
  assert.deepEqual(fullCertificate.peeling, certificate.peeling);
});

test("il peeling ASP a batch rifiuta round successivi a un punto fisso", async () => {
  await assert.rejects(() => solveKCoreMembershipCompletionWhyNotByRounds(
    1,
    1,
    [1, 2, 3, 4],
    [],
    [],
    new Map([[1, "a"], [2, "b"]]),
    async () => ({
      Result: "SATISFIABLE",
      Models: { More: "no" },
      Call: [{ Witnesses: [{ Value: [
        "cf_kcm_diag_peeled_at(1,1)",
        "cf_kcm_diag_peeled_at(2,1)",
        "cf_kcm_diag_peeled_at(2,3)"
      ] }] }]
    }),
    { maxRoundsPerQuery: 3 }
  ), /riprende il peeling dopo un round senza eliminazioni/);
});

test("il batching adattivo usa batch ampi solo per peeling seriali", async () => {
  const runner = await createClingoWasmRunner();
  const serialNodes = Array.from({ length: 12 }, (_, index) => index + 1);
  const serialEdges = [
    { sourceNode: 1, targetNode: 2 },
    { sourceNode: 2, targetNode: 3 },
    { sourceNode: 1, targetNode: 3 }
  ];
  for (let node = 3; node < 12; node += 1) {
    serialEdges.push({ sourceNode: node, targetNode: node + 1 });
  }
  const serialCandidate = {
    id: "serial-cycle-chord",
    sourceNodeId: "n1",
    targetNodeId: "n5",
    sourceNode: 1,
    targetNode: 5,
    edgeType: "benchmark-only",
    cost: 1,
    recordIndex: 1
  };
  let serialQueryCount = 0;
  const serialCertificate = await solveKCoreMembershipCompletionWhyNotByRounds(
    2,
    6,
    serialNodes,
    serialEdges,
    [serialCandidate],
    new Map(serialNodes.map((node) => [node, `n${node}`])),
    async (program) => {
      serialQueryCount += 1;
      return runner.run(program);
    },
    { stopAfterTargetRemoval: true, maxRoundsPerQuery: 4, adaptiveBatching: true }
  );
  assert.equal(serialCertificate.peeling.find((step) => step.nodeId === "n6")?.round, 7);
  assert.equal(serialQueryCount, 2, "il prefisso seriale conserva il batch da quattro round");

  const treeNodeCount = 15;
  const treeNodes = Array.from({ length: treeNodeCount + 3 }, (_, index) => index + 1);
  const treeEdges = [
    { sourceNode: 1, targetNode: 2 },
    { sourceNode: 2, targetNode: 3 },
    { sourceNode: 1, targetNode: 3 },
    { sourceNode: 3, targetNode: 4 }
  ];
  for (let treeIndex = 1; treeIndex < treeNodeCount; treeIndex += 1) {
    const parentTreeIndex = Math.floor((treeIndex - 1) / 2);
    treeEdges.push({ sourceNode: parentTreeIndex + 4, targetNode: treeIndex + 4 });
  }
  const treeCandidate = {
    id: "branching-cycle-chord",
    sourceNodeId: "n1",
    targetNodeId: "n11",
    sourceNode: 1,
    targetNode: 11,
    edgeType: "benchmark-only",
    cost: 1,
    recordIndex: 1
  };
  let branchingQueryCount = 0;
  const branchingCertificate = await solveKCoreMembershipCompletionWhyNotByRounds(
    2,
    6,
    treeNodes,
    treeEdges,
    [treeCandidate],
    new Map(treeNodes.map((node) => [node, `n${node}`])),
    async (program) => {
      branchingQueryCount += 1;
      return runner.run(program);
    },
    { stopAfterTargetRemoval: true, maxRoundsPerQuery: 4, adaptiveBatching: true }
  );
  assert.equal(branchingCertificate.peeling.find((step) => step.nodeId === "n6")?.round, 3);
  assert.equal(branchingQueryCount, 3, "i round con peeling parallelo disattivano il batch");
});

test("il why-not k-core per round mantiene basso il grounding sul grafo psicologico", async () => {
  const normalized = normalizeGraphData(dataset, graphConfig);
  const timelineStart = Number(graphConfig.timeline.start);
  const timelineEnd = Number(graphConfig.timeline.end);
  const nodesInProjection = normalized.nodes.filter((node) => {
    const timeline = graphConfig.nodeTypes?.[node.type]?.timeline;
    if (!timeline) return true;
    const from = Number(node.data?.[timeline.startField] ?? 0);
    const to = Number(node.data?.[timeline.endField] ?? 9999);
    return from <= timelineEnd && to >= timelineStart;
  });
  const nodeIds = new Set(nodesInProjection.map((node) => node.id));
  const linksInProjection = normalized.links.filter((link) =>
    nodeIds.has(link.source) && nodeIds.has(link.target)
  );
  assert.equal(nodesInProjection.length, 335);
  assert.equal(linksInProjection.length, 989);

  const graph = { ...normalized, nodes: nodesInProjection, links: linksInProjection };
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const indexByNodeId = new Map(Object.entries(reverseIndex).map(([index, id]) => [id, Number(index)]));
  const nodeIdByIndex = new Map(Object.entries(reverseIndex).map(([index, id]) => [Number(index), id]));
  const candidateNodeIndices = nodesInProjection.map((node) => indexByNodeId.get(node.id));
  const neighbors = new Map(nodesInProjection.map((node) => [node.id, new Set()]));
  for (const link of linksInProjection) {
    neighbors.get(link.source)?.add(link.target);
    neighbors.get(link.target)?.add(link.source);
  }
  const target = [...nodesInProjection].sort((left, right) =>
    neighbors.get(left.id).size - neighbors.get(right.id).size
  )[0];
  const targetDegree = neighbors.get(target.id).size;
  const candidateTarget = nodesInProjection.find((node) =>
    node.id !== target.id && !neighbors.get(target.id).has(node.id)
  );
  assert.ok(candidateTarget, "la fixture richiede almeno una coppia non osservata");
  const targetNodeIndex = indexByNodeId.get(target.id);
  const candidateTargetIndex = indexByNodeId.get(candidateTarget.id);
  const k = targetDegree + 2;
  const candidatesForGraph = [{
    id: "benchmark-only-addition",
    sourceNodeId: target.id,
    targetNodeId: candidateTarget.id,
    sourceNode: targetNodeIndex,
    targetNode: candidateTargetIndex,
    edgeType: "benchmark-only",
    cost: 1,
    recordIndex: 1
  }];
  const primary = buildKCoreMembershipCompletionCounterfactualProgram(
    k,
    targetNodeIndex,
    candidateNodeIndices,
    candidatesForGraph
  );
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const primaryResult = await runner.run(`${facts}\n${primary.program}`, ["--time-limit=25"]);
  assert.equal(primaryResult.Result, "UNSATISFIABLE");

  const observedEdges = linksInProjection.map((link) => ({
    sourceNode: indexByNodeId.get(link.source),
    targetNode: indexByNodeId.get(link.target)
  }));
  const roundMetrics = [];
  const certificate = await solveKCoreMembershipCompletionWhyNotByRounds(
    k,
    targetNodeIndex,
    candidateNodeIndices,
    observedEdges,
    candidatesForGraph,
    nodeIdByIndex,
    async (program) => {
      const result = await runner.run(program, ["--stats=2", "--time-limit=25"]);
      roundMetrics.push({
        atoms: result.Stats?.LP?.Atoms,
        finalRules: result.Stats?.LP?.Rules?.Final
      });
      return result;
    },
    { stopAfterTargetRemoval: true, maxRoundsPerQuery: 4 }
  );
  assert.equal(certificate.targetNodeId, target.id);
  assert.ok(certificate.peeling.some((step) => step.nodeId === target.id));
  assert.equal(roundMetrics.length, 1, "sul target di grado minimo basta certificare il primo round di peeling");
  assert.equal(certificate.peelingScope, "target_prefix");
  assert.ok(Math.max(...roundMetrics.map(({ finalRules }) => finalRules ?? 0)) < 20_000,
    "il grounding per round non deve ricrescere all'ordine del milione di regole monolitiche");
  assert.ok(runner.getWasmLinearMemoryStats().peakBytes <= 64 * 1024 * 1024,
    "il certificato per round deve restare sotto il budget WASM osservato per il worker clingo");
});

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
