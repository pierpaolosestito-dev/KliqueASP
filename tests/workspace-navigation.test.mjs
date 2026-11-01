import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navigation = await readFile(new URL("../src/lib/kliqueasp/components/WorkspaceNavigation.svelte", import.meta.url), "utf8");
const homePage = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
const caseStudyPage = await readFile(new URL("../src/routes/PsychologyHistoryGraph/+page.svelte", import.meta.url), "utf8");

test("home links directly to the data-driven workspace and preserves access to the psychology case study", () => {
  assert.match(homePage, /<WorkspaceNavigation variant="home"\s*\/>/);
  assert.match(navigation, /href=\{workspaceHref\}>Apri area di lavoro<\/a>/);
  assert.match(navigation, /href=\{caseStudyHref\}>Caso studio psicologi<\/a>/);
  assert.match(navigation, /const workspaceHref = `\$\{base\}\/Sandbox\/`/);
  assert.match(navigation, /const caseStudyHref = `\$\{base\}\/PsychologyHistoryGraph\/`/);
});

test("the psychology live route offers a direct path from the case study to user-provided graphs", () => {
  assert.match(caseStudyPage, /<WorkspaceNavigation variant="case-study"\s*\/>/);
  assert.match(navigation, /href=\{workspaceHref\}>Analizza i tuoi dati<\/a>/);
  assert.match(navigation, /aria-label="Navigazione KliqueASP"/);
});

test("workspace navigation stays below the compact toolbar when the viewport is narrow", () => {
  assert.match(navigation, /@media \(max-width: 1280px\)[\s\S]*top: calc\(var\(--toolbar-top, 10px\) \+ var\(--toolbar-height, 170px\) \+ 8px\)/);
  assert.match(navigation, /@media \(max-width: 600px\)[\s\S]*left: 12px[\s\S]*right: 12px[\s\S]*flex-wrap: wrap/);
});
