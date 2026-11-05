import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildGraphNodeDirectoryEntries } from "../src/lib/kliqueasp/graph/nodeDirectory.ts";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const directory = await readFile(new URL("../src/lib/kliqueasp/components/GraphNodeDirectory.svelte", import.meta.url), "utf8");

test("l'elenco dei nodi usa etichette di ripiego e un ordinamento stabile", () => {
  assert.deepEqual(buildGraphNodeDirectoryEntries([
    { id: "z", label: "Zeta", type: "Persona" },
    { id: "2", label: "" },
    { id: "a", label: "alfa" },
    { id: "b", label: "Alfa" },
    { label: "senza ID" }
  ]), [
    { id: "2", label: "2", type: "" },
    { id: "a", label: "alfa", type: "" },
    { id: "b", label: "Alfa", type: "" },
    { id: "z", label: "Zeta", type: "Persona" }
  ]);
});

test("l'elenco rispetta l'insieme di nodi effettivamente mostrato nel focus del grafo", () => {
  const nodes = [
    { id: "root", label: "Radice" },
    { id: "neighbor", label: "Vicino" },
    { id: "outside", label: "Fuori focus" }
  ];

  assert.deepEqual(
    buildGraphNodeDirectoryEntries(nodes, new Set(["root", "neighbor"])).map(({ id }) => id),
    ["root", "neighbor"]
  );
  assert.deepEqual(
    buildGraphNodeDirectoryEntries(nodes, new Set()).map(({ id }) => id),
    []
  );
});

test("l'elenco testuale consente ricerca accessibile per nome, ID e tipo e carica i nodi a pagine", () => {
  assert.match(directory, /export let searchInputId = "graph-node-directory-search"/);
  assert.match(directory, /<label for=\{searchInputId\}>Cerca per nome, ID o tipo<\/label>/);
  assert.match(directory, /node\.label\.toLocaleLowerCase\("it"\)\.includes\(normalizedQuery\)/);
  assert.match(directory, /node\.id\.toLocaleLowerCase\("it"\)\.includes\(normalizedQuery\)/);
  assert.match(directory, /node\.type\.toLocaleLowerCase\("it"\)\.includes\(normalizedQuery\)/);
  assert.match(directory, /const pageSize = 20/);
  assert.match(directory, /aria-pressed=\{selectedNodeId === node\.id\}/);
  assert.match(directory, /role="status" aria-live="polite"/);
  assert.match(directory, /Nessun nodo visibile nella vista corrente/);
  assert.match(directory, /Nessun nodo corrisponde alla ricerca/);
  assert.match(directory, /<button class="directory-clear-search" type="button" on:click=\{clearSearch\}>Cancella ricerca<\/button>/);
  assert.match(directory, /import \{ tick \} from "svelte"/);
  assert.match(directory, /bind:this=\{searchInputElement\}/);
  assert.match(directory, /async function clearSearch\(\)\s*\{\s*query = "";\s*visibleLimit = pageSize;\s*await tick\(\);\s*searchInputElement\?\.focus\(\);/);
  assert.match(directory, /Reimposta filtri e vista per ripristinare l'elenco/);
});

test("la directory riflette i focus di vicinato e dei witness triadici e riusa la selezione del grafo", () => {
  assert.match(graphApp, /focusedSignedTriadEdgeIds !== null\s*\? cliqueNodes\s*:\s*neighborhoodFocusNodeIds/);
  assert.match(graphApp, /buildGraphNodeDirectoryEntries\(\s*data\?\.nodes \?\? \[\],\s*graphDirectoryFocusNodeIds\s*\)/);
  assert.match(graphApp, /function selectGraphDirectoryNode\(id: string\)\s*\{\s*selectRoot\(id\);\s*closeToolbarMenus\(\);\s*\}/);
  assert.match(graphApp, /<GraphNodeDirectory\s+nodes=\{graphNodeDirectoryNodes\}\s+selectedNodeId=\{selectedId\}\s+onSelect=\{selectGraphDirectoryNode\}/);
  assert.equal((graphApp.match(/<summary>Nodi · \{graphNodeDirectoryNodes\.length\}<\/summary>/g) ?? []).length, 2);
  const viewMenu = graphApp.slice(graphApp.indexOf('<summary>Vista '), graphApp.indexOf('</details>', graphApp.indexOf('<summary>Vista ')));
  assert.doesNotMatch(viewMenu, /GraphNodeDirectory|Nodi ·|Elenco nodi/);
  assert.match(graphApp, /<details class="toolbar-menu graph-node-directory node-directory-menu desktop-toolbar-control">[\s\S]*?GraphNodeDirectory/);
  assert.match(graphApp, /\.node-directory-menu > \.node-directory-content \{ right: 0; left: auto;/);
  assert.match(graphApp, /<details class="graph-node-directory mobile-node-directory">[\s\S]*?searchInputId="mobile-graph-node-directory-search"/);
});
