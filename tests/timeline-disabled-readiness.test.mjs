import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const timeline = await readFile(new URL("../src/lib/kliqueasp/components/TimelineSlider.svelte", import.meta.url), "utf8");

test("disabled time-range controls explain that an analysis is running", () => {
  assert.match(app, /id="analysis-in-progress-status"[^>]*>\s*È in corso un calcolo\. Attendi il completamento prima di modificare i criteri o l'intervallo temporale/);
  assert.equal((timeline.match(/aria-describedby=\{disabled \? "analysis-in-progress-status" : undefined\}/g) ?? []).length, 2);
  assert.equal((timeline.match(/\{disabled\}/g) ?? []).length, 2);
});
