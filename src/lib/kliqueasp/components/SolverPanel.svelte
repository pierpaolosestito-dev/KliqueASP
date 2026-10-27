<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { deepMergeConfig } from "../config/deepMergeConfig";
  import { downloadCsvText, serializeCsv } from "../csvExport";
  import WorkerMemoryReadout from "./WorkerMemoryReadout.svelte";
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";
  import type { CliqueSupportingEdge } from "../graph/graphModel";
  import type { CliqueMaximumMembershipDiagnosis } from "../graph/cliqueMembershipDiagnosis";
  import { getGraphTaskContract } from "../graph/graphTaskContracts";
  import { buildCliqueMaximumMembershipDiagnosisCsv, buildCliqueSupportingExportRows } from "../graph/cliqueCsvExport";
  import { getOwnRecordValue } from "../graph/recordUtils";

  const cliqueMembershipQueryContract = getGraphTaskContract("clique")?.supportingQueries?.find(
    (query) => query.id === "cliqueMaximumMembershipDiagnosis"
  );

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
    selectedGroup?: string;
  };

  export let error: string = "";

  export let maximumCliques: string[][] = [];
  export let maximumCliquesForMembership: string[][] = [];
  export let allCliques: string[][] = [];
  export let supportingEdgesByClique: Record<string, CliqueSupportingEdge[]> = {};
  export let edgeProvenanceBySourceId: Record<string, string> = {};
  export let edgeProvenanceReferencesBySourceId: Record<string, string[]> = {};
  export let workerWasmMemoryStats: WorkerWasmMemoryStats | null = null;
  export let clingoTiming: ClingoInvocationTiming | null = null;
  export let showClingoTiming: boolean = false;
  export let clingoStats: ClingoInvocationStats | null = null;
  export let showClingoStats: boolean = false;

  export let selectedNodeId: string | null = null;
  export let sourceIdByNodeId: Record<string, string> = {};
  export let cliqueMembershipDiagnosis: CliqueMaximumMembershipDiagnosis | null = null;
  export let cliqueMembershipDiagnosisTargetNodeId: string | null = null;
  export let cliqueMembershipDiagnosisRunning: boolean = false;
  export let cliqueMembershipDiagnosisError: string = "";

  export let minSize: number = 3;
  export let topPerSize: number = 5;

  export let selectedGroup: string = "";
  export let availableGroups: string[] = [];

  function edgeProvenance(edgeId: string): string | undefined {
    return getOwnRecordValue<string>(edgeProvenanceBySourceId, edgeId);
  }

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

  const SOLVER_CFG = deepMergeConfig(
    DEFAULT_SOLVER_CFG,
    config ?? {}
  );

  const F = SOLVER_CFG.features ?? DEFAULT_SOLVER_CFG.features;

  let showOnlyMaximum = false;
  let showAll = false;
  let filterBySelectedNode = false;

  let filteredCliques: string[][] = [];
  let grouped: { size: number; cliques: string[][] }[] = [];
  let selectedCliqueSignature = "";

  function cliqueSignature(clique: string[]): string {
    return [...clique].sort().join("\u0000");
  }

  $: selectedCliqueSupportingEdges = supportingEdgesByClique[ selectedCliqueSignature ] ?? [];

  function highlightClique(c: string[]) {
    selectedCliqueSignature = cliqueSignature(c);
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
      ? (maximumCliquesForMembership ?? []).some(c => Array.isArray(c) && c.includes(selectedNodeId))
      : false;

  function downloadCSV() {
    if (!filteredCliques?.length) return;

    const rows: unknown[][] = [["size", "clique"]];
    for (const clique of filteredCliques) rows.push([clique.length, clique.join(" | ")]);
    downloadCsvText("cliques_export.csv", serializeCsv(rows));
  }

  function downloadExplanationCSV() {
    if (!filteredCliques.length) return;
    const rows = buildCliqueSupportingExportRows(
      filteredCliques,
      supportingEdgesByClique,
      edgeProvenanceBySourceId,
      edgeProvenanceReferencesBySourceId
    );
    const csv = serializeCsv(rows);
    downloadCsvText("cliques_with_supporting_edges.csv", csv);
  }

  function downloadMembershipDiagnosisCSV() {
    if (!cliqueMembershipDiagnosis) return;
    downloadCsvText("maximum_clique_membership_diagnosis.csv", buildCliqueMaximumMembershipDiagnosisCsv(
      cliqueMembershipDiagnosis,
      sourceIdByNodeId,
      stats?.selectedGroup ?? ""
    ));
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
    <WorkerMemoryReadout stats={workerWasmMemoryStats} {clingoTiming} showClingoTiming={showClingoTiming} {clingoStats} showClingoStats={showClingoStats} />
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

  {#if stats?.maxSize > 0 && stats.maxSize < 3}
    <p class="clique-threshold-note">
      L'ottimo matematico ha taglia {stats.maxSize}; il riepilogo legacy elenca solo clique di almeno 3 nodi.
    </p>
  {/if}

  {#if F.selectedAnalysis !== false && selectedNodeId}
  <div class="selected-analysis">
    <div><strong>Selected node:</strong> {selectedNodeId}</div>
    <div><strong>Displayed cliques containing it:</strong> {selectedCliqueCount}</div>
    <div>
      <strong>In maximum clique:</strong>
      {selectedInMaximum ? "YES" : "NO"}
    </div>
    <div><strong>Analyzed group:</strong> {stats?.selectedGroup || "all nodes"}</div>
    {#if !selectedInMaximum && stats?.maxSize > 0}
      <button
        type="button"
        disabled={cliqueMembershipDiagnosisRunning}
        on:click={() => dispatch("diagnoseMaximumMembership", selectedNodeId)}
      >
        {cliqueMembershipDiagnosisRunning ? "Verifica ASP in corso…" : "Diagnosi ASP why-not"}
      </button>
      {#if cliqueMembershipQueryContract}
        <details class="membership-query-contract">
          <summary>Semantica della diagnosi ASP</summary>
          <p>{cliqueMembershipQueryContract.querySemantics}</p>
          <p><strong>Enumerazione:</strong> {cliqueMembershipQueryContract.supportedEnumeration.join(" / ")}.</p>
          <p><strong>Input:</strong> {cliqueMembershipQueryContract.inputPredicates.join(", ")}.</p>
          <p><strong>Witness:</strong> {cliqueMembershipQueryContract.witnessPredicates.join(", ")}.</p>
          <p><strong>Campi:</strong> {cliqueMembershipQueryContract.resultFields.join(", ")}.</p>
          <small>Encoding `{cliqueMembershipQueryContract.aspEncoding}` v{cliqueMembershipQueryContract.encodingVersion}; parser `{cliqueMembershipQueryContract.parser}`.</small>
        </details>
      {/if}
    {/if}
    {#if cliqueMembershipDiagnosisTargetNodeId === selectedNodeId && cliqueMembershipDiagnosisError}
      <p role="alert">Diagnosi non disponibile: {cliqueMembershipDiagnosisError}</p>
    {/if}
    {#if cliqueMembershipDiagnosisTargetNodeId === selectedNodeId && cliqueMembershipDiagnosis}
      {#if cliqueMembershipDiagnosis.outcome === "excluded-from-maximum"}
        <strong>Esclusione dalla clique massima verificata da ASP</strong>
        <p>
          La migliore clique che contiene il nodo ha taglia {cliqueMembershipDiagnosis.maximumContainingSize};
          l'ottimo globale è {cliqueMembershipDiagnosis.globalMaximumSize} (gap {cliqueMembershipDiagnosis.sizeGap}).
          Il solver ha provato l'ottimo con il nodo forzato e il witness è stato verificato sul grafo corrente.
        </p>
      {:else}
        <strong>Controesempio: il nodo appartiene a una clique massima</strong>
        <p>La query ASP ha trovato una clique con il nodo di taglia {cliqueMembershipDiagnosis.maximumContainingSize}; il precedente elenco massimo non è coerente con questo witness.</p>
      {/if}
      <p>È una spiegazione strutturale della proiezione analizzata, non una causa storica o sociale.</p>
      <p><strong>Witness:</strong> {cliqueMembershipDiagnosis.witnessNodeIds.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId).join(" | ")}</p>
      {#if cliqueMembershipDiagnosis.supportingEdges.length > 0}
        <ul>
          {#each cliqueMembershipDiagnosis.supportingEdges as edge}
            <li>
              {sourceIdByNodeId[edge.sourceNodeId] ?? edge.sourceNodeId} — {sourceIdByNodeId[edge.targetNodeId] ?? edge.targetNodeId}
              {#if edge.edgeId}<small>{edge.edgeIdGenerated ? "chiave record locale" : "ID arco sorgente"}: {edge.edgeId}</small>{/if}
            </li>
          {/each}
        </ul>
      {/if}
      <div class="membership-diagnosis-actions">
        <button type="button" on:click={() => dispatch("highlightMembershipWitness", cliqueMembershipDiagnosis)}>
          Evidenzia witness 3D
        </button>
        <button type="button" on:click={downloadMembershipDiagnosisCSV}>Esporta diagnosi CSV</button>
      </div>
    {/if}
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
    {#if Object.keys(supportingEdgesByClique).length > 0}
    <button on:click={downloadExplanationCSV}>
      Download clique witnesses CSV
    </button>
    {/if}
    {/if}

  </div>

  {#if F.selectedAnalysis !== false && selectedCliqueSignature}
    <div class="selected-analysis clique-explanation">
      <strong>Positive ASP explanation</strong>
      <p>Each unordered pair of clique nodes has at least one supporting edge record.</p>
      {#if selectedCliqueSupportingEdges.length > 0}
        <ul>
          {#each selectedCliqueSupportingEdges as edge}
            <li>
              {edge.sourceNodeId} — {edge.targetNodeId}
              {#if edge.edgeId}
                <small>{edge.edgeIdGenerated ? "generated local record key" : "source edge ID"}: {edge.edgeId}</small>
                {#if edgeProvenance(edge.edgeId)}
                  <small>declared source: {edgeProvenance(edge.edgeId)}</small>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
      {:else}
        <small>Edge-record details are unavailable for this result.</small>
      {/if}
    </div>
  {/if}

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
            <span class="clique-label">{c.join(", ")}</span>
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

  .membership-diagnosis-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .membership-query-contract {
    margin-top: 8px;
    font-size: 0.82rem;
    line-height: 1.35;
  }

  .membership-query-contract summary {
    cursor: pointer;
  }

  .membership-query-contract p {
    margin: 5px 0 0;
    overflow-wrap: anywhere;
  }

  .membership-query-contract small {
    display: block;
    margin-top: 5px;
    overflow-wrap: anywhere;
  }

  .clique-threshold-note {
    margin: 8px 0;
    font-size: 0.9em;
    opacity: 0.85;
  }

  .clique-explanation p {
    margin: 5px 0;
  }

  .clique-explanation ul {
    max-height: 180px;
    overflow: auto;
    margin: 6px 0 0;
    padding-left: 20px;
  }

  .clique-explanation small {
    display: block;
    opacity: 0.75;
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

  .clique-label {
    min-width: 0;
    overflow-wrap: anywhere;
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
    flex: 0 0 auto;
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

  @media (max-width: 1280px) {
    .solver-panel {
      box-sizing: border-box;
      width: min(var(--solver-width), calc(100vw - 20px));
      right: 10px;
      top: calc(var(--toolbar-top) + var(--toolbar-height, 180px) + 10px);
      max-height: calc(100vh - var(--toolbar-height, 180px) - var(--toolbar-top) - 20px - var(--mobile-status-reserve, 48px));
    }
  }
</style>
