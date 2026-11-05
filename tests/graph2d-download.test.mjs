import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildGraph2DDownloadFilename,
  GRAPH2D_OBJECT_URL_REVOKE_DELAY_MS,
  scheduleGraph2DObjectUrlRevocation
} from "../src/lib/kliqueasp/graph/graph2dDownload.ts";

test("2D download filenames identify scope, sanitize labels, and use the supplied date", () => {
  const date = new Date(2026, 9, 29, 23, 59, 59);
  assert.equal(
    buildGraph2DDownloadFilename("witness", "Comunità 1 evidenziata · partizione ottima 1", "svg", date),
    "kliqueasp-testimone-comunita-1-evidenziata-partizione-ottima-1-2026-10-29.svg"
  );
  assert.equal(
    buildGraph2DDownloadFilename("projection", "!!!", "png", date),
    "kliqueasp-proiezione-rete-2026-10-29.png"
  );
  assert.equal(
    buildGraph2DDownloadFilename("projection", "Proiezione corrente", "svg", date),
    "kliqueasp-proiezione-corrente-2026-10-29.svg"
  );
  assert.equal(
    buildGraph2DDownloadFilename("witness", "Testimone · comunità 1", "png", date),
    "kliqueasp-testimone-comunita-1-2026-10-29.png"
  );
  assert.equal(
    buildGraph2DDownloadFilename("projection", "a".repeat(80), "svg", date),
    `kliqueasp-proiezione-${"a".repeat(48)}-2026-10-29.svg`
  );
});

test("2D blob URLs stay alive through the browser's download-start window", () => {
  let scheduledCallback;
  let scheduledDelay = 0;
  const revoked = [];
  scheduleGraph2DObjectUrlRevocation("blob:graph-export", (url) => revoked.push(url), (callback, delay) => {
    scheduledCallback = callback;
    scheduledDelay = delay;
    return 0;
  });

  assert.equal(GRAPH2D_OBJECT_URL_REVOKE_DELAY_MS, 30_000);
  assert.equal(scheduledDelay, GRAPH2D_OBJECT_URL_REVOKE_DELAY_MS);
  assert.deepEqual(revoked, []);
  scheduledCallback();
  assert.deepEqual(revoked, ["blob:graph-export"]);
});

test("2D download actions announce the requested filename accessibly", async () => {
  const component = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");
  assert.match(component, /scheduleGraph2DObjectUrlRevocation\(url,/);
  assert.match(component, /downloadStatus = `Richiesta di download inviata al browser:/);
  assert.doesNotMatch(component, /\{#if downloadStatus\}/);
  assert.match(component, /class:has-message=\{Boolean\(downloadStatus\.trim\(\)\)\}/);
  assert.match(component, /class="download-status"[\s\S]{0,180}role="status"[\s\S]{0,40}aria-live="polite"[\s\S]{0,40}aria-atomic="true"[\s\S]{0,80}>\{downloadStatus\.trim\(\)\}<\/div>/);
});
