import assert from "node:assert/strict";
import test from "node:test";
import {
  getDeclaredNodeTimelineConfig,
  getDeclaredNodeTypeConfig,
  isDeclaredNodeAlwaysVisible
} from "../src/lib/kliqueasp/graph/configuredNodeSemantics.ts";

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
