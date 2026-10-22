import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { BASE_PATH, resolveBuildPath } from "../scripts/serve-static-base-path.mjs";
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
