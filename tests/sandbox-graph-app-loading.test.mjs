import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sandbox = await readFile(new URL("../src/routes/Sandbox/+page.svelte", import.meta.url), "utf8");

test("Sandbox defers GraphApp until the workspace route has started", () => {
  assert.doesNotMatch(sandbox, /import GraphApp from ["'][^"']*GraphApp\.svelte["']/);
  assert.match(sandbox, /import\("\$lib\/kliqueasp\/GraphApp\.svelte"\)/);
  assert.match(sandbox, /onMount\(\(\) => \{\s*void loadGraphApp\(\);/);
  assert.match(sandbox, /\{:else if sessionReady && GraphAppComponent\}/);
  assert.match(sandbox, /<svelte:component\s+this=\{GraphAppComponent\}/);
});

test("Sandbox announces preparation and offers an accessible retry when loading fails", () => {
  assert.match(sandbox, /role="status" aria-live="polite"/);
  assert.match(sandbox, /role="alert"/);
  assert.match(sandbox, /onclick=\{loadGraphApp\}>Riprova<\/button>/);
  assert.doesNotMatch(sandbox, /onclick=\{loadGraphApp\} disabled=/,
    "the retry action leaves the error branch as soon as the announced loading state begins");
  assert.match(sandbox, /graphAppLoadError = "";[\s\S]*?\{:else\}\s*<div class="session-loading" role="status" aria-live="polite">/);
  assert.match(sandbox, /Preparazione|Caricamento dell’area di lavoro/);
  assert.match(sandbox, /Non è stato possibile caricare l’area di lavoro/);
});
