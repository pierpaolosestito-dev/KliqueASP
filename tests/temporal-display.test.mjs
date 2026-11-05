import assert from "node:assert/strict";
import test from "node:test";
import { displayMappedGraphTime, displayMappedTimelineRange, displayMappedTimelineValue } from "../src/lib/kliqueasp/graph/temporalDisplay.ts";
import { resolveInitialTemporalWindow } from "../src/lib/kliqueasp/graph/temporalProjection.ts";

test("timeline labels turn mapped epoch milliseconds into compact UTC dates without changing ordinary numeric years", () => {
  assert.equal(displayMappedTimelineValue(Date.UTC(2010, 10, 8, 12, 30)), "2010-11-08");
  assert.equal(displayMappedTimelineRange(Date.UTC(2010, 10, 8), Date.UTC(2016, 0, 25)), "2010-11-08–2016-01-25");
  assert.equal(displayMappedTimelineValue(2021), "2021");
  assert.equal(displayMappedGraphTime(Date.UTC(2010, 10, 8, 12, 30)), "2010-11-08T12:30:00.000Z");
});

test("an optional initial window stays inside the full navigable timeline bounds", () => {
  const bounds = { start: 10, end: 100 };
  assert.deepEqual(resolveInitialTemporalWindow(bounds, { start: 20, end: 40 }), { start: 20, end: 40 });
  assert.deepEqual(resolveInitialTemporalWindow(bounds, undefined), bounds);
  assert.deepEqual(resolveInitialTemporalWindow(bounds, { start: 20, end: 101 }), bounds);
  assert.deepEqual(resolveInitialTemporalWindow(bounds, { start: 50, end: 40 }), bounds);
});

test("the workspace initializes and resets to the configured timeline window", async () => {
  const { readFile } = await import("node:fs/promises");
  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  assert.match(graphApp, /let currentStart = getConfiguredTimelineWindow\(\)\.start/);
  assert.match(graphApp, /let currentEnd = getConfiguredTimelineWindow\(\)\.end/);
  assert.equal((graphApp.match(/const initialWindow = getConfiguredTimelineWindow\(\);/g) ?? []).length, 5);
  assert.match(graphApp, /currentStart = initialWindow\.start;\s*currentEnd = initialWindow\.end;/);
});

test("the range slider presents date-only labels while retaining precise UTC values as titles", async () => {
  const { readFile } = await import("node:fs/promises");
  const timeline = await readFile(new URL("../src/lib/kliqueasp/components/TimelineSlider.svelte", import.meta.url), "utf8");
  assert.match(timeline, /displayMappedTimelineValue\(localStart\)/);
  assert.match(timeline, /title=\{displayMappedGraphTime\(localStart\)\}/);
  assert.match(timeline, /date in UTC/);
});
