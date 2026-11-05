type StringIndex = Readonly<Record<string, string | undefined>>;

function ownStringValue(index: StringIndex, key: string): string | undefined {
  return Object.hasOwn(index, key) ? index[key] : undefined;
}

function formatNodeResultLabel(labelValue: string | undefined, sourceId: string): string {
  const label = labelValue?.trim();
  return label && label !== sourceId ? `${label} (${sourceId})` : sourceId;
}

/** Formats a node label for result summaries while keeping its source ID identifiable. */
export function displayNodeResultLabel(
  nodeId: string,
  nodeLabelsById: StringIndex,
  sourceIdsByNodeId: StringIndex
): string {
  const sourceId = ownStringValue(sourceIdsByNodeId, nodeId) ?? nodeId;
  return formatNodeResultLabel(ownStringValue(nodeLabelsById, nodeId), sourceId);
}

/** Uses an already-available source ID while safely resolving the node's human label. */
export function displayNodeResultLabelWithSourceId(
  nodeId: string,
  nodeLabelsById: StringIndex,
  sourceId: string
): string {
  return formatNodeResultLabel(ownStringValue(nodeLabelsById, nodeId), sourceId || nodeId);
}
