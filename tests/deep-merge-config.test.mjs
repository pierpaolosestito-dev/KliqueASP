import assert from "node:assert/strict";
import test from "node:test";
import { deepMergeConfig } from "../src/lib/kliqueasp/config/deepMergeConfig.ts";

test("config deep merge preserves reserved own keys without changing ordinary merge semantics", () => {
  const base = JSON.parse(`{
    "nodeTypes": {
      "person": { "color": "#fff", "size": 5 },
      "__proto__": { "baseField": "kept", "replaced": "old" }
    },
    "features": { "timeline": true },
    "list": [1, 2]
  }`);
  const override = JSON.parse(`{
    "nodeTypes": {
      "person": { "size": 7 },
      "__proto__": { "replaced": "new", "overrideField": "kept" }
    },
    "features": { "__proto__": { "nested": true } },
    "list": [3]
  }`);

  const merged = deepMergeConfig(base, override);

  assert.deepEqual(merged.nodeTypes.person, { color: "#fff", size: 7 });
  assert.deepEqual(merged.list, [3], "arrays keep the existing replace behavior");
  assert.equal(Object.hasOwn(merged.nodeTypes, "__proto__"), true);
  assert.deepEqual(merged.nodeTypes.__proto__, {
    baseField: "kept",
    replaced: "new",
    overrideField: "kept"
  });
  assert.equal(Object.getPrototypeOf(merged.nodeTypes), Object.prototype);
  assert.equal(Object.hasOwn(merged.features, "__proto__"), true);
  assert.deepEqual(merged.features.__proto__, { nested: true });
  assert.equal(Object.getPrototypeOf(merged.features), Object.prototype);
  assert.equal(Object.prototype.nested, undefined);
});

test("a reserved config key is not confused with an inherited Object prototype member", () => {
  const merged = deepMergeConfig({}, JSON.parse('{"__proto__":{"inherited":true}}'));

  assert.equal(Object.hasOwn(merged, "__proto__"), true);
  assert.deepEqual(merged.__proto__, { inherited: true });
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
  assert.equal(Object.prototype.inherited, undefined);
});
