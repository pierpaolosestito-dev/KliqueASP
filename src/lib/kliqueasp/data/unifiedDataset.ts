import dataset from "../data/my-dataset.json";

export interface GraphNode {
  id?: string;
  label: string;
  type?: string;
  data?: Record<string, any>;
}

export interface GraphEdge {
  source: string | { id: string };
  target: string | { id: string };
  type?: string;
}

export interface UnifiedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AspGraph {
  index: Record<number, { type: string; id: string; label: string }>;
  idByKey: Record<string, number>;
  edges: Array<[number, number]>;
}

const ASP_DEBUG = true;

function atomize(s: string) {
  return (s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getLinkEndId(end: any): string {
  return typeof end === "object" && end !== null ? end.id : end;
}

function normalizeGraph(raw: any): UnifiedGraph {
  if (raw?.data?.nodes && raw?.data?.edges) {
    return {
      nodes: raw.data.nodes ?? [],
      edges: raw.data.edges ?? []
    };
  }

  return {
    nodes: raw?.nodes ?? [],
    edges: raw?.edges ?? []
  };
}

export function getUnifiedGraph(): UnifiedGraph {
  return normalizeGraph(dataset);
}

function getNodeStableId(node: GraphNode): string {
  return atomize(node.id ?? node.label);
}

function getNodeLabel(node: GraphNode): string {
  return node.label ?? node.id ?? "";
}

function buildLookup(nodes: GraphNode[]) {
  const byId = new Map<string, GraphNode>();
  const byLabel = new Map<string, GraphNode>();

  for (const node of nodes) {
    byId.set(getNodeStableId(node), node);
    byLabel.set(atomize(node.label), node);
  }

  return { byId, byLabel };
}

function resolveEndpoint(
  endpoint: string | { id: string },
  byId: Map<string, GraphNode>,
  byLabel: Map<string, GraphNode>
): GraphNode | null {
  const raw = getLinkEndId(endpoint);
  const key = atomize(raw);

  return byId.get(key) ?? byLabel.get(key) ?? null;
}

function extractMacroAreas(node: GraphNode): string[] {
  return (node.data?.roles ?? [])
    .map((r: any) => r?.macro_area)
    .filter(Boolean);
}

// =====================================================
// ASP-friendly mapping
// =====================================================

export function getAspGraph(): AspGraph {
  const graph = getUnifiedGraph();
  const { byId, byLabel } = buildLookup(graph.nodes);

  const selectedNodeKeys = new Set<string>();
  const selectedEdges: Array<[string, string]> = [];

  // -------------------------------------------------
  // 1) Tutti i nodi del dataset corrente
  // -------------------------------------------------

  for (const node of graph.nodes) {
    selectedNodeKeys.add(getNodeStableId(node));
  }

  // -------------------------------------------------
  // 2) Tutti gli archi risolvibili del dataset corrente
  // -------------------------------------------------

  for (const edge of graph.edges) {
    const sourceNode = resolveEndpoint(edge.source, byId, byLabel);
    const targetNode = resolveEndpoint(edge.target, byId, byLabel);

    if (!sourceNode || !targetNode) continue;

    const sourceKey = getNodeStableId(sourceNode);
    const targetKey = getNodeStableId(targetNode);

    selectedNodeKeys.add(sourceKey);
    selectedNodeKeys.add(targetKey);

    selectedEdges.push([sourceKey, targetKey]);
  }

  // -------------------------------------------------
  // 3) ID stabili ordinati lessicograficamente
  // -------------------------------------------------

  const entityKeys = Array.from(selectedNodeKeys).sort((a, b) =>
    a.localeCompare(b)
  );

  const idByKey: Record<string, number> = {};
  const index: Record<number, { type: string; id: string; label: string }> = {};

  let nextId = 1;

  for (const key of entityKeys) {
    const node = byId.get(key) ?? byLabel.get(key);
    if (!node) continue;

    idByKey[key] = nextId;

    index[nextId] = {
      type: node.type ?? "unknown",
      id: key,
      label: getNodeLabel(node)
    };

    nextId++;
  }

  // -------------------------------------------------
  // 4) Costruzione edges deduplicati
  // -------------------------------------------------

  const edgeSet = new Set<string>();
  const edges: Array<[number, number]> = [];

  for (const [sourceKey, targetKey] of selectedEdges) {
    const fromId = idByKey[sourceKey];
    const toId = idByKey[targetKey];

    if (!fromId || !toId) continue;

    const [a, b] = fromId < toId ? [fromId, toId] : [toId, fromId];
    const key = `${a}->${b}`;

    if (edgeSet.has(key)) continue;

    edgeSet.add(key);
    edges.push([a, b]);
  }

  const aspGraph: AspGraph = {
    index,
    idByKey,
    edges
  };

  if (ASP_DEBUG) {
    console.group("[ASP DEBUG]");
    console.log("Tot nodes:", Object.keys(index).length);
    console.log("Tot edges:", edges.length);

    console.log("First 10 nodes:");
    Object.entries(index)
      .slice(0, 10)
      .forEach(([id, v]) => {
        console.log(`  ${id} -> (${v.type}) ${v.label}`);
      });

    console.log("First 10 edges:");
    edges.slice(0, 10).forEach(([a, b]) => {
      console.log(`  edge(${a}, ${b})`);
    });

    console.groupEnd();
  }

  return aspGraph;
}

// =====================================================
// ASP facts dump
// =====================================================

export function getAspFactsLp(): string {
  const graph = getUnifiedGraph();
  const aspGraph = getAspGraph();

  const { byId, byLabel } = buildLookup(graph.nodes);

  const lines: string[] = [];

  // nodes + type
  for (const id of Object.keys(aspGraph.index).map(Number)) {
    const item = aspGraph.index[id];

    lines.push(`node(${id}).`);
    lines.push(`type(${id},${atomize(item.type)}).`);
  }

  // macro facts
  for (const id of Object.keys(aspGraph.index).map(Number)) {
    const item = aspGraph.index[id];
    const node = byId.get(item.id) ?? byLabel.get(item.id);

    if (!node) continue;

    const macros = extractMacroAreas(node);

    for (const macro of macros) {
      lines.push(`macro(${id},${atomize(macro)}).`);
    }
  }

  // undirected edges
  for (const [a, b] of aspGraph.edges) {
    lines.push(`edge(${a},${b}).`);
    lines.push(`edge(${b},${a}).`);
  }

  const content = lines.join("\n");

  if (ASP_DEBUG) {
    console.group("[ASP DEBUG] LP preview");
    content
      .split("\n")
      .slice(0, 40)
      .forEach(line => console.log(line));
    console.groupEnd();
  }

  return content;
}

// =====================================================
// Export LP file for debug
// =====================================================

export function downloadAspLp(): void {
  const facts = getAspFactsLp();

  const ASP_PROGRAM = `
{ in(V) : node(V) }.

:- in(U), in(V), U < V, not edge(U,V).

#maximize { 1,V : in(V) }.

#show in/1.
`;

  const fullProgram =
    facts.trim() + "\n\n" + ASP_PROGRAM.trim() + "\n";

  const blob = new Blob([fullProgram], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "debug_graph.asp";
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log("✅ LP file generated.");
}

// =====================================================
// Browser console helpers
// =====================================================

declare global {
  interface Window {
    dumpAsp?: () => void;
    dumpAspFile?: () => void;
  }
}

if (typeof window !== "undefined") {
  window.dumpAsp = () => {
    console.log(getAspFactsLp());
  };

  window.dumpAspFile = () => {
    downloadAspLp();
  };
}