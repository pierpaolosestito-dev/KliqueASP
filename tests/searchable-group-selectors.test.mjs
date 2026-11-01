import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentPaths = [
  "ContextualCliquePanel.svelte",
  "MotifAnalysisPanel.svelte",
  "StructuralAnalysisPanel.svelte",
  "SolverPanel.svelte"
];
const components = await Promise.all(componentPaths.map(async (name) => [
  name,
  await readFile(new URL(`../src/lib/kliqueasp/components/${name}`, import.meta.url), "utf8")
]));

test("group pickers in analysis panels use searchable progressive options", () => {
  for (const [name, source] of components) {
    assert.match(source, /import SearchableNodeSelect from "\.\/SearchableNodeSelect\.svelte"/, `${name} should use the shared accessible picker`);
    assert.match(source, /availableGroups\.map\(\(group\) => \(\{ value: group, label: group \}\)\)/, `${name} should retain each group as a searchable value and label`);
    assert.doesNotMatch(source, /\{#each availableGroups as group/,
      `${name} should not mount a native option element for every group`);
  }
  assert.match(components[0][1], /on:change=\{criteriaChanged\}/, "contextual clique changes must preserve its run-again notice");
  assert.match(components[1][1], /on:change=\{clearResults\}/, "motif group changes must invalidate the previous result");
  assert.match(components[1][1], /on:change=\{clearSignedTriadResults\}/, "signed-triad group changes must clear the previous result");
  assert.match(components[2][1], /availableGroupSearchOptions/, "structural analyses should search both candidate and target groups");
  assert.match(components[3][1], /groupSelectionChanged = \(selectedGroup \|\| ""\) !== \(stats\?\.selectedGroup \|\| ""\)/,
    "the clique panel should continue indicating when the selected group differs from the analyzed group");
});

test("projection group checkboxes are searchable and progressively disclosed", async () => {
  const app = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  assert.match(app, /const groupFilterPageSize = 15/);
  assert.match(app, /group\.toLowerCase\(\)\.includes\(groupFilterSearch\.trim\(\)\.toLowerCase\(\)\)/);
  assert.match(app, /\{#each visibleGroupFilters as group/);
  assert.match(app, /aria-label="Cerca un gruppo nel filtro della proiezione"/);
  assert.match(app, /checked=\{selectedGroupsFilter\.has\(group\)\}/);
  assert.match(app, /on:change=\{\(e\) => toggleGroupFilter\(group/);
  assert.match(app, /total=\{matchingGroupFilters\.length\}[\s\S]*?visible=\{visibleGroupFilters\.length\}/);
  assert.doesNotMatch(app, /\{#each availableGroups as group/,
    "the projection panel should not mount all group checkboxes at once");
});
