import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BASE_PATH, createStaticBasePathServer, resolveBuildPath } from "../scripts/serve-static-base-path.mjs";
import svelteConfig from "../svelte.config.js";
import * as rootLayoutOptions from "../src/routes/+layout.ts";

const buildDirectory = path.resolve("test-build-root");

test("the configured base path uses root-relative assets for nested and trailing-slash routes", () => {
  assert.equal(svelteConfig.kit.paths.base, BASE_PATH);
  assert.equal(svelteConfig.kit.paths.relative, false);
  assert.equal(rootLayoutOptions.trailingSlash, "always");
});

test("the static preview redirects the site root to its configured base path", () => {
  assert.deepEqual(resolveBuildPath("/", buildDirectory), {
    kind: "redirect",
    location: `${BASE_PATH}/`
  });
  assert.deepEqual(resolveBuildPath(BASE_PATH, buildDirectory), {
    kind: "redirect",
    location: `${BASE_PATH}/`
  });
});

test("the static preview maps base-path directory pages and assets into the build directory", () => {
  assert.deepEqual(resolveBuildPath(`${BASE_PATH}/`, buildDirectory), {
    kind: "file",
    filePath: path.join(buildDirectory, "index.html")
  });
  assert.deepEqual(resolveBuildPath(`${BASE_PATH}/PsychologyHistoryGraph`, buildDirectory), {
    kind: "file",
    filePath: path.join(buildDirectory, "PsychologyHistoryGraph", "index.html")
  });
  assert.deepEqual(resolveBuildPath(`${BASE_PATH}/PsychologyHistoryGraph/`, buildDirectory), {
    kind: "file",
    filePath: path.join(buildDirectory, "PsychologyHistoryGraph", "index.html")
  });
  assert.deepEqual(resolveBuildPath(`${BASE_PATH}/Sandbox/`, buildDirectory), {
    kind: "file",
    filePath: path.join(buildDirectory, "Sandbox", "index.html")
  });
  assert.deepEqual(resolveBuildPath(`${BASE_PATH}/_app/immutable/entry/start.js`, buildDirectory), {
    kind: "file",
    filePath: path.join(buildDirectory, "_app", "immutable", "entry", "start.js")
  });
});

test("the static preview rejects malformed and traversal paths", () => {
  assert.deepEqual(resolveBuildPath(`${BASE_PATH}/%2e%2e/package.json`, buildDirectory), {
    kind: "forbidden"
  });
  assert.deepEqual(resolveBuildPath(`${BASE_PATH}/%5c..%5cpackage.json`, buildDirectory), {
    kind: "bad-request"
  });
  assert.deepEqual(resolveBuildPath(`${BASE_PATH}/%ZZ`, buildDirectory), {
    kind: "bad-request"
  });
  assert.deepEqual(resolveBuildPath("/other/site/index.html", buildDirectory), {
    kind: "not-found"
  });
});

test("the static preview serves opt-in diagnostics with opt-in cross-origin isolation", async () => {
  const temporaryBuildDirectory = await mkdtemp(path.join(os.tmpdir(), "kliqueasp-static-preview-"));
  await writeFile(path.join(temporaryBuildDirectory, "index.html"), "<!doctype html><title>probe</title>");
  const diagnosticFile = path.join(temporaryBuildDirectory, "diagnostic.html");
  await writeFile(diagnosticFile, "<!doctype html><title>diagnostic</title>");

  async function readRootHeaders(crossOriginIsolated) {
    const server = createStaticBasePathServer({
      buildDirectory: temporaryBuildDirectory,
      crossOriginIsolated,
      additionalFiles: { [`${BASE_PATH}/diagnostic.html`]: diagnosticFile }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    try {
      const rootResponse = await fetch(`http://127.0.0.1:${address.port}${BASE_PATH}/`, {
        headers: { Connection: "close" }
      });
      await rootResponse.text();
      const diagnosticResponse = await fetch(`http://127.0.0.1:${address.port}${BASE_PATH}/diagnostic.html`, {
        headers: { Connection: "close" }
      });
      assert.equal(diagnosticResponse.status, 200);
      assert.match(await diagnosticResponse.text(), /<title>diagnostic<\/title>/);
      return rootResponse.headers;
    } finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }

  try {
    const defaultHeaders = await readRootHeaders(false);
    assert.equal(defaultHeaders.get("cross-origin-opener-policy"), null);
    assert.equal(defaultHeaders.get("cross-origin-embedder-policy"), null);

    const isolatedHeaders = await readRootHeaders(true);
    assert.equal(isolatedHeaders.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(isolatedHeaders.get("cross-origin-embedder-policy"), "require-corp");
  } finally {
    await rm(temporaryBuildDirectory, { recursive: true, force: true });
  }
});
