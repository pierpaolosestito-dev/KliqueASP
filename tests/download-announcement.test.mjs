import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WORKBENCH_ANNOUNCEMENT_EVENT } from "../src/lib/kliqueasp/workbenchAnnouncement.ts";

test("CSV downloads announce their filename through a mounted polite status", async () => {
  const component = await readFile(new URL("../src/lib/kliqueasp/components/DownloadAnnouncement.svelte", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

  assert.match(component, /window\.addEventListener\(CSV_DOWNLOAD_REQUESTED_EVENT, announce\)/);
  assert.match(component, /window\.addEventListener\(WORKBENCH_ANNOUNCEMENT_EVENT, announce\)/);
  assert.match(component, /Richiesta di download inviata al browser: \$\{filename\}/);
  assert.match(component, /showMessage\(message\)/);
  assert.doesNotMatch(component, /\{#if message\}/);
  assert.match(component, /class:has-message=\{Boolean\(message\.trim\(\)\)\}/);
  assert.match(component, /role="status"\s+aria-live="polite"\s+aria-atomic="true"/);
  assert.match(component, /\{message\.trim\(\)\}/);
  assert.match(component, /\.download-announcement:not\(\.has-message\)/);
  assert.match(component, /clearMessageTimer = setTimeout\(\(\) => \{/);
  assert.equal((component.match(/top: calc\(var\(--toolbar-top, 16px\) \+ var\(--toolbar-height, 48px\) \+ 10px\);/g) ?? []).length, 2,
    "the notice should follow the measured toolbar height on desktop and mobile");
  assert.doesNotMatch(component, /top: 72px/);
  assert.match(app, /import DownloadAnnouncement from "\.\/components\/DownloadAnnouncement\.svelte"/);
  assert.match(app, /<DownloadAnnouncement\s*\/>/);
});

test("l'import progetto annuncia dopo il rimontaggio keyed e ripristina il focus", async () => {
  const editor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");
  const projectBranch = editor.match(/onLoadProject\(parsed\);[\s\S]{0,800}?void restorePanelFocus\(\);/)?.[0] ?? "";

  assert.ok(projectBranch.includes("fileMessage = `Progetto caricato da ${file.name}.`;"));
  assert.match(projectBranch, /await tick\(\)/);
  assert.match(projectBranch, /announceWorkbenchStatus\(fileMessage\)/);
  assert.match(projectBranch, /void restorePanelFocus\(\)/);
  const requiredOrder = [
    "onLoadProject(parsed)",
    "await tick()",
    "announceWorkbenchStatus(fileMessage)",
    "onClose()",
    "void restorePanelFocus()"
  ];
  assert.deepEqual(requiredOrder.map((step) => projectBranch.indexOf(step)),
    [...requiredOrder.map((step) => projectBranch.indexOf(step))].sort((left, right) => left - right));
});

test("workbench announcements trim status messages and ignore empty messages", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const target = new EventTarget();
  const received = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  try {
    target.addEventListener(WORKBENCH_ANNOUNCEMENT_EVENT, (event) => received.push(event.detail.message));
    const { announceWorkbenchStatus } = await import("../src/lib/kliqueasp/workbenchAnnouncement.ts");
    announceWorkbenchStatus("  Progetto caricato da rete.json.  ");
    announceWorkbenchStatus("   ");
    assert.deepEqual(received, ["Progetto caricato da rete.json."]);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
  }
});
