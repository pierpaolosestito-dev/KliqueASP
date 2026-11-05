import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "datasets/real-benchmarks/bitcoin-otc/soc-sign-bitcoinotc.csv");
const outputDirectory = path.join(root, "static/examples");
const legacyOutputPath = path.join(outputDirectory, "bitcoin-otc.json");
const bootstrapPath = path.join(outputDirectory, "bitcoin-otc-bootstrap.json");
const shardDirectory = path.join(outputDirectory, "bitcoin-otc-shards");
const configPath = path.join(root, "src/lib/kliqueasp/data/examples/bitcoin-otc.config.json");
const manifestPath = path.join(root, "src/lib/kliqueasp/data/examples/bitcoin-otc.manifest.json");
const source = await readFile(sourcePath, "utf8");
const rows = source.split(/\r?\n/).filter((line) => line.trim() !== "");
const rolesByNode = new Map();
const edges = [];
let previousSourceTime = -Infinity;
let previousMappedTime = -Infinity;

for (let index = 0; index < rows.length; index += 1) {
  const fields = rows[index].split(",");
  if (fields.length !== 4) throw new Error(`Riga ${index + 1}: attese quattro colonne CSV.`);
  const [sourceId, targetId, rawRating, sourceTimeSeconds] = fields;
  const rating = Number(rawRating);
  const timeSeconds = Number(sourceTimeSeconds);
  if (!/^\d+$/.test(sourceId) || !/^\d+$/.test(targetId) ||
    !Number.isInteger(rating) || rating < -10 || rating > 10 || rating === 0 ||
    !Number.isFinite(timeSeconds)) {
    throw new Error(`Riga ${index + 1}: ID, rating o timestamp non valido.`);
  }
  if (timeSeconds < previousSourceTime) throw new Error(`Riga ${index + 1}: il CSV non è ordinato per tempo.`);

  // The app accepts integer millisecond/ISO graph times. Preserve the original
  // timestamp text beside this documented nearest-millisecond timeline value.
  const timeMilliseconds = Math.round(timeSeconds * 1_000);
  if (timeMilliseconds <= previousMappedTime) {
    throw new Error(`Riga ${index + 1}: la conversione in millisecondi non conserva l'ordine degli eventi.`);
  }
  previousSourceTime = timeSeconds;
  previousMappedTime = timeMilliseconds;

  const sourceRoles = rolesByNode.get(sourceId) ?? new Set();
  sourceRoles.add("rater");
  rolesByNode.set(sourceId, sourceRoles);
  const targetRoles = rolesByNode.get(targetId) ?? new Set();
  targetRoles.add("ratee");
  rolesByNode.set(targetId, targetRoles);

  const polarity = rating < 0 ? -1 : 1;
  edges.push({
    id: `bitcoin-otc-record-${index + 1}`,
    source: sourceId,
    target: targetId,
    type: polarity < 0 ? "negative-rating" : "positive-rating",
    rating,
    polarity,
    sourceTimeSeconds,
    validFrom: timeMilliseconds,
    validTo: timeMilliseconds
  });
}

const nodes = [...rolesByNode.entries()]
  .sort(([left], [right]) => Number(left) - Number(right))
  .map(([id, roles]) => ({ id, label: `Utente ${id}`, type: "user", roles: [...roles].sort() }));
if (edges.length !== 35_592 || nodes.length !== 5_881) {
  throw new Error(`Conteggi SNAP inattesi: ${nodes.length} nodi, ${edges.length} rating.`);
}

const firstTime = edges[0].validFrom;
const lastTime = edges.at(-1).validTo;
const initialWindowDurationMs = 30 * 24 * 60 * 60 * 1_000;
let initialWindow = { start: firstTime, end: Math.min(lastTime, firstTime + initialWindowDurationMs) };
let initialWindowEdgeCount = -1;
let firstWindowEdgeIndex = 0;
let afterWindowEdgeIndex = 0;
for (const edge of edges) {
  const start = edge.validFrom;
  const end = Math.min(lastTime, start + initialWindowDurationMs);
  while (afterWindowEdgeIndex < edges.length && edges[afterWindowEdgeIndex].validFrom <= end) {
    afterWindowEdgeIndex += 1;
  }
  while (firstWindowEdgeIndex < edges.length && edges[firstWindowEdgeIndex].validFrom < start) {
    firstWindowEdgeIndex += 1;
  }
  const count = afterWindowEdgeIndex - firstWindowEdgeIndex;
  if (count > initialWindowEdgeCount) {
    initialWindow = { start, end };
    initialWindowEdgeCount = count;
  }
}
const config = {
  schemaVersion: 2,
  features: { filters: true, timeline: true, labelVisibilityToggle: true, nodeLabelsVisibleByDefault: false },
  timeline: {
    start: firstTime,
    end: lastTime,
    initialWindow,
    debounceMs: 180
  },
  nodeTypes: { user: { color: "#4c78a8" } },
  colors: { edgeTypes: { "positive-rating": "#218c72", "negative-rating": "#c44e52" } },
  graphMapping: {
    node: { idField: "$.id", labelField: "$.label", typeField: "$.type", roleField: "$.roles[*]" },
    edge: {
      idField: "$.id",
      sourceField: "$.source",
      targetField: "$.target",
      typeField: "$.type",
      direction: "directed",
      identity: "multigraph",
      validity: { fromField: "$.validFrom", toField: "$.validTo", numericUnit: "milliseconds" },
      weightField: "$.rating",
      attributes: {
        rating: "$.rating",
        polarity: "$.polarity",
        sourceTimeSeconds: "$.sourceTimeSeconds"
      }
    }
  },
  graphAnalysis: {
    motifs: [
      {
        id: "negative-rating",
        label: "Rating negativi registrati",
        roles: {
          rater: { nodeTypes: ["user"] },
          ratee: { nodeTypes: ["user"] }
        },
        edges: [{ sourceRole: "rater", targetRole: "ratee", edgeType: "negative-rating", attributes: { polarity: -1 } }]
      },
      {
        id: "opposed-reciprocal-ratings",
        label: "Rating reciproci con segno opposto",
        roles: {
          first: { nodeTypes: ["user"] },
          second: { nodeTypes: ["user"] }
        },
        edges: [
          { sourceRole: "first", targetRole: "second", edgeType: "positive-rating", attributes: { polarity: 1 } },
          { sourceRole: "second", targetRole: "first", edgeType: "negative-rating", attributes: { polarity: -1 } }
        ]
      },
      {
        id: "ordered-negative-rating-chain",
        label: "Due rating negativi in sequenza",
        roles: {
          first: { nodeTypes: ["user"] },
          middle: { nodeTypes: ["user"] },
          last: { nodeTypes: ["user"] }
        },
        edges: [
          { sourceRole: "first", targetRole: "middle", edgeType: "negative-rating", attributes: { polarity: -1 } },
          { sourceRole: "middle", targetRole: "last", edgeType: "negative-rating", attributes: { polarity: -1 } }
        ],
        temporal: { semantics: "orderedByStart", strict: true }
      }
    ]
  },
  graphIntegrity: {
    requireNodeTypes: true,
    requireEdgeTypes: true,
    allowedNodeTypes: ["user"],
    allowedEdgeTypes: ["positive-rating", "negative-rating"],
    requiredEdgeIntervals: ["positive-rating", "negative-rating"],
    edgeTypeDomains: [
      { edgeType: "positive-rating", sourceNodeTypes: ["user"], targetNodeTypes: ["user"] },
      { edgeType: "negative-rating", sourceNodeTypes: ["user"], targetNodeTypes: ["user"] }
    ],
    requiredEdgeAttributes: [
      { edgeType: "positive-rating", attributes: ["rating", "polarity", "sourceTimeSeconds"] },
      { edgeType: "negative-rating", attributes: ["rating", "polarity", "sourceTimeSeconds"] }
    ]
  }
};

const initialWindowEdges = edges.filter(({ validFrom, validTo }) =>
  validFrom <= initialWindow.end && validTo >= initialWindow.start);
const initialWindowEdgeIds = new Set(initialWindowEdges.map(({ id }) => id));
const remainingEdges = edges.filter(({ id }) => !initialWindowEdgeIds.has(id));
const shardCount = 6;
const shardSize = Math.ceil(remainingEdges.length / shardCount);
const shards = [];
await mkdir(outputDirectory, { recursive: true });
await mkdir(shardDirectory, { recursive: true });
for (let index = 0; index < shardCount; index += 1) {
  const shardEdges = remainingEdges.slice(index * shardSize, (index + 1) * shardSize);
  if (shardEdges.length === 0) continue;
  const filename = `part-${String(index + 1).padStart(2, "0")}.json`;
  await writeFile(path.join(shardDirectory, filename), `${JSON.stringify({ edges: shardEdges })}\n`);
  shards.push({ path: `bitcoin-otc-shards/${filename}`, edgeCount: shardEdges.length });
}
const datasetMetadata = { id: "bitcoin-otc", label: "Bitcoin OTC · SNAP" };
const bootstrap = { datasetMetadata, nodes, edges: initialWindowEdges };
const manifest = {
  schemaVersion: 1,
  datasetId: datasetMetadata.id,
  nodeCount: nodes.length,
  edgeCount: edges.length,
  initialWindow,
  initialWindowEdgeCount: initialWindowEdges.length,
  bootstrapPath: "bitcoin-otc-bootstrap.json",
  shards
};

await mkdir(path.dirname(configPath), { recursive: true });
await writeFile(bootstrapPath, `${JSON.stringify(bootstrap)}\n`);
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await rm(legacyOutputPath, { force: true });
const generatedBytes = await Promise.all([
  bootstrapPath,
  ...shards.map(({ path: relativePath }) => path.join(outputDirectory, relativePath))
].map(async (filepath) => (await readFile(filepath)).byteLength));
process.stdout.write(
  `Bitcoin OTC: ${nodes.length} utenti, ${edges.length} rating, ` +
  `${initialWindowEdges.length} nel bootstrap, ${shards.length} pacchetti, ` +
  `${generatedBytes.reduce((sum, bytes) => sum + bytes, 0)} byte JSON.\n`
);
