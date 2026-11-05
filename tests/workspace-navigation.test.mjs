import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [homePage, sandboxPage, caseStudyPage, graphApp] = await Promise.all([
  readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/routes/Sandbox/+page.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/routes/PsychologyHistoryGraph/+page.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8")
]);

function colorFromRule(selector, property = "color") {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = homePage.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1];
  assert.ok(rule, `expected a CSS rule for ${selector}`);
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const color = rule.match(new RegExp(`(?:^|;)\\s*${escapedProperty}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`))?.[1];
  assert.ok(color, `expected ${property} color in ${selector}`);
  return color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color;
}

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255);
    const [red, green, blue] = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("the landing page offers direct data, project, and example entry points", () => {
  assert.match(homePage, /href=\{`\$\{workspaceHref\}\?start=data`\}>[\s\S]*?Carica i miei dati/);
  assert.match(homePage, /href=\{`\$\{workspaceHref\}\?start=project`\}>[\s\S]*?Apri un progetto/);
  assert.match(homePage, /href=\{`\$\{workspaceHref\}\?start=example&example=karate-club`\} target="_blank" rel="noopener">[\s\S]*?Prova un esempio/);
  assert.match(homePage, /class="examples-grid"[\s\S]*?each graphExamples as example/);
  assert.match(homePage, /target="_blank" rel="noopener"/);
  assert.match(homePage, /const workspaceHref = `\$\{base\}\/Sandbox\/`/);
  assert.match(homePage, /const caseStudyHref = `\$\{base\}\/PsychologyHistoryGraph\/`/);
  assert.doesNotMatch(homePage, /<GraphApp/);
});

test("the narrow mobile landing page prioritizes entry actions over its decorative graph", () => {
  assert.match(homePage, /@media \(max-width: 340px\)[\s\S]*?\.hero-art\s*\{\s*display: none;/);
  assert.match(homePage, /<nav class="start-actions" aria-label="Inizia un'analisi">/);
  assert.match(homePage, /:global\(html\) \{ min-width: 280px/);
  assert.match(homePage, /overflow-x: hidden;\s*overflow-y: auto;/);
  assert.match(homePage, /\.examples-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
});

test("landing-page secondary copy keeps WCAG AA contrast on its intended surfaces", () => {
  const combinations = [
    [".action-copy small", "#ffffff"],
    [".start-action--primary .action-copy small", "#17675f"],
    [".art-caption", "#f4f7f5"],
    [".art-note", "#ffffff"],
    [".case-study-eyebrow", "#ffffff"],
    [".case-study-copy > p:last-child", "#ffffff"],
    [".case-study-button", "#f4f7f5"],
    [".examples-heading > p", "#f4f7f5"],
    [".example-card-title", "#ffffff"],
    [".example-card-description", "#ffffff"],
    [".example-card-open", "#ffffff"],
    [".page-footer", "#f4f7f5"]
  ];

  for (const [selector, background] of combinations) {
    const ratio = contrastRatio(colorFromRule(selector), background);
    assert.ok(ratio >= 4.5, `${selector} contrast is ${ratio.toFixed(2)}:1`);
  }
});

test("workspace startup actions restore regular work and isolate examples from the shared session", () => {
  assert.match(sandboxPage, /type WorkspaceStartAction = "data" \| "project" \| "example"/);
  assert.match(sandboxPage, /new URLSearchParams\(search\)\.get\("start"\)/);
  assert.match(sandboxPage, /startAction === "data" \|\| startAction === "project"\) editorOpen = true/);
  assert.match(sandboxPage, /readWorkspaceExampleId\(search: string\): WorkspaceExampleId/);
  assert.match(sandboxPage, /startAction === "example"\) \{\s*sessionPersistenceEnabled = false;[\s\S]*?loadWorkspaceExample\(exampleId\)/);
  assert.match(sandboxPage, /if \(!sessionReady \|\| !sessionPersistenceEnabled\) return/);
  assert.match(sandboxPage, /\$: sessionSnapshot = sessionReady && sessionPersistenceEnabled \?/);
  assert.match(sandboxPage, /async function loadWorkspaceExample\(exampleId: WorkspaceExampleId\)[\s\S]*?case "sociopatterns-invs-full":[\s\S]*?await loadFullInVSExample\(\)/);
  assert.match(sandboxPage, /restoreWorkbenchSession\(\)\.then\(\(\) => \{[\s\S]*?startAction === "data"/);
  assert.match(sandboxPage, /cleanUrl\.searchParams\.delete\("start"\)/);
  assert.match(sandboxPage, /cleanUrl\.searchParams\.delete\("example"\)/);
});

test("the psychology case study remains reachable and returns to the workspace from its toolbar", () => {
  assert.match(homePage, /class="case-study-link" href=\{caseStudyHref\}/);
  assert.match(homePage, /class="case-study-button" href=\{caseStudyHref\}/);
  assert.doesNotMatch(caseStudyPage, /WorkspaceNavigation/);
  assert.match(caseStudyPage, /const workspaceHref = `\$\{base\}\/Sandbox\//);
  assert.match(caseStudyPage, /workspaceNavigationHref=\{workspaceHref\}/);
  assert.match(graphApp, /export let workspaceNavigationHref = ""/);
  assert.match(graphApp, /<a class="toolbar-button desktop-toolbar-control workspace-toolbar-action" href=\{workspaceNavigationHref\}[^>]*>I miei dati<\/a>/);
  assert.match(graphApp, /<a class="workspace-route-action" href=\{workspaceNavigationHref\}>Analizza i tuoi dati<\/a>/);
});

test("the case-study toolbar route stays reachable on mobile and does not use a floating CTA", () => {
  assert.match(graphApp, /<details class="toolbar-menu mobile-toolbar-more"[\s\S]*?<a class="workspace-route-action" href=\{workspaceNavigationHref\}>Analizza i tuoi dati<\/a>/);
  assert.match(graphApp, /\.toolbar-menu \.menu-content > a \{\s*display: none;/);
  assert.match(graphApp, /\.toolbar \.mobile-toolbar-more \.workspace-route-action \{ display: block; \}/);
  assert.doesNotMatch(caseStudyPage, /<nav class="workspace-navigation"/);
});
