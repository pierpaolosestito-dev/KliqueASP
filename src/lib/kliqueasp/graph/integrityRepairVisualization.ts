import type { Graph2DEdgeAnnotation, Graph2DLinkInput, Graph2DNodeInput } from "./graph2dExport.ts";
import type { IntegrityRepairProposal } from "./integrityTask.ts";
import { getStructuralEdgeIdentity } from "./structuralTasks.ts";
import { getOwnRecordValue } from "./recordUtils.ts";
import { getGraphEndpointId, normalizeGraphId } from "./graphModel.ts";

export type IntegrityRepairVisualization = {
  nodeIds: string[];
  edgeIds: string[];
  nodeAnnotations: Record<string, string>;
  edgeAnnotations: Record<string, Graph2DEdgeAnnotation>;
  resultLabel: string;
  completionLabel: string;
  hasWitness: boolean;
};

function formatValue(value: unknown): string {
  return value === undefined ? "assente" : JSON.stringify(value);
}

function addAction(actions: Map<string, string[]>, id: unknown, description: string): void {
  if (id === undefined || id === null || String(id).trim() === "") return;
  const key = String(id);
  const list = actions.get(key) ?? [];
  list.push(description);
  actions.set(key, list);
}

/** Maps a proposed integrity repair onto its existing graph targets without applying edits. */
export function buildIntegrityRepairVisualization(
  proposal: IntegrityRepairProposal,
  nodes: Graph2DNodeInput[],
  links: Graph2DLinkInput[],
  provenanceBySourceId: Record<string, string> = {}
): IntegrityRepairVisualization {
  const nodeActions = new Map<string, string[]>();
  const edgeActions = new Map<string, string[]>();
  const edgeRemovals = new Set<string>();
  const edgeModifications = new Set<string>();

  for (const edgeId of proposal.edgeIds) {
    const cost = getOwnRecordValue<number>(proposal.edgeCosts ?? {}, edgeId);
    addAction(edgeActions, edgeId, `Rimozione proposta · costo ${cost ?? "?"}`);
    edgeRemovals.add(String(edgeId));
  }
  for (const candidate of proposal.nodeAttributes ?? []) {
    addAction(nodeActions, candidate.nodeId, `Assegnare ${candidate.attribute} = ${formatValue(candidate.value)} · costo ${candidate.cost}`);
  }
  for (const candidate of proposal.nodeAttributeReplacements ?? []) {
    addAction(nodeActions, candidate.nodeId,
      `Sostituire ${candidate.attribute}: ${formatValue(candidate.expectedValue)} → ${formatValue(candidate.value)} · costo ${candidate.cost}`);
  }
  for (const candidate of proposal.nodeTypeReplacements ?? []) {
    addAction(nodeActions, candidate.nodeId, `Correggere il tipo: ${candidate.expectedType} → ${candidate.newType} · costo ${candidate.cost}`);
  }
  for (const candidate of proposal.edgeAttributes ?? []) {
    addAction(edgeActions, candidate.edgeId,
      `Assegnare ${candidate.attribute} = ${formatValue(candidate.value)} · costo ${candidate.cost}`);
    edgeModifications.add(String(candidate.edgeId));
  }
  for (const candidate of proposal.edgeAttributeReplacements ?? []) {
    addAction(edgeActions, candidate.edgeId,
      `Sostituire ${candidate.attribute}: ${formatValue(candidate.expectedValue)} → ${formatValue(candidate.value)} · costo ${candidate.cost}`);
    edgeModifications.add(String(candidate.edgeId));
  }
  for (const candidate of proposal.edgeTypeReplacements ?? []) {
    addAction(edgeActions, candidate.edgeId, `Correggere il tipo: ${candidate.expectedType} → ${candidate.newType} · costo ${candidate.cost}`);
    edgeModifications.add(String(candidate.edgeId));
  }
  for (const candidate of proposal.edgeIntervalReplacements ?? []) {
    addAction(edgeActions, candidate.edgeId,
      `Sostituire l'intervallo: [${formatValue(candidate.expectedFrom)}, ${formatValue(candidate.expectedTo)}] → [${formatValue(candidate.from)}, ${formatValue(candidate.to)}] · costo ${candidate.cost}`);
    edgeModifications.add(String(candidate.edgeId));
  }

  const nodeIdByReference = new Map<string, string>();
  const knownNodeIds = new Set<string>();
  for (const node of nodes) {
    const nodeId = normalizeGraphId(node.id);
    if (!nodeId) continue;
    knownNodeIds.add(nodeId);
    nodeIdByReference.set(nodeId, nodeId);
    nodeIdByReference.set(String(node.sourceId ?? node.analysis?.id ?? node.id), nodeId);
  }
  const selectedNodeIds = new Set<string>();
  const nodeAnnotations: Record<string, string> = {};
  let visibleNodeActionCount = 0;
  for (const [reference, actions] of nodeActions) {
    const nodeId = nodeIdByReference.get(reference);
    if (!nodeId) continue;
    selectedNodeIds.add(nodeId);
    visibleNodeActionCount += actions.length;
    const existing = nodeAnnotations[nodeId];
    nodeAnnotations[nodeId] = existing
      ? `${existing} · ${actions.join(" · ")}`
      : `Modifica proposta · ${actions.join(" · ")}`;
  }

  const matchingLinks = links.filter((link) => edgeActions.has(String(link.sourceId ?? link.analysis?.id ?? "")));
  const edgeIds = matchingLinks.map((link) => getStructuralEdgeIdentity(link));
  const edgeAnnotations = Object.fromEntries(matchingLinks.map((link) => {
    const sourceId = String(link.sourceId ?? link.analysis?.id ?? "");
    const actions = edgeActions.get(sourceId) ?? [];
    const removalProposed = edgeRemovals.has(sourceId);
    const provenance = getOwnRecordValue<string>(provenanceBySourceId, sourceId);
    for (const endpoint of [link.source, link.target]) {
      const nodeId = normalizeGraphId(getGraphEndpointId(endpoint));
      if (knownNodeIds.has(nodeId)) selectedNodeIds.add(nodeId);
    }
    const label = removalProposed
      ? edgeModifications.has(sourceId) ? "Rimozione e modifica proposte" : "Rimozione proposta"
      : "Modifica proposta";
    return [getStructuralEdgeIdentity(link), {
      label,
      description: [
        `Azione sull'arco ${sourceId}: ${actions.join(" · ")}`,
        ...(provenance ? [`Fonte dichiarata: ${provenance}`] : [])
      ].join(" · "),
      color: removalProposed ? "#b4233c" : "#b45309",
      dashPattern: removalProposed ? "dotted" : "dashed"
    } satisfies Graph2DEdgeAnnotation];
  }));

  const nodeIds = [...selectedNodeIds];
  const hasWitness = nodeIds.length > 0 || edgeIds.length > 0;
  const totalActionCount = [...nodeActions.values(), ...edgeActions.values()].reduce((sum, actions) => sum + actions.length, 0);
  const visibleActionCount = visibleNodeActionCount + matchingLinks.reduce((sum, link) => {
    const sourceId = String(link.sourceId ?? link.analysis?.id ?? "");
    return sum + (edgeActions.get(sourceId)?.length ?? 0);
  }, 0);
  const actionsOutsideProjection = totalActionCount - visibleActionCount;
  const visibleActionLabel = `${visibleActionCount} ${visibleActionCount === 1 ? "azione visibile" : "azioni visibili"}`;
  return {
    nodeIds,
    edgeIds,
    nodeAnnotations,
    edgeAnnotations,
    resultLabel: hasWitness
      ? `Proposta minima di riparazione · ${visibleActionLabel}${actionsOutsideProjection > 0 ? ` · ${actionsOutsideProjection} fuori proiezione` : ""}`
      : "Proposta di riparazione · nessun target visibile nella proiezione corrente",
    completionLabel: `Ottimo di costo provato · costo ${proposal.cost} · dati invariati`,
    hasWitness
  };
}
