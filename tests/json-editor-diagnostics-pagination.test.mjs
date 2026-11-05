import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");

test("additional draft diagnostics are revealed in bounded pages", () => {
  assert.match(editor, /const DRAFT_DIAGNOSTICS_PAGE_SIZE = 20;/);
  assert.match(editor, /additionalDraftDiagnostics = draftValidation\?\.diagnostics\.slice\(6\) \?\? \[\]/);
  assert.match(editor, /visibleAdditionalDraftDiagnostics = additionalDraftDiagnostics\.slice\(0, visibleDraftDiagnosticLimit\)/);

  const detailStart = editor.indexOf('<details class="more-diagnostics"');
  const detailEnd = editor.indexOf("</details>", detailStart);
  assert.ok(detailStart >= 0 && detailEnd > detailStart, "additional diagnostics should stay behind the existing disclosure");
  const details = editor.slice(detailStart, detailEnd);
  assert.match(details, /#each visibleAdditionalDraftDiagnostics as diagnostic/);
  assert.match(details, /total=\{additionalDraftDiagnostics\.length\}/);
  assert.match(details, /visible=\{visibleAdditionalDraftDiagnostics\.length\}/);
  assert.match(details, /pageSize=\{DRAFT_DIAGNOSTICS_PAGE_SIZE\}/);
  assert.match(details, /label="diagnosi aggiuntive"/);
  assert.doesNotMatch(details, /#each draftValidation\.diagnostics\.slice\(6\)/);

  const validationStart = editor.indexOf("function scheduleDraftValidation");
  const validationEnd = editor.indexOf("function diagnosticTarget", validationStart);
  assert.ok(validationStart >= 0 && validationEnd > validationStart);
  assert.match(editor.slice(validationStart, validationEnd), /visibleDraftDiagnosticLimit = DRAFT_DIAGNOSTICS_PAGE_SIZE;/);
});
