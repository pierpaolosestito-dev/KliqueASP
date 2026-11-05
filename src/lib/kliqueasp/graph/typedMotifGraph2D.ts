import type { Graph2DEdgeAnnotation } from "./graph2dExport.ts";
import type { TypedMotifMatch, TypedMotifNearMatch } from "./motifTask.ts";
import { displayMappedGraphTime } from "./temporalDisplay.ts";

export type TypedMotifGraph2DAnnotations = {
  nodeAnnotations: Record<string, string>;
  /** Keyed by source-record ID; callers resolve these to the graph's display identities. */
  edgeAnnotations: Record<string, Graph2DEdgeAnnotation>;
};

function roleAnnotations(roles: TypedMotifMatch["roles"]): Record<string, string> {
  return Object.fromEntries(Object.entries(roles).map(([role, assignment]) => [
    assignment.nodeId,
    `Ruolo ${role}`
  ]));
}

/** Keeps temporal ASP evidence visible in 2D SVGs while leaving static motifs unchanged. */
export function buildTypedMotifGraph2DAnnotations(match: TypedMotifMatch): TypedMotifGraph2DAnnotations {
  const nodeAnnotations = roleAnnotations(match.roles);
  const hasTemporalEvidence = match.timeValue !== undefined ||
    match.supportingEdges.some((edge) => edge.startTimeValue !== undefined);
  if (!hasTemporalEvidence) return { nodeAnnotations, edgeAnnotations: {} };

  const descriptionsByEdgeId = new Map<string, string[]>();
  for (const edge of match.supportingEdges) {
    const relation = `${edge.sourceRole} —${edge.edgeType}→ ${edge.targetRole}`;
    const timeEvidence = match.timeValue !== undefined
      ? `istante comune ${displayMappedGraphTime(match.timeValue)}`
      : edge.startTimeValue !== undefined
        ? `inizio scelto ${displayMappedGraphTime(edge.startTimeValue)}`
        : "";
    const description = [relation, timeEvidence].filter(Boolean).join(" · ");
    for (const edgeId of edge.edgeIds) {
      const descriptions = descriptionsByEdgeId.get(edgeId) ?? [];
      if (!descriptions.includes(description)) descriptions.push(description);
      descriptionsByEdgeId.set(edgeId, descriptions);
    }
  }

  return {
    nodeAnnotations,
    edgeAnnotations: Object.fromEntries([...descriptionsByEdgeId].map(([edgeId, descriptions]) => [edgeId, {
      label: "Relazione temporale del motivo",
      description: descriptions.join(" · ")
    }]))
  };
}

/** Keeps temporal blockers attached to the selected observed records of a why-not result. */
export function buildTypedMotifNearMatchGraph2DAnnotations(match: TypedMotifNearMatch): TypedMotifGraph2DAnnotations {
  const nodeAnnotations = roleAnnotations(match.roles);
  const evidence = match.temporalEvidence;
  if (!evidence) return { nodeAnnotations, edgeAnnotations: {} };

  const descriptionsByEdgeId = new Map<string, string[]>();
  for (const edge of evidence.supportingEdges) {
    const descriptionParts = [`${edge.sourceRole} —${edge.edgeType}→ ${edge.targetRole}`];
    if (edge.startTimeValue !== undefined) {
      descriptionParts.push(`inizio scelto ${displayMappedGraphTime(edge.startTimeValue)}`);
    } else if (evidence.timeValue !== undefined) {
      descriptionParts.push(`istante esaminato ${displayMappedGraphTime(evidence.timeValue)}`);
    }
    const orderViolations = evidence.orderViolations.filter((violation) =>
      violation.firstIndex === edge.index || violation.secondIndex === edge.index
    );
    if (orderViolations.length) {
      descriptionParts.push(`ordine temporale invertito con pattern ${orderViolations.map((violation) =>
        violation.firstIndex === edge.index ? violation.secondIndex : violation.firstIndex
      ).join(", ")}`);
    }
    if (evidence.maximumSpan && evidence.spanViolation !== undefined &&
      (edge.index === 1 || edge.index === evidence.supportingEdges.length)) {
      descriptionParts.push(
        `finestra massima ${evidence.maximumSpan.value} ${evidence.maximumSpan.unit} ${evidence.spanViolation ? "superata" : "rispettata"}`
      );
    }
    const description = descriptionParts.join(" · ");
    for (const edgeId of edge.edgeIds) {
      const descriptions = descriptionsByEdgeId.get(edgeId) ?? [];
      if (!descriptions.includes(description)) descriptions.push(description);
      descriptionsByEdgeId.set(edgeId, descriptions);
    }
  }

  return {
    nodeAnnotations,
    edgeAnnotations: Object.fromEntries([...descriptionsByEdgeId].map(([edgeId, descriptions]) => [edgeId, {
      label: "Relazione temporale esaminata",
      description: descriptions.join(" · ")
    }]))
  };
}
