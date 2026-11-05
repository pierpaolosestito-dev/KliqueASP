import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8");
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("le violazioni mostrano etichette e ID per i nodi coinvolti", () => {
  assert.match(panel, /ProgressiveList items=\{violation\.nodeIds\} resetKey=\{violation\} label="nodi della violazione" let:item>\s*<span>\{displayResultNode\(item\)\}<\/span>/);
  assert.match(panel, /function displayResultNode\(nodeId: string\): string\s*\{\s*return displayNodeResultLabel\(nodeId, nodeLabelById, sourceIdByNodeId\);/);
});

test("le proposte che modificano un nodo espongono un nome leggibile senza perdere l'ID", () => {
  assert.match(panel, /Assegnare \$\{candidate\.attribute\}[\s\S]*?al nodo \$\{displayResultNode\(candidate\.nodeId\)\}/);
  assert.match(panel, /Sostituire \$\{candidate\.attribute\} del nodo \$\{displayResultNode\(candidate\.nodeId\)\}/);
  assert.match(panel, /Correggere il tipo del nodo \$\{displayResultNode\(candidate\.nodeId\)\}/);
});

test("il pannello integrita riceve le etichette e gli ID del grafo sorgente", () => {
  assert.match(graphApp, /\$:\s*nodeLabelById\s*=\s*Object\.assign\(Object\.create\(null\),\s*Object\.fromEntries\(\(originalData\?\.nodes \?\? \[\]\)\.map/);
  assert.match(graphApp, /<IntegrityPanel[\s\S]*?\{nodeLabelById\}/);
  assert.match(graphApp, /<IntegrityPanel[\s\S]*?\{sourceIdByNodeId\}/);
});
