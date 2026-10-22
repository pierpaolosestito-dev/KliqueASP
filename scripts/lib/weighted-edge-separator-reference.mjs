/** Independent weighted s-t edge-cut reference using Dinic's max-flow algorithm. */
export function minimumCostEdgeSeparatorByDinic(
  nodes,
  edges,
  removalCostByEdgeId,
  sourceId,
  targetId,
  direction = "undirected"
) {
  if (!Array.isArray(nodes) || nodes.length === 0) throw new TypeError("nodes must be a non-empty array");
  if (!Array.isArray(edges)) throw new TypeError("edges must be an array");
  if (!(removalCostByEdgeId instanceof Map)) throw new TypeError("removal costs must be a Map");
  if (direction !== "undirected" && direction !== "directed") throw new RangeError("unsupported graph direction");

  const indexById = new Map();
  for (const [index, node] of nodes.entries()) {
    if (!node || typeof node.id !== "string" || node.id === "") throw new TypeError("every node must have a non-empty string id");
    if (indexById.has(node.id)) throw new RangeError(`duplicate node id: ${node.id}`);
    indexById.set(node.id, index);
  }
  const sourceIndex = indexById.get(sourceId);
  const targetIndex = indexById.get(targetId);
  if (sourceIndex === undefined || targetIndex === undefined) throw new RangeError("both terminals must exist in the graph");
  if (sourceIndex === targetIndex) throw new RangeError("the terminals must be distinct");

  const residual = Array.from({ length: nodes.length }, () => []);
  const addArc = (from, to, capacity) => {
    const forward = { to, capacity, reverse: residual[to].length };
    const backward = { to: from, capacity: 0, reverse: residual[from].length };
    residual[from].push(forward);
    residual[to].push(backward);
  };
  const edgeIds = new Set();
  for (const edge of edges) {
    if (!edge || typeof edge.id !== "string" || edge.id === "") throw new TypeError("every edge record must have a non-empty string id");
    if (edgeIds.has(edge.id)) throw new RangeError(`duplicate edge id: ${edge.id}`);
    edgeIds.add(edge.id);
    const left = indexById.get(edge.source);
    const right = indexById.get(edge.target);
    if (left === undefined || right === undefined) throw new RangeError("every edge endpoint must exist in the graph");
    const cost = removalCostByEdgeId.get(edge.id);
    if (!Number.isSafeInteger(cost) || cost <= 0) throw new RangeError(`edge ${edge.id} must have a positive safe integer removal cost`);
    addArc(left, right, cost);
    if (direction === "undirected") addArc(right, left, cost);
  }

  let totalFlow = 0;
  while (true) {
    const level = Array(residual.length).fill(-1);
    level[sourceIndex] = 0;
    const queue = [sourceIndex];
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      for (const arc of residual[current]) {
        if (arc.capacity <= 0 || level[arc.to] !== -1) continue;
        level[arc.to] = level[current] + 1;
        queue.push(arc.to);
      }
    }
    if (level[targetIndex] === -1) break;

    const nextArc = Array(residual.length).fill(0);
    const send = (current, amount) => {
      if (current === targetIndex) return amount;
      for (; nextArc[current] < residual[current].length; nextArc[current] += 1) {
        const arc = residual[current][nextArc[current]];
        if (arc.capacity <= 0 || level[arc.to] !== level[current] + 1) continue;
        const pushed = send(arc.to, Math.min(amount, arc.capacity));
        if (pushed === 0) continue;
        arc.capacity -= pushed;
        residual[arc.to][arc.reverse].capacity += pushed;
        return pushed;
      }
      return 0;
    };

    while (true) {
      const pushed = send(sourceIndex, Number.MAX_SAFE_INTEGER);
      if (pushed === 0) break;
      totalFlow += pushed;
      if (!Number.isSafeInteger(totalFlow)) throw new RangeError("minimum cut exceeds the safe integer range");
    }
  }

  return totalFlow;
}

/** Independently checks whether removing the supplied edge records disconnects two terminals. */
export function isEdgeSeparator(nodes, edges, removedEdgeIds, sourceId, targetId, direction = "undirected") {
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(removedEdgeIds)) {
    throw new TypeError("nodes, edges, and removed edge IDs must be arrays");
  }
  if (direction !== "undirected" && direction !== "directed") throw new RangeError("unsupported graph direction");

  const nodeIds = new Set(nodes.map(({ id }) => id));
  if (!nodeIds.has(sourceId) || !nodeIds.has(targetId) || sourceId === targetId) return false;
  const edgeIds = new Set(edges.map(({ id }) => id));
  const removed = new Set(removedEdgeIds);
  if ([...removed].some((id) => !edgeIds.has(id))) return false;

  const adjacency = new Map([...nodeIds].map((id) => [id, []]));
  for (const edge of edges) {
    if (!nodeIds.has(edge?.source) || !nodeIds.has(edge?.target)) {
      throw new RangeError("every edge endpoint must exist in the graph");
    }
    if (removed.has(edge.id)) continue;
    adjacency.get(edge.source).push(edge.target);
    if (direction === "undirected") adjacency.get(edge.target).push(edge.source);
  }

  const visited = new Set([sourceId]);
  const queue = [sourceId];
  for (let head = 0; head < queue.length; head += 1) {
    for (const neighbor of adjacency.get(queue[head])) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return !visited.has(targetId);
}
