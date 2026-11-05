import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";

const editor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");
const sandbox = await readFile(new URL("../src/routes/Sandbox/+page.svelte", import.meta.url), "utf8");

test("creating a blank project requires confirmation and announces the replacement scope", () => {
  assert.match(editor, /export let onCreateProject: \(\) => void/);
  assert.match(editor, /<section class="data-actions" aria-label="Gestisci progetti e dati">[\s\S]*?showNewProjectConfirmation/);
  assert.match(editor, /on:click=\{requestNewProjectConfirmation\}[\s\S]*?Nuovo progetto/);
  assert.match(editor, /aria-labelledby="new-project-confirmation-title"/);
  assert.match(editor, /aria-describedby="new-project-confirmation-description"/);
  assert.match(editor, /Nome, dati e configurazione correnti saranno sostituiti\. Esporta il progetto per conservarne una copia\./);
  assert.match(editor, /Crea progetto vuoto/);
  assert.match(editor, /async function requestNewProjectConfirmation\(\)[\s\S]*?newProjectCancelButton\?\.focus\(\)/);
  assert.match(editor, /function handleNewProjectConfirmationKeydown\(event: KeyboardEvent\)[\s\S]*?event\.key !== "Escape"[\s\S]*?cancelNewProjectConfirmation/);
  assert.match(editor, /async function confirmNewProject\(\)[\s\S]*?onCreateProject\(\)/);
  assert.match(editor, /\.data-actions > \.reset-confirmation\s*\{\s*width: 100%;/);
  assert.match(editor, /async function requestResetConfirmation\(\)[\s\S]*?showNewProjectConfirmation = false/);
  assert.match(editor, /async function requestNewProjectConfirmation\(\)[\s\S]*?showResetConfirmation = false/);
});

test("a blank project starts with a valid empty graph and the workspace default mapping", () => {
  const createStart = sandbox.indexOf("  function createNewProject() {");
  const saveStart = sandbox.indexOf("  function saveProject() {", createStart);
  assert.ok(createStart >= 0 && saveStart > createStart, "the new-project action should remain explicit");
  const createProject = sandbox.slice(createStart, saveStart);
  assert.match(createProject, /projectName = "Nuovo progetto"/);
  assert.match(createProject, /configText = DEFAULT_CONFIG_TEXT/);
  assert.match(createProject, /datasetText = JSON\.stringify\(\{ nodes: \[\], edges: \[\] \}, null, 2\)/);
  assert.match(createProject, /applyJson\(\)/);
  assert.match(createProject, /projectDirty = true/);

  const normalized = normalizeGraphData(
    { nodes: [], edges: [] },
    {
      features: { timeline: true },
      nodeTypes: {
        actor: {
          timeline: { startField: "$.data.active_from", endField: "$.data.active_to" },
          group: "$.data.affiliations[*].group"
        }
      }
    }
  );
  assert.equal(normalized.valid, true);
  assert.deepEqual(normalized.nodes, []);
  assert.deepEqual(normalized.links, []);
});
