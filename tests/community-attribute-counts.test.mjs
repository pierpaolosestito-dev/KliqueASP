import assert from "node:assert/strict";
import test from "node:test";
import { deriveCommunityAttributeBoundCounts } from "../src/lib/kliqueasp/graph/communityAttributeCounts.ts";

test("i conteggi attributo per comunità sono derivati dai candidati mappati e preservano i tipi JSON", () => {
  const partitions = [{ communities: [["A", "B"], ["C"]], scaledScore: 12 }];
  const candidateNodes = [
    {
      id: "A",
      analysis: { attributes: Object.fromEntries([
        ["department", "psychology"], ["rank", 3], ["__proto__", "reserved-value"]
      ]) }
    },
    { id: "B", analysis: { attributes: { department: "psychology", rank: "3" } } },
    { id: "C", analysis: { attributes: { department: "medicine", rank: 3 } } }
  ];
  const bounds = [
    { attribute: " department ", value: "psychology", minPerCommunity: 2, maxPerCommunity: 2 },
    { attribute: "rank", value: 3, minPerCommunity: 1 },
    { attribute: "__proto__", value: "reserved-value", maxPerCommunity: 1 }
  ];

  const [derived] = deriveCommunityAttributeBoundCounts(partitions, candidateNodes, bounds);
  assert.deepEqual(derived.attributeBoundCounts, [
    { communityId: "A", attribute: "department", value: "psychology", count: 2, minimum: 2, maximum: 2 },
    { communityId: "A", attribute: "rank", value: 3, count: 1, minimum: 1 },
    { communityId: "A", attribute: "__proto__", value: "reserved-value", count: 1, maximum: 1 },
    { communityId: "C", attribute: "department", value: "psychology", count: 0, minimum: 2, maximum: 2 },
    { communityId: "C", attribute: "rank", value: 3, count: 1, minimum: 1 },
    { communityId: "C", attribute: "__proto__", value: "reserved-value", count: 0, maximum: 1 }
  ]);
  assert.deepEqual(partitions, [{ communities: [["A", "B"], ["C"]], scaledScore: 12 }]);
});

test("senza vincoli attributo il risultato ASP resta privo del campo derivato", () => {
  const partitions = [{ communities: [["A"]], scaledScore: 0 }];
  const derived = deriveCommunityAttributeBoundCounts(
    partitions,
    [{ id: "A", analysis: { attributes: {} } }],
    []
  );

  assert.strictEqual(derived, partitions);
  assert.ok(!Object.hasOwn(derived[0], "attributeBoundCounts"));
});
