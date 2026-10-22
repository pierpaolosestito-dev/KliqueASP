/**
 * Independent minimum-cost vertex cut reference using vertex splitting and Dinic.
 * The input graph is undirected unless `direction` is explicitly `directed`.
 */
export function minimumCostNodeSeparatorByDinic(
  nodes,
  edges,
  removalCostByNodeId,
  sourceId,
  targetId,
  direction = "undirected"
) {
  if (!Array.isArray(nodes) || nodes.length === 0) throw new TypeError("nodes must be a non-empty array");
  if (!Array.isArray(edges)) throw new TypeError("edges must be an array");
  if (!(removalCostByNodeId instanceof Map)) throw new TypeError("removal costs must be a Map");
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

  let removableCostTotal = 0;
  for (const node of nodes) {
    if (node.id === sourceId || node.id === targetId) continue;
    const cost = removalCostByNodeId.get(node.id);
    if (!Number.isSafeInteger(cost) || cost <= 0) {
      throw new RangeError(`node ${node.id} must have a positive safe integer removal cost`);
    }
    removableCostTotal += cost;
    if (!Number.isSafeInteger(removableCostTotal)) throw new RangeError("total removal cost exceeds the safe integer range");
  }

  const infiniteCapacity = removableCostTotal + 1;
  if (!Number.isSafeInteger(infiniteCapacity)) throw new RangeError("total removal cost leaves no safe sentinel capacity");

  const residual = Array.from({ length: nodes.length * 2 }, () => []);
  const addArc = (from, to, capacity) => {
    const forward = { to, capacity, reverse: residual[to].length };
    const backward = { to: from, capacity: 0, reverse: residual[from].length };
    residual[from].push(forward);
    residual[to].push(backward);
  };
  const inNode = (index) => index * 2;
  const outNode = (index) => index * 2 + 1;

  for (let index = 0; index < nodes.length; index += 1) {
    const nodeId = nodes[index].id;
    const capacity = nodeId === sourceId || nodeId === targetId
      ? infiniteCapacity
      : removalCostByNodeId.get(nodeId);
    addArc(inNode(index), outNode(index), capacity);
  }

  for (const edge of edges) {
    const left = indexById.get(edge?.source);
    const right = indexById.get(edge?.target);
    if (left === undefined || right === undefined) throw new RangeError("every edge endpoint must exist in the graph");
    addArc(outNode(left), inNode(right), infiniteCapacity);
    if (direction === "undirected") addArc(outNode(right), inNode(left), infiniteCapacity);
  }

  let totalFlow = 0;
  while (true) {
    const level = Array(residual.length).fill(-1);
    const sourceOut = outNode(sourceIndex);
    level[sourceOut] = 0;
    const queue = [sourceOut];
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      for (const arc of residual[current]) {
        if (arc.capacity <= 0 || level[arc.to] !== -1) continue;
        level[arc.to] = level[current] + 1;
        queue.push(arc.to);
      }
    }
    if (level[inNode(targetIndex)] === -1) break;

    const nextArc = Array(residual.length).fill(0);
    const send = (current, amount) => {
      if (current === inNode(targetIndex)) return amount;
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
      const pushed = send(sourceOut, infiniteCapacity);
      if (pushed === 0) break;
      totalFlow += pushed;
      if (!Number.isSafeInteger(totalFlow)) throw new RangeError("minimum cut exceeds the safe integer range");
      if (totalFlow >= infiniteCapacity) return null;
    }
  }

  return totalFlow;
}

/** Independently checks whether removing the supplied nodes disconnects two terminals. */
export function isNodeSeparator(nodes, edges, removedNodeIds, sourceId, targetId, direction = "undirected") {
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(removedNodeIds)) {
    throw new TypeError("nodes, edges, and removed node IDs must be arrays");
  }
  if (direction !== "undirected" && direction !== "directed") throw new RangeError("unsupported graph direction");

  const nodeIds = new Set(nodes.map(({ id }) => id));
  if (!nodeIds.has(sourceId) || !nodeIds.has(targetId) || sourceId === targetId) return false;
  const removed = new Set(removedNodeIds);
  if (removed.has(sourceId) || removed.has(targetId)) return false;
  if ([...removed].some((id) => !nodeIds.has(id))) return false;

  const adjacency = new Map([...nodeIds].map((id) => [id, []]));
  for (const edge of edges) {
    if (!nodeIds.has(edge?.source) || !nodeIds.has(edge?.target)) {
      throw new RangeError("every edge endpoint must exist in the graph");
    }
    adjacency.get(edge.source).push(edge.target);
    if (direction === "undirected") adjacency.get(edge.target).push(edge.source);
  }

  const visited = new Set([sourceId]);
  const queue = [sourceId];
  for (let head = 0; head < queue.length; head += 1) {
    for (const neighbor of adjacency.get(queue[head])) {
      if (removed.has(neighbor) || visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push(neighbor);
    }
  }
  return !visited.has(targetId);
}
