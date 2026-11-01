import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("CSV downloads announce their filename through a mounted polite status", async () => {
  const component = await readFile(new URL("../src/lib/kliqueasp/components/DownloadAnnouncement.svelte", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

  assert.match(component, /window\.addEventListener\(CSV_DOWNLOAD_REQUESTED_EVENT, announceDownload\)/);
  assert.match(component, /Richiesta di download inviata al browser: \$\{filename\}/);
  assert.match(component, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(component, /clearMessageTimer = setTimeout\(\(\) => \{/);
  assert.match(app, /import DownloadAnnouncement from "\.\/components\/DownloadAnnouncement\.svelte"/);
  assert.match(app, /<DownloadAnnouncement\s*\/>/);
});
