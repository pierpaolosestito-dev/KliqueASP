<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { base } from "$app/paths";
  import * as THREE from "three";
  import { forceManyBody, forceCenter, forceLink } from "d3-force-3d";
  import TimelineSlider from "./components/TimelineSlider.svelte";
  import InfoPanel from "./components/InfoPanel.svelte";
  import HistoryPanel from "./components/HistoryPanel.svelte";
  import SolverPanel from "./components/SolverPanel.svelte";

  export let graphConfig: any = {};
  export let graphData: any = {
    nodes: [],
    edges: []
  };
  export let forceEasterEgg: boolean = false;

  export let JsonEditor: any = null;
  export let jsonEditorProps: any = {};
  // ---------------------------------------------------------------------------
  // DEFAULT CONFIG
  // ---------------------------------------------------------------------------
  // Questo fallback permette all'app di funzionare anche se graph.config.json
  // è vuoto oppure contiene solo i mapping essenziali del dataset, ad esempio:
  //
  // {
  //   "nodeTypes": {
  //     "actor": {
  //       "timeline": {
  //         "startField": "$.data.active_from",
  //         "endField": "$.data.active_to"
  //       },
  //       "group": "$.data.affiliations[*].group"
  //     }
  //   }
  // }
  // ---------------------------------------------------------------------------

  const DEFAULT_GRAPH_CONFIG: any = {
    graph: {
      backgroundColor: "#050816",
      nodeOpacity: 0.95,
      linkOpacity: 0.4,
      linkWidth: 0.4
    },

    forces: {
      charge: -60,
      linkDistance: 70,
      linkStrength: 0.5
    },

    colors: {
      root: "#facc15",
      neighbor: "#60a5fa",
      preview: "#7dd3fc",
      default: "#334155",
      clique: "#7dd3fc"
    },

    node: {
      iconSize: 14,
      ring: {
        innerRadius: 0.65,
        outerRadius: 0.85,
        segments: 32,
        scale: 8
      },
      label: {
        font: "26px sans-serif",
        scale: [18, 8],
        offsetY: -10
      }
    },

    features: {
      filters: true,
      timeline: true
    },

    timeline: {
      debounceMs: 140,
      start: 1776,
      end: 2017,
      mode: "simple"
    },

    solver: {
      enabled: true,
      // "maximal": clique non estendibili (default)
      // "all":     tutte le clique, incluse le sotto-clique (--opt-mode=enum)
      // "maximum": solo le clique di cardinalità massima (--opt-mode=optN)
      cliqueMode: "maximal",
      features: {
        groupFilter: true,
        minSize: true,
        topPerSize: true,
        onlyMaximum: true,
        showAll: true,
        filterBySelectedNode: true,
        downloadCSV: true,
        histogram: true,
        stats: true,
        selectedAnalysis: true
      }
    },

    ui: {
      timeline: {
        bottom: 20,
        width: "min(800px, 90vw)",
        padding: "16px 24px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.9)",
        blur: 8,
        shadow: "0 10px 30px rgba(0,0,0,0.15)",
        zIndex: 25,

        label: {
          gap: 12,
          fontSize: 18,
          fontWeight: 600,
          marginBottom: 12
        },

        slider: {
          height: 40,
          trackHeight: 6,
          trackRadius: 6,
          trackColor: "#cbd5f5",
          thumbSize: 18,
          thumbColor: "#0ea5e9",
          thumbBorder: "2px solid white"
        }
      },

      infoPanel: {
        top: 10,
        right: 10,
        width: 260,
        maxHeight: 340,
        padding: 12,
        borderRadius: 8,
        background: "rgba(255,255,255,0.9)",
        zIndex: 10,

        title: {
          fontSize: 16
        },

        modal: {
          backdrop: "rgba(2,6,23,0.6)",
          zIndex: 999,

          cardWidth: "min(720px, 92vw)",
          cardMaxHeight: "85vh",
          cardBg: "#ffffff",
          cardRadius: 12,

          headerFontSize: 20,
          headerBorder: "1px solid rgba(0,0,0,0.1)",

          bodyPadding: 16,
          lineHeight: 1.6,

          footerPadding: "12px 16px",

          closeBg: "rgba(0,0,0,0.05)",
          closeColor: "#0f172a"
        }
      },

      solverPanel: {
        top: 20,
        right: 20,
        width: 420,
        maxHeight: "85vh",
        padding: 18,
        borderRadius: 14,
        background: "rgba(255,255,255,0.95)",
        shadow: "0 20px 40px rgba(0,0,0,0.15)",
        zIndex: 50,
        fontSize: 13,

        header: {
          titleSize: 16,
          closeColor: "#0f172a"
        },

        meta: {
          opacity: 0.85,
          gap: 4
        },

        selectedAnalysis: {
          background: "rgba(99,102,241,0.15)",
          padding: 10,
          radius: 8,
          marginTop: 10
        },

        controls: {
          gap: 6,
          marginTop: 14,
          marginBottom: 14,
          inputWidth: 70
        },

        cliques: {
          marginTop: 14,
          groupGap: 12,
          titleSize: 14,

          item: {
            padding: "6px 8px",
            marginBottom: 4,
            background: "rgba(14,165,233,0.15)",
            hover: "rgba(14,165,233,0.3)",
            radius: 6,
            fontSize: 12
          },

          badge: {
            bg: "#facc15",
            color: "#000",
            fontSize: 10,
            padding: "2px 4px",
            radius: 4
          }
        }
      },

      historyPanel: {
        left: 10,
        bottom: 10,
        maxWidth: "min(560px, 92vw)",
        padding: 10,
        borderRadius: 8,
        background: "rgba(255,255,255,0.95)",
        zIndex: 15,
        fontSize: 13,
        textColor: "#0f172a",

        header: {
          marginBottom: 8
        },

        clearButton: {
          background: "rgba(0,0,0,0.06)",
          radius: 6,
          size: 28
        },

        crumbs: {
          gap: 6
        },

        crumb: {
          background: "rgba(14,165,233,0.12)",
          hover: "rgba(14,165,233,0.22)",
          padding: "4px 8px",
          radius: 999,
          maxWidth: 220
        },

        separator: {
          opacity: 0.6
        }
      },

      body: {
        background: "#f8fafc",
        textColor: "#0f172a",
        fontFamily: "system-ui, sans-serif"
      },

      toolbar: {
        spacing: 8,
        padding: "8px 10px",
        borderRadius: 8,
        top: 10,
        left: 10,
        background: "rgba(255, 255, 255, 0.9)",
        zIndex: 30
      },

      search: {
        width: 320,
        maxWidth: "56vw"
      },

      zoom: {
        gap: 4,
        marginLeft: 6
      },

      filterCard: {
        top: 64,
        left: 10,
        padding: 10,
        borderRadius: 8,
        fontSize: 13,
        background: "rgba(255, 255, 255, 0.9)",
        zIndex: 10,
        maxWidth: 280,
        maxHeight: "55vh"
      },

      autocomplete: {
        itemPadding: "6px 10px",
        fontSize: 13,
        background: "#ffffff",
        borderRadius: 8,
        shadow: "0 10px 24px rgba(0, 0, 0, 0.15)",
        zIndex: 20,
        offsetY: 6
      },

      filters: {
        titleColor: "#0284c7",
        accentColor: "#0ea5e9"
      }
    },

    filters: {
      enabled: true,
      types: true,
      groups: true
    },

    nodeTypes: {
      highlight: {
        root: "#facc15",
        neighbor: "#60a5fa",
        preview: "#7dd3fc",
        clique: "#7dd3fc"
      },

      default: {
        color: "#334155",
        icon: "assets/PsychologyHistoryGraph/icon.png"
      },

      person: {
        color: "#38bdf8",
        icon: "assets/PsychologyHistoryGraph/icon.png",
        category: "temporal",
        timeline: {
          startField: "anno_nascita",
          endField: "anno_morte"
        },
        group: "roles[].group"
      },

      place: {
        color: "#22c55e",
        icon: "assets/PsychologyHistoryGraph/icon.png",
        category: "spatial",
        alwaysVisible: true
      }
    }
  };

  // ---------------------------------------------------------------------------
  // ALIAS LEGACY
  // ---------------------------------------------------------------------------
  // Prima del rename "macroArea" -> "group" il config usava altre chiavi.
  // Le traduciamo nelle chiavi correnti, senza sovrascrivere quelle nuove,
  // così i config già pubblicati (es. results/jsons/graph.config.json)
  // continuano a funzionare.
  // ---------------------------------------------------------------------------
  function applyLegacyConfigAliases(raw: any): any {
    if (!raw || typeof raw !== "object") return {};

    const cfg = JSON.parse(JSON.stringify(raw));

    for (const typeCfg of Object.values(cfg.nodeTypes ?? {}) as any[]) {
      if (typeCfg && typeof typeCfg === "object" && typeCfg.group === undefined && typeCfg.macroAreaField !== undefined) {
        typeCfg.group = typeCfg.macroAreaField;
      }
    }

    if (cfg.filters && cfg.filters.groups === undefined && cfg.filters.macroAreas !== undefined) {
      cfg.filters.groups = cfg.filters.macroAreas;
    }

    const solverFeatures = cfg.solver?.features;
    if (solverFeatures && solverFeatures.groupFilter === undefined && solverFeatures.macroFilter !== undefined) {
      solverFeatures.groupFilter = solverFeatures.macroFilter;
    }

    return cfg;
  }

  const RAW_CONFIG: any = applyLegacyConfigAliases(graphConfig);

  function isPlainObject(value: any): boolean {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function deepMerge<T = any>(base: T, override: any): T {
    if (!isPlainObject(base)) return override ?? base;
    if (!isPlainObject(override)) return base;

    const result: any = { ...(base as any) };

    for (const key of Object.keys(override)) {
      const baseValue = (base as any)[key];
      const overrideValue = override[key];

      if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
        result[key] = deepMerge(baseValue, overrideValue);
      } else {
        result[key] = overrideValue;
      }
    }

    return result;
  }

  function hasOwnPath(obj: any, path: string): boolean {
    const parts = path.split(".");
    let cur = obj;

    for (const p of parts) {
      if (!cur || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, p)) {
        return false;
      }
      cur = cur[p];
    }

    return true;
  }

  const GRAPH_CONFIG: any = deepMerge(
    DEFAULT_GRAPH_CONFIG,
    RAW_CONFIG
  );

  function normalizeNodeTypeConfigs() {
    const nodeTypes = GRAPH_CONFIG.nodeTypes ?? {};
    const defaultStyle = nodeTypes.default ?? {};

    for (const [type, cfg] of Object.entries(nodeTypes) as [string, any][]) {
      if (type === "default" || type === "highlight") continue;
      if (!cfg || typeof cfg !== "object") continue;

      // Ogni tipo custom eredita almeno stile e icona dal tipo default.
      GRAPH_CONFIG.nodeTypes[type] = {
        ...defaultStyle,
        ...cfg
      };

      // Se un tipo dichiara una timeline, allora è un tipo temporale
      // anche se il JSON minimale non specifica category: "temporal".
      if (GRAPH_CONFIG.nodeTypes[type].timeline && !GRAPH_CONFIG.nodeTypes[type].category) {
        GRAPH_CONFIG.nodeTypes[type].category = "temporal";
      }
    }
  }

  normalizeNodeTypeConfigs();

  const UI = GRAPH_CONFIG.ui;
  const solverEnabled = GRAPH_CONFIG.solver?.enabled !== false;

  let container: HTMLDivElement;
  let graph3D: any;
  let clingoWorker: Worker;

  // ---------------- STATE ----------------
  let data: any = null;
  let originalData: any = null;
  let query = "";
  let currentStart = GRAPH_CONFIG.timeline.start;
  let currentEnd = GRAPH_CONFIG.timeline.end;
  let timelineTimeout: any = null;

  let rootSelectedId: string | null = null;
  let selectedId: string | null = null;
  let selectedNode: any = null;
  let selectedDetails: any = null;

  let neighborMap: Map<string, Set<string>> = new Map();
  let highlightedNeighbors = new Set<string>();
  let cliqueNodes = new Set<string>();

  // ---------------- EASTER EGG STATE ----------------
  let easterEggMode = false;

  // ---------------- SOLVER STATE ----------------
  let showSolverPanel = false;
  let solverRunning = false;
  let solverError = "";

  let maximumCliques: string[][] = [];
  let allCliques: string[][] = [];

  let solverStats = {
    totalCliques: 0,
    maxSize: 0,
    histogram: new Map<number, number>(),
    timeMs: undefined as number | undefined,
    nodesCount: undefined as number | undefined,
    linksCount: undefined as number | undefined,
    periodLabel: undefined as string | undefined,
    cliqueMode: undefined as string | undefined
  };

  let minCliqueSize = 3;
  let topPerSize = 5;

  // ---------------- FILTERS ----------------
  const filtersEnabled =
    GRAPH_CONFIG.features?.filters !== false &&
    GRAPH_CONFIG.filters?.enabled !== false;
  const typeFiltersEnabled = GRAPH_CONFIG.filters?.types ?? true;
  const groupFiltersEnabled = GRAPH_CONFIG.filters?.groups ?? false;

  let availableTypes: string[] = [];
  let availableGroups: string[] = [];

  let selectedTypes = new Set<string>();
  let selectedGroupsFilter = new Set<string>();

  // ---------------- SOLVER GROUP FILTER ----------------
  let selectedGroup: string = "";

  // ---------------- HELPERS ----------------
  function atomize(s: string) {
    return (s ?? "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/&/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function normalizeName(s: string) {
    return (s ?? "")
      .trim()
      .replace(/\s+/g, " ");
  }

  function getLinkEndId(end: any): string {
    return typeof end === "object" && end !== null ? end.id : end;
  }

  function getNodeById(id: string, nodes = data?.nodes ?? []): any | null {
    return nodes.find((n: any) => n.id === id) ?? null;
  }

  function buildUiDetails(node: any) {
    if (!node) return null;

    return {
      tipo: node.type ?? "unknown",
      titolo: node.label,
      ...node.data
    };
  }

  function updateSelectedDetails(id: string) {
    const node = getNodeById(id);
    selectedDetails = buildUiDetails(node);
  }

  // ---------------------------------------------------------------------------
  // JSONPATH-LIKE FIELD EXTRACTION
  // ---------------------------------------------------------------------------
  // Supporta una forma leggera di JSONPath sufficiente per i mapping del grafo:
  //
  // - "roles[].group"
  // - "roles[*].group"
  // - "data.roles[].group"
  // - "$.data.roles[*].group"
  //
  // Se il path non inizia con "$" o "data.", viene interpretato come relativo
  // a node.data. Quindi "roles[].group" equivale a
  // "$.data.roles[*].group".
  // ---------------------------------------------------------------------------

  function normalizeJsonPathExpression(path: string): string {
    let expr = (path ?? "").trim();

    if (!expr) return "";

    if (expr.startsWith("$.")) {
      expr = expr.slice(2);
    } else if (expr.startsWith("$")) {
      expr = expr.slice(1).replace(/^\./, "");
    } else if (!expr.startsWith("data.")) {
      expr = `data.${expr}`;
    }

    expr = expr
      .replace(/\[\*\]/g, "[]")
      .replace(/\[\]/g, "[]");

    return expr;
  }

  function jsonPathValues(root: any, path: string): any[] {
    const expr = normalizeJsonPathExpression(path);
    if (!expr) return [];

    const segments = expr.split(".").filter(Boolean);
    let current: any[] = [root];

    for (const rawSegment of segments) {
      const isArrayExpansion = rawSegment.endsWith("[]");
      const key = isArrayExpansion
        ? rawSegment.slice(0, -2)
        : rawSegment;

      const next: any[] = [];

      for (const item of current) {
        if (item == null) continue;

        const value = item[key];

        if (isArrayExpansion) {
          if (Array.isArray(value)) {
            next.push(...value);
          }
        } else {
          if (Array.isArray(value)) {
            next.push(...value);
          } else if (value !== undefined && value !== null) {
            next.push(value);
          }
        }
      }

      current = next;
    }

    return current
      .flat(Infinity)
      .filter((v) => v !== undefined && v !== null);
  }

  function getTimelineValue(node: any, fieldOrPath: string, fallback: number): number {
    if (!fieldOrPath) return fallback;

    const direct = node.data?.[fieldOrPath];
    if (direct !== undefined && direct !== null) {
      const n = Number(direct);
      return Number.isFinite(n) ? n : fallback;
    }

    const values = jsonPathValues(node, fieldOrPath);
    const first = values[0];

    if (first === undefined || first === null) return fallback;

    const n = Number(first);
    return Number.isFinite(n) ? n : fallback;
  }

  function hasTimelineConfig(node: any): boolean {
    const config = GRAPH_CONFIG.nodeTypes?.[node.type];
    return !!config?.timeline?.startField && !!config?.timeline?.endField;
  }

  function isTemporalNode(node: any): boolean {
    const config = GRAPH_CONFIG.nodeTypes?.[node.type];

    // Compatibilità con il vecchio config completo:
    // category: "temporal" continua a funzionare.
    if (config?.category === "temporal") return true;

    // Compatibilità con il config minimale:
    // se un tipo dichiara una timeline, è trattato come temporale.
    return hasTimelineConfig(node);
  }

  function updateTimelineBoundsFromDataIfNeeded() {
    const userProvidedStart = hasOwnPath(RAW_CONFIG, "timeline.start");
    const userProvidedEnd = hasOwnPath(RAW_CONFIG, "timeline.end");

    // Se l'utente ha specificato esplicitamente start/end, non li tocchiamo.
    if (userProvidedStart && userProvidedEnd) return;

    if (!originalData?.nodes?.length) return;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const node of originalData.nodes) {
      if (!hasTimelineConfig(node)) continue;

      const config = GRAPH_CONFIG.nodeTypes?.[node.type];
      const start = getTimelineValue(node, config.timeline.startField, Number.NaN);
      const end = getTimelineValue(node, config.timeline.endField, Number.NaN);

      if (Number.isFinite(start)) min = Math.min(min, start);
      if (Number.isFinite(end)) max = Math.max(max, end);
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) return;

    if (!userProvidedStart) GRAPH_CONFIG.timeline.start = min;
    if (!userProvidedEnd) GRAPH_CONFIG.timeline.end = max;

    currentStart = GRAPH_CONFIG.timeline.start;
    currentEnd = GRAPH_CONFIG.timeline.end;
  }

  // ---------------- DATASET ----------------
  function computeDynamicFilters() {
    if (!originalData?.nodes) {
      availableTypes = [];
      availableGroups = [];
      return;
    }

    const typeSet = new Set<string>();
    const groupSet = new Set<string>();

    for (const node of originalData.nodes) {
      if (node.type) typeSet.add(node.type);

      const groups = extractGroups(node);
      groups.forEach(g => groupSet.add(g));
    }

    availableTypes = Array.from(typeSet).sort();
    availableGroups = Array.from(groupSet).sort();
  }

  function isGraphEmpty(graph: any): boolean {
    const nodes = graph?.nodes ?? [];
    const edges = graph?.edges ?? graph?.links ?? [];

    return nodes.length === 0 && edges.length === 0;
  }

  function getKliqueAspEasterEggGraph() {
    const raw = "KLIQUEASP";

    const nodes: any[] = [];
    const edges: any[] = [];

    const spacingX = 24;
    const spacingY = 16;
    const startX = -((raw.length - 1) * spacingX) / 2;

    raw.split("").forEach((char, i) => {
      const id = `kliqueasp_${i}_${char.toLowerCase()}`;
      const x = startX + i * spacingX;

      nodes.push({
        id,
        label: char,
        type: "logo",
        fx: x,
        fy: 0,
        fz: 0,
        data: {
          description: "KliqueASP easter egg node",
          letter: char
        }
      });

      if (i > 0) {
        edges.push({
          source: `kliqueasp_${i - 1}_${raw[i - 1].toLowerCase()}`,
          target: id,
          type: "logo_link"
        });
      }
    });

    nodes.push({
      id: "kliqueasp_core",
      label: "ASP",
      type: "logo",
      fx: 0,
      fy: -spacingY,
      fz: 0,
      data: {
        description: "Reasoning core"
      }
    });

    for (const node of nodes) {
      if (node.id !== "kliqueasp_core") {
        edges.push({
          source: "kliqueasp_core",
          target: node.id,
          type: "reasoning_link"
        });
      }
    }

    return {
      nodes,
      edges
    };
  }

  function nodePassesTypeFilters(node: any) {
    if (!typeFiltersEnabled || selectedTypes.size === 0) return true;
    return selectedTypes.has(node.type);
  }

  function extractGroups(node: any): string[] {
    const config = GRAPH_CONFIG.nodeTypes?.[node.type];

    if (!config?.group) return [];

    return jsonPathValues(node, config.group)
      .map((value) => String(value).trim())
      .filter(Boolean);
  }

  function nodePassesGroupFilters(node: any) {
    if (!groupFiltersEnabled || selectedGroupsFilter.size === 0) return true;

    return extractGroups(node).some((g) =>
      selectedGroupsFilter.has(g)
    );
  }

  function nodePassesTimeline(node: any) {
    const config = GRAPH_CONFIG.nodeTypes?.[node.type];

    if (!config?.timeline) return true;

    const start = getTimelineValue(
      node,
      config.timeline.startField,
      0
    );

    const end = getTimelineValue(
      node,
      config.timeline.endField,
      9999
    );

    return start <= currentEnd && end >= currentStart;
  }

  function recomputeGraphData() {
    if (!originalData) return;

    const TIMELINE_CFG = GRAPH_CONFIG.timeline ?? {};
    const mode = easterEggMode ? "simple" : (TIMELINE_CFG.mode ?? "simple");

    const visibleNodes = new Set<string>();

    // =========================================================
    // 🔹 MODE 1: GRAPH-AWARE (timeline intelligente)
    // =========================================================
    if (mode === "graph-aware") {

      const visibleTemporal = new Set<string>();

      // --- STEP 1: nodi temporali
      for (const node of originalData.nodes) {
        if (!isTemporalNode(node)) continue;

        const config = GRAPH_CONFIG.nodeTypes?.[node.type];
        if (!config?.timeline) continue;

        const start = getTimelineValue(
          node,
          config.timeline.startField,
          0
        );

        const end = getTimelineValue(
          node,
          config.timeline.endField,
          9999
        );

        if (start <= currentEnd && end >= currentStart) {
          visibleTemporal.add(node.id);
        }
      }

      // --- STEP 2: espansione ai nodi collegati
      const visibleRelated = new Set<string>();

      for (const link of originalData.links) {
        const s = getLinkEndId(link.source);
        const t = getLinkEndId(link.target);

        if (visibleTemporal.has(s)) visibleRelated.add(t);
        if (visibleTemporal.has(t)) visibleRelated.add(s);
      }

      // --- STEP 3: unione (+ tipi dichiarati alwaysVisible)
      const expanded = new Set<string>([
        ...visibleTemporal,
        ...visibleRelated
      ]);

      for (const node of originalData.nodes) {
        if (GRAPH_CONFIG.nodeTypes?.[node.type]?.alwaysVisible) expanded.add(node.id);
      }

      // --- STEP 4: applica filtri (type + group)
      for (const node of originalData.nodes) {
        if (!expanded.has(node.id)) continue;
        if (!nodePassesTypeFilters(node)) continue;
        if (!nodePassesGroupFilters(node)) continue;

        visibleNodes.add(node.id);
      }

      // --- STEP 5: fallback robusto
      // Se il graph-aware non trova nodi temporali, evitiamo una schermata vuota
      // e passiamo al comportamento simple.
      if (visibleNodes.size === 0) {
        for (const node of originalData.nodes) {
          if (!nodePassesTypeFilters(node)) continue;
          if (!nodePassesGroupFilters(node)) continue;
          if (!nodePassesTimeline(node)) continue;

          visibleNodes.add(node.id);
        }
      }

    } else {

      // =========================================================
      // 🔹 MODE 2: SIMPLE
      // =========================================================
      for (const node of originalData.nodes) {
        if (!nodePassesTypeFilters(node)) continue;
        if (!nodePassesGroupFilters(node)) continue;
        if (!nodePassesTimeline(node)) continue;

        visibleNodes.add(node.id);
      }
    }

    // =========================================================
    // 🔹 LINK FILTERING
    // =========================================================
    const filteredLinks = originalData.links.filter((l: any) => {
      const s = getLinkEndId(l.source);
      const t = getLinkEndId(l.target);
      return visibleNodes.has(s) && visibleNodes.has(t);
    });

    const filteredNodes = originalData.nodes.filter((n: any) =>
      visibleNodes.has(n.id)
    );

    data = {
      nodes: filteredNodes,
      links: filteredLinks
    };

    // =========================================================
    // 🔹 rebuild neighbor map
    // =========================================================
    buildNeighborMap();

    // =========================================================
    // 🔹 reset selection se non più valida
    // =========================================================
    if (selectedId && !visibleNodes.has(selectedId)) {
      selectedId = null;
      rootSelectedId = null;
      selectedNode = null;
      selectedDetails = null;
      highlightedNeighbors = new Set();
    }

    // =========================================================
    // 🔹 update graph
    // =========================================================
    graph3D?.graphData(data);
    refreshNodeVisuals();
  }

  function loadDataset() {
    currentStart = GRAPH_CONFIG.timeline.start;
    currentEnd = GRAPH_CONFIG.timeline.end;

    rootSelectedId = null;
    selectedId = null;
    selectedNode = null;
    selectedDetails = null;
    highlightedNeighbors = new Set();
    cliqueNodes = new Set();
    clearHistory();

    let graph = graphData;

    if (forceEasterEgg || isGraphEmpty(graph)) {
      console.info("🥚 Empty dataset detected. Loading KliqueASP easter egg graph.");
      easterEggMode = true;
      graph = getKliqueAspEasterEggGraph();
    } else {
      easterEggMode = false;
    }

    const graphEdges = graph.edges ?? graph.links ?? [];

    // Il grafo è trattato come non orientato (anche dall'encoding ASP):
    // A-B e B-A sono lo stesso arco, quindi teniamo solo la prima occorrenza.
    const seenEdges = new Set<string>();
    const links: any[] = [];

    for (const e of graphEdges) {
      const source = atomize(getLinkEndId(e.source));
      const target = atomize(getLinkEndId(e.target));
      const key = source < target ? `${source}\u0000${target}` : `${target}\u0000${source}`;

      if (seenEdges.has(key)) continue;
      seenEdges.add(key);

      links.push({ source, target, type: e.type });
    }

    originalData = {
      nodes: graph.nodes.map((n: any) => {
        const label = normalizeName(n.label);

        return {
          ...n,
          label,
          id: n.id ? atomize(n.id) : atomize(label)
        };
      }),
      links
    };

    updateTimelineBoundsFromDataIfNeeded();
    buildSearchIndexFromNodes(originalData.nodes);
    computeDynamicFilters();
    recomputeGraphData();

    graph3D?.cameraPosition({ x: 0, y: 0, z: 220 }, { x: 0, y: 0, z: 0 }, 800);
  }

  // ---------------- HISTORY ----------------
  let history: { id: string; label: string }[] = [];

  function startHistory(id: string, label: string) {
    history = [{ id, label }];
  }

  function pushHistory(id: string, label: string) {
    if (history[history.length - 1]?.id === id) return;
    history = [...history, { id, label }];
  }

  function truncateHistoryTo(id: string) {
    const idx = history.findIndex(h => h.id === id);
    if (idx >= 0) history = history.slice(0, idx + 1);
  }

  function clearHistory() {
    history = [];
  }

  // ---------------- AUTOCOMPLETE ----------------
  let searchIndex: { id: string; label: string; norm: string }[] = [];
  let suggestions: { id: string; label: string }[] = [];
  let showSuggestions = false;
  let searchMessage = "";

  function buildSearchIndexFromNodes(nodes: any[]) {
    searchIndex = nodes.map((n) => ({
      id: n.id,
      label: n.label,
      norm: n.label.toLowerCase(),
    }));

    suggestions = [];
    showSuggestions = false;
  }

  function rankCandidates(q: string) {
    const text = q.trim().toLowerCase();
    if (text.length < 2) {
      suggestions = [];
      showSuggestions = false;
      return;
    }

    const ranked = searchIndex
      .map((item) => {
        let score = 0;
        if (item.norm.startsWith(text)) score += 3;
        else if (item.norm.includes(` ${text}`)) score += 2;
        else if (item.norm.includes(text)) score += 1;
        return { id: item.id, label: item.label, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.label.length - b.label.length)
      .slice(0, 7)
      .map(({ id, label }) => ({ id, label }));

    suggestions = ranked;
    showSuggestions = ranked.length > 0;
  }

  function chooseSuggestion(s: { id: string; label: string }) {
    query = s.label;
    showSuggestions = false;
    selectSearchResult(getNodeById(s.id, originalData?.nodes ?? []));
  }

  // ---------------- NODE STYLE ----------------
  function getNodeType(node: any): string {
    return node.type || "default";
  }

  function getNodeStyle(node: any) {
    const type = getNodeType(node);
    const defaultStyle = GRAPH_CONFIG.nodeTypes.default ?? {};
    const typeStyle = GRAPH_CONFIG.nodeTypes[type] ?? {};

    return {
      ...defaultStyle,
      ...typeStyle
    };
  }

  // I colori di highlight possono arrivare da nodeTypes.highlight oppure dal
  // blocco "colors" del config; i valori espliciti dell'utente vincono sui default.
  const H = {
    ...DEFAULT_GRAPH_CONFIG.nodeTypes.highlight,
    ...(RAW_CONFIG.colors ?? {}),
    ...(RAW_CONFIG.nodeTypes?.highlight ?? {})
  };

  const colorAccessor = (n: any) => {
    // Clique highlight attivo
    if (cliqueNodes.size > 0) {
      if (cliqueNodes.has(n.id)) return H.clique;
      return GRAPH_CONFIG.colors?.default ?? "#334155";
    }

    // Stato normale
    if (!selectedId) {
      return getNodeStyle(n).color ?? GRAPH_CONFIG.colors?.default ?? "#334155";
    }

    if (n.id === selectedId) return H.root;
    if (highlightedNeighbors.has(n.id)) return H.preview;
    if (neighborMap.get(selectedId)?.has(n.id)) return H.neighbor;

    return getNodeStyle(n).color ?? GRAPH_CONFIG.colors?.default ?? "#334155";
  };

  function opacityForNode(nodeId: string) {
    // Se è attivo un highlight di clique,
    // i nodi della clique restano pieni, tutti gli altri vengono spenti.
    if (cliqueNodes.size > 0) {
      return cliqueNodes.has(nodeId) ? 1 : 0.12;
    }

    // Comportamento normale basato sulla selezione del nodo
    if (!selectedId) return 1;
    if (nodeId === selectedId) return 1;
    if (highlightedNeighbors.has(nodeId)) return 1;
    if (neighborMap.get(selectedId)?.has(nodeId)) return 0.95;

    return 0.22;
  }

  // ---------------- ICON + RING ----------------
  const AUTO_FALLBACK_PALETTE = [
    "#38bdf8",
    "#22c55e",
    "#f59e0b",
    "#a78bfa",
    "#ef4444",
    "#14b8a6",
    "#f97316",
    "#e879f9",
    "#84cc16",
    "#06b6d4"
  ];

  function hashString(value: string): number {
    let h = 0;

    for (let i = 0; i < value.length; i++) {
      h = ((h << 5) - h) + value.charCodeAt(i);
      h |= 0;
    }

    return Math.abs(h);
  }

  function getDeterministicFallbackColor(node: any): string {
    const type = getNodeType(node);
    const typeStyle = GRAPH_CONFIG.nodeTypes?.[type];

    if (typeStyle?.color) return typeStyle.color;

    const key = `${node.type ?? "default"}:${node.label ?? node.id ?? ""}`;

    return AUTO_FALLBACK_PALETTE[
      hashString(key) % AUTO_FALLBACK_PALETTE.length
    ];
  }

  function getConfiguredNodeIcon(node: any): string | null {
    const type = getNodeType(node);

    if (type === "logo") return null;

    const rawTypeIcon = RAW_CONFIG?.nodeTypes?.[type]?.icon;
    if (rawTypeIcon !== undefined) return rawTypeIcon;

    const defaultKnownTypeIcon = DEFAULT_GRAPH_CONFIG?.nodeTypes?.[type]?.icon;
    if (defaultKnownTypeIcon !== undefined && type !== "default") {
      return defaultKnownTypeIcon;
    }

    const rawDefaultIcon = RAW_CONFIG?.nodeTypes?.default?.icon;
    if (rawDefaultIcon !== undefined) return rawDefaultIcon;

    return null;
  }

  // Path delle icone che hanno fallito il caricamento: per questi nodi si usa
  // la pallina di fallback invece di uno sprite vuoto.
  const failedIconPaths = new Set<string>();

  function getExplicitNodeIcon(node: any): string | null {
    const path = normalizeAssetPath(getConfiguredNodeIcon(node));
    if (!path || failedIconPaths.has(path)) return null;
    return path;
  }

  const textureLoader = new THREE.TextureLoader();
  const textureCache = new Map<string, THREE.Texture>();

  function normalizeAssetPath(path: string | undefined | null): string | null {
    if (!path || typeof path !== "string") return null;

    const value = path.trim();
    if (!value) return null;

    // URL assoluti esterni, data URL e blob URL restano invariati
    if (/^(https?:\/\/|data:image\/|blob:)/i.test(value)) {
      return value;
    }

    // Path locali: sono relativi alla cartella static/ e vanno serviti sotto
    // il base path dell'app ("" in dev, "/KliqueASP" su GitHub Pages).
    const relative = value.replace(/^\/+/, "");
    const baseNoSlash = base.replace(/^\/+/, "");

    // Compatibilità con config che includono già il base path
    // (es. "KliqueASP/assets/...").
    if (baseNoSlash && relative.startsWith(`${baseNoSlash}/`)) {
      return `/${relative}`;
    }

    return `${base}/${relative}`;
  }

  function getTexture(safePath: string) {
    if (!textureCache.has(safePath)) {
      const tex = textureLoader.load(
        safePath,
        undefined,
        undefined,
        (err) => {
          console.warn("❌ Texture non caricabile:", safePath, err);
          failedIconPaths.add(safePath);
          textureCache.delete(safePath);
          rebuildNodeObjects();
        }
      );

      tex.colorSpace = THREE.SRGBColorSpace;
      textureCache.set(safePath, tex);
    }

    return textureCache.get(safePath) ?? null;
  }

  const R = GRAPH_CONFIG.node.ring;
  const ringGeometry = new THREE.RingGeometry(R.innerRadius, R.outerRadius, R.segments);

  // Geometrie condivise della pallina di fallback.
  const ballGlowGeometry = new THREE.SphereGeometry(4.1, 24, 24);
  const ballCoreGeometry = new THREE.SphereGeometry(2.65, 32, 32);
  const ballHighlightGeometry = new THREE.SphereGeometry(0.75, 16, 16);

  function makeIconSprite(tex: THREE.Texture, size = 14) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false
      })
    );

    sprite.scale.set(size, size, 1);
    return sprite;
  }

  function makeFallbackNodeBall(node: any) {
    const group = new THREE.Group();
    const color = new THREE.Color(getDeterministicFallbackColor(node));

    const glow = new THREE.Mesh(
      ballGlowGeometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false
      })
    );

    const core = new THREE.Mesh(
      ballCoreGeometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true
      })
    );

    const highlight = new THREE.Mesh(
      ballHighlightGeometry,
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        depthWrite: false
      })
    );

    highlight.position.set(-0.85, 0.95, 1.9);

    group.add(glow);
    group.add(core);
    group.add(highlight);

    return { group, glow, core, highlight };
  }

  function makeRing() {
    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    const s = GRAPH_CONFIG.node.ring.scale;
    ring.scale.set(s, s, s);
    return ring;
  }

  // Le texture delle label dipendono solo dal testo: le riusiamo.
  const labelTextureCache = new Map<string, THREE.CanvasTexture>();

  function getLabelTexture(text: string) {
    let texture = labelTextureCache.get(text);
    if (texture) return texture;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const L = GRAPH_CONFIG.node.label;

    ctx.font = L.font;
    canvas.width = ctx.measureText(text).width + 20;
    canvas.height = 36;

    ctx.font = L.font;
    ctx.fillStyle = "white";
    ctx.fillText(text, 10, 26);

    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    labelTextureCache.set(text, texture);

    return texture;
  }

  function makeLabel(text: string) {
    const L = GRAPH_CONFIG.node.label;

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getLabelTexture(text),
        transparent: true,
        depthWrite: false
      })
    );

    sprite.scale.set(L.scale[0], L.scale[1], 1);
    return sprite;
  }

  function makeNodeObject(node: any) {
    const group = new THREE.Group();

    const iconPath = getExplicitNodeIcon(node);
    const tex = iconPath ? getTexture(iconPath) : null;

    let icon: THREE.Sprite | null = null;
    let ball: ReturnType<typeof makeFallbackNodeBall> | null = null;

    // 🔹 ICONA se disponibile/configurata
    if (tex) {
      icon = makeIconSprite(tex, GRAPH_CONFIG.node.iconSize);
      group.add(icon);
    } else {
      // 🔹 fallback visiva node-like: pallina 3D pulita, senza iniziali
      ball = makeFallbackNodeBall(node);
      group.add(ball.group);
    }

    // 🔹 ring sempre
    const ring = makeRing();
    group.add(ring);

    // 🔹 label
    const label = makeLabel(node.label);
    label.position.y = GRAPH_CONFIG.node.label.offsetY;
    group.add(label);

    group.userData.kq = { icon, ball, ring, label };
    applyNodeVisual(node, group);

    return group;
  }

  // Aggiorna colore/opacità di un oggetto già creato, senza ricostruirlo.
  function applyNodeVisual(node: any, obj: any) {
    const kq = obj?.userData?.kq;
    if (!kq) return;

    const o = opacityForNode(node.id);

    kq.ring.material.color.set(colorAccessor(node));
    kq.ring.material.opacity = Math.min(0.95, o);

    if (kq.icon) kq.icon.material.opacity = o;

    if (kq.ball) {
      kq.ball.glow.material.opacity = Math.min(0.18, o * 0.18);
      kq.ball.core.material.opacity = Math.min(1, o);
      kq.ball.highlight.material.opacity = Math.min(0.55, o * 0.55);
    }

    kq.label.material.opacity = Math.max(0.18, o);
  }

  function refreshNodeVisuals() {
    for (const node of data?.nodes ?? []) {
      applyNodeVisual(node, node.__threeObj);
    }
  }

  // Ricostruzione completa (solo quando cambia la scelta icona/fallback).
  function rebuildNodeObjects() {
    graph3D?.nodeThreeObject((node: any) => makeNodeObject(node));
  }

  // ---------------- GRAPH HELPERS ----------------
  function buildNeighborMap() {
    neighborMap = new Map();

    data.links.forEach((l: any) => {
      const s = getLinkEndId(l.source);
      const t = getLinkEndId(l.target);

      if (!neighborMap.has(s)) neighborMap.set(s, new Set());
      if (!neighborMap.has(t)) neighborMap.set(t, new Set());

      neighborMap.get(s)!.add(t);
      neighborMap.get(t)!.add(s);
    });
  }

  // ---------------- FILTER ACTIONS ----------------
  function toggleTypeFilter(type: string, checked: boolean) {
    const next = new Set(selectedTypes);
    if (checked) next.add(type);
    else next.delete(type);
    selectedTypes = next;
    recomputeGraphData();
  }

  function toggleGroupFilter(group: string, checked: boolean) {
    const next = new Set(selectedGroupsFilter);
    if (checked) next.add(group);
    else next.delete(group);
    selectedGroupsFilter = next;
    recomputeGraphData();
  }

  // ---------------- TIMELINE ----------------
  function applyTimelineFilter() {
    console.log("[TL] applyTimelineFilter", {
      currentStart,
      currentEnd,
      nodes: originalData?.nodes?.length
    });

    if (!originalData) return;

    recomputeGraphData();

    console.log("[TL] filteredNodes:", data.nodes.length);
    console.log("[TL] filteredLinks:", data.links.length);
  }

  // ---------------- INTERACTIONS ----------------
  function focusNode(id: string) {
    const node = data.nodes.find((n: any) => n.id === id);

    console.log("🎯 FOCUS NODE:", node);

    if (!node) {
      console.warn("❌ Nodo non presente nel grafo filtrato");
      return;
    }

    console.log("📍 POS:", node.x, node.y, node.z);

    if (node.x == null) {
      console.warn("❌ Nodo SENZA coordinate (simulation non pronta)");
      return;
    }

    graph3D.cameraPosition(
      { x: node.x * 2, y: node.y * 2, z: node.z * 2 + 40 },
      { x: node.x, y: node.y, z: node.z },
      900
    );
  }

  function selectNode(id: string) {
    const node = data.nodes.find((n: any) => n.id === id);
    if (!node) return;

    const degree = neighborMap.get(id)?.size ?? 0;

    selectedNode = { ...node, degree };
    updateSelectedDetails(id);
  }

  function viewNeighbor(id: string) {
    highlightedNeighbors = new Set([id]);
    focusNode(id);
    selectNode(id);
    refreshNodeVisuals();
  }

  function commitNeighbor(id: string, label: string = "") {
    rootSelectedId = id;
    selectedId = id;
    highlightedNeighbors = new Set();

    const node = getNodeById(id);
    pushHistory(id, node?.label ?? label ?? id);

    focusNode(id);
    selectNode(id);
    refreshNodeVisuals();
  }

  function backToRoot() {
    if (!rootSelectedId) return;
    highlightedNeighbors = new Set();
    focusNode(rootSelectedId);
    selectNode(rootSelectedId);
    refreshNodeVisuals();
  }

  // Seleziona id come nuovo nodo radice (click, ricerca, history, clique).
  function selectRoot(id: string, historyMode: "start" | "truncate" = "start") {
    const node = getNodeById(id);
    if (!node) return;

    rootSelectedId = id;
    selectedId = id;
    highlightedNeighbors = new Set();

    if (historyMode === "start") startHistory(node.id, node.label);
    else truncateHistoryTo(id);

    focusNode(id);
    selectNode(id);
    refreshNodeVisuals();
  }

  function selectSearchResult(node: any) {
    if (!node) {
      searchMessage = "Nessun nodo trovato";
      return;
    }

    // Un nodo nascosto da filtri/timeline non può essere selezionato:
    // lo segnaliamo invece di lasciare una selezione invisibile.
    if (!getNodeById(node.id)) {
      searchMessage = `"${node.label}" è nascosto dai filtri o dalla timeline correnti`;
      return;
    }

    searchMessage = "";
    selectRoot(node.id);
  }

  function searchNode(q: string) {
    const text = q.trim().toLowerCase();
    if (!text || !originalData) return;

    // Priorità: match esatto > prefisso > sottostringa; a parità, nodi visibili.
    const rank = (n: any) => {
      const label = n.label.toLowerCase();
      const score = label === text ? 3 : label.startsWith(text) ? 2 : label.includes(text) ? 1 : 0;
      return score * 2 + (getNodeById(n.id) ? 1 : 0);
    };

    let best: any = null;
    let bestScore = 0;

    for (const n of originalData.nodes) {
      const score = rank(n);
      if (score > bestScore) {
        best = n;
        bestScore = score;
      }
    }

    selectSearchResult(bestScore >= 2 ? best : null);
  }

  function resetView() {
    rootSelectedId = null;
    selectedId = null;
    selectedNode = null;
    selectedDetails = null;
    highlightedNeighbors = new Set();
    cliqueNodes = new Set();
    suggestions = [];
    showSuggestions = false;
    searchMessage = "";
    clearHistory();

    selectedTypes = new Set();
    selectedGroupsFilter = new Set();

    currentStart = GRAPH_CONFIG.timeline.start;
    currentEnd = GRAPH_CONFIG.timeline.end;

    recomputeGraphData();
    refreshNodeVisuals();
    graph3D.cameraPosition({ x: 0, y: 0, z: 220 }, { x: 0, y: 0, z: 0 }, 800);
  }

  function clearClique() {
    cliqueNodes = new Set();
    refreshNodeVisuals();
  }

  function zoomIn() {
    const cam = graph3D.camera();
    graph3D.cameraPosition(
      { x: cam.position.x, y: cam.position.y, z: cam.position.length() * 0.75 },
      undefined,
      300
    );
  }

  function zoomOut() {
    const cam = graph3D.camera();
    graph3D.cameraPosition(
      { x: cam.position.x, y: cam.position.y, z: cam.position.length() * 1.3 },
      undefined,
      300
    );
  }

  // ---------------- ASP ----------------
  // Modalità di enumerazione (solver.cliqueMode):
  // - "maximal": tutte le clique massimali (non estendibili) -> default
  // - "all":     tutte le clique, incluse le sotto-clique (--opt-mode=enum);
  //              è il comportamento con cui sono stati prodotti i CSV in results/
  // - "maximum": solo le clique di cardinalità massima (--opt-mode=optN)
  type CliqueMode = "maximal" | "all" | "maximum";

  const CLIQUE_MODES: CliqueMode[] = ["maximal", "all", "maximum"];

  function getCliqueMode(): CliqueMode {
    const mode = GRAPH_CONFIG.solver?.cliqueMode;
    return CLIQUE_MODES.includes(mode) ? mode : "maximal";
  }

  // Stringa ASP quotata: i valori dei gruppi possono contenere spazi, "&",
  // iniziare con una cifra, ecc. e non sempre sono costanti valide.
  function aspString(value: string) {
    const escaped = String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");

    return `"${escaped}"`;
  }

  function buildCliqueProgram(mode: CliqueMode, group: string) {
    const domain = group ? "valid" : "node";
    const lines: string[] = [];

    if (group) {
      lines.push(`valid(V) :- node(V), group(V, ${aspString(group)}).`, "");
    }

    lines.push(
      `{ in(V) : ${domain}(V) }.`,
      "",
      ":- in(U), in(V), U < V, not edge(U,V)."
    );

    if (mode === "maximal") {
      // Massimalità: ogni candidato fuori dalla clique deve avere almeno un
      // membro non adiacente (altrimenti la clique sarebbe estendibile).
      lines.push(
        "",
        `out(W) :- ${domain}(W), in(V), V != W, not edge(W,V).`,
        `:- ${domain}(W), not in(W), not out(W).`
      );
    } else {
      lines.push("", "#maximize { 1,V : in(V) }.");
    }

    lines.push("", "#show in/1.");

    return lines.join("\n");
  }

  function getCliqueModeOptions(mode: CliqueMode): string[] {
    if (mode === "all") return ["--opt-mode=enum"];
    if (mode === "maximum") return ["--opt-mode=optN"];
    return [];
  }

  function buildAspFactsFromCurrentData() {
    if (!data) return { facts: "", reverseIndex: {} };

    const indexMap = new Map<string, number>();
    const reverseIndex: Record<number, string> = {};

    let counter = 1;

    // ---------------- NODE INDEX ----------------
    for (const node of data.nodes) {
      indexMap.set(node.id, counter);
      reverseIndex[counter] = node.id;
      counter++;
    }

    let facts = "";

    // ---------------- NODE FACTS ----------------
    for (const [, idx] of indexMap) {
      facts += `node(${idx}).\n`;
    }

    // ---------------- GROUP FACTS (GENERIC)
    for (const node of data.nodes) {
      const idx = indexMap.get(node.id);
      if (!idx) continue;

      for (const group of new Set(extractGroups(node))) {
        facts += `group(${idx},${aspString(group)}).\n`;
      }
    }

    // ---------------- EDGE FACTS ----------------
    for (const link of data.links) {
      const sourceId = getLinkEndId(link.source);
      const targetId = getLinkEndId(link.target);

      const s = indexMap.get(sourceId);
      const t = indexMap.get(targetId);

      if (s && t) {
        facts += `edge(${s},${t}).\n`;
        facts += `edge(${t},${s}).\n`;
      }
    }

    return { facts, reverseIndex };
  }

  // Invia un programma al worker e attende il risultato JSON di clingo.
  function callClingo(program: string, options: string[]): Promise<any> {
    return new Promise((resolve) => {
      const cleanup = () => {
        clingoWorker.removeEventListener("message", onMessage);
        clingoWorker.removeEventListener("error", onError);
      };

      const onMessage = (e: MessageEvent) => {
        const msg = e.data;

        // La risposta a "init" è null: non è il risultato di questo run.
        if (!msg || typeof msg !== "object" || !("Result" in msg)) return;

        cleanup();
        resolve(msg);
      };

      const onError = (e: ErrorEvent) => {
        cleanup();
        resolve({ Result: "ERROR", Error: e.message || "Clingo worker error" });
      };

      clingoWorker.addEventListener("message", onMessage);
      clingoWorker.addEventListener("error", onError);

      clingoWorker.postMessage({
        type: "run",
        args: [program, 0, options]
      });
    });
  }

  function parseWitnessCliques(witnesses: any[], reverseIndex: Record<number, string>) {
    const seen = new Set<string>();
    const cliques: string[][] = [];

    for (const w of witnesses ?? []) {
      const names = (w?.Value ?? [])
        .map((atom: string) => /^in\((\d+)\)$/.exec(atom))
        .filter(Boolean)
        .map((m: RegExpExecArray) => reverseIndex[Number(m[1])])
        .filter(Boolean) as string[];

      if (names.length <= 2) continue;

      // Con --opt-mode=optN lo stesso modello ottimo può comparire due volte.
      const key = [...names].sort().join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);

      cliques.push(names);
    }

    return cliques;
  }

  async function runMaximumClique() {
    if (solverRunning || !clingoWorker) return;

    if (!data || !data.nodes?.length) {
      console.warn("⚠️ No visible nodes. Aborting clique computation.");
      return;
    }

    const { facts, reverseIndex } = buildAspFactsFromCurrentData();

    if (!facts.trim()) {
      console.warn("⚠️ No facts generated. Aborting.");
      return;
    }

    const mode = getCliqueMode();
    const program = buildCliqueProgram(mode, selectedGroup);
    const fullProgram = facts.trim() + "\n\n" + program.trim() + "\n";

    solverRunning = true;
    solverError = "";

    const t0 = performance.now();
    const result = await callClingo(fullProgram, getCliqueModeOptions(mode));
    const t1 = performance.now();

    solverRunning = false;

    let foundCliques: string[][] = [];

    if (result?.Result === "ERROR") {
      console.error("❌ CLINGO ERROR:", result.Error);
      solverError = result.Error || "Clingo error";
    } else {
      foundCliques = parseWitnessCliques(result?.Call?.[0]?.Witnesses, reverseIndex);
    }

    foundCliques.sort((a, b) => b.length - a.length);

    const maxSize = foundCliques[0]?.length ?? 0;

    // In modalità "maximum" clingo stampa anche i modelli intermedi non ottimi.
    if (mode === "maximum") {
      foundCliques = foundCliques.filter((c) => c.length === maxSize);
    }

    const maxCliques = foundCliques.filter((c) => c.length === maxSize);

    const hist = new Map<number, number>();
    for (const c of foundCliques) {
      hist.set(c.length, (hist.get(c.length) ?? 0) + 1);
    }

    console.log(
      `🟢 [CLIQUE] mode=${mode}${selectedGroup ? ` group=${selectedGroup}` : ""}: ` +
      `${foundCliques.length} cliques, max size ${maxSize}, ${(t1 - t0).toFixed(1)} ms`
    );

    maximumCliques = maxCliques;
    allCliques = foundCliques;

    solverStats = {
      totalCliques: foundCliques.length,
      maxSize,
      histogram: hist,
      timeMs: t1 - t0,
      nodesCount: data.nodes.length,
      linksCount: data.links.length,
      periodLabel: `${currentStart}–${currentEnd}`,
      cliqueMode: mode
    };

    showSolverPanel = true;
    cliqueNodes = new Set(maxCliques[0] ?? []);
    refreshNodeVisuals();
  }

  // ---------------- LIFECYCLE ----------------
  let destroyed = false;

  onMount(() => {
    (async () => {
      const ForceGraph3D = (await import("3d-force-graph")).default;

      // Il componente può essere smontato prima che l'import termini
      // (es. "Apply JSON" ripetuto nella Sandbox).
      if (destroyed) return;

      if (solverEnabled) {
        clingoWorker = new Worker(`${base}/clingo/clingo.web.worker.js`, {
          type: "module"
        });

        clingoWorker.onerror = (e) =>
          console.error("❌ [CLINGO] Worker failed to load:", e.message, e);

        clingoWorker.postMessage({
          type: "init",
          wasmUrl: `${base}/clingo/clingo.wasm`
        });
      }

      graph3D = new ForceGraph3D(container)
        .nodeId("id")
        .nodeLabel("label")
        .backgroundColor(GRAPH_CONFIG.graph.backgroundColor)
        .nodeOpacity(GRAPH_CONFIG.graph.nodeOpacity)
        .linkOpacity(GRAPH_CONFIG.graph.linkOpacity)
        .linkWidth(GRAPH_CONFIG.graph.linkWidth);

      graph3D.nodeThreeObjectExtend(false);
      rebuildNodeObjects();

      graph3D.onNodeClick((node: any) => {
        showSuggestions = false;
        selectRoot(node.id);
      });

      const F = GRAPH_CONFIG.forces;
      graph3D
        .forceEngine("d3")
        .d3Force("charge", forceManyBody().strength(F.charge))
        .d3Force("center", forceCenter())
        .d3Force("link", forceLink().distance(F.linkDistance).strength(F.linkStrength));

      loadDataset();
    })();
  });

  onDestroy(() => {
    destroyed = true;
    graph3D?._destructor?.();
    clingoWorker?.terminate();
  });
</script>

<div
  class:with-json-editor={JsonEditor && jsonEditorProps?.open}
  class="app-root"
  style="
  --info-top: {UI.infoPanel.top}px;
--info-right: {UI.infoPanel.right}px;
--info-width: {UI.infoPanel.width}px;
--info-max-height: {UI.infoPanel.maxHeight}px;
--info-padding: {UI.infoPanel.padding}px;
--info-radius: {UI.infoPanel.borderRadius}px;
--info-bg: {UI.infoPanel.background};
--info-z: {UI.infoPanel.zIndex};

--info-title-size: {UI.infoPanel.title.fontSize}px;

--modal-backdrop: {UI.infoPanel.modal.backdrop};
--modal-z: {UI.infoPanel.modal.zIndex};

--modal-card-width: {UI.infoPanel.modal.cardWidth};
--modal-card-max-height: {UI.infoPanel.modal.cardMaxHeight};
--modal-card-bg: {UI.infoPanel.modal.cardBg};
--modal-card-radius: {UI.infoPanel.modal.cardRadius}px;

--modal-header-size: {UI.infoPanel.modal.headerFontSize}px;
--modal-header-border: {UI.infoPanel.modal.headerBorder};

--modal-body-padding: {UI.infoPanel.modal.bodyPadding}px;
--modal-line-height: {UI.infoPanel.modal.lineHeight};

--modal-footer-padding: {UI.infoPanel.modal.footerPadding};

--modal-close-bg: {UI.infoPanel.modal.closeBg};
--modal-close-color: {UI.infoPanel.modal.closeColor};
--solver-top: {UI.solverPanel.top}px;
--solver-right: {UI.solverPanel.right}px;
--solver-width: {UI.solverPanel.width}px;
--solver-max-height: {UI.solverPanel.maxHeight};
--solver-padding: {UI.solverPanel.padding}px;
--solver-radius: {UI.solverPanel.borderRadius}px;
--solver-bg: {UI.solverPanel.background};
--solver-shadow: {UI.solverPanel.shadow};
--solver-z: {UI.solverPanel.zIndex};
--solver-font-size: {UI.solverPanel.fontSize}px;

--solver-close-color: {UI.solverPanel.header.closeColor};

--solver-meta-opacity: {UI.solverPanel.meta.opacity};
--solver-meta-gap: {UI.solverPanel.meta.gap}px;

--solver-selected-bg: {UI.solverPanel.selectedAnalysis.background};
--solver-selected-padding: {UI.solverPanel.selectedAnalysis.padding}px;
--solver-selected-radius: {UI.solverPanel.selectedAnalysis.radius}px;
--solver-selected-mt: {UI.solverPanel.selectedAnalysis.marginTop}px;

--solver-controls-gap: {UI.solverPanel.controls.gap}px;
--solver-controls-mt: {UI.solverPanel.controls.marginTop}px;
--solver-controls-mb: {UI.solverPanel.controls.marginBottom}px;
--solver-input-width: {UI.solverPanel.controls.inputWidth}px;

--solver-cliques-mt: {UI.solverPanel.cliques.marginTop}px;
--solver-group-gap: {UI.solverPanel.cliques.groupGap}px;

--solver-item-padding: {UI.solverPanel.cliques.item.padding};
--solver-item-mb: {UI.solverPanel.cliques.item.marginBottom}px;
--solver-item-bg: {UI.solverPanel.cliques.item.background};
--solver-item-hover: {UI.solverPanel.cliques.item.hover};
--solver-item-radius: {UI.solverPanel.cliques.item.radius}px;
--solver-item-font: {UI.solverPanel.cliques.item.fontSize}px;

--solver-badge-bg: {UI.solverPanel.cliques.badge.bg};
--solver-badge-color: {UI.solverPanel.cliques.badge.color};
--solver-badge-font: {UI.solverPanel.cliques.badge.fontSize}px;
--solver-badge-padding: {UI.solverPanel.cliques.badge.padding};
--solver-badge-radius: {UI.solverPanel.cliques.badge.radius}px;
--history-left: {UI.historyPanel.left}px;
--history-bottom: {UI.historyPanel.bottom}px;
--history-max-width: {UI.historyPanel.maxWidth};
--history-padding: {UI.historyPanel.padding}px;
--history-radius: {UI.historyPanel.borderRadius}px;
--history-bg: {UI.historyPanel.background};
--history-z: {UI.historyPanel.zIndex};
--history-font: {UI.historyPanel.fontSize}px;
--history-color: {UI.historyPanel.textColor};

--history-header-mb: {UI.historyPanel.header.marginBottom}px;

--history-clear-bg: {UI.historyPanel.clearButton.background};
--history-clear-radius: {UI.historyPanel.clearButton.radius}px;
--history-clear-size: {UI.historyPanel.clearButton.size}px;

--history-gap: {UI.historyPanel.crumbs.gap}px;

--history-crumb-bg: {UI.historyPanel.crumb.background};
--history-crumb-hover: {UI.historyPanel.crumb.hover};
--history-crumb-padding: {UI.historyPanel.crumb.padding};
--history-crumb-radius: {UI.historyPanel.crumb.radius}px;
--history-crumb-max: {UI.historyPanel.crumb.maxWidth}px;

--history-sep-opacity: {UI.historyPanel.separator.opacity};
  --body-bg: {UI.body.background};
--body-color: {UI.body.textColor};
--body-font: {UI.body.fontFamily};

--toolbar-bg: {UI.toolbar.background};
--toolbar-z: {UI.toolbar.zIndex};

--zoom-margin-left: {UI.zoom.marginLeft}px;

--filter-bg: {UI.filterCard.background};
--filter-z: {UI.filterCard.zIndex};
--filter-max-width: {UI.filterCard.maxWidth}px;
--filter-max-height: {UI.filterCard.maxHeight};

--autocomplete-bg: {UI.autocomplete.background};
--autocomplete-radius: {UI.autocomplete.borderRadius}px;
--autocomplete-shadow: {UI.autocomplete.shadow};
--autocomplete-z: {UI.autocomplete.zIndex};
--autocomplete-offset-y: {UI.autocomplete.offsetY}px;
    --toolbar-top: {UI.toolbar.top}px;
    --toolbar-left: {UI.toolbar.left}px;
    --toolbar-gap: {UI.toolbar.spacing}px;
    --toolbar-padding: {UI.toolbar.padding};
    --toolbar-radius: {UI.toolbar.borderRadius}px;

    --search-width: {UI.search.width}px;
    --search-max-width: {UI.search.maxWidth};

    --zoom-gap: {UI.zoom.gap}px;

    --filter-top: {UI.filterCard.top}px;
    --filter-left: {UI.filterCard.left}px;
    --filter-padding: {UI.filterCard.padding}px;
    --filter-radius: {UI.filterCard.borderRadius}px;
    --filter-font-size: {UI.filterCard.fontSize}px;

    --autocomplete-item-padding: {UI.autocomplete.itemPadding};
    --autocomplete-font-size: {UI.autocomplete.fontSize}px;
  "
>
  {#if JsonEditor}
    <svelte:component
      this={JsonEditor}
      {...jsonEditorProps}
    />
  {/if}
  <div bind:this={container} class="graph"></div>

<!-- TOOLBAR -->
<div class="toolbar">
  {#if solverEnabled}
    <button on:click={runMaximumClique} disabled={solverRunning}>
      {solverRunning ? "Running…" : "Run Maximum Clique"}
    </button>

    <button on:click={clearClique}>
      Clear Clique
    </button>
  {/if}

  {#if JsonEditor}
  <button
    type="button"
    on:click={() => jsonEditorProps?.onOpen?.()}
  >
    JSON Editor
  </button>
{/if}

  <div class="search-wrap">
    <input
      type="text"
      placeholder="Search node..."
      bind:value={query}
      on:input={() => {
        searchMessage = "";
        rankCandidates(query);
      }}
      on:keydown={(e) => {
        if (e.key === "Enter") {
          showSuggestions = false;
          searchNode(query);
        }
        if (e.key === "Escape") showSuggestions = false;
      }}
      on:focus={() => suggestions.length > 0 && query.trim().length >= 2 && (showSuggestions = true)}
      on:blur={() => setTimeout(() => (showSuggestions = false), 120)}
    />

    {#if showSuggestions}
      <div class="autocomplete">
        {#each suggestions as s (s.id)}
          <button
            type="button"
            class="autocomplete-item"
            on:mousedown|preventDefault
            on:click={() => chooseSuggestion(s)}
          >{s.label}</button>
        {/each}
      </div>
    {:else if searchMessage}
      <div class="search-message" role="status">{searchMessage}</div>
    {/if}
  </div>

  <button on:click={() => (showSuggestions = false, searchNode(query))}>Search</button>
  <button on:click={resetView}>Reset</button>

  <div class="zoom-inline">
    <button on:click={zoomIn}>+</button>
    <button on:click={zoomOut}>−</button>
  </div>
</div>

{#if filtersEnabled}
  <div class="filter-card">
    <strong>Filters</strong>

    {#if typeFiltersEnabled}
      <div class="filter-section">
        <span class="filter-title">Types</span>
        {#each availableTypes as type}
          <label>
            <input
              type="checkbox"
              checked={selectedTypes.has(type)}
              on:change={(e) => toggleTypeFilter(type, (e.currentTarget as HTMLInputElement).checked)}
            />
            {type}
          </label>
        {/each}
      </div>
    {/if}

    {#if groupFiltersEnabled}
      <div class="filter-section">
        <span class="filter-title">Groups</span>
        {#each availableGroups as group}
          <label>
            <input
              type="checkbox"
              checked={selectedGroupsFilter.has(group)}
              on:change={(e) => toggleGroupFilter(group, (e.currentTarget as HTMLInputElement).checked)}
            />
            {group}
          </label>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<InfoPanel
  {selectedNode}
  {selectedDetails}
  {rootSelectedId}
  neighborIds={
  Array.from(neighborMap.get(rootSelectedId ?? "") ?? [])
    .map(id => {
      const node = getNodeById(id);
      return {
        id,
        label: node?.label ?? id
      };
    })
}
  {highlightedNeighbors}
  onBackToRoot={backToRoot}
  onViewNeighbor={viewNeighbor}
  onCommitNeighbor={(id) => {
  const node = getNodeById(id);
  commitNeighbor(id, node?.label ?? id);
}}
/>

<HistoryPanel
  {history}
  onClear={clearHistory}
  onJumpTo={(id) => selectRoot(id, "truncate")}
/>

{#if GRAPH_CONFIG.features.timeline}
<TimelineSlider
  uiConfig={UI.timeline}
  min={GRAPH_CONFIG.timeline.start}
  max={GRAPH_CONFIG.timeline.end}
  start={currentStart}
  end={currentEnd}
  on:change={(e) => {
    currentStart = e.detail.start;
    currentEnd = e.detail.end;

    clearTimeout(timelineTimeout);
    timelineTimeout = setTimeout(() => {
      applyTimelineFilter();
      graph3D?.d3ReheatSimulation?.();
    }, GRAPH_CONFIG.timeline.debounceMs);
  }}
/>
{/if}

{#if solverEnabled}
<SolverPanel
  config={GRAPH_CONFIG.solver}
  open={showSolverPanel}
  stats={solverStats}
  error={solverError}
  maximumCliques={maximumCliques}
  allCliques={allCliques}
  selectedNodeId={selectedId}
  bind:minSize={minCliqueSize}
  bind:topPerSize={topPerSize}
  bind:selectedGroup
  {availableGroups}
  on:close={() => showSolverPanel = false}
  on:highlight={(e) => {
    const clique = e.detail as string[];

    cliqueNodes = new Set(clique);

    if (clique[0]) selectRoot(clique[0]);

    refreshNodeVisuals();
  }}
/>
{/if}
</div>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: var(--body-bg);
    font-family: var(--body-font);
    color: var(--body-color);
  }

  .graph {
    width: 100vw;
    height: 100vh;
  }

  .toolbar {
    position: absolute;
    top: var(--toolbar-top);
    left: var(--toolbar-left);
    display: flex;
    gap: var(--toolbar-gap);
    align-items: center;
    background: var(--toolbar-bg);
    padding: var(--toolbar-padding);
    border-radius: var(--toolbar-radius);
    z-index: var(--toolbar-z);
  }

  .search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-wrap input {
    width: var(--search-width);
    max-width: var(--search-max-width);
  }

  .autocomplete {
    position: absolute;
    top: calc(100% + var(--autocomplete-offset-y));
    left: 0;
    width: var(--search-width);
    max-width: var(--search-max-width);
    background: var(--autocomplete-bg);
    border-radius: var(--autocomplete-radius);
    overflow: hidden;
    z-index: var(--autocomplete-z);
    box-shadow: var(--autocomplete-shadow);
  }

  .autocomplete-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-radius: 0;
    color: inherit;
    font-family: inherit;
    padding: var(--autocomplete-item-padding);
    cursor: pointer;
    font-size: var(--autocomplete-font-size);
    line-height: 1.2;
    border-top: 1px solid rgba(148, 163, 184, 0.08);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .autocomplete-item:first-child {
    border-top: none;
  }

  .autocomplete-item:hover,
  .autocomplete-item:focus-visible {
    background: var(--autocomplete-hover, rgba(56, 189, 248, 0.2));
  }

  .search-message {
    position: absolute;
    top: calc(100% + var(--autocomplete-offset-y));
    left: 0;
    width: var(--search-width);
    max-width: var(--search-max-width);
    box-sizing: border-box;
    padding: var(--autocomplete-item-padding);
    font-size: var(--autocomplete-font-size);
    background: var(--autocomplete-bg);
    border-radius: var(--autocomplete-radius);
    box-shadow: var(--autocomplete-shadow);
    z-index: var(--autocomplete-z);
  }

  .zoom-inline {
    display: flex;
    flex-direction: column;
    gap: var(--zoom-gap);
    margin-left: var(--zoom-margin-left);
  }

  .filter-card {
    position: absolute;
    top: var(--filter-top);
    left: var(--filter-left);
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--filter-bg);
    padding: var(--filter-padding);
    border-radius: var(--filter-radius);
    z-index: var(--filter-z);
    font-size: var(--filter-font-size);
    max-width: var(--filter-max-width);
    max-height: var(--filter-max-height);
    overflow-y: auto;
  }

  .filter-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .filter-title {
    font-weight: 600;
    color: var(--filter-title-color, #7dd3fc);
  }

  .filter-card label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .filter-card input[type="checkbox"] {
    accent-color: var(--filter-accent-color, #38bdf8);
  }

    .app-root.with-json-editor .graph {
    margin-left: 420px;
    width: calc(100vw - 420px);
  }

  .app-root.with-json-editor .toolbar {
    left: calc(var(--toolbar-left) + 420px);
  }

  .app-root.with-json-editor .filter-card {
    left: calc(var(--filter-left) + 420px);
  }

  @media (max-width: 900px) {
    .app-root.with-json-editor .graph {
      margin-left: 0;
      width: 100vw;
    }

    .app-root.with-json-editor .toolbar {
      left: var(--toolbar-left);
    }

    .app-root.with-json-editor .filter-card {
      left: var(--filter-left);
    }
  }
</style>