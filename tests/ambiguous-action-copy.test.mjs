import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contextualClique = await readFile(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8");
const historyPanel = await readFile(new URL("../src/lib/kliqueasp/components/HistoryPanel.svelte", import.meta.url), "utf8");
const jsonEditor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");
const structuralPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");

test("result clearing and analysis archive actions name what they remove", () => {
  assert.match(contextualClique, /on:click=\{clear\}>Cancella risultati<\/button>/);
  assert.doesNotMatch(contextualClique, /on:click=\{clear\}>Cancella<\/button>/);
  assert.match(historyPanel, /on:click=\{onClearAnalysisArchive\} title="Svuota archivio delle analisi">\s*Svuota archivio\s*<\/button>/);
  assert.doesNotMatch(historyPanel, /on:click=\{onClearAnalysisArchive\}[\s\S]{0,120}>\s*Svuota\s*</);
});

test("repeated mapping and path-step actions name the object they change", () => {
  assert.ok(jsonEditor.includes('on:click={() => addAttributeMapping("node")} disabled={Boolean(nodeAttributeAddBlocker)}>Aggiungi attributo nodo</button>'));
  assert.ok(jsonEditor.includes('on:click={() => addAttributeMapping("edge")} disabled={Boolean(edgeAttributeAddBlocker)}>Aggiungi attributo arco</button>'));
  assert.doesNotMatch(jsonEditor, /addAttributeMapping\("(?:node|edge)"\)[^\n]*>Aggiungi<\/button>/);
  assert.ok(structuralPanel.includes('aria-label={`Rimuovi passo ${index + 1}`} title={`Rimuovi passo ${index + 1}`} on:click={() => removePathTypeStep(index)}>Rimuovi passo</button>'));
  assert.doesNotMatch(structuralPanel, /on:click=\{\(\) => removePathTypeStep\(index\)\}>Rimuovi<\/button>/);
});
