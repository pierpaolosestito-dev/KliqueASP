import assert from "node:assert/strict";
import test from "node:test";
import {
  createKCoreBenchmarkFixture,
  supportedKCoreBenchmarkTopologies
} from "../scripts/kcore-benchmark-fixtures.mjs";

function peelTwoCore(nodes, edges) {
  const neighbors = new Map(nodes.map(({ id }) => [id, new Set()]));
  for (const { source, target } of edges) {
    neighbors.get(source).add(target);
    neighbors.get(target).add(source);
  }
  const active = new Set(neighbors.keys());
  let rounds = 0;
  while (true) {
    const peeled = [...active].filter((id) =>
      [...neighbors.get(id)].filter((neighbor) => active.has(neighbor)).length < 2
    );
    if (peeled.length === 0) break;
    rounds += 1;
    for (const id of peeled) active.delete(id);
  }
  return { core: [...active].sort(), rounds };
}

for (const topology of supportedKCoreBenchmarkTopologies) {
  test(`la fixture k-core ${topology} ha struttura valida e risultato noto`, () => {
    for (let nodeCount = 3; nodeCount <= 12; nodeCount += 1) {
      const fixture = createKCoreBenchmarkFixture(topology, nodeCount);
      const nodeIds = fixture.nodes.map(({ id }) => id);
      const edgeIds = fixture.edges.map(({ id }) => id);
      const nodeSet = new Set(nodeIds);

      assert.equal(nodeSet.size, nodeCount, `ID nodi univoci per n=${nodeCount}`);
      assert.equal(new Set(edgeIds).size, fixture.edges.length, `ID archi univoci per n=${nodeCount}`);
      assert.ok(fixture.edges.every(({ source, target }) =>
        nodeSet.has(source) && nodeSet.has(target) && source !== target
      ), `riferimenti e assenza di cappi per n=${nodeCount}`);

      const peeled = peelTwoCore(fixture.nodes, fixture.edges);
      assert.equal(peeled.core.length, fixture.coreSize, `cardinalità del 2-core per n=${nodeCount}`);
      const expectedRounds = topology === "cycle"
        ? 0
        : topology === "star" ? 2
          : topology === "path" ? Math.ceil(nodeCount / 2)
            : nodeCount - fixture.coreSize;
      assert.equal(peeled.rounds, expectedRounds, `round di peeling per n=${nodeCount}`);
    }
  });
}

test("le fixture k-core rifiutano taglie e topologie non supportate", () => {
  assert.throws(() => createKCoreBenchmarkFixture("path", 2), RangeError);
  assert.throws(() => createKCoreBenchmarkFixture("unknown", 3), RangeError);
});
