import {
  buildCompactKCoreWitnessCsv,
  buildDominatingSetWitnessCsv,
  buildKCoreWitnessCsv,
  buildSeparatorCertificateCsv
} from "../src/lib/kliqueasp/graph/structuralCsvExport.ts";

const scales = process.argv.includes("--stress") ? [100, 500, 1000, 5000] : [100, 500, 1000];
const evidenceFor = (edgeIdentities) => edgeIdentities.map((id) => ({
  edge_id: id,
  provenance_references: [`dataset:${id}`, `record:${id}`]
}));
const provenanceFor = (edgeIdentities) => edgeIdentities.map((id) => `${id}:synthetic source`).join(" | ");

function measure(name, expectedDataRows, build) {
  const started = performance.now();
  const csv = build();
  const elapsedMs = performance.now() - started;
  const dataRows = csv.split("\n").length - 1;
  if (dataRows !== expectedDataRows) {
    throw new Error(`${name}: expected ${expectedDataRows} data rows, got ${dataRows}`);
  }
  return {
    certificate: name,
    dataRows,
    bytesUtf8: Buffer.byteLength(csv, "utf8"),
    csvBuildMs: Number(elapsedMs.toFixed(3))
  };
}

const results = [];
for (const nodeCount of scales) {
  const nodeIds = Array.from({ length: nodeCount }, (_, index) => `n${index}`);
  const sourceIdByNodeId = Object.fromEntries(nodeIds.map((id) => [id, id]));
  const cyclePairs = nodeIds.map((sourceNodeId, index) => {
    const targetNodeId = nodeIds[(index + 1) % nodeCount];
    const edgeIdentity = `cycle-edge-${index}`;
    return {
      sourceNodeId,
      targetNodeId,
      supportingRecords: [{ edgeIdentity, edgeId: edgeIdentity, edgeIdGenerated: false }]
    };
  });
  const coverage = nodeIds.map((targetNodeId, index) => {
    const coveringNodeId = index === 0 ? nodeIds[0] : nodeIds[0];
    const edgeIdentity = index === 0 ? undefined : `star-edge-${index}`;
    return {
      targetNodeId,
      coveringNodeId,
      supportingRecords: edgeIdentity
        ? [{ edgeIdentity, edgeId: edgeIdentity, edgeIdGenerated: false }]
        : []
    };
  });
  const reachableNodeIds = nodeIds.slice(0, Math.ceil(nodeCount / 2));

  results.push(
    measure("k-core witnesses (cycle, degree 2)", nodeCount, () => buildKCoreWitnessCsv({
      nodeIds,
      supportPairs: cyclePairs,
      directedGraph: false,
      kCoreMode: "",
      requiredK: 2,
      sourceIdByNodeId,
      edgeProvenanceSummary: provenanceFor,
      structuredEdgeEvidence: evidenceFor
    })),
    measure("k-core witnesses compact v2 (cycle, degree 2)", nodeCount + 1, () => buildCompactKCoreWitnessCsv({
      nodeIds,
      supportPairs: cyclePairs,
      directedGraph: false,
      kCoreMode: "",
      requiredK: 2,
      sourceIdByNodeId,
      edgeProvenanceSummary: provenanceFor,
      structuredEdgeEvidence: evidenceFor
    })),
    measure("dominating-set witnesses (star)", nodeCount, () => buildDominatingSetWitnessCsv({
      coverage,
      sourceIdByNodeId,
      edgeProvenanceSummary: provenanceFor,
      structuredEdgeEvidence: evidenceFor
    })),
    measure("edge-separator certificate (one cut)", 1, () => buildSeparatorCertificateCsv({
      task: "minimumEdgeSeparator",
      startTerminalId: nodeIds[0],
      goalTerminalId: nodeIds[nodeCount - 1],
      witnesses: [{ removedIds: [`cut-edge-${nodeCount}`], reachableNodeIds }],
      edgeTask: true,
      sourceIdByNodeId,
      sourceIdByEdgeId: { [`cut-edge-${nodeCount}`]: `cut-edge-${nodeCount}` },
      edgeProvenanceSummary: provenanceFor,
      structuredEdgeEvidence: evidenceFor
    }))
  );
}

console.log(JSON.stringify({
  scope: "CSV building and serialization only; synthetic witnesses, no ASP solving or browser download",
  stress: process.argv.includes("--stress"),
  scales,
  results
}, null, 2));
