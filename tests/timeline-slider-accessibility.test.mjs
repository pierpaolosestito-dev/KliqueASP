import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const timeline = await readFile(
  new URL("../src/lib/kliqueasp/components/TimelineSlider.svelte", import.meta.url),
  "utf8"
);

test("the temporal range is a named group with separate start and end sliders", () => {
  assert.match(timeline, /class="timeline-container"\s+role="group"\s+aria-label=\{[^}]*Intervallo temporale del grafo/);
  assert.equal((timeline.match(/type="range"/g) ?? []).length, 2);
  assert.match(timeline, /type="range"\s+aria-label="Inizio del periodo"/);
  assert.match(timeline, /type="range"\s+aria-label="Fine del periodo"/);
});
