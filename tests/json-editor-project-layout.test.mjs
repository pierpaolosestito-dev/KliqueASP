import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");

test("the project name gets a full-width field before clearly grouped project actions", () => {
  const start = editor.indexOf('<div class="project-management">');
  const end = editor.indexOf('<div class="source-data-actions"', start);
  assert.ok(start >= 0 && end > start, "sezione progetto non trovata");
  const project = editor.slice(start, end);
  assert.match(project, /<span>Nome progetto<\/span>[\s\S]*?id="workbench-project-name"/);
  assert.match(project, /<div class="project-file-actions" role="group" aria-label="Azioni progetto">[\s\S]*?Nuovo progetto[\s\S]*?Apri progetto[\s\S]*?Esporta progetto/);
  assert.match(editor, /\.project-management\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("the project field and three project actions remain readable in narrow panels", () => {
  assert.match(editor, /\.project-name-field input\s*\{[^}]*min-height:\s*40px;[^}]*font-size:\s*14px/s);
  assert.match(editor, /\.project-file-actions :global\(button\), \.project-file-actions \.file-button\s*\{[^}]*min-height:\s*40px;[^}]*font-size:\s*12px/s);
  assert.match(editor, /@media \(max-width: 520px\)[\s\S]*?\.project-file-actions > \* \{ flex: 1 1 118px; \}/);
  assert.match(editor, /<div class="source-data-actions" role="group" aria-label="Carica dati e configurazione">/);
});
