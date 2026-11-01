import assert from "node:assert/strict";
import test from "node:test";

import { getGraphMotionSettings, getGraphTransitionDuration, getInitialGraphCameraDistance } from "../src/lib/kliqueasp/graph/graphMotion.ts";

test("preserves the existing 3D layout and camera motion by default", () => {
  assert.deepEqual(getGraphMotionSettings(false), {
    warmupTicks: 0,
    cooldownTicks: Infinity,
    cooldownTime: 15_000
  });
  assert.equal(getGraphTransitionDuration(800, false), 800);
});

test("settles the graph before rendering and removes camera tweening for reduced motion", () => {
  assert.deepEqual(getGraphMotionSettings(true), {
    warmupTicks: 12,
    cooldownTicks: 1,
    cooldownTime: 1
  });
  assert.equal(getGraphMotionSettings(true, 10_000).warmupTicks, 30);
  assert.equal(getGraphMotionSettings(false, 10_000).warmupTicks, 0);
  assert.equal(getGraphTransitionDuration(800, true), 0);
});

test("rejects invalid camera transition durations", () => {
  assert.throws(() => getGraphTransitionDuration(-1, false), RangeError);
  assert.throws(() => getGraphTransitionDuration(Number.NaN, true), RangeError);
});

test("starts larger graphs farther away while preserving the small-graph camera", () => {
  assert.equal(getInitialGraphCameraDistance(3), 220);
  assert.equal(getInitialGraphCameraDistance(8), 220);
  assert.equal(getInitialGraphCameraDistance(34), 454);
  assert.ok(getInitialGraphCameraDistance(100) > getInitialGraphCameraDistance(34));
  assert.equal(getInitialGraphCameraDistance(Number.NaN), 220);
});
