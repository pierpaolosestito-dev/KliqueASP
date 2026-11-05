import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("Vista can hide and reopen the timeline without resetting its selected interval", () => {
  assert.match(graphApp, /let showTimelineControl = true/);
  assert.match(graphApp, /class:timeline-enabled=\{timelineControlEnabled && showTimelineControl\}/);
  assert.equal((graphApp.match(/showTimelineControl = !showTimelineControl/g) ?? []).length, 2);
  assert.match(graphApp, /\{#if timelineControlEnabled && showTimelineControl\}[\s\S]*?<TimelineSlider/);
  assert.match(graphApp, /Timeline nascosta · periodo \{currentTimelineLabel\}/);
});

test("the timeline has an in-panel close control that returns focus to the toolbar", async () => {
  const timeline = await readFile(new URL("../src/lib/kliqueasp/components/TimelineSlider.svelte", import.meta.url), "utf8");
  assert.match(timeline, /class="timeline-dismiss"[\s\S]*?aria-label="Nascondi timeline"[\s\S]*?dispatch\("dismiss"\)/);
  assert.match(graphApp, /on:dismiss=\{dismissTimelineControl\}/);
  assert.match(graphApp, /function dismissTimelineControl\(\)\s*\{\s*showTimelineControl = false;\s*closeToolbarMenusAndRestoreFocus\(\);/);
});

test("timeline criteria continue to use the selected temporal window while its control is collapsed", () => {
  assert.match(graphApp, /periodLabel: timelineControlEnabled \? currentTimelineLabel/);
  assert.match(graphApp, /filterLinksByTemporalWindow\(/);
  assert.match(graphApp, /applyTimelineFilter\(\)/);
  assert.match(graphApp, /class:timeline-enabled=\{timelineControlEnabled && showTimelineControl\}/);
});
