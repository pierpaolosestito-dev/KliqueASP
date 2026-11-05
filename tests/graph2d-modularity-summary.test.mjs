import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the 2D structural summary receives the verified modularity value and scope", async () => {
  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  assert.match(graphApp, /modularity: structuralStats\.modularity,[\s\S]*?modularityResolution: structuralStats\.modularityResolution,[\s\S]*?weightedModularity: structuralStats\.weightedModularity/);
});
