import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GraphJsonTextParseError, parseGraphJsonTexts } from "../src/lib/kliqueasp/graph/graphJsonText.ts";

const [sandbox, jsonEditor, jsonCodeEditor] = await Promise.all([
  readFile(new URL("../src/routes/Sandbox/+page.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/JsonCodeEditor.svelte", import.meta.url), "utf8")
]);

test("editor JSON parsing identifies invalid configuration text", () => {
  assert.throws(
    () => parseGraphJsonTexts("{ invalid", JSON.stringify({ nodes: [], edges: [] })),
    (error) => {
      assert.ok(error instanceof GraphJsonTextParseError);
      assert.equal(error.input, "configurazione");
      assert.match(error.message, /Il JSON della configurazione non è valido/);
      assert.ok(error.technicalDetails.length > 0);
      return true;
    }
  );
});

test("editor JSON parsing identifies invalid dataset text after valid configuration", () => {
  assert.throws(
    () => parseGraphJsonTexts(JSON.stringify({}), "{ invalid"),
    (error) => {
      assert.ok(error instanceof GraphJsonTextParseError);
      assert.equal(error.input, "dataset");
      assert.match(error.message, /Il JSON del dataset non è valido/);
      assert.ok(error.technicalDetails.length > 0);
      return true;
    }
  );
});

test("valid editor JSON is returned unchanged for the existing graph normalization step", () => {
  const config = { solver: { taskTimeoutMs: 20 } };
  const dataset = { nodes: [{ id: "a" }], links: [{ source: "a", target: "a" }] };
  assert.deepEqual(parseGraphJsonTexts(JSON.stringify(config), JSON.stringify(dataset)), {
    graphConfig: config,
    graphData: dataset
  });
});

test("the editor presents concise Italian apply errors and keeps parser text in an optional disclosure", () => {
  assert.match(sandbox, /parseGraphJsonTexts\(configText, datasetText\)/);
  assert.match(sandbox, /errorTechnicalDetails = error\.technicalDetails/);
  assert.match(jsonEditor, /id="graph-config"[\s\S]*?invalid=\{errorInput === "configurazione"\}[\s\S]*?describedBy=\{errorInput === "configurazione" \? "graph-apply-error" : undefined\}/);
  assert.match(jsonEditor, /id="graph-dataset"[\s\S]*?invalid=\{errorInput === "dataset"\}[\s\S]*?describedBy=\{errorInput === "dataset" \? "graph-apply-error" : undefined\}/);
  assert.match(jsonCodeEditor, /aria-label=\{ariaLabel\}/);
  assert.match(jsonCodeEditor, /aria-invalid=\{invalid \? "true" : undefined\}[\s\S]*?aria-describedby=\{describedBy\}/);
  assert.match(jsonEditor, /<div id="graph-apply-error" class="error-box" role="alert">[\s\S]*?<summary>Dettagli tecnici<\/summary>[\s\S]*?<pre>\{errorTechnicalDetails\}<\/pre>/);
  assert.match(sandbox, /errorInput = error\.input/);
  assert.match(sandbox, /onConfigTextChange:[\s\S]*?errorInput = ""/);
  assert.match(sandbox, /onDatasetTextChange:[\s\S]*?errorInput = ""/);
});

test("project import failures use the file error presentation once and keep technical detail", () => {
  assert.match(sandbox, /import \{ GraphJsonUploadReadError \} from "\$lib\/kliqueasp\/graph\/graphJsonUpload"/);
  assert.match(sandbox, /function loadProject\(project: unknown\) \{[\s\S]*?errorMessage = "";[\s\S]*?applyJson\(\);[\s\S]*?const message = errorMessage;[\s\S]*?const technicalDetails = errorTechnicalDetails;[\s\S]*?errorMessage = "";[\s\S]*?throw new GraphJsonUploadReadError\(message, technicalDetails\)/);
});
