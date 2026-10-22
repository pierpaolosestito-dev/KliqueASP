export const supportedKCoreBenchmarkTopologies = Object.freeze([
  "cycle-with-tail",
  "star",
  "path",
  "cycle"
]);

export function createKCoreBenchmarkFixture(topology, nodeCount) {
  if (!Number.isSafeInteger(nodeCount) || nodeCount < 3) {
    throw new RangeError("nodeCount deve essere un intero sicuro >= 3");
  }
  if (!supportedKCoreBenchmarkTopologies.includes(topology)) {
    throw new RangeError(`Topologia non supportata: ${topology}`);
  }

  const nodes = Array.from({ length: nodeCount }, (_, index) => ({ id: `node_${index}` }));
  const edges = [];

  if (topology === "cycle-with-tail") {
    const coreSize = Math.max(3, Math.floor(nodeCount / 2));
    for (let index = 0; index < coreSize; index += 1) {
      edges.push({
        id: `core_${index}`,
        source: `node_${index}`,
        target: `node_${(index + 1) % coreSize}`
      });
    }
    for (let index = coreSize; index < nodeCount; index += 1) {
      edges.push({
        id: `tail_${index}`,
        source: index === coreSize ? "node_0" : `node_${index - 1}`,
        target: `node_${index}`
      });
    }
    return { nodes, edges, coreSize };
  }

  if (topology === "star") {
    for (let index = 1; index < nodeCount; index += 1) {
      edges.push({ id: `spoke_${index}`, source: "node_0", target: `node_${index}` });
    }
    return { nodes, edges, coreSize: 0 };
  }

  if (topology === "path") {
    for (let index = 0; index < nodeCount - 1; index += 1) {
      edges.push({ id: `path_${index}`, source: `node_${index}`, target: `node_${index + 1}` });
    }
    return { nodes, edges, coreSize: 0 };
  }

  for (let index = 0; index < nodeCount; index += 1) {
    edges.push({
      id: `cycle_${index}`,
      source: `node_${index}`,
      target: `node_${(index + 1) % nodeCount}`
    });
  }
  return { nodes, edges, coreSize: nodeCount };
}
