<script lang="ts">
  import { createEventDispatcher } from "svelte";

  // Sezione "solver" del config già risolta dal parent (GraphApp).
  export let config: any = {};

  export let open: boolean = false;

  export let stats: {
    totalCliques: number;
    maxSize: number;
    histogram: Map<number, number>;
    timeMs?: number;
    nodesCount?: number;
    linksCount?: number;
    periodLabel?: string;
    cliqueMode?: string;
  };

  export let error: string = "";

  export let maximumCliques: string[][] = [];
  export let allCliques: string[][] = [];

  export let selectedNodeId: string | null = null;

  export let minSize: number = 3;
  export let topPerSize: number = 5;

  export let selectedGroup: string = "";
  export let availableGroups: string[] = [];

  const dispatch = createEventDispatcher();

  const DEFAULT_SOLVER_CFG = {
    enabled: true,
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
  };

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

  const SOLVER_CFG = deepMerge(
    DEFAULT_SOLVER_CFG,
    config ?? {}
  );

  const F = SOLVER_CFG.features ?? DEFAULT_SOLVER_CFG.features;

  let showOnlyMaximum = false;
  let showAll = false;
  let filterBySelectedNode = false;

  let filteredCliques: string[][] = [];
  let grouped: { size: number; cliques: string[][] }[] = [];

  function highlightClique(c: string[]) {
    dispatch("highlight", c);
  }

  function closePanel() {
    dispatch("close");
  }

  function getFilteredCliques() {
    const min = Number(minSize);
    const safeMin = Number.isFinite(min) ? min : 0;

    let base: any = allCliques ?? [];
    if (!Array.isArray(base)) base = [];

    if (showOnlyMaximum) {
      base = maximumCliques ?? [];
      if (!Array.isArray(base)) base = [];
    }

    if (filterBySelectedNode && selectedNodeId) {
      base = base.filter(
        (c: any) => Array.isArray(c) && c.includes(selectedNodeId)
      );
    }

    base = base.filter(
      (c: any) => Array.isArray(c) && c.length >= safeMin
    );

    return base as string[][];
  }

  // ✅ FIX REATTIVITÀ
  $: {
    allCliques;
    maximumCliques;
    selectedNodeId;
    minSize;
    showOnlyMaximum;
    filterBySelectedNode;

    filteredCliques = getFilteredCliques();
  }

  function groupCliques(cliques: string[][]) {
    if (!cliques || !cliques.length) return [];

    const top = Number(topPerSize);
    const safeTop = Number.isFinite(top) ? top : 5;

    const map = new Map<number, string[][]>();

    for (const c of cliques) {
      if (!Array.isArray(c)) continue;
      if (!map.has(c.length)) map.set(c.length, []);
      map.get(c.length)!.push(c);
    }

    const sizes = Array.from(map.keys()).sort((a, b) => b - a);

    return sizes.map(size => ({
      size,
      cliques: showAll
        ? map.get(size)!
        : map.get(size)!.slice(0, safeTop)
    }));
  }

  // ✅ FIX REATTIVITÀ
  $: {
    filteredCliques;
    showAll;
    topPerSize;

    grouped = groupCliques(filteredCliques ?? []);
  }

  $: selectedCliqueCount =
    selectedNodeId
      ? (allCliques ?? []).filter(c => Array.isArray(c) && c.includes(selectedNodeId)).length
      : 0;

  const CLIQUE_MODE_LABELS: Record<string, string> = {
    maximal: "maximal cliques",
    all: "all cliques (incl. sub-cliques)",
    maximum: "maximum cliques only"
  };

  $: histogramRows = Array.from(stats?.histogram?.entries?.() ?? [])
    .sort((a, b) => b[0] - a[0]);

  $: histogramMax = Math.max(1, ...histogramRows.map(([, count]) => count));

  $: selectedInMaximum =
    selectedNodeId
      ? (maximumCliques ?? []).some(c => Array.isArray(c) && c.includes(selectedNodeId))
      : false;

  function downloadCSV() {
    if (!filteredCliques?.length) return;

    let csv = "size,clique\n";

    for (const c of filteredCliques) {
      csv += `${c.length},"${c.join(" | ")}"\n`;
    }

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "cliques_export.csv";
    a.click();

    URL.revokeObjectURL(url);
  }
</script>

{#if open}
<div class="solver-panel">

  <div class="solver-header">
    <h3>ASP Clique Analysis</h3>
    <button class="close-btn" on:click={closePanel}>✕</button>
  </div>

  {#if F.stats !== false}
  <div class="solver-meta">
    {#if stats?.cliqueMode}
      <div><strong>Mode:</strong> {CLIQUE_MODE_LABELS[stats.cliqueMode] ?? stats.cliqueMode}</div>
    {/if}
    <div><strong>Total cliques:</strong> {stats?.totalCliques ?? 0}</div>
    <div><strong>Maximum size:</strong> {stats?.maxSize ?? 0}</div>

    {#if stats?.timeMs}
      <div><strong>Solver time:</strong> {stats.timeMs.toFixed(2)} ms</div>
    {/if}

    {#if stats?.nodesCount}
      <div><strong>Nodes:</strong> {stats.nodesCount}</div>
    {/if}

    {#if stats?.linksCount}
      <div><strong>Edges:</strong> {stats.linksCount}</div>
    {/if}

    {#if stats?.periodLabel}
      <div><strong>Period:</strong> {stats.periodLabel}</div>
    {/if}
  </div>
  {/if}

  {#if error}
    <div class="solver-error" role="alert">
      <strong>Solver error</strong>
      <pre>{error}</pre>
    </div>
  {/if}

  {#if F.histogram !== false && histogramRows.length > 0}
  <div class="histogram" aria-label="Clique size distribution">
    {#each histogramRows as [size, count]}
      <div class="histogram-row">
        <span class="histogram-label">Size {size}</span>
        <span class="histogram-track">
          <span class="histogram-bar" style="width: {(count / histogramMax) * 100}%"></span>
        </span>
        <span class="histogram-count">{count}</span>
      </div>
    {/each}
  </div>
  {/if}

  {#if F.selectedAnalysis !== false && selectedNodeId}
  <div class="selected-analysis">
    <div><strong>Selected node:</strong> {selectedNodeId}</div>
    <div><strong>Cliques containing it:</strong> {selectedCliqueCount}</div>
    <div>
      <strong>In maximum clique:</strong>
      {selectedInMaximum ? "YES" : "NO"}
    </div>
  </div>
  {/if}

  <div class="solver-controls">

    {#if F.groupFilter !== false}
    <label>
      Group
      <select bind:value={selectedGroup}>
        <option value="">-- none --</option>
        {#each availableGroups as group}
          <option value={group}>{group}</option>
        {/each}
      </select>
    </label>
    {/if}

    {#if F.minSize !== false}
    <label>
      Min clique size
      <input type="number" bind:value={minSize} min="2" />
    </label>
    {/if}

    {#if F.topPerSize !== false}
    <label>
      Top per size
      <input type="number" bind:value={topPerSize} min="1" max="50" />
    </label>
    {/if}

    {#if F.onlyMaximum !== false}
    <label>
      <input type="checkbox" bind:checked={showOnlyMaximum} />
      Only maximum cliques
    </label>
    {/if}

    {#if F.showAll !== false}
    <label>
      <input type="checkbox" bind:checked={showAll} />
      Show all (no top limit)
    </label>
    {/if}

    {#if F.filterBySelectedNode !== false && selectedNodeId}
    <label>
      <input type="checkbox" bind:checked={filterBySelectedNode} />
      Only cliques containing "{selectedNodeId}"
    </label>
    {/if}

    {#if F.downloadCSV !== false}
    <button on:click={downloadCSV}>
      Download CSV (filtered)
    </button>
    {/if}

  </div>

  <div class="solver-cliques">
    <h4>Cliques</h4>

    {#if grouped.length === 0}
      <div class="empty">No cliques for current filters.</div>
    {/if}

    {#each grouped as group}
      <div class="size-group">
        <div class="size-title">
          Size {group.size}
        </div>

        {#each group.cliques as c}
          <button type="button" class="clique-item" on:click={() => highlightClique(c)}>
            {c.join(", ")}
            {#if c.length === stats?.maxSize}
              <span class="max-badge">MAX</span>
            {/if}
          </button>
        {/each}
      </div>
    {/each}
  </div>

</div>
{/if}

<style>
  .solver-panel {
    position: absolute;
    right: var(--solver-right);
    top: var(--solver-top);
    width: var(--solver-width);
    max-height: var(--solver-max-height);
    overflow-y: auto;
    background: var(--solver-bg);
    padding: var(--solver-padding);
    border-radius: var(--solver-radius);
    box-shadow: var(--solver-shadow);
    z-index: var(--solver-z);
    font-size: var(--solver-font-size);
  }

  .solver-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--solver-close-color);
    cursor: pointer;
    font-size: 16px;
  }

  .solver-meta div {
    margin-bottom: var(--solver-meta-gap);
    opacity: var(--solver-meta-opacity);
  }

  .selected-analysis {
    margin-top: var(--solver-selected-mt);
    padding: var(--solver-selected-padding);
    background: var(--solver-selected-bg);
    border-radius: var(--solver-selected-radius);
  }

  .solver-controls {
    margin-top: var(--solver-controls-mt);
    margin-bottom: var(--solver-controls-mb);
    display: flex;
    flex-direction: column;
    gap: var(--solver-controls-gap);
  }

  .solver-controls input[type="number"] {
    width: var(--solver-input-width);
    margin-left: 6px;
  }

  .solver-controls select {
    margin-left: 6px;
  }

  .solver-cliques {
    margin-top: var(--solver-cliques-mt);
  }

  .size-group {
    margin-bottom: var(--solver-group-gap);
  }

  .size-title {
    font-weight: 600;
    margin-bottom: 6px;
  }

  .clique-item {
    width: 100%;
    text-align: left;
    border: none;
    color: inherit;
    font-family: inherit;
    padding: var(--solver-item-padding);
    margin-bottom: var(--solver-item-mb);
    background: var(--solver-item-bg);
    border-radius: var(--solver-item-radius);
    cursor: pointer;
    font-size: var(--solver-item-font);
    display: flex;
    justify-content: space-between;
  }

  .clique-item:hover {
    background: var(--solver-item-hover);
  }

  .max-badge {
    font-size: var(--solver-badge-font);
    background: var(--solver-badge-bg);
    color: var(--solver-badge-color);
    padding: var(--solver-badge-padding);
    border-radius: var(--solver-badge-radius);
    margin-left: 6px;
  }

  .empty {
    opacity: 0.6;
  }

  .solver-error {
    margin-top: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(239, 68, 68, 0.12);
    color: #991b1b;
  }

  .solver-error pre {
    margin: 4px 0 0;
    white-space: pre-wrap;
    font-size: 11px;
  }

  .histogram {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .histogram-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .histogram-label {
    width: 52px;
    flex: none;
  }

  .histogram-track {
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: rgba(14, 165, 233, 0.1);
    overflow: hidden;
  }

  .histogram-bar {
    display: block;
    height: 100%;
    background: var(--solver-item-hover);
  }

  .histogram-count {
    min-width: 32px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>