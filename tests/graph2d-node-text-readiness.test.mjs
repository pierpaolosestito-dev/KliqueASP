import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");

test("disabled 2D label controls describe their graph-size limit", () => {
  assert.match(panel, /id="graph2d-node-text-limit"[^>]*>Nomi, ID e annotazioni sono disattivati oltre/);
  assert.equal((panel.match(/aria-describedby=\{!nodeTextAvailable \? "graph2d-node-text-limit" : undefined\}/g) ?? []).length, 3);
});

test("a selected path explains why its node order cannot be changed", () => {
  assert.match(panel, /aria-describedby="graph2d-path-order-note" \/> Ordine del cammino/);
  assert.match(panel, /id="graph2d-path-order-note">La sequenza è fissata dal percorso selezionato\./);
});
