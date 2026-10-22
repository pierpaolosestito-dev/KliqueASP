import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, serializeCsv } from "../src/lib/kliqueasp/csvExport.ts";
import { buildAspFactsFromGraph, buildCliqueProgram, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildCliqueSupportingExportRows } from "../src/lib/kliqueasp/graph/cliqueCsvExport.ts";
import {
  buildEdgeProvenanceBySourceId,
  buildEdgeProvenanceReferencesBySourceId
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      assert.equal(field, "", "una virgoletta CSV apre un campo solo all'inizio");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\r" || character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }
  }

  assert.equal(quoted, false, "il CSV termina fuori da un campo quotato aperto");
  if (row.length > 0 || field !== "") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

test("CSV cell quoting escapes quotes, commas, and line breaks", () => {
  assert.equal(csvCell('a,"b"\r\nc'), '"a,""b""\r\nc"');
  assert.equal(csvCell(null), '""');
});

test("CSV cell quoting neutralizes spreadsheet formulas after whitespace or BOM", () => {
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell(" \t@SUM(A1:A2)"), '"\' \t@SUM(A1:A2)"');
  assert.equal(csvCell("\uFEFF-HYPERLINK(\"https://example.invalid\")"), '"\'\uFEFF-HYPERLINK(""https://example.invalid"")"');
});

test("CSV serialization preserves numeric values and row boundaries", () => {
  assert.equal(serializeCsv([
    ["node_id", "score", "label"],
    ["=unsafe", -2, "A, B"]
  ]), '"node_id","score","label"\n"\'=unsafe","-2","A, B"');
});

test("structured JSON witness cells round-trip identifiers and provenance containing the display separator", () => {
  const witness = {
    element_ids: ["node|a", 'node,"b"'],
    supporting_edge_evidence: [{ edge_id: "edge|1", provenance_references: ["archive|2024", 'file,"A"'] }]
  };
  const parsed = parseCsv(serializeCsv([
    ["structured_witness_json"],
    [JSON.stringify(witness)]
  ]));

  assert.deepEqual(JSON.parse(parsed[1][0]), witness);
});

test("CSV round-trip covers schema v2 multigraph provenance, special characters, and 5000 records", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.recordId",
        sourceField: "$.from",
        targetField: "$.to",
        identity: "multigraph",
        provenanceField: "$.sources"
      }
    }
  };
  const specialRecordId = 'record|,"first"\r\nline';
  const specialSources = ['archivio, "A"\r\nline', "secondary|catalogue", "Rete d'\u00e9t\u00e9"];
  const graph = normalizeGraphData({
    nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
    edges: Array.from({ length: 5000 }, (_, index) => ({
      recordId: index === 0 ? specialRecordId : `parallel-${index}`,
      from: [["A", "B"], ["B", "C"], ["A", "C"]][index % 3][0],
      to: [["A", "B"], ["B", "C"], ["A", "C"]][index % 3][1],
      sources: index === 0 ? specialSources : [`archive-${index}`, "shared-source"]
    }))
  }, config);

  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.links.length, 5000, "il mapping multigrafo mantiene tutti i record paralleli");
  const fullAspFacts = buildAspFactsFromGraph(graph).facts;
  assert.equal((fullAspFacts.match(/^edge_record\(/gm) ?? []).length, 5000);
  assert.equal((fullAspFacts.match(/^edge_provenance\(/gm) ?? []).length, 10001);
  const runtimeAspFacts = buildAspFactsFromGraph(graph, undefined, { includeEdgeProvenance: false }).facts;
  assert.equal((runtimeAspFacts.match(/^edge_record\(/gm) ?? []).length, 5000);
  assert.doesNotMatch(runtimeAspFacts, /^edge_provenance\(/m);
  const solverResult = await (await createClingoWasmRunner()).run(
    `${runtimeAspFacts}\n${buildCliqueProgram("maximal", "")}`
  );
  assert.equal(solverResult.Result, "SATISFIABLE", solverResult.Error ?? JSON.stringify(solverResult));
  assert.deepEqual(solverResult.Call?.[0]?.Witnesses?.[0]?.Value, ["in(1)", "in(2)", "in(3)"]);

  const clique = ["a", "b", "c"];
  const supportingEdges = graph.links.map((link) => ({
    sourceNodeId: link.source,
    targetNodeId: link.target,
    edgeId: link.sourceId,
    edgeIdGenerated: false
  }));
  const provenanceReferencesBySourceId = buildEdgeProvenanceReferencesBySourceId(graph.links);
  const rows = buildCliqueSupportingExportRows(
    [clique],
    { [clique.join("\u0000")]: supportingEdges },
    buildEdgeProvenanceBySourceId(graph.links),
    provenanceReferencesBySourceId
  );
  const csv = serializeCsv(rows);
  const utf8Csv = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(csv, "utf8"));
  const parsedRows = parseCsv(utf8Csv);

  assert.ok(Buffer.byteLength(csv, "utf8") > 250_000, "la fixture esercita anche un export di volume significativo");
  assert.equal(parsedRows.length, 2);
  assert.deepEqual(parsedRows[0].slice(0, 6), [
    "size", "clique", "supporting_pairs", "source_edge_ids", "generated_record_keys", "source_edge_provenance"
  ], "le colonne leggibili esistenti mantengono nomi e ordine");
  assert.deepEqual(parsedRows[0].slice(6), [
    "clique_node_ids_json", "supporting_pairs_json", "source_edge_ids_json", "generated_record_keys_json",
    "source_edge_provenance_json"
  ]);
  assert.equal(parsedRows[1].length, 11);
  assert.deepEqual(JSON.parse(parsedRows[1][6]), clique);
  const pairRecords = JSON.parse(parsedRows[1][7]);
  assert.equal(pairRecords.length, 5000);
  assert.deepEqual(pairRecords[0], { source_node_id: "a", target_node_id: "b" });
  const sourceEdgeIds = JSON.parse(parsedRows[1][8]);
  assert.equal(sourceEdgeIds.length, 5000);
  assert.equal(sourceEdgeIds[0], specialRecordId);
  const sourceProvenance = JSON.parse(parsedRows[1][10]);
  assert.equal(sourceProvenance.length, 5000);
  assert.deepEqual(sourceProvenance[0], {
    edge_id: specialRecordId,
    references: provenanceReferencesBySourceId[specialRecordId]
  });
});

test("CSV download keeps its object URL valid through the anchor click", async () => {
  const { downloadCsvText } = await import("../src/lib/kliqueasp/csvExport.ts");
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalDocument = globalThis.document;
  const originalSetTimeout = globalThis.setTimeout;
  const calls = [];
  let deferredRevoke;
  let anchor;
  let capturedBlob;

  URL.createObjectURL = (blob) => {
    capturedBlob = blob;
    calls.push(["create", blob.type]);
    return "blob:test-csv";
  };
  URL.revokeObjectURL = (url) => calls.push(["revoke", url]);
  globalThis.document = {
    body: { appendChild: (element) => { anchor = element; calls.push(["append", element]); } },
    createElement: (tagName) => {
      assert.equal(tagName, "a");
      return {
        click: () => calls.push(["click", anchor?.download]),
        remove: () => calls.push(["remove", anchor?.download])
      };
    }
  };
  globalThis.setTimeout = (callback, delay) => {
    deferredRevoke = callback;
    calls.push(["defer", delay]);
    return 1;
  };

  try {
    const certificateCsv = serializeCsv([
      ["terminal_start", "terminal_goal", "removed_edge_id", "reachable_node_id"],
      ["s", "g", "source:sa", "s"],
      ["s", "g", "source:sa", "a"]
    ]);
    downloadCsvText("result.csv", certificateCsv);
    assert.equal(anchor.href, "blob:test-csv");
    assert.equal(anchor.download, "result.csv");
    assert.ok(capturedBlob instanceof Blob);
    assert.equal(capturedBlob.type, "text/csv;charset=utf-8;");
    assert.deepEqual(
      Buffer.from(await capturedBlob.arrayBuffer()),
      Buffer.from(certificateCsv, "utf8"),
      "il Blob passato al browser contiene i byte UTF-8 del certificato CSV serializzato"
    );
    assert.deepEqual(calls.map(([name]) => name), ["create", "append", "click", "remove", "defer"]);
    deferredRevoke();
    assert.deepEqual(calls.at(-1), ["revoke", "blob:test-csv"]);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    globalThis.document = originalDocument;
    globalThis.setTimeout = originalSetTimeout;
  }
});
