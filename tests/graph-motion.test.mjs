import assert from "node:assert/strict";
import test from "node:test";

import { getGraphFitZoomFactor, getGraphMotionSettings, getGraphTransitionDuration, getInitialGraphCameraDistance } from "../src/lib/kliqueasp/graph/graphMotion.ts";

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

test("starts graphs at a readable scale and increases camera distance with graph size", () => {
  assert.equal(getInitialGraphCameraDistance(3), 180);
  assert.equal(getInitialGraphCameraDistance(8), 180);
  assert.equal(getInitialGraphCameraDistance(34), 371);
  assert.ok(getInitialGraphCameraDistance(100) > getInitialGraphCameraDistance(34));
  assert.equal(getInitialGraphCameraDistance(Number.NaN), 180);
});

test("screen-space graph fitting enlarges underfilled graphs and caps the correction", () => {
  assert.equal(getGraphFitZoomFactor(0.4, 0.5), 1.25);
  assert.equal(getGraphFitZoomFactor(0.1, 0.2), 1.25);
  assert.ok(Math.abs(getGraphFitZoomFactor(0.3, 0.6) - (0.68 / 0.6)) < 1e-9);
});

test("screen-space graph fitting never zooms in past the safe viewport margin", () => {
  assert.equal(getGraphFitZoomFactor(0.75, 0.2), 1);
  assert.equal(getGraphFitZoomFactor(0.4, 0.68), 1);
  assert.equal(getGraphFitZoomFactor(Number.NaN, 0.2), 1);
});
