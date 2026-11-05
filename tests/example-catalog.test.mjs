import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getGraphExampleCatalog, parseWorkspaceExampleId } from "../src/lib/kliqueasp/graph/exampleCatalog.ts";

const [homePage, graphApp, editor, sandbox] = await Promise.all([
  readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/routes/Sandbox/+page.svelte", import.meta.url), "utf8")
]);

test("the shared catalogue lists every bundled dataset and the psychology case study", () => {
  const catalog = getGraphExampleCatalog("/KliqueASP");
  assert.deepEqual(catalog.map(({ id }) => id), [
    "karate-club",
    "davis-southern-women",
    "gahuku-gama-signed",
    "temporal-edge-projection",
    "sociopatterns-invs-100-minute",
    "sociopatterns-invs-full",
    "synthetic-graph",
    "synthetic-graph-directed",
    "bitcoin-otc",
    "psychology-case-study"
  ]);
  for (const example of catalog) {
    assert.ok(example.href.startsWith("/KliqueASP/"));
    assert.equal(example.opensWorkspaceExample, example.id !== "psychology-case-study");
  }
  assert.match(catalog.find(({ id }) => id === "sociopatterns-invs-full").href, /start=example&example=sociopatterns-invs-full/);
  assert.match(catalog.find(({ id }) => id === "synthetic-graph").href, /start=example&example=synthetic-graph/);
  assert.match(catalog.find(({ id }) => id === "bitcoin-otc").description, /35\.592 rating.*più attiva di 30 giorni/);
  assert.equal(catalog.find(({ id }) => id === "psychology-case-study").href, "/KliqueASP/PsychologyHistoryGraph/");
});

test("unknown example slugs fall back to the established Karate Club entry", () => {
  assert.equal(parseWorkspaceExampleId("davis-southern-women"), "davis-southern-women");
  assert.equal(parseWorkspaceExampleId("synthetic-graph-directed"), "synthetic-graph-directed");
  assert.equal(parseWorkspaceExampleId("bitcoin-otc"), "bitcoin-otc");
  assert.equal(parseWorkspaceExampleId("not-an-example"), "karate-club");
  assert.equal(parseWorkspaceExampleId(null), "karate-club");
});

test("the landing page, toolbar, and data panel share links that open isolated tabs", () => {
  assert.match(homePage, /const graphExamples = getGraphExampleCatalog\(base\)/);
  assert.match(homePage, /each graphExamples as example/);
  assert.match(graphApp, /const graphExampleCatalog = getGraphExampleCatalog\(base\)/);
  assert.match(graphApp, /each graphExampleCatalog as example/);
  assert.match(editor, /const workspaceExamples = getGraphExampleCatalog\(base\)\.filter/);
  assert.equal((graphApp.match(/class="toolbar-example-link" href=\{example\.href\} target="_blank" rel="noopener"/g) ?? []).length, 2);
  assert.match(editor, /<a class="example-link" href=\{example\.href\} target="_blank" rel="noopener">/);
  assert.match(sandbox, /sessionPersistenceEnabled = false/);
  assert.match(sandbox, /sessionReady && sessionPersistenceEnabled/);
  assert.match(sandbox, /if \(!sessionReady \|\| !sessionPersistenceEnabled\) return/);
  assert.match(sandbox, /case "synthetic-graph":\s*loadSyntheticGraphExample\(false\)/);
  assert.match(sandbox, /case "synthetic-graph-directed":\s*loadSyntheticGraphExample\(true\)/);
  assert.match(sandbox, /case "bitcoin-otc":\s*await loadBitcoinOtcExample\(\)/);
  assert.match(sandbox, /fetch\(`\$\{base\}\/examples\/\$\{bitcoinOtcManifest\.bootstrapPath\}`\)/);
  assert.match(sandbox, /bitcoinOtcManifest\.shards\.length/);
  assert.match(sandbox, /<progress[\s\S]*?Avanzamento caricamento Bitcoin OTC/);
  assert.match(sandbox, /Riprendi/);
});
