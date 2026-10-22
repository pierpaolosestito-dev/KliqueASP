import assert from "node:assert/strict";
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildTypedMotifProgram,
  buildTypedMotifNearMatchProgram,
  buildTypedMotifTemporalNearMatchProgram,
  buildTypedMotifCompletionCounterfactualProgram,
  parseTypedMotifMatches,
  parseTypedMotifNearMatches,
  parseTypedMotifCompletionCounterfactuals
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const config = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.label", typeField: "$.kind" },
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      typeField: "$.kind",
      direction: "undirected",
      identity: "multigraph"
    }
  }
};

const sharedPlaceMotif = {
  id: "shared-place",
  label: "Due persone associate allo stesso luogo",
  roles: {
    personA: { nodeTypes: ["person"] },
    personB: { nodeTypes: ["person"] },
    place: { nodeTypes: ["place"] }
  },
  edges: [
    { sourceRole: "personA", targetRole: "place", edgeType: "person-place" },
    { sourceRole: "personB", targetRole: "place", edgeType: "person-place" }
  ],
  symmetricRoles: [["personA", "personB"]]
};

test("i motivi tipizzati ASP usano ruoli/config e restituiscono archi testimoni con ID sorgente", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place-1", label: "Istituto X", kind: "place" },
      { id: "place-2", label: "Istituto Y", kind: "place" }
    ],
    edges: [
      { id: "a-x", from: "p-1", to: "place-1", kind: "person-place" },
      { id: "b-x", from: "p-2", to: "place-1", kind: "person-place" },
      { id: "a-y", from: "p-1", to: "place-2", kind: "person-place" },
      { id: "b-y", from: "p-2", to: "place-2", kind: "person-place" }
    ]
  }, config);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifProgram(sharedPlaceMotif, graph.direction);
  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${facts.facts}\n${compiled.program}`);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );

  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map((match) => match.roles.place.sourceId).sort(), ["place-1", "place-2"]);
  for (const match of matches) {
    assert.deepEqual(
      [match.roles.personA.sourceId, match.roles.personB.sourceId].sort(),
      ["p-1", "p-2"]
    );
    assert.deepEqual(match.supportingEdges.map((pattern) => pattern.edgeIds[0]).sort(),
      match.roles.place.sourceId === "place-1" ? ["a-x", "b-x"] : ["a-y", "b-y"]);
  }
});

test("ogni testimone positivo dei motivi è sufficiente e completo su tutti i 64 grafi del fixture bipartito", async () => {
  const people = ["p-1", "p-2", "p-3"];
  const places = ["l-1", "l-2"];
  const nodes = [
    ...people.map((id) => ({ id, label: id, kind: "person" })),
    ...places.map((id) => ({ id, label: id, kind: "place" }))
  ];
  const possibleEdges = people.flatMap((person) => places.map((place) => ({ person, place })));
  const runner = await createClingoWasmRunner();

  for (let mask = 0; mask < 2 ** possibleEdges.length; mask += 1) {
    const edges = possibleEdges.flatMap((edge, index) => (mask & (1 << index)) === 0 ? [] : [{
      id: `e-${edge.person}-${edge.place}`,
      from: edge.person,
      to: edge.place,
      kind: "person-place"
    }]);
    const graph = normalizeGraphData({ nodes, edges }, config);
    const facts = buildAspFactsFromGraph(graph);
    const compiled = buildTypedMotifProgram(sharedPlaceMotif, graph.direction);
    assert.equal(compiled.nearMatch, false);
    assert.doesNotMatch(compiled.program, /motif_role_unassigned|motif_edge_missing|#minimize/);
    const result = await runner.run(`${facts.facts}\n${compiled.program}`);
    const matches = parseTypedMotifMatches(
      result.Call?.[0]?.Witnesses,
      compiled,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      facts.reverseEdgeIndex
    );

    const expected = new Map();
    for (const place of places) {
      for (let first = 0; first < people.length; first += 1) {
        for (let second = first + 1; second < people.length; second += 1) {
          const pair = [people[first], people[second]];
          const witnessIds = pair.map((person) => `e-${person}-${place}`);
          if (witnessIds.every((id) => edges.some((edge) => edge.id === id))) {
            expected.set(`${place}|${pair.join("|")}`, { place, pair, witnessIds });
          }
        }
      }
    }

    assert.equal(matches.length, expected.size, `maschera archi ${mask}`);
    assert.equal(result.Result, expected.size ? "SATISFIABLE" : "UNSATISFIABLE", `maschera archi ${mask}`);
    for (const match of matches) {
      const place = match.roles.place.sourceId;
      const pair = [match.roles.personA.sourceId, match.roles.personB.sourceId].sort();
      assert.equal(new Set([...pair, place]).size, 3, `ruoli distinti, maschera ${mask}`);
      assert.ok(places.includes(place), `dominio del ruolo place, maschera ${mask}`);
      assert.ok(pair.every((person) => people.includes(person)), `dominio dei ruoli person, maschera ${mask}`);

      const key = `${place}|${pair.join("|")}`;
      const expectedMatch = expected.get(key);
      assert.ok(expectedMatch, `assegnamento supportato, maschera ${mask}: ${key}`);
      assert.deepEqual(
        match.supportingEdges.map((support) => support.edgeIds).flat().sort(),
        [...expectedMatch.witnessIds].sort(),
        `ogni relazione del template ha record testimoni esatti, maschera ${mask}`
      );
      expected.delete(key);
    }
    assert.equal(expected.size, 0, `nessun assegnamento valido omesso, maschera ${mask}`);

    if (matches.length === 0) {
      const nearMatchProgram = buildTypedMotifNearMatchProgram(sharedPlaceMotif, graph.direction);
      assert.equal(nearMatchProgram.nearMatch, true);
      const nearResult = await runner.run(`${facts.facts}\n${nearMatchProgram.program}`, ["--opt-mode=opt"]);
      assert.equal(nearResult.Result, "OPTIMUM FOUND", `diagnostica near-match, maschera ${mask}`);
      const nearMatches = parseTypedMotifNearMatches(
        nearResult.Call?.[0]?.Witnesses,
        nearMatchProgram,
        facts.reverseIndex,
        facts.reverseSourceIndex,
        facts.reverseEdgeIndex
      );
      assert.ok(nearMatches.length > 0, `testimone near-match, maschera ${mask}`);

      let bestAssignedRoleCount = -1;
      let bestMissingPatternCount = Number.POSITIVE_INFINITY;
      const assignmentChoices = [people, people, places].map((domain) => [undefined, ...domain]);
      for (const personA of assignmentChoices[0]) {
        for (const personB of assignmentChoices[1]) {
          for (const place of assignmentChoices[2]) {
            const assigned = [personA, personB, place].filter(Boolean);
            if (new Set(assigned).size !== assigned.length) continue;
            const assignedRoleCount = assigned.length;
            const roleByName = { personA, personB, place };
            const missingPatternCount = sharedPlaceMotif.edges.filter((pattern) => {
              const source = roleByName[pattern.sourceRole];
              const target = roleByName[pattern.targetRole];
              return source && target && !edges.some((edge) =>
                edge.kind === pattern.edgeType &&
                ((edge.from === source && edge.to === target) || (edge.from === target && edge.to === source))
              );
            }).length;
            if (assignedRoleCount > bestAssignedRoleCount ||
              (assignedRoleCount === bestAssignedRoleCount && missingPatternCount < bestMissingPatternCount)) {
              bestAssignedRoleCount = assignedRoleCount;
              bestMissingPatternCount = missingPatternCount;
            }
          }
        }
      }

      for (const nearMatch of nearMatches) {
        assert.equal(Object.keys(nearMatch.roles).length, bestAssignedRoleCount, `massimo riempimento ruoli, maschera ${mask}`);
        assert.equal(nearMatch.missingPatterns.length, bestMissingPatternCount, `minimo di relazioni mancanti, maschera ${mask}`);
        assert.equal(nearMatch.missingRoles.length, 3 - bestAssignedRoleCount, `ruoli mancanti, maschera ${mask}`);
        const expectedUnresolved = sharedPlaceMotif.edges.filter((pattern) =>
          !nearMatch.roles[pattern.sourceRole] || !nearMatch.roles[pattern.targetRole]
        ).length;
        assert.equal(nearMatch.unresolvedPatterns.length, expectedUnresolved, `relazioni non valutabili, maschera ${mask}`);
        for (const support of nearMatch.supportingEdges) {
          const source = nearMatch.roles[support.sourceRole]?.sourceId;
          const target = nearMatch.roles[support.targetRole]?.sourceId;
          const expectedEdgeIds = source && target
            ? edges.filter((edge) => edge.kind === support.edgeType &&
                ((edge.from === source && edge.to === target) || (edge.from === target && edge.to === source)))
              .map((edge) => edge.id)
              .sort()
            : [];
          assert.deepEqual(support.edgeIds, expectedEdgeIds, `record a supporto del near-match, maschera ${mask}`);
        }
      }
    }
  }
});

test("i motivi statici con assenze esplicite coincidono con l'enumeratore indotto su tutti i grafi semplici a tre nodi", async () => {
  const nodes = ["a", "b", "c"].map((id) => ({ id, label: id, kind: "person" }));
  const possibleEdges = [["a", "b"], ["a", "c"], ["b", "c"]];
  const pathWithoutShortcut = {
    id: "path-without-shortcut",
    roles: {
      left: { nodeTypes: ["person"] },
      center: { nodeTypes: ["person"] },
      right: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "left", targetRole: "center", edgeType: "knows" },
      { sourceRole: "center", targetRole: "right", edgeType: "knows" }
    ],
    absentEdges: [{ sourceRole: "left", targetRole: "right", edgeType: "knows" }],
    closedWorld: true,
    symmetricRoles: [["left", "right"]]
  };
  const runner = await createClingoWasmRunner();
  const order = new Map(nodes.map((node, index) => [node.id, index]));

  for (let mask = 0; mask < 2 ** possibleEdges.length; mask += 1) {
    const edges = possibleEdges.flatMap(([from, to], index) => (mask & (1 << index)) === 0 ? [] : [{
      id: `e-${from}-${to}`,
      from,
      to,
      kind: "knows"
    }]);
    const graph = normalizeGraphData({ nodes, edges }, config);
    const facts = buildAspFactsFromGraph(graph);
    const compiled = buildTypedMotifProgram(pathWithoutShortcut, graph.direction);
    const result = await runner.run(`${facts.facts}\n${compiled.program}`);
    const actual = parseTypedMotifMatches(
      result.Call?.[0]?.Witnesses,
      compiled,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      facts.reverseEdgeIndex
    ).map((match) => [
      match.roles.left.sourceId,
      match.roles.center.sourceId,
      match.roles.right.sourceId
    ]).sort((left, right) => left.join("|").localeCompare(right.join("|")));

    const present = new Set(edges.map((edge) => [edge.from, edge.to].sort().join("|")));
    const expected = [];
    for (const left of ["a", "b", "c"]) {
      for (const center of ["a", "b", "c"]) {
        for (const right of ["a", "b", "c"]) {
          if (new Set([left, center, right]).size !== 3 || order.get(left) > order.get(right)) continue;
          if (!present.has([left, center].sort().join("|")) || !present.has([center, right].sort().join("|"))) continue;
          if (present.has([left, right].sort().join("|"))) continue;
          expected.push([left, center, right]);
        }
      }
    }
    expected.sort((left, right) => left.join("|").localeCompare(right.join("|")));
    assert.equal(result.Result === "SATISFIABLE", expected.length > 0, `mask ${mask}`);
    assert.deepEqual(actual, expected, `mask ${mask}`);
    for (const witness of result.Call?.[0]?.Witnesses ?? []) {
      const parsed = parseTypedMotifMatches([witness], compiled, facts.reverseIndex, facts.reverseSourceIndex, facts.reverseEdgeIndex)[0];
      assert.deepEqual(parsed.absenceConditions, pathWithoutShortcut.absentEdges, `certificato assenza, maschera ${mask}`);
    }
  }
});

test("inducedEdgeTypes genera il complemento tipizzato e coincide con l'oracolo su tutti i grafi semplici a tre nodi", async () => {
  const nodes = ["a", "b", "c"].map((id) => ({ id, label: id, kind: "person" }));
  const possibleEdges = [["a", "b"], ["a", "c"], ["b", "c"]];
  const inducedPath = {
    id: "induced-path",
    roles: {
      left: { nodeTypes: ["person"] },
      center: { nodeTypes: ["person"] },
      right: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "left", targetRole: "center", edgeType: "knows" },
      { sourceRole: "center", targetRole: "right", edgeType: "knows" }
    ],
    inducedEdgeTypes: ["knows"],
    closedWorld: true,
    symmetricRoles: [["left", "right"]]
  };
  const runner = await createClingoWasmRunner();
  const order = new Map(nodes.map((node, index) => [node.id, index]));

  for (let mask = 0; mask < 2 ** possibleEdges.length; mask += 1) {
    const edges = possibleEdges.flatMap(([from, to], index) => (mask & (1 << index)) === 0 ? [] : [{
      id: `e-${from}-${to}`,
      from,
      to,
      kind: "knows"
    }]);
    const graph = normalizeGraphData({ nodes, edges }, config);
    const facts = buildAspFactsFromGraph(graph);
    const compiled = buildTypedMotifProgram(inducedPath, graph.direction);
    const result = await runner.run(`${facts.facts}\n${compiled.program}`);
    const actual = parseTypedMotifMatches(
      result.Call?.[0]?.Witnesses,
      compiled,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      facts.reverseEdgeIndex
    ).map((match) => [
      match.roles.left.sourceId,
      match.roles.center.sourceId,
      match.roles.right.sourceId
    ]).sort((left, right) => left.join("|").localeCompare(right.join("|")));

    const present = new Set(edges.map((edge) => [edge.from, edge.to].sort().join("|")));
    const expected = [];
    for (const left of ["a", "b", "c"]) {
      for (const center of ["a", "b", "c"]) {
        for (const right of ["a", "b", "c"]) {
          if (new Set([left, center, right]).size !== 3 || order.get(left) > order.get(right)) continue;
          if (!present.has([left, center].sort().join("|")) || !present.has([center, right].sort().join("|"))) continue;
          if (present.has([left, right].sort().join("|"))) continue;
          expected.push([left, center, right]);
        }
      }
    }
    expected.sort((left, right) => left.join("|").localeCompare(right.join("|")));
    assert.equal(result.Result === "SATISFIABLE", expected.length > 0, `mask ${mask}`);
    assert.deepEqual(actual, expected, `mask ${mask}`);
    for (const witness of result.Call?.[0]?.Witnesses ?? []) {
      const parsed = parseTypedMotifMatches([witness], compiled, facts.reverseIndex, facts.reverseSourceIndex, facts.reverseEdgeIndex)[0];
      assert.deepEqual(parsed.inducedEdgeTypes, ["knows"], `vocabolario indotto, maschera ${mask}`);
      assert.ok(parsed.absenceConditions?.some((condition) => condition.sourceRole === "left" && condition.targetRole === "right"));
    }
  }
});

test("inducedEdgeTypes rispetta orientamento, tipi fuori vocabolario e cappi", async () => {
  const directedConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: { ...config.graphMapping.edge, direction: "directed" }
    }
  };
  const motif = {
    id: "directed-induced-pair",
    roles: {
      source: { nodeTypes: ["person"] },
      target: { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "source", targetRole: "target", edgeType: "knows" }],
    inducedEdgeTypes: ["knows"],
    closedWorld: true
  };
  const nodes = [
    { id: "a", label: "A", kind: "person" },
    { id: "b", label: "B", kind: "person" }
  ];
  const runGraph = async (edges) => {
    const graph = normalizeGraphData({ nodes, edges }, directedConfig);
    const facts = buildAspFactsFromGraph(graph);
    const compiled = buildTypedMotifProgram(motif, graph.direction);
    const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);
    return { result, compiled, facts };
  };

  const scopedOutReverse = await runGraph([
    { id: "ab", from: "a", to: "b", kind: "knows" },
    { id: "ba-advises", from: "b", to: "a", kind: "advises" }
  ]);
  assert.equal(scopedOutReverse.result.Result, "SATISFIABLE");
  const scopedMatches = parseTypedMotifMatches(
    scopedOutReverse.result.Call?.[0]?.Witnesses,
    scopedOutReverse.compiled,
    scopedOutReverse.facts.reverseIndex,
    scopedOutReverse.facts.reverseSourceIndex,
    scopedOutReverse.facts.reverseEdgeIndex
  );
  assert.ok(scopedMatches.some((match) => match.roles.source.sourceId === "a" && match.roles.target.sourceId === "b"));

  const forbiddenReverse = await runGraph([
    { id: "ab", from: "a", to: "b", kind: "knows" },
    { id: "ba", from: "b", to: "a", kind: "knows" }
  ]);
  assert.equal(forbiddenReverse.result.Result, "UNSATISFIABLE");
  const nearProgram = buildTypedMotifNearMatchProgram(motif, "directed");
  const nearResult = await (await createClingoWasmRunner()).run(
    `${forbiddenReverse.facts.facts}\n${nearProgram.program}`,
    ["--opt-mode=opt"]
  );
  const nearMatches = parseTypedMotifNearMatches(
    nearResult.Call?.[0]?.Witnesses,
    nearProgram,
    forbiddenReverse.facts.reverseIndex,
    forbiddenReverse.facts.reverseSourceIndex,
    forbiddenReverse.facts.reverseEdgeIndex
  );
  const aToBWhyNot = nearMatches.find((match) =>
    match.roles.source?.sourceId === "a" && match.roles.target?.sourceId === "b"
  );
  assert.ok(aToBWhyNot);
  assert.deepEqual(aToBWhyNot.violatedAbsencePatterns.map((pattern) => pattern.edgeIds), [["ba"]]);

  const forbiddenLoop = await runGraph([
    { id: "ab", from: "a", to: "b", kind: "knows" },
    { id: "aa", from: "a", to: "a", kind: "knows" }
  ]);
  assert.equal(forbiddenLoop.result.Result, "UNSATISFIABLE");
});

test("inducedEdgeTypes richiede ambito chiuso statico e tipi univoci validi", () => {
  const roles = {
    left: { nodeTypes: ["person"] },
    right: { nodeTypes: ["person"] }
  };
  const edges = [{ sourceRole: "left", targetRole: "right", edgeType: "knows" }];
  assert.throws(() => buildTypedMotifProgram({ id: "implicit", roles, edges, inducedEdgeTypes: ["knows"] }, "undirected"), /closedWorld: true/);
  assert.throws(() => buildTypedMotifProgram({ id: "empty", roles, edges, inducedEdgeTypes: [], closedWorld: true }, "undirected"), /array non vuoto/);
  assert.throws(() => buildTypedMotifProgram({ id: "duplicate", roles, edges, inducedEdgeTypes: ["knows", " knows "], closedWorld: true }, "undirected"), /duplicati/);
  assert.throws(() => buildTypedMotifProgram({
    id: "temporal", roles, edges, inducedEdgeTypes: ["knows"], closedWorld: true,
    temporal: { semantics: "coValid" }
  }, "undirected"), /template temporali/);
});

test("le assenze dei motivi diretti rispettano il verso e il why-not mostra relazioni proibite", async () => {
  const directedConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: { ...config.graphMapping.edge, direction: "directed" }
    }
  };
  const nodes = ["a", "b", "c"].map((id) => ({ id, label: id, kind: "person" }));
  const motif = {
    id: "directed-open-triad",
    roles: {
      source: { nodeTypes: ["person"] },
      middle: { nodeTypes: ["person"] },
      target: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "source", targetRole: "middle", edgeType: "knows" },
      { sourceRole: "middle", targetRole: "target", edgeType: "knows" }
    ],
    absentEdges: [{ sourceRole: "source", targetRole: "target", edgeType: "knows" }],
    closedWorld: true
  };
  const graph = normalizeGraphData({
    nodes,
    edges: [
      { id: "ab", from: "a", to: "b", kind: "knows" },
      { id: "bc", from: "b", to: "c", kind: "knows" },
      { id: "ca", from: "c", to: "a", kind: "knows" }
    ]
  }, directedConfig);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifProgram(motif, graph.direction);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);
  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(matches.some((match) =>
    match.roles.source.sourceId === "a" && match.roles.middle.sourceId === "b" && match.roles.target.sourceId === "c"
  ), "l'arco inverso c→a non deve violare l'assenza richiesta a→c");

  const nearTemplate = {
    ...pathWithoutShortcutForNearMatch(),
    id: "forbidden-triangle"
  };
  const triangle = normalizeGraphData({
    nodes,
    edges: [
      { id: "ab", from: "a", to: "b", kind: "knows" },
      { id: "ac", from: "a", to: "c", kind: "knows" },
      { id: "bc", from: "b", to: "c", kind: "knows" }
    ]
  }, config);
  const triangleFacts = buildAspFactsFromGraph(triangle);
  const nearProgram = buildTypedMotifNearMatchProgram(nearTemplate, triangle.direction);
  const nearResult = await (await createClingoWasmRunner()).run(
    `${triangleFacts.facts}\n${nearProgram.program}`,
    ["--opt-mode=opt"]
  );
  const nearMatches = parseTypedMotifNearMatches(
    nearResult.Call?.[0]?.Witnesses,
    nearProgram,
    triangleFacts.reverseIndex,
    triangleFacts.reverseSourceIndex,
    triangleFacts.reverseEdgeIndex
  );
  assert.equal(nearResult.Result, "OPTIMUM FOUND");
  assert.ok(nearMatches.length > 0);
  assert.ok(nearMatches.every((match) => match.missingPatterns.length === 0));
  assert.ok(nearMatches.every((match) => match.violatedAbsencePatterns.length === 1));
  assert.ok(nearMatches.every((match) => match.violatedAbsencePatterns[0].edgeIds.length === 1));
  for (const match of nearMatches) {
    const expectedForbiddenEdgeId = [match.roles.left.sourceId, match.roles.right.sourceId].sort().join("");
    assert.deepEqual(match.violatedAbsencePatterns[0].edgeIds, [expectedForbiddenEdgeId]);
  }
});

test("i template con assenze rifiutano ipotesi implicite, conflitti, simmetrie false e tempo non definito", () => {
  const roles = {
    left: { nodeTypes: ["person"] },
    center: { nodeTypes: ["person"] },
    right: { nodeTypes: ["person"] }
  };
  const edges = [
    { sourceRole: "left", targetRole: "center", edgeType: "knows" },
    { sourceRole: "center", targetRole: "right", edgeType: "knows" }
  ];
  const absentEdges = [{ sourceRole: "left", targetRole: "right", edgeType: "knows" }];
  assert.throws(() => buildTypedMotifProgram({ id: "implicit", roles, edges, absentEdges }, "undirected"), /closedWorld: true/);
  assert.throws(() => buildTypedMotifProgram({ id: "empty", roles, edges, closedWorld: true }, "undirected"), /richiede almeno una relazione/);
  assert.throws(() => buildTypedMotifProgram({
    id: "unknown-role", roles, edges, closedWorld: true,
    absentEdges: [{ sourceRole: "left", targetRole: "missing", edgeType: "knows" }]
  }, "undirected"), /ruolo non dichiarato/);
  assert.throws(() => buildTypedMotifProgram({
    id: "conflict", roles, edges, closedWorld: true,
    absentEdges: [{ sourceRole: "left", targetRole: "center", edgeType: "knows" }]
  }, "undirected"), /presente e assente/);
  assert.throws(() => buildTypedMotifProgram({
    id: "temporal", roles, edges, closedWorld: true, absentEdges,
    temporal: { semantics: "coValid" }
  }, "undirected"), /template temporali/);
  assert.throws(() => buildTypedMotifProgram({
    id: "false-symmetry",
    roles: { left: roles.left, right: roles.center, third: roles.right },
    edges: [{ sourceRole: "left", targetRole: "third", edgeType: "knows" }],
    absentEdges: [{ sourceRole: "right", targetRole: "third", edgeType: "knows" }],
    closedWorld: true,
    symmetricRoles: [["left", "right"]]
  }, "directed"), /non sono simmetrici/);
});

test("il controfattuale di completamento non seleziona archi che violano l'induzione tipizzata", async () => {
  const directedConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: { ...config.graphMapping.edge, direction: "directed" }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "s", label: "S", kind: "source" },
      { id: "m", label: "M", kind: "middle" },
      { id: "t", label: "T", kind: "target" }
    ],
    edges: [{ id: "observed-sm", from: "s", to: "m", kind: "knows" }]
  }, directedConfig);
  const motif = {
    id: "safe-completion",
    roles: {
      source: { nodeTypes: ["source"] },
      middle: { nodeTypes: ["middle"] },
      target: { nodeTypes: ["target"] }
    },
    edges: [
      { sourceRole: "source", targetRole: "middle", edgeType: "knows" },
      { sourceRole: "middle", targetRole: "target", edgeType: "knows" }
    ],
    inducedEdgeTypes: ["knows"],
    closedWorld: true
  };
  const facts = buildAspFactsFromGraph(graph);
  const aspIndexBySourceId = Object.fromEntries(Object.entries(facts.reverseSourceIndex).map(([index, sourceId]) => [sourceId, Number(index)]));
  const compiled = buildTypedMotifCompletionCounterfactualProgram(motif, graph.direction, "", [
    { id: "candidate-mt", sourceNodeId: "m", targetNodeId: "t", sourceNode: aspIndexBySourceId.m, targetNode: aspIndexBySourceId.t, edgeType: "knows", cost: 2, recordIndex: 2 },
    { id: "candidate-st", sourceNodeId: "s", targetNodeId: "t", sourceNode: aspIndexBySourceId.s, targetNode: aspIndexBySourceId.t, edgeType: "knows", cost: 1, recordIndex: 3 }
  ]);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  const proposals = parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.equal(result.Result, "OPTIMUM FOUND");
  assert.equal(proposals.length, 1);
  assert.deepEqual(proposals[0].addedEdges.map((edge) => edge.id), ["candidate-mt"]);
  assert.deepEqual(proposals[0].match.inducedEdgeTypes, ["knows"]);
  assert.ok(proposals[0].match.absenceConditions.some((condition) =>
    condition.sourceRole === "source" && condition.targetRole === "target" && condition.edgeType === "knows"
  ));
});

function pathWithoutShortcutForNearMatch() {
  return {
    roles: {
      left: { nodeTypes: ["person"] },
      center: { nodeTypes: ["person"] },
      right: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "left", targetRole: "center", edgeType: "knows" },
      { sourceRole: "center", targetRole: "right", edgeType: "knows" }
    ],
    absentEdges: [{ sourceRole: "left", targetRole: "right", edgeType: "knows" }],
    closedWorld: true,
    symmetricRoles: [["left", "right"]]
  };
}

test("i motivi diretti rispettano verso degli archi e rifiutano template incoerenti", async () => {
  const directedConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: { ...config.graphMapping.edge, direction: "directed" }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", label: "A", kind: "person" },
      { id: "b", label: "B", kind: "person" }
    ],
    edges: [{ id: "a-to-b", from: "a", to: "b", kind: "follows" }]
  }, directedConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = {
    id: "follows",
    roles: {
      follower: { nodeTypes: ["person"] },
      followed: { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "follower", targetRole: "followed", edgeType: "follows" }]
  };
  const compiled = buildTypedMotifProgram(template, graph.direction);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);
  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.equal(result.Result, "SATISFIABLE");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].roles.follower.sourceId, "a");
  assert.equal(matches[0].roles.followed.sourceId, "b");

  assert.throws(() => buildTypedMotifProgram({
    ...sharedPlaceMotif,
    symmetricRoles: [["personA", "place"]]
  }, "undirected"), /stessi tipi di nodo/);

  assert.throws(() => buildTypedMotifProgram({
    ...sharedPlaceMotif,
    edges: [{ sourceRole: "personA", targetRole: "place", edgeType: "person-place" }]
  }, "undirected"), /non sono simmetrici nella struttura/);

  assert.throws(() => buildTypedMotifProgram({
    ...sharedPlaceMotif,
    symmetricRoles: [],
    edges: [
      { sourceRole: "personA", targetRole: "place", edgeType: "person-place" },
      { sourceRole: "place", targetRole: "personA", edgeType: "person-place" }
    ]
  }, "undirected"), /relazioni duplicate/);

  assert.throws(() => buildTypedMotifProgram({
    id: "duplicate-normalized-role",
    roles: {
      person: { nodeTypes: ["person"] },
      " person ": { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "person", targetRole: " person ", edgeType: "knows" }]
  }, "directed"), /nomi duplicati dopo la normalizzazione/);
});

test("il why-not dei motivi distingue il ruolo senza candidato dalle relazioni non valutabili", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "p", label: "P", kind: "person" },
      { id: "place", label: "Place", kind: "place" }
    ],
    edges: [{ id: "p-place", from: "p", to: "place", kind: "person-place" }]
  }, config);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifNearMatchProgram(sharedPlaceMotif, graph.direction);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error);
  const [nearMatch] = parseTypedMotifNearMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(nearMatch);
  assert.equal(Object.keys(nearMatch.roles).length, 2);
  assert.deepEqual(nearMatch.missingRoles, ["personB"], "ruoli simmetrici parziali usano un prefisso canonico");
  assert.equal(nearMatch.missingPatterns.length, 0);
  assert.equal(nearMatch.unresolvedPatterns.length, 1);
  assert.equal(nearMatch.supportingEdges.filter((edge) => edge.edgeIds.length > 0).length, 1);
});

test("i motivi temporali richiedono intervalli co-validi e restituiscono il primo istante comune", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place-x", label: "Istituto X", kind: "place" },
      { id: "place-y", label: "Istituto Y", kind: "place" }
    ],
    edges: [
      { id: "a-x-1", from: "p-1", to: "place-x", kind: "person-place", fromYear: 2000, toYear: 2003 },
      { id: "a-x-2", from: "p-1", to: "place-x", kind: "person-place", fromYear: 2001, toYear: 2004 },
      { id: "b-x", from: "p-2", to: "place-x", kind: "person-place", fromYear: 2003, toYear: 2008 },
      { id: "a-y", from: "p-1", to: "place-y", kind: "person-place", fromYear: 2000, toYear: 2001 },
      { id: "b-y", from: "p-2", to: "place-y", kind: "person-place", fromYear: 2002, toYear: 2005 }
    ]
  }, temporalConfig);
  assert.equal(graph.capabilities.edgeIntervals.available, true);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifProgram({
    ...sharedPlaceMotif,
    temporal: { semantics: "coValid" }
  }, graph.direction);
  assert.equal(compiled.temporal, true);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].roles.place.sourceId, "place-x");
  assert.equal(matches[0].timeValue, 2003);
  assert.deepEqual(matches[0].supportingEdges.map((edge) => edge.edgeIds).flat().sort(), ["a-x-1", "a-x-2", "b-x"]);
  assert.throws(() => buildTypedMotifProgram({
    ...sharedPlaceMotif,
    temporal: { semantics: "eventOrder" }
  }, "undirected"), /semantics deve essere/);
});

test("i motivi orderedByStart ordinano gli inizi di validità e conservano ogni combinazione di archi testimoni", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "actor-1", label: "Ada", kind: "actor" },
      { id: "context-1", label: "Istituto X", kind: "context" },
      { id: "place-1", label: "Progetto Y", kind: "place" }
    ],
    edges: [
      { id: "actor-early", from: "actor-1", to: "place-1", kind: "actor-place", fromYear: 2000, toYear: 2010 },
      { id: "actor-equal", from: "actor-1", to: "place-1", kind: "actor-place", fromYear: 2002, toYear: 2010 },
      { id: "actor-late", from: "actor-1", to: "place-1", kind: "actor-place", fromYear: 2003, toYear: 2010 },
      { id: "context-mid", from: "context-1", to: "place-1", kind: "context-place", fromYear: 2002, toYear: 2010 }
    ]
  }, temporalConfig);
  assert.equal(graph.capabilities.edgeIntervals.available, true);
  const facts = buildAspFactsFromGraph(graph);
  const motif = {
    id: "ordered-context",
    roles: {
      actor: { nodeTypes: ["actor"] },
      context: { nodeTypes: ["context"] },
      place: { nodeTypes: ["place"] }
    },
    edges: [
      { sourceRole: "actor", targetRole: "place", edgeType: "actor-place" },
      { sourceRole: "context", targetRole: "place", edgeType: "context-place" }
    ],
    temporal: { semantics: "orderedByStart" }
  };
  const runner = await createClingoWasmRunner();
  const runAndParse = async (template) => {
    const compiled = buildTypedMotifProgram(template, graph.direction);
    const result = await runner.run(`${facts.facts}\n${compiled.program}`);
    assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
    return parseTypedMotifMatches(
      result.Call?.[0]?.Witnesses,
      compiled,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      facts.reverseEdgeIndex
    );
  };

  const nonStrict = await runAndParse(motif);
  assert.equal(nonStrict.length, 2);
  assert.deepEqual(nonStrict.map((match) => {
    const first = match.supportingEdges[0];
    const second = match.supportingEdges[1];
    return [first.edgeIds[0], first.startTimeValue, second.edgeIds[0], second.startTimeValue];
  }).sort((left, right) => left[0].localeCompare(right[0])), [
    ["actor-early", 2000, "context-mid", 2002],
    ["actor-equal", 2002, "context-mid", 2002]
  ]);

  const strict = await runAndParse({
    ...motif,
    temporal: { semantics: "orderedByStart", strict: true }
  });
  assert.equal(strict.length, 1);
  assert.equal(strict[0].supportingEdges[0].edgeIds[0], "actor-early");
  assert.throws(() => buildTypedMotifProgram({
    ...motif,
    temporal: { semantics: "orderedByStart", strict: "yes" }
  }, "undirected"), /strict deve essere un booleano/);
  assert.throws(() => buildTypedMotifProgram({
    ...sharedPlaceMotif,
    temporal: { semantics: "orderedByStart" }
  }, "undirected"), /non sono simmetrici nella struttura/);
});

test("orderedByStart esclude sequenze invertite e il modo stretto esclude inizi uguali", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const makeGraph = (actorStart, contextStart) => normalizeGraphData({
    nodes: [
      { id: "actor-1", label: "Ada", kind: "actor" },
      { id: "context-1", label: "Istituto X", kind: "context" },
      { id: "place-1", label: "Progetto Y", kind: "place" }
    ],
    edges: [
      { id: "actor-event", from: "actor-1", to: "place-1", kind: "actor-place", fromYear: actorStart, toYear: 2010 },
      { id: "context-event", from: "context-1", to: "place-1", kind: "context-place", fromYear: contextStart, toYear: 2010 }
    ]
  }, temporalConfig);
  const motif = {
    id: "strict-order",
    roles: {
      actor: { nodeTypes: ["actor"] },
      context: { nodeTypes: ["context"] },
      place: { nodeTypes: ["place"] }
    },
    edges: [
      { sourceRole: "actor", targetRole: "place", edgeType: "actor-place" },
      { sourceRole: "context", targetRole: "place", edgeType: "context-place" }
    ],
    temporal: { semantics: "orderedByStart", strict: true }
  };
  const runner = await createClingoWasmRunner();
  const reversedGraph = makeGraph(2003, 2002);
  const reversedFacts = buildAspFactsFromGraph(reversedGraph);
  const nonStrictProgram = buildTypedMotifProgram({
    ...motif,
    temporal: { semantics: "orderedByStart" }
  }, reversedGraph.direction);
  const reversedResult = await runner.run(`${reversedFacts.facts}\n${nonStrictProgram.program}`);
  assert.equal(reversedResult.Result, "UNSATISFIABLE", reversedResult.Error ?? JSON.stringify(reversedResult));

  const equalGraph = makeGraph(2002, 2002);
  const equalFacts = buildAspFactsFromGraph(equalGraph);
  const strictProgram = buildTypedMotifProgram(motif, equalGraph.direction);
  const equalResult = await runner.run(`${equalFacts.facts}\n${strictProgram.program}`);
  assert.equal(equalResult.Result, "UNSATISFIABLE", equalResult.Error ?? JSON.stringify(equalResult));
});

test("il why-not coValid sceglie il tempo che attiva più pattern e distingue quelli senza intervalli", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place", label: "Istituto", kind: "place" }
    ],
    edges: [
      { id: "a-place", from: "p-1", to: "place", kind: "person-place", fromYear: 1, toYear: 2 },
      { id: "b-place", from: "p-2", to: "place", kind: "person-place" }
    ]
  }, temporalConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = { ...sharedPlaceMotif, temporal: { semantics: "coValid" } };
  const compiled = buildTypedMotifTemporalNearMatchProgram(template, graph.direction);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const [nearMatch] = parseTypedMotifNearMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(nearMatch);
  assert.equal(nearMatch.missingPatterns.length, 0);
  assert.ok([1, 2].includes(nearMatch.temporalEvidence.timeValue));
  assert.deepEqual(nearMatch.temporalEvidence.unavailablePatterns.map((pattern) => pattern.index), [2]);
  assert.deepEqual(nearMatch.temporalEvidence.inactivePatterns, []);
  assert.deepEqual(nearMatch.temporalEvidence.supportingEdges[0].edgeIds, ["a-place"]);

  const disjointGraph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place", label: "Istituto", kind: "place" }
    ],
    edges: [
      { id: "a-place", from: "p-1", to: "place", kind: "person-place", fromYear: 1, toYear: 2 },
      { id: "b-place", from: "p-2", to: "place", kind: "person-place", fromYear: 4, toYear: 5 }
    ]
  }, temporalConfig);
  const disjointFacts = buildAspFactsFromGraph(disjointGraph);
  const disjointResult = await (await createClingoWasmRunner()).run(
    `${disjointFacts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(disjointResult.Result, "OPTIMUM FOUND", disjointResult.Error ?? JSON.stringify(disjointResult));
  const [disjointNearMatch] = parseTypedMotifNearMatches(
    disjointResult.Call?.[0]?.Witnesses,
    compiled,
    disjointFacts.reverseIndex,
    disjointFacts.reverseSourceIndex,
    disjointFacts.reverseEdgeIndex
  );
  assert.ok(disjointNearMatch);
  assert.deepEqual(disjointNearMatch.temporalEvidence.unavailablePatterns, []);
  assert.equal(disjointNearMatch.temporalEvidence.inactivePatterns.length, 1);
  assert.ok([1, 2, 4, 5].includes(disjointNearMatch.temporalEvidence.timeValue));
  assert.equal(disjointNearMatch.temporalEvidence.supportingEdges.filter((edge) => edge.edgeIds.length > 0).length, 1);
});

test("il why-not orderedByStart restituisce record selezionati e inversioni consecutive", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        direction: "directed",
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id, label: id, kind: "person" })),
    edges: [
      { id: "ab", from: "a", to: "b", kind: "r1", fromYear: 5, toYear: 8 },
      { id: "bc", from: "b", to: "c", kind: "r2", fromYear: 3, toYear: 8 },
      { id: "cd", from: "c", to: "d", kind: "r3", fromYear: 3, toYear: 8 }
    ]
  }, temporalConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = {
    id: "ordered-chain",
    temporal: { semantics: "orderedByStart" },
    roles: Object.fromEntries(["a", "b", "c", "d"].map((role) => [role, { nodeTypes: ["person"] }])),
    edges: [
      { sourceRole: "a", targetRole: "b", edgeType: "r1" },
      { sourceRole: "b", targetRole: "c", edgeType: "r2" },
      { sourceRole: "c", targetRole: "d", edgeType: "r3" }
    ]
  };
  const compiled = buildTypedMotifTemporalNearMatchProgram(template, graph.direction);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND");
  const [nearMatch] = parseTypedMotifNearMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(nearMatch);
  assert.equal(nearMatch.missingPatterns.length, 0);
  assert.deepEqual(nearMatch.temporalEvidence.unavailablePatterns, []);
  assert.deepEqual(nearMatch.temporalEvidence.orderViolations, [{ firstIndex: 1, secondIndex: 2 }]);
  assert.deepEqual(nearMatch.temporalEvidence.supportingEdges.map((edge) => edge.edgeIds), [["ab"], ["bc"], ["cd"]]);
  assert.deepEqual(nearMatch.temporalEvidence.supportingEdges.map((edge) => edge.startTimeValue), [5, 3, 3]);

  const strictTemplate = { ...template, temporal: { semantics: "orderedByStart", strict: true } };
  const strictCompiled = buildTypedMotifTemporalNearMatchProgram(strictTemplate, graph.direction);
  const strictResult = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${strictCompiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(strictResult.Result, "OPTIMUM FOUND", strictResult.Error ?? JSON.stringify(strictResult));
  const [strictNearMatch] = parseTypedMotifNearMatches(
    strictResult.Call?.[0]?.Witnesses,
    strictCompiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(strictNearMatch);
  assert.deepEqual(strictNearMatch.temporalEvidence.orderViolations, [
    { firstIndex: 1, secondIndex: 2 },
    { firstIndex: 2, secondIndex: 3 }
  ]);
});

test("il controfattuale statico sceglie la combinazione di archi ipotetici di costo minimo senza mutare i dati", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place", label: "Istituto X", kind: "place" }
    ],
    edges: [{ id: "observed-a", from: "p-1", to: "place", kind: "person-place" }]
  }, config);
  const originalLinks = structuredClone(graph.links);
  const facts = buildAspFactsFromGraph(graph);
  const candidates = [
    {
      id: "hypothetical-expensive",
      sourceNodeId: "p-2",
      targetNodeId: "place",
      sourceNode: 2,
      targetNode: 3,
      edgeType: "person-place",
      cost: 5,
      recordIndex: 2
    },
    {
      id: "hypothetical-cheap",
      sourceNodeId: "p-2",
      targetNodeId: "place",
      sourceNode: 2,
      targetNode: 3,
      edgeType: "person-place",
      cost: 2,
      recordIndex: 3
    }
  ];
  const compiled = buildTypedMotifCompletionCounterfactualProgram(
    sharedPlaceMotif,
    graph.direction,
    "",
    candidates
  );
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const proposals = parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );

  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].totalCost, 2);
  assert.deepEqual(proposals[0].addedEdges.map((edge) => edge.id), ["hypothetical-cheap"]);
  assert.deepEqual(proposals[0].addedEdges[0].patternIndexes.length, 1);
  assert.deepEqual(proposals[0].match.supportingEdges.flatMap((edge) => edge.edgeIds), ["observed-a"]);
  assert.deepEqual(graph.links, originalLinks);
  assert.equal(graph.links.length, 1);
});

test("il controfattuale temporale coValid richiede intervalli e trova un istante comune", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place", label: "Istituto X", kind: "place" }
    ],
    edges: [{ id: "observed-a", from: "p-1", to: "place", kind: "person-place", fromYear: 1, toYear: 5 }]
  }, temporalConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = { ...sharedPlaceMotif, temporal: { semantics: "coValid" } };
  const candidate = {
    id: "hypothetical-b",
    sourceNodeId: "p-2",
    targetNodeId: "place",
    sourceNode: 2,
    targetNode: 3,
    edgeType: "person-place",
    cost: 3,
    recordIndex: 2,
    validity: { from: 4, to: 8 }
  };
  const compiled = buildTypedMotifCompletionCounterfactualProgram(template, graph.direction, "", [candidate]);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const [proposal] = parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(proposal);
  assert.equal(proposal.match.timeValue, 4);
  assert.deepEqual(proposal.addedEdges[0].id, "hypothetical-b");
  assert.deepEqual(proposal.addedEdges[0].validity, { from: 4, to: 8 });
  assert.throws(() => buildTypedMotifCompletionCounterfactualProgram(
    template,
    graph.direction,
    "",
    [{ ...candidate, validity: undefined }]
  ), /validity deve dichiarare from e to/);
});

test("gli intervalli ipotetici usano lo stesso parser temporale degli archi osservati", () => {
  const template = { ...sharedPlaceMotif, temporal: { semantics: "coValid" } };
  const candidate = {
    id: "hypothetical-year",
    sourceNodeId: "p-2",
    targetNodeId: "place",
    sourceNode: 2,
    targetNode: 3,
    edgeType: "person-place",
    cost: 1,
    recordIndex: 2,
    validity: { from: "2024", to: 2025 }
  };
  const compiled = buildTypedMotifCompletionCounterfactualProgram(template, "undirected", "", [candidate]);
  assert.deepEqual(compiled.candidates[0].validity, { from: 2024, to: 2025 });

  assert.throws(() => buildTypedMotifCompletionCounterfactualProgram(template, "undirected", "", [
    { ...candidate, validity: { from: "2024-02-31", to: "2024-03-01" } }
  ]), /data ISO valida/);
  assert.throws(() => buildTypedMotifCompletionCounterfactualProgram(template, "undirected", "", [
    { ...candidate, validity: { from: "2024-02-29T12:00:00", to: "2024-03-01T12:00:00" } }
  ]), /data ISO valida/);
  assert.throws(() => buildTypedMotifCompletionCounterfactualProgram(template, "undirected", "", [
    { ...candidate, validity: { from: "2023-02-29T12:00:00Z", to: "2024-03-01T12:00:00Z" } }
  ]), /data ISO valida/);
});

test("il controfattuale orderedByStart accetta supporti ipotetici sintetici e rispetta la sequenza", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "actor", label: "A", kind: "actor" },
      { id: "context", label: "C", kind: "context" },
      { id: "place", label: "P", kind: "place" }
    ],
    edges: [{ id: "observed-first", from: "actor", to: "place", kind: "actor-place", fromYear: 2, toYear: 9 }]
  }, temporalConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = {
    id: "ordered-counterfactual",
    roles: {
      actor: { nodeTypes: ["actor"] },
      context: { nodeTypes: ["context"] },
      place: { nodeTypes: ["place"] }
    },
    edges: [
      { sourceRole: "actor", targetRole: "place", edgeType: "actor-place" },
      { sourceRole: "context", targetRole: "place", edgeType: "context-place" }
    ],
    temporal: { semantics: "orderedByStart" }
  };
  const candidate = {
    id: "hypothetical-second",
    sourceNodeId: "context",
    targetNodeId: "place",
    sourceNode: 2,
    targetNode: 3,
    edgeType: "context-place",
    cost: 1,
    recordIndex: 2,
    validity: { from: 4, to: 8 }
  };
  const compiled = buildTypedMotifCompletionCounterfactualProgram(template, graph.direction, "", [candidate]);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const [proposal] = parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(proposal);
  assert.deepEqual(proposal.addedEdges[0].patternIndexes, [2]);
  assert.deepEqual(proposal.addedEdges[0].validity, { from: 4, to: 8 });
  assert.deepEqual(proposal.match.supportingEdges.map((edge) => edge.edgeIds), [["observed-first"], []]);
  assert.deepEqual(proposal.match.supportingEdges.map((edge) => edge.startTimeValue), [2, 4]);
});

test("il controfattuale restituisce UNSAT quando nessun candidato autorizzato completa il motivo", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place", label: "Istituto X", kind: "place" }
    ],
    edges: [{ id: "observed-a", from: "p-1", to: "place", kind: "person-place" }]
  }, config);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifCompletionCounterfactualProgram(sharedPlaceMotif, graph.direction, "", [{
    id: "wrong-type",
    sourceNodeId: "p-2",
    targetNodeId: "place",
    sourceNode: 2,
    targetNode: 3,
    edgeType: "unrelated",
    cost: 1,
    recordIndex: 2
  }]);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);
  assert.equal(result.Result, "UNSATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.deepEqual(parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  ), []);
});

test("i timestamp ISO sono codificati nel range clingo e decodificati nel witness", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.valid_from", toField: "$.valid_to" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c"].map((id) => ({ id, label: id, kind: "person" })),
    edges: [
      { id: "e1", from: "a", to: "b", kind: "collaboration", valid_from: "2024-01-01", valid_to: "2024-04-01" },
      { id: "e2", from: "b", to: "c", kind: "collaboration", valid_from: "2024-02-01", valid_to: "2024-05-01" },
      { id: "e3", from: "c", to: "a", kind: "collaboration", valid_from: "2024-03-01", valid_to: "2024-06-01" }
    ]
  }, temporalConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = buildTypedMotifProgram({
    id: "temporal-triangle",
    label: "Triade temporale",
    roles: {
      a: { nodeTypes: ["person"] },
      b: { nodeTypes: ["person"] },
      c: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "a", targetRole: "b", edgeType: "collaboration" },
      { sourceRole: "b", targetRole: "c", edgeType: "collaboration" },
      { sourceRole: "c", targetRole: "a", edgeType: "collaboration" }
    ],
    symmetricRoles: [["a", "b", "c"]],
    temporal: { semantics: "coValid" }
  }, graph.direction);

  assert.match(facts.facts, /edge_valid_from\(1,1\)\./);
  assert.match(facts.facts, /edge_valid_from\(2,2\)\./);
  assert.match(facts.facts, /edge_valid_from\(3,3\)\./);
  assert.doesNotMatch(facts.facts, /170\d{9,}/, "i millisecondi Unix non devono arrivare come interi ASP");

  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${facts.facts}\n${template.program}`);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  const [match] = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    template,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    new Set(),
    facts.temporalEncoding.decode
  );
  assert.equal(match.timeValue, Date.parse("2024-03-01"));
});

test("i controfattuali temporali condividono la codifica con gli intervalli ISO ipotetici", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.valid_from", toField: "$.valid_to" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c"].map((id) => ({ id, label: id, kind: "person" })),
    edges: [
      { id: "e1", from: "a", to: "b", kind: "collaboration", valid_from: "2024-01-01", valid_to: "2024-12-31" },
      { id: "e2", from: "b", to: "c", kind: "collaboration", valid_from: "2024-01-01", valid_to: "2024-12-31" }
    ]
  }, temporalConfig);
  const candidateValidity = { from: "2024-03-01", to: "2024-06-30" };
  const facts = buildAspFactsFromGraph(graph, undefined, {
    additionalTemporalValues: [candidateValidity.from, candidateValidity.to]
  });
  const motif = {
    id: "temporal-triangle",
    label: "Triade temporale",
    roles: {
      a: { nodeTypes: ["person"] },
      b: { nodeTypes: ["person"] },
      c: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "a", targetRole: "b", edgeType: "collaboration" },
      { sourceRole: "b", targetRole: "c", edgeType: "collaboration" },
      { sourceRole: "c", targetRole: "a", edgeType: "collaboration" }
    ],
    symmetricRoles: [["a", "b", "c"]],
    temporal: { semantics: "coValid" }
  };
  const candidate = {
    id: "e3",
    sourceNodeId: "c",
    targetNodeId: "a",
    edgeType: "collaboration",
    sourceNode: 3,
    targetNode: 1,
    cost: 1,
    recordIndex: 3,
    validity: candidateValidity
  };
  const compiled = buildTypedMotifCompletionCounterfactualProgram(
    motif,
    graph.direction,
    "",
    [candidate],
    facts.temporalEncoding
  );
  const candidateFrom = facts.temporalEncoding.encode(candidateValidity.from);
  const candidateTo = facts.temporalEncoding.encode(candidateValidity.to);
  assert.match(compiled.program, new RegExp(`cf_candidate_interval\\(3,${candidateFrom},${candidateTo}\\)\\.`));
  assert.doesNotMatch(compiled.program, /170\\d{9,}/);

  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const [proposal] = parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    facts.temporalEncoding.decode
  );
  assert.equal(proposal.addedEdges[0].validity.from, Date.parse("2024-03-01"));
  assert.equal(proposal.addedEdges[0].validity.to, Date.parse("2024-06-30"));
});

