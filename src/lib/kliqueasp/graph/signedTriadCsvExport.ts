import { csvCell } from "../csvExport.ts";
import type { SignedTriadResult } from "./signedTriadTask";

const SIGNED_TRIAD_CSV_HEADER = [
  "node_1_id", "node_2_id", "node_3_id", "classification", "negative_dyad_count",
  "dyad_12_polarity", "dyad_12_edge_records_json", "dyad_13_polarity", "dyad_13_edge_records_json",
  "dyad_23_polarity", "dyad_23_edge_records_json"
];

/** Builds the complete signed-triad CSV without retaining an intermediate row matrix. */
export function buildSignedTriadCsv(
  results: readonly SignedTriadResult[],
  sourceIdByNodeId: Readonly<Record<string, string>> = {}
): string {
  const lines = [SIGNED_TRIAD_CSV_HEADER.map(csvCell).join(",")];
  const sourceNodeId = (nodeId: string) => sourceIdByNodeId[nodeId] ?? nodeId;

  for (const triad of results) {
    const sourceNodeIds = triad.nodeIds.map(sourceNodeId);
    const [dyad12, dyad13, dyad23] = triad.dyads;
    const row = [
      ...sourceNodeIds,
      triad.balanced ? "balanced" : "unbalanced",
      triad.negativeDyadCount,
      dyad12.polarity, JSON.stringify(dyad12.edgeRecords),
      dyad13.polarity, JSON.stringify(dyad13.edgeRecords),
      dyad23.polarity, JSON.stringify(dyad23.edgeRecords)
    ];
    lines.push(row.map(csvCell).join(","));
  }

  return lines.join("\n");
}
