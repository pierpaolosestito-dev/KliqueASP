import assert from "node:assert/strict";
import test from "node:test";
import { buildSignedTriadCsv } from "../src/lib/kliqueasp/graph/signedTriadCsvExport.ts";

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
    } else if (character === '"') {
      assert.equal(field, "");
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

  assert.equal(quoted, false);
  if (row.length > 0 || field !== "") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function sampleTriad() {
  const dyad = (id, sourceNodeId, targetNodeId, polarity) => ({
    id: 1,
    sourceIndex: 1,
    targetIndex: 2,
    sourceNodeId,
    targetNodeId,
    polarity,
    edgeRecords: [{ id, generated: false }]
  });
  return {
    nodeIds: ["a", "b", "c"],
    balanced: false,
    negativeDyadCount: 1,
    dyads: [
      dyad("edge,\"1\"", "a", "b", "negative"),
      dyad("=edge-2", "a", "c", "positive"),
      dyad("edge-3", "b", "c", "positive")
    ]
  };
}

test("il CSV delle triadi conserva i witness, quota i campi e neutralizza valori formula-like", () => {
  const rows = parseCsv(buildSignedTriadCsv([sampleTriad()], {
    a: "=actor-a",
    b: "actor,\"b\"",
    c: "actor\nc"
  }));

  assert.deepEqual(rows[0], [
    "node_1_id", "node_2_id", "node_3_id", "classification", "negative_dyad_count",
    "dyad_12_polarity", "dyad_12_edge_records_json", "dyad_13_polarity", "dyad_13_edge_records_json",
    "dyad_23_polarity", "dyad_23_edge_records_json"
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].length, 11);
  assert.deepEqual(rows[1].slice(0, 9), [
    "'=actor-a", 'actor,"b"', "actor\nc", "unbalanced", "1", "negative",
    JSON.stringify([{ id: 'edge,"1"', generated: false }]), "positive",
    JSON.stringify([{ id: "=edge-2", generated: false }])
  ]);
  assert.deepEqual(JSON.parse(rows[1][10]), [{ id: "edge-3", generated: false }]);
});

test("l'export vuoto mantiene la sola intestazione e l'export esteso conserva tutte le righe", () => {
  const emptyRows = parseCsv(buildSignedTriadCsv([]));
  assert.equal(emptyRows.length, 1);
  assert.equal(emptyRows[0].length, 11);

  const triad = sampleTriad();
  const results = Array.from({ length: 5000 }, () => triad);
  const csv = buildSignedTriadCsv(results);
  assert.equal(csv.split("\n").length, 5001);
  assert.equal(parseCsv(csv).length, 5001);
});
