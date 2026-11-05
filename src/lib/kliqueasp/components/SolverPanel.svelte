<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { formatItalianNumber } from "../graph/formatItalianNumber.ts";
  import { deepMergeConfig } from "../config/deepMergeConfig";
  import { downloadCsvText, serializeCsv } from "../csvExport";
  import AnalysisErrorMessage from "./AnalysisErrorMessage.svelte";
  import AnalysisCompletionStatus from "./AnalysisCompletionStatus.svelte";
  import SolverDiagnosticsDetails from "./SolverDiagnosticsDetails.svelte";
  import ResultListPager from "./ResultListPager.svelte";
  import ProgressiveList from "./ProgressiveList.svelte";
  import SearchableNodeSelect from "./SearchableNodeSelect.svelte";
  import AnalysisProjectionScopeSummary from "./AnalysisProjectionScopeSummary.svelte";
  import { DEFAULT_ANALYSIS_PROJECTION_SCOPE, type AnalysisProjectionScope } from "../graph/analysisProjectionScope.ts";
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";
  import type { CliqueSupportingEdge } from "../graph/graphModel";
  import type { CliqueMaximumMembershipDiagnosis } from "../graph/cliqueMembershipDiagnosis";
  import { getGraphTaskContract } from "../graph/graphTaskContracts";
  import { getCliqueTaskQuestion } from "../graph/cliqueTaskCopy.ts";
  import { buildCliqueMaximumMembershipDiagnosisCsv, buildCliqueSupportingExportRows } from "../graph/cliqueCsvExport";
  import { getOwnRecordValue } from "../graph/recordUtils";
  import { displayNodeResultLabel } from "../graph/nodeResultLabel.ts";

  const cliqueMembershipQueryContract = getGraphTaskContract("clique")?.supportingQueries?.find(
    (query) => query.id === "cliqueMaximumMembershipDiagnosis"
  );

  // Sezione "solver" del config già risolta dal parent (GraphApp).
  export let config: any = {};

  export let open: boolean = false;
  export let compactModal = false;
  export let running: boolean = false;

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
  export let completionLabel = "";

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
  export let analysisScope: AnalysisProjectionScope = DEFAULT_ANALYSIS_PROJECTION_SCOPE;

  export let selectedNodeId: string | null = null;
  export let nodeLabelById: Record<string, string> = {};
  export let sourceIdByNodeId: Record<string, string> = {};
  export let cliqueMembershipDiagnosis: CliqueMaximumMembershipDiagnosis | null = null;
  export let cliqueMembershipDiagnosisTargetNodeId: string | null = null;
  export let cliqueMembershipDiagnosisRunning: boolean = false;
  export let cliqueMembershipDiagnosisError: string = "";

  export let minSize: number = 3;
  export let topPerSize: number = 5;

  export let selectedGroup: string = "";
  export let availableGroups: string[] = [];

  $: groupSelectionChanged = (selectedGroup || "") !== (stats?.selectedGroup || "");
  $: cliqueAnalysisCompleted = Boolean(completionLabel) || stats?.timeMs !== undefined;
  $: hasCliqueSourceResults = (allCliques?.length ?? 0) > 0 || (maximumCliques?.length ?? 0) > 0;
  $: searchableGroupOptions = availableGroups.map((group) => ({ value: group, label: group }));

  function resetResultFilters() {
    minSize = 1;
    showOnlyMaximum = false;
    filterBySelectedNode = false;
  }

  function displayResultNode(nodeId: string): string {
    return displayNodeResultLabel(nodeId, nodeLabelById, sourceIdByNodeId);
  }

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
  let visibleCliqueLimits: Record<number, number> = {};
  let visibleGrouped: { size: number; cliques: string[][]; visibleCliques: string[][] }[] = [];
  let previousMaximumCliques = maximumCliques;
  let selectedCliqueSignature = maximumCliques[0] ? cliqueSignature(maximumCliques[0]) : "";
  const cliquePageSize = 100;
  let previousFilteredCliques = filteredCliques;
  let previousShowAll = showAll;
  let previousTopPerSize = topPerSize;
  let selectedCliqueEvidenceLimit = 100;
  let selectedCliqueMembersOpen = false;
  let membershipEvidenceLimit = 100;
  let previousSelectedCliqueSignature = selectedCliqueSignature;
  let previousMembershipDiagnosis = cliqueMembershipDiagnosis;

  function cliqueSignature(clique: string[]): string {
    return [...clique].sort().join("\u0000");
  }

  $: selectedCliqueSupportingEdges = supportingEdgesByClique[ selectedCliqueSignature ] ?? [];
  $: visibleSelectedCliqueSupportingEdges = selectedCliqueSupportingEdges.slice(0, selectedCliqueEvidenceLimit);
  $: selectedCliqueNodes = filteredCliques.find((clique) => cliqueSignature(clique) === selectedCliqueSignature)
    ?? maximumCliques.find((clique) => cliqueSignature(clique) === selectedCliqueSignature)
    ?? [];
  $: visibleMembershipSupportingEdges = (cliqueMembershipDiagnosis?.supportingEdges ?? []).slice(0, membershipEvidenceLimit);

  $: if (maximumCliques !== previousMaximumCliques) {
    previousMaximumCliques = maximumCliques;
    selectedCliqueSignature = maximumCliques[0] ? cliqueSignature(maximumCliques[0]) : "";
  }

  $: if (selectedCliqueSignature !== previousSelectedCliqueSignature) {
    previousSelectedCliqueSignature = selectedCliqueSignature;
    selectedCliqueEvidenceLimit = 100;
    selectedCliqueMembersOpen = false;
  }
  $: if (cliqueMembershipDiagnosis !== previousMembershipDiagnosis) {
    previousMembershipDiagnosis = cliqueMembershipDiagnosis;
    membershipEvidenceLimit = 100;
  }

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

    const map = new Map<number, string[][]>();

    for (const c of cliques) {
      if (!Array.isArray(c)) continue;
      if (!map.has(c.length)) map.set(c.length, []);
      map.get(c.length)!.push(c);
    }

    const sizes = Array.from(map.keys()).sort((a, b) => b - a);

    return sizes.map(size => ({
      size,
      cliques: map.get(size)!
    }));
  }

  // ✅ FIX REATTIVITÀ
  $: {
    filteredCliques;
    showAll;
    topPerSize;

    grouped = groupCliques(filteredCliques ?? []);
  }

  $: if (
    filteredCliques !== previousFilteredCliques ||
    showAll !== previousShowAll ||
    topPerSize !== previousTopPerSize
  ) {
    previousFilteredCliques = filteredCliques;
    previousShowAll = showAll;
    previousTopPerSize = topPerSize;
    visibleCliqueLimits = {};
  }

  $: visibleGrouped = grouped.map((group) => {
    const requestedTop = Number(topPerSize);
    const topLimit = Number.isFinite(requestedTop) ? Math.max(0, Math.floor(requestedTop)) : 5;
    const visibleLimit = showAll
      ? visibleCliqueLimits[group.size] ?? cliquePageSize
      : topLimit;
    return { ...group, visibleCliques: group.cliques.slice(0, visibleLimit) };
  });

  function showMoreCliques(size: number) {
    visibleCliqueLimits = {
      ...visibleCliqueLimits,
      [size]: (visibleCliqueLimits[size] ?? cliquePageSize) + cliquePageSize
    };
  }

  $: selectedCliqueCount =
    selectedNodeId
      ? (allCliques ?? []).filter(c => Array.isArray(c) && c.includes(selectedNodeId)).length
      : 0;

  const CLIQUE_MODE_LABELS: Record<string, string> = {
    maximal: "clique massimali",
    all: "tutte le clique (incluse le sottoclique)",
    maximum: "solo clique di taglia massima"
  };

  $: histogramRows = Array.from(stats?.histogram?.entries?.() ?? [])
    .sort((a, b) => b[0] - a[0]);
  $: taskQuestion = getCliqueTaskQuestion(stats?.cliqueMode);

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
<section
  class="solver-panel"
  role={compactModal ? "dialog" : undefined}
  aria-modal={compactModal ? "true" : undefined}
  aria-labelledby="solver-panel-title"
  tabindex="-1"
>

  <div class="solver-header">
    <div>
      <h3 id="solver-panel-title">Risultati clique</h3>
      <p class="task-question">{taskQuestion}</p>
    </div>
    <button class="close-btn" aria-label="Chiudi risultati clique" title="Chiudi risultati clique" on:click={closePanel}>×</button>
  </div>

  <AnalysisProjectionScopeSummary scope={analysisScope} />

  {#if F.stats !== false}
  <div class="solver-meta">
    {#if stats?.cliqueMode}
    <div><strong>Modalità:</strong> {CLIQUE_MODE_LABELS[stats.cliqueMode] ?? stats.cliqueMode}</div>
    {/if}
    <div><strong>Gruppo analizzato:</strong> {stats?.selectedGroup || "tutti i nodi"}</div>
    <div><strong>Clique di almeno 3 nodi trovate:</strong> {stats?.totalCliques ?? 0}</div>
    <div><strong>Taglia massima:</strong> {stats?.maxSize ?? 0}</div>

    {#if stats?.timeMs}
      <div><strong>Tempo di calcolo:</strong> {formatItalianNumber(stats.timeMs, 2)} ms</div>
    {/if}

    {#if stats?.nodesCount}
      <div><strong>Nodi analizzati:</strong> {stats.nodesCount}</div>
    {/if}

    {#if stats?.linksCount}
      <div><strong>Archi analizzati:</strong> {stats.linksCount}</div>
    {/if}

    <SolverDiagnosticsDetails
      {workerWasmMemoryStats}
      {clingoTiming}
      {showClingoTiming}
      {clingoStats}
      {showClingoStats}
    />
  </div>
  {/if}

  <AnalysisCompletionStatus label={completionLabel} />

  {#if error}
    <div class="solver-error">
      <strong>Errore di calcolo</strong>
      <AnalysisErrorMessage message={error} />
    </div>
  {/if}

  {#if F.histogram !== false && histogramRows.length > 0}
  <div class="histogram" aria-label="Distribuzione delle clique per taglia">
    <ProgressiveList items={histogramRows} label="taglie della distribuzione" let:item>
      {@const [size, count] = item}
      <div class="histogram-row">
        <span class="histogram-label">Taglia {size}</span>
        <span class="histogram-track">
          <span class="histogram-bar" style="width: {(count / histogramMax) * 100}%"></span>
        </span>
        <span class="histogram-count">{count}</span>
      </div>
    </ProgressiveList>
  </div>
  {/if}

  {#if F.selectedAnalysis !== false && selectedNodeId}
  <div class="selected-analysis">
    <div><strong>Nodo selezionato:</strong> {selectedNodeId}</div>
    <div><strong>Clique mostrate che lo includono:</strong> {selectedCliqueCount}</div>
    <div>
      <strong>In una clique massima:</strong>
      {selectedInMaximum ? "Sì" : "No"}
    </div>
    <div><strong>Gruppo analizzato:</strong> {stats?.selectedGroup || "tutti i nodi"}</div>
    {#if !selectedInMaximum && stats?.maxSize > 0}
      <button
        type="button"
        aria-describedby={running || cliqueMembershipDiagnosisRunning ? "analysis-in-progress-status" : undefined}
        disabled={running || cliqueMembershipDiagnosisRunning}
        on:click={() => dispatch("diagnoseMaximumMembership", selectedNodeId)}
      >
      {cliqueMembershipDiagnosisRunning ? "Verifica in corso…" : "Spiega l’esclusione dall’ottimo"}
      </button>
      {#if cliqueMembershipQueryContract}
        <details class="membership-query-contract">
          <summary>Dettagli tecnici della spiegazione</summary>
          <p>{cliqueMembershipQueryContract.querySemantics}</p>
          <p><strong>Enumerazione:</strong> {cliqueMembershipQueryContract.supportedEnumeration.join(" / ")}.</p>
          <p><strong>Dati di ingresso:</strong> {cliqueMembershipQueryContract.inputPredicates.join(", ")}.</p>
          <p><strong>Testimone:</strong> {cliqueMembershipQueryContract.witnessPredicates.join(", ")}.</p>
          <p><strong>Campi:</strong> {cliqueMembershipQueryContract.resultFields.join(", ")}.</p>
          <small>Encoding `{cliqueMembershipQueryContract.aspEncoding}` v{cliqueMembershipQueryContract.encodingVersion}; parser `{cliqueMembershipQueryContract.parser}`.</small>
        </details>
      {/if}
    {/if}
    {#if cliqueMembershipDiagnosisTargetNodeId === selectedNodeId && cliqueMembershipDiagnosisError}
      <AnalysisErrorMessage message={"Diagnosi non disponibile: " + cliqueMembershipDiagnosisError} />
    {/if}
    {#if cliqueMembershipDiagnosisTargetNodeId === selectedNodeId && cliqueMembershipDiagnosis}
      {#if cliqueMembershipDiagnosis.outcome === "excluded-from-maximum"}
        <strong>Esclusione dalla clique massima verificata</strong>
        <p>
          La migliore clique che contiene il nodo ha taglia {cliqueMembershipDiagnosis.maximumContainingSize};
          l'ottimo globale è {cliqueMembershipDiagnosis.globalMaximumSize} (gap {cliqueMembershipDiagnosis.sizeGap}).
          La ricerca vincolata al nodo è stata confrontata con il massimo globale e il testimone è stato verificato sul grafo corrente.
        </p>
      {:else}
        <strong>Controesempio: il nodo appartiene a una clique massima</strong>
        <p>Una verifica ha trovato una clique con il nodo di taglia {cliqueMembershipDiagnosis.maximumContainingSize}; il precedente elenco non è coerente con questo testimone.</p>
      {/if}
      <p>È una spiegazione strutturale della proiezione analizzata, non una causa storica o sociale.</p>
      <div class="membership-witness">
        <strong>Testimone ({cliqueMembershipDiagnosis.witnessNodeIds.length} nodi)</strong>
        <ProgressiveList
          items={cliqueMembershipDiagnosis.witnessNodeIds}
          resetKey={cliqueMembershipDiagnosis}
          label="nodi del testimone"
          let:item
          let:index
        >
          <span>{index ? " · " : ""}{displayResultNode(item)}</span>
        </ProgressiveList>
      </div>
      {#if cliqueMembershipDiagnosis.supportingEdges.length > 0}
        <ul>
          {#each visibleMembershipSupportingEdges as edge}
            <li>
              {displayResultNode(edge.sourceNodeId)} — {displayResultNode(edge.targetNodeId)}
              {#if edge.edgeId}<small>{edge.edgeIdGenerated ? "chiave record locale" : "ID arco sorgente"}: {edge.edgeId}</small>{/if}
            </li>
          {/each}
        </ul>
        <ResultListPager
          total={cliqueMembershipDiagnosis.supportingEdges.length}
          visible={visibleMembershipSupportingEdges.length}
          pageSize={100}
          label="archi testimoni"
          showMore={() => membershipEvidenceLimit += 100}
        />
      {/if}
      <div class="membership-diagnosis-actions">
        <button type="button" on:click={() => dispatch("highlightMembershipWitness", cliqueMembershipDiagnosis)}>
          Evidenzia testimone 3D
        </button>
        <button type="button" on:click={downloadMembershipDiagnosisCSV}>Esporta diagnosi CSV</button>
      </div>
    {/if}
  </div>
  {/if}

  <div class="solver-controls">

    {#if F.groupFilter !== false}
    <label class="solver-filter-field">
      Gruppo da analizzare
      <SearchableNodeSelect
        id="clique-analysis-group"
        bind:value={selectedGroup}
        options={searchableGroupOptions}
        ariaLabel="Cerca il gruppo da analizzare"
        placeholder="Tutti i nodi"
        disabledDescriptionId={running ? "analysis-in-progress-status" : undefined}
        disabled={running}
      />
    </label>
    {#if groupSelectionChanged}
      <button
        type="button"
        class="solver-rerun-action"
        aria-describedby={running ? "analysis-in-progress-status" : undefined}
        disabled={running}
        on:click={() => dispatch("rerun")}
      >
        {running
          ? "Calcolo in corso…"
          : selectedGroup
            ? `Ricalcola clique nel gruppo: ${selectedGroup}`
            : "Ricalcola clique su tutti i nodi"}
      </button>
    {/if}
    {/if}

    {#if F.minSize !== false}
    <label class="solver-filter-field">
      Taglia minima
      <input type="number" bind:value={minSize} min="3" />
    </label>
    {/if}

    {#if F.onlyMaximum !== false}
    <label class="solver-toggle">
      <input type="checkbox" bind:checked={showOnlyMaximum} />
      Mostra solo le clique massime
    </label>
    {/if}

    {#if F.filterBySelectedNode !== false && selectedNodeId}
    <label class="solver-toggle">
      <input type="checkbox" bind:checked={filterBySelectedNode} />
      Solo clique che includono "{selectedNodeId}"
    </label>
    {/if}

    {#if F.topPerSize !== false || F.showAll !== false}
    <details class="solver-advanced-options">
      <summary>Altre opzioni</summary>
      {#if F.topPerSize !== false}
        <label class="solver-filter-field">
          Numero iniziale per taglia
          <input type="number" bind:value={topPerSize} min="1" max="50" aria-describedby="clique-list-limit-help" />
        </label>
        <small id="clique-list-limit-help">Numero di clique inizialmente visibili per taglia; il calcolo non cambia.</small>
      {/if}
      {#if F.showAll !== false}
        <label class="solver-toggle">
          <input type="checkbox" bind:checked={showAll} aria-describedby="clique-list-all-help" />
          Consenti di sfogliare l'intero elenco
        </label>
        <small id="clique-list-all-help">Carica progressivamente le clique dell'elenco corrente senza rilanciare l'analisi.</small>
      {/if}
    </details>
    {/if}

    {#if F.downloadCSV !== false}
    <button type="button" class="solver-export-action" on:click={downloadCSV}>
      Esporta risultati CSV
    </button>
    {#if Object.keys(supportingEdgesByClique).length > 0}
    <button type="button" class="solver-export-action solver-export-secondary" on:click={downloadExplanationCSV}>
      Esporta gli archi testimoni CSV
    </button>
    {/if}
    {/if}

  </div>

  {#if F.selectedAnalysis !== false && selectedCliqueSignature}
    <details class="selected-analysis clique-explanation">
      <summary>
        Evidenza della clique
        · {selectedCliqueNodes.length} nodi
        {#if selectedCliqueSupportingEdges.length > 0}
          · {formatItalianNumber(selectedCliqueSupportingEdges.length)} record di supporto
        {/if}
      </summary>
      <p>Ogni coppia di nodi della clique è sostenuta da almeno un record di arco.</p>
      <details
        class="clique-member-evidence"
        open={selectedCliqueMembersOpen}
        on:toggle={(event) => selectedCliqueMembersOpen = event.currentTarget.open}
      >
        <summary>Elenco dei nodi</summary>
        {#if selectedCliqueMembersOpen}
          <div class="clique-member-list">
            <ProgressiveList items={selectedCliqueNodes} resetKey={selectedCliqueSignature} label="nodi della clique" let:item>
              <span>{displayResultNode(item)}</span>
            </ProgressiveList>
          </div>
        {/if}
      </details>
      {#if selectedCliqueSupportingEdges.length > 0}
        <ul>
          {#each visibleSelectedCliqueSupportingEdges as edge}
            <li>
              {displayResultNode(edge.sourceNodeId)} — {displayResultNode(edge.targetNodeId)}
              {#if edge.edgeId}
                <small>{edge.edgeIdGenerated ? "chiave locale del record" : "ID arco sorgente"}: {edge.edgeId}</small>
                {#if edgeProvenance(edge.edgeId)}
                  <small>fonte dichiarata: {edgeProvenance(edge.edgeId)}</small>
                {/if}
              {/if}
            </li>
          {/each}
        </ul>
        <ResultListPager
          total={selectedCliqueSupportingEdges.length}
          visible={visibleSelectedCliqueSupportingEdges.length}
          pageSize={100}
          label="archi testimoni"
          showMore={() => selectedCliqueEvidenceLimit += 100}
        />
      {:else}
        <small>I dettagli dei record di arco non sono disponibili per questo risultato.</small>
      {/if}
    </details>
  {/if}

  <div class="solver-cliques">
    <h4>Risultati</h4>

    {#if grouped.length === 0 && cliqueAnalysisCompleted}
      <div class="empty">
        <div role="status">
          {#if stats?.maxSize > 0 && stats.maxSize < 3}
            <strong>La clique più grande ha {stats.maxSize} nodi; nessuna raggiunge la soglia minima di 3.</strong>
          {:else}
            <strong>Nessuna clique corrisponde alla visualizzazione corrente.</strong>
          {/if}
          {#if groupSelectionChanged}
            <p>Il gruppo selezionato è diverso da quello analizzato. Ricalcola per aggiornare i risultati.</p>
          {:else if hasCliqueSourceResults}
            <p>La taglia minima o i filtri dei risultati escludono tutte le clique trovate.</p>
          {:else if stats?.maxSize > 0 && stats.maxSize < 3}
            <p>La lista mostra gruppi di almeno 3 nodi.</p>
          {:else}
            <p>La ricerca non ha restituito clique per il perimetro analizzato. Rivedi i filtri del grafo o il gruppo e ripeti l'analisi.</p>
          {/if}
        </div>
        {#if !groupSelectionChanged && !hasCliqueSourceResults && stats?.maxSize > 0 && stats.maxSize < 3}
          <button
            type="button"
            class="clique-threshold-next-step"
            on:click={() => dispatch("openStructuralAnalysis")}
          >Apri k-plex e k-core</button>
        {/if}
        {#if !groupSelectionChanged && hasCliqueSourceResults}
          <button type="button" on:click={resetResultFilters}>Rimuovi i filtri dei risultati</button>
        {/if}
      </div>
    {/if}

    {#each visibleGrouped as group}
      <div class="size-group">
        <div class="size-title">
          Taglia {group.size}
        </div>

        {#each group.visibleCliques as c}
          <button type="button" class="clique-item" aria-pressed={cliqueSignature(c) === selectedCliqueSignature} on:click={() => highlightClique(c)}>
            <span class="clique-label">{c.length} nodi · {c.slice(0, 5).map(displayResultNode).join(", ")}{c.length > 5 ? ` · +${c.length - 5} altri` : ""}</span>
            {#if c.length === stats?.maxSize}
              <span class="max-badge">MASSIMA</span>
            {/if}
          </button>
        {/each}
        {#if showAll}
          <ResultListPager
            total={group.cliques.length}
            visible={group.visibleCliques.length}
            pageSize={cliquePageSize}
            label={`clique di taglia ${group.size}`}
            showMore={() => showMoreCliques(group.size)}
          />
        {/if}
      </div>
    {/each}
  </div>

</section>
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
    align-items: flex-start;
    gap: 12px;
  }

  .task-question {
    margin: 3px 0 0;
    color: #526174;
    font-size: 0.92em;
    line-height: 1.35;
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

  .clique-threshold-next-step {
    min-height: 34px;
    margin: 0;
    border: 1px solid #1e645d;
    border-radius: 8px;
    padding: 7px 10px;
    background: #1e645d;
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .clique-threshold-next-step:hover {
    border-color: #174d47;
    background: #174d47;
  }

  .clique-threshold-next-step:focus-visible {
    outline: 3px solid #72c7ba;
    outline-offset: 2px;
  }

  .clique-explanation p {
    margin: 5px 0;
  }

  .clique-explanation summary {
    cursor: pointer;
    font-weight: 600;
  }

  .clique-explanation ul {
    max-height: 180px;
    overflow: auto;
    margin: 6px 0 0;
    padding-left: 20px;
  }

  .clique-member-evidence {
    margin: 7px 0;
  }

  .clique-member-list {
    display: grid;
    gap: 3px;
    max-height: 180px;
    margin-top: 5px;
    overflow: auto;
    overflow-wrap: anywhere;
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

  .solver-advanced-options {
    display: grid;
    gap: 6px;
    padding: 7px 9px;
    border: 1px solid #dbe3ee;
    border-radius: 8px;
    background: #f8fafc;
  }

  .solver-advanced-options summary {
    color: #334155;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .solver-advanced-options small {
    color: #526174;
    line-height: 1.35;
  }

  .solver-controls input[type="number"] {
    width: min(var(--solver-input-width), 100%);
    margin-left: auto;
  }

  .solver-filter-field {
    display: flex;
    min-height: 34px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: #334155;
    font-weight: 550;
  }

  .solver-controls input[type="number"] {
    box-sizing: border-box;
    min-height: 32px;
    padding: 5px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #fff;
    color: #172033;
    font: inherit;
    font-weight: 450;
  }

  .solver-filter-field :global(.searchable-node-select) {
    min-width: 132px;
    max-width: 60%;
    margin-left: auto;
  }

  .solver-controls input[type="number"] {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .solver-toggle {
    display: flex;
    min-height: 28px;
    align-items: center;
    gap: 9px;
    color: #334155;
    line-height: 1.35;
  }

  .solver-toggle input[type="checkbox"] {
    width: 16px;
    height: 16px;
    margin: 0;
    flex: 0 0 auto;
    accent-color: #1e645d;
  }

  .solver-rerun-action,
  .solver-export-action,
  .membership-diagnosis-actions button,
  .selected-analysis > button {
    min-height: 34px;
    border: 1px solid #1e645d;
    border-radius: 8px;
    padding: 7px 10px;
    background: #1e645d;
    color: #fff;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .solver-rerun-action:hover:not(:disabled),
  .solver-export-action:hover,
  .membership-diagnosis-actions button:hover,
  .selected-analysis > button:hover {
    border-color: #174d47;
    background: #174d47;
  }

  .solver-rerun-action:disabled,
  .solver-export-action:disabled,
  .membership-diagnosis-actions button:disabled,
  .selected-analysis > button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .solver-controls .solver-export-secondary,
  .membership-diagnosis-actions button + button {
    border-color: #cbd5e1;
    background: #fff;
    color: #334155;
  }

  .solver-controls .solver-export-secondary:hover,
  .membership-diagnosis-actions button + button:hover {
    border-color: #94a3b8;
    background: #f1f5f9;
  }

  .clique-item[aria-pressed="true"] {
    outline: 2px solid #1e645d;
    outline-offset: 1px;
    background: #bfe7df;
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
    display: grid;
    justify-items: start;
    gap: 8px;
    padding: 10px;
    border: 1px solid #dbe5ec;
    border-radius: 8px;
    background: #f8fafc;
  }

  .empty > div {
    display: grid;
    gap: 4px;
    color: #475569;
  }

  .empty strong {
    color: #334155;
  }

  .empty p {
    margin: 0;
  }

  .empty button {
    justify-self: start;
    min-height: 32px;
    padding: 6px 9px;
    border: 1px solid #b7c8d2;
    border-radius: 7px;
    background: #fff;
    color: #164e63;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .empty button:focus-visible {
    outline: 3px solid #0284c7;
    outline-offset: 2px;
  }

  .solver-error {
    margin-top: 10px;
    display: grid;
    gap: 6px;
  }

  .solver-error > strong {
    color: #803b2e;
    font-size: 12px;
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
