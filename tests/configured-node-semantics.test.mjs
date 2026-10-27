import assert from "node:assert/strict";
import test from "node:test";
import {
  getDeclaredNodeTimelineConfig,
  getDeclaredNodeTypeConfig,
  isDeclaredNodeAlwaysVisible
} from "../src/lib/kliqueasp/graph/configuredNodeSemantics.ts";
import { normalizeNodeTypeConfigStyles } from "../src/lib/kliqueasp/graph/nodeTypeConfig.ts";
import { deepMergeConfig } from "../src/lib/kliqueasp/config/deepMergeConfig.ts";

test("i default applicativi non dichiarano mapping temporali per un dataset generico", () => {
  const applicationDefaults = {
    person: {
      category: "temporal",
      timeline: { startField: "anno_nascita", endField: "anno_morte" }
    }
  };

  assert.equal(getDeclaredNodeTimelineConfig({}, "person"), null);
  assert.deepEqual(getDeclaredNodeTimelineConfig(applicationDefaults, "person"), {
    startField: "anno_nascita",
    endField: "anno_morte"
  });
  assert.equal(getDeclaredNodeTimelineConfig({ person: { timeline: { startField: "born" } } }, "person"), null);
  assert.equal(getDeclaredNodeTimelineConfig(applicationDefaults, "actor"), null);
});

test("gruppi e visibilità permanente derivano dal config del grafo, non dai default applicativi", () => {
  const applicationDefaults = {
    person: { group: "roles[].macro_area" },
    place: { alwaysVisible: true }
  };
  const graphConfig = {
    person: { group: "affiliations[].group" },
    place: { alwaysVisible: false }
  };

  assert.equal(getDeclaredNodeTypeConfig({}, "person"), null);
  assert.equal(getDeclaredNodeTypeConfig(graphConfig, "person")?.group, "affiliations[].group");
  assert.equal(isDeclaredNodeAlwaysVisible({}, "place"), false);
  assert.equal(isDeclaredNodeAlwaysVisible(applicationDefaults, "place"), true);
  assert.equal(isDeclaredNodeAlwaysVisible(graphConfig, "place"), false);
});

test("i tipi di nodo sono letti solo dalle proprietà proprie della configurazione", () => {
  const inheritedConfig = Object.create({ ghost: { alwaysVisible: true } });
  const explicitReservedType = JSON.parse(
    '{"__proto__":{"alwaysVisible":true,"timeline":{"startField":"from","endField":"to"}}}'
  );

  assert.equal(getDeclaredNodeTypeConfig({}, "__proto__"), null);
  assert.equal(getDeclaredNodeTypeConfig(inheritedConfig, "ghost"), null);
  assert.equal(getDeclaredNodeTypeConfig(explicitReservedType, "__proto__")?.alwaysVisible, true);
  assert.deepEqual(getDeclaredNodeTimelineConfig(explicitReservedType, "__proto__"), {
    startField: "from",
    endField: "to"
  });
});

test("la normalizzazione degli stili conserva i tipi riservati e i default visivi", () => {
  const input = JSON.parse(`{
    "default": {"color":"#123456","size":4,"icon":"default.svg"},
    "highlight": {"color":"#abcdef"},
    "person": {"size":7},
    "__proto__": {"icon":"reserved.svg","timeline":{"startField":"from","endField":"to"}}
  }`);

  const normalized = normalizeNodeTypeConfigStyles(input);

  assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "__proto__"), true);
  assert.deepEqual(normalized.person, {
    color: "#123456",
    size: 7,
    icon: "default.svg"
  });
  assert.deepEqual(normalized.highlight, { color: "#abcdef" });
  assert.deepEqual(normalized["__proto__"], {
    color: "#123456",
    size: 4,
    icon: "reserved.svg",
    timeline: { startField: "from", endField: "to" },
    category: "temporal"
  });
  assert.equal(Object.prototype.category, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized, "ghost"), false);
});

test("il percorso merge-normalizzazione mantiene una dichiarazione semantica __proto__", () => {
  const rawConfig = JSON.parse(`{
    "nodeTypes": {
      "__proto__": {
        "alwaysVisible": true,
        "timeline": {"startField":"from","endField":"to"}
      }
    }
  }`);
  const graphConfig = deepMergeConfig({
    nodeTypes: {
      default: { color: "#123456", icon: "default.svg" },
      highlight: { color: "#abcdef" }
    }
  }, rawConfig);
  const normalizedNodeTypes = normalizeNodeTypeConfigStyles(graphConfig.nodeTypes);

  assert.equal(Object.prototype.hasOwnProperty.call(graphConfig.nodeTypes, "__proto__"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(normalizedNodeTypes, "__proto__"), true);
  assert.equal(Object.getPrototypeOf(normalizedNodeTypes), Object.prototype);
  assert.deepEqual(normalizedNodeTypes["__proto__"], {
    color: "#123456",
    icon: "default.svg",
    alwaysVisible: true,
    timeline: { startField: "from", endField: "to" },
    category: "temporal"
  });
  assert.equal(isDeclaredNodeAlwaysVisible(graphConfig.nodeTypes, "__proto__"), true);
  assert.deepEqual(getDeclaredNodeTimelineConfig(graphConfig.nodeTypes, "__proto__"), {
    startField: "from",
    endField: "to"
  });
  assert.equal(Object.prototype.alwaysVisible, undefined);
  assert.equal(Object.prototype.category, undefined);
});
