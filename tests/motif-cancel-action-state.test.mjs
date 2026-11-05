import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");

test("the motif-count cancel action is present only during an unfinished active count", () => {
  assert.match(panel, /\{#if motifCountProgress\.completed < motifCountProgress\.total && running\}\s*<button\s+type="button"\s+on:click=\{\(\) => dispatch\("cancelCount"\)\}\s+aria-describedby=\{motifCountNotice\.startsWith\("Annullamento"\) \? "motif-count-cancel-status" : undefined\}\s+disabled=\{motifCountNotice\.startsWith\("Annullamento"\)\}/);
  assert.match(panel, /motifCountNotice\.startsWith\("Annullamento"\) \? "Annullamento in corso…" : "Interrompi conteggio"/);
  assert.match(panel, /id="motif-count-cancel-status" class="readiness" role="status">\{motifCountNotice\}/);
});
