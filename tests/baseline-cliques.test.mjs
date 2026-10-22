import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";

const projectRoot = process.cwd();
const datasetPath = path.join(
  projectRoot,
  "src/lib/kliqueasp/data/my-dataset.json"
);
const resultsDirectory = path.join(
  projectRoot,
  "static/assets/PsychologyHistoryGraph/results"
);

const expectedExportRows = {
  "cliques_export_person.csv": 192,
  "cliques_export_person_accademia.csv": 20,
  "cliques_export_person_articultura.csv": 3,
  "cliques_export_person_filosofia.csv": 4,
  "cliques_export_person_medicina.csv": 45,
  "cliques_export_person_psicologia.csv": 29,
  "cliques_export_person_scienzesociali.csv": 2,
  "cliques_export_personplace.csv": 505,
  "cliques_export_personplace_accademia.csv": 21,
  "cliques_export_personplace_articultura.csv": 3,
  "cliques_export_personplace_filosofia.csv": 4,
  "cliques_export_personplace_medicina.csv": 146,
  "cliques_export_personplace_psicologia.csv": 41,
  "cliques_export_personplace_scienzesociali.csv": 2
};

function atomize(value) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function endpointId(endpoint) {
  return typeof endpoint === "object" && endpoint !== null
    ? endpoint.id
    : endpoint;
}

function pairKey(first, second) {
  return first < second
    ? `${first}\u0000${second}`
    : `${second}\u0000${first}`;
}

function readBaseline() {
  const graph = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
  const nodeById = new Map(
    graph.nodes.map((node) => [atomize(node.id ?? node.label), node])
  );
  const edges = new Set();
  const edgeTypes = new Set();
  let repeatedEndpointRows = 0;

  for (const edge of graph.edges ?? graph.links ?? []) {
    const source = atomize(endpointId(edge.source));
    const target = atomize(endpointId(edge.target));
    const key = pairKey(source, target);

    if (edges.has(key)) repeatedEndpointRows += 1;
    edges.add(key);
    edgeTypes.add(edge.type ?? null);
  }

  return { graph, nodeById, edges, edgeTypes, repeatedEndpointRows };
}

function parseExportRow(line, filename, lineNumber) {
  const match = /^(\d+),"(.*)"$/.exec(line);
  assert.ok(match, `${filename}:${lineNumber} deve essere una riga CSV valida`);

  return {
    declaredSize: Number(match[1]),
    members: match[2].split(" | ").map(atomize)
  };
}

test("il grafo psicologico mantiene la baseline strutturale attesa", () => {
  const { graph, nodeById, edges, edgeTypes, repeatedEndpointRows } =
    readBaseline();

  assert.equal(graph.nodes.length, 335);
  assert.equal(graph.edges.length, 1365);
  assert.equal(nodeById.size, graph.nodes.length, "gli ID normalizzati devono essere univoci");
  assert.equal(edges.size, 989);
  assert.equal(repeatedEndpointRows, 376);
  assert.deepEqual([...edgeTypes].sort(), ["person-person", "person-place"]);

  for (const edge of graph.edges) {
    const source = atomize(endpointId(edge.source));
    const target = atomize(endpointId(edge.target));

    assert.ok(nodeById.has(source), `estremo sorgente inesistente: ${source}`);
    assert.ok(nodeById.has(target), `estremo destinazione inesistente: ${target}`);
    assert.notEqual(source, target, `self-loop inatteso su ${source}`);
  }
});

test("il normalizzatore mantiene invariata la proiezione legacy del dataset italiano", () => {
  const graph = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
  const normalized = normalizeGraphData(graph);

  assert.equal(normalized.valid, true);
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.direction, "undirected");
  assert.equal(normalized.nodes.length, 335);
  assert.equal(normalized.links.length, 989);
  assert.deepEqual(normalized.diagnostics, []);
  assert.ok(normalized.links.every((link) => Object.keys(link).every((key) =>
    ["source", "target", "type"].includes(key)
  )), "il profilo legacy non deve introdurre metadata analitici impliciti");
});

test("gli export storici contengono clique valide e conservano i conteggi", () => {
  const { nodeById, edges } = readBaseline();
  const filenames = Object.keys(expectedExportRows);

  assert.deepEqual(
    fs.readdirSync(resultsDirectory).filter((name) => name.endsWith(".csv")).sort(),
    [...filenames].sort(),
    "l'insieme dei CSV di riferimento è cambiato"
  );

  for (const filename of filenames) {
    const contents = fs.readFileSync(path.join(resultsDirectory, filename), "utf8");
    const lines = contents.trimEnd().split(/\r?\n/);

    assert.equal(lines[0], "size,clique", `${filename}: intestazione CSV inattesa`);
    assert.equal(lines.length - 1, expectedExportRows[filename], `${filename}: conteggio righe`);

    for (const [index, line] of lines.slice(1).entries()) {
      const { declaredSize, members } = parseExportRow(line, filename, index + 2);

      assert.equal(declaredSize, members.length, `${filename}:${index + 2}: dimensione errata`);
      assert.ok(members.length > 2, `${filename}:${index + 2}: i risultati storici escludono dimensioni ≤ 2`);
      assert.equal(new Set(members).size, members.length, `${filename}:${index + 2}: membro duplicato`);

      for (const member of members) {
        const node = nodeById.get(member);
        assert.ok(node, `${filename}:${index + 2}: nodo sconosciuto ${member}`);

        if (filename.startsWith("cliques_export_person_" ) || filename === "cliques_export_person.csv") {
          assert.equal(node.type, "person", `${filename}:${index + 2}: ${member} non è una persona`);
        }
      }

      for (let first = 0; first < members.length; first += 1) {
        for (let second = first + 1; second < members.length; second += 1) {
          assert.ok(
            edges.has(pairKey(members[first], members[second])),
            `${filename}:${index + 2}: manca l'arco fra ${members[first]} e ${members[second]}`
          );
        }
      }
    }
  }
});
