<script lang="ts">
  import type { GraphViewFilterSnapshot } from "../graph/graphViewFilters.ts";
  import { createEventDispatcher } from "svelte";
  import { formatItalianNumber } from "../graph/formatItalianNumber.ts";
  import { displayNodeResultLabel } from "../graph/nodeResultLabel.ts";
  import { downloadCsvText } from "../csvExport";
  import AnalysisErrorMessage from "./AnalysisErrorMessage.svelte";
  import AnalysisCompletionStatus from "./AnalysisCompletionStatus.svelte";
  import ResultListPager from "./ResultListPager.svelte";
  import GraphFilterSummary from "./GraphFilterSummary.svelte";
  import {
    buildProvenanceScenarioCliqueCsv,
    type ProvenanceScenarioCliqueComparison
  } from "../graph/provenanceScenarioAnalysis";

  export let open = false;
  export let compactModal = false;
  export let running = false;
  export let progress = "";
  export let error = "";
  export let completionLabel = "";
  export let comparison: ProvenanceScenarioCliqueComparison | null = null;
  export let nodeLabels: Record<string, string> = {};
  export let sourceIdByNodeId: Record<string, string> = {};
  export let highlightedNodeIds: string[] = [];
  export let selectedGroup = "";
  export let confidenceThreshold: number | null = null;
  export let timelineWindow = "";
  export let viewFilters: GraphViewFilterSnapshot = { types: [], groups: [] };

  const dispatch = createEventDispatcher();
  const scenarioPageSize = 20;
  const membershipPageSize = 100;
  let visibleScenarioLimit = scenarioPageSize;
  let visibleMembershipLimit = membershipPageSize;
  let selectedMembershipNodeId = "";
  let previousComparison = comparison;
  $: if (comparison !== previousComparison) {
    previousComparison = comparison;
    visibleScenarioLimit = scenarioPageSize;
    visibleMembershipLimit = membershipPageSize;
    selectedMembershipNodeId = "";
  }
  $: visibleScenarios = comparison?.scenarios.slice(0, visibleScenarioLimit) ?? [];
  $: visibleMemberships = comparison?.memberships.slice(0, visibleMembershipLimit) ?? [];
  $: candidateDomainDeclared = comparison?.scenarios.some((scenario) => scenario.candidateNodeCount !== undefined) ?? false;

  function highlightNode(nodeId: string) {
    selectedMembershipNodeId = nodeId;
    dispatch("highlight", [nodeId]);
  }

  function isMembershipRowSelected(nodeId: string): boolean {
    return selectedMembershipNodeId === nodeId &&
      highlightedNodeIds.length === 1 && highlightedNodeIds[0] === nodeId;
  }

  function exportComparison() {
    if (!comparison) return;
    downloadCsvText("clique_scenario_stability.csv", buildProvenanceScenarioCliqueCsv(
      comparison,
      nodeLabels,
      selectedGroup,
      confidenceThreshold,
      timelineWindow,
      viewFilters
    ));
  }

  $: notBraveCount = comparison?.memberships.filter((membership) => membership.optimalAnswerSetCount === 0).length ?? 0;
  $: braveOnlyCount = comparison?.memberships.filter((membership) =>
    membership.optimalAnswerSetCount > 0 && !membership.stableAcrossEveryOptimalAnswerSet
  ).length ?? 0;
</script>

{#if open}
  <section
    class="scenario-comparison-panel"
    role={compactModal ? "dialog" : undefined}
    aria-modal={compactModal ? "true" : undefined}
    aria-labelledby="scenario-comparison-title"
    tabindex="-1"
  >
    <header>
      <div>
        {#if comparison?.worldAssumption === "finite-exhaustive-worlds"}
          <h3 id="scenario-comparison-title">Presenza dei nodi nelle clique massime</h3>
          <p>Confronta la presenza dei nodi nelle clique massime tra gli scenari configurati.</p>
        {:else}
          <h3 id="scenario-comparison-title">Stabilità delle clique massime tra scenari</h3>
          <p>Confronta le clique massime calcolate separatamente per ogni scenario configurato.</p>
        {/if}
      </div>
      <button type="button" class="close" aria-label="Chiudi confronto scenari" title="Chiudi confronto scenari" on:click={() => dispatch("close")}>×</button>
    </header>

    <AnalysisCompletionStatus label={completionLabel} />

    {#if running}
      <div class="status" role="status">{progress || "Calcolo delle clique massime per scenario…"}</div>
    {/if}

    {#if error}
      <AnalysisErrorMessage message={error} />
    {/if}

    {#if comparison && !error}
      <div class="summary" role="status" aria-label="Riepilogo delle presenze nelle clique massime">
        {#if comparison.worldAssumption === "finite-exhaustive-worlds"}
          <strong>{comparison.stableNodeIds.length}</strong> presenti in tutte le clique massime di ogni scenario ·
          <strong>{braveOnlyCount}</strong> presenti in almeno una clique massima ma non in tutte ·
          <strong>{notBraveCount}</strong> candidati mai selezionati ·
        {:else}
          <strong>{comparison.stableNodeIds.length}</strong> presenti in tutte le clique massime di ogni scenario ·
          <strong>{comparison.nonUniversalNodeIds.length}</strong> non presenti in tutte le clique massime ·
        {/if}
        {comparison.scenarioCount} scenari · {comparison.totalOptimalAnswerSetCount} clique massime calcolate
      </div>

      <div class="context">
        {#if comparison.worldAssumption === "finite-exhaustive-worlds"}
          <span>Il confronto assume che gli scenari configurati coprano tutti i casi da considerare.</span>
        {/if}
        <span>L'insieme dei nodi è ricalcolato per scenario con la finestra temporale e i filtri correnti.</span>
        <span>Gruppo clique: {selectedGroup || "tutti"}</span>
        <span>Soglia confidenza: {confidenceThreshold ?? "non attiva"}</span>
        {#if timelineWindow}<span>Finestra: {timelineWindow}</span>{/if}
        <GraphFilterSummary types={viewFilters.types} groups={viewFilters.groups} degreeFilters={viewFilters.degreeFilters} />
      </div>

      <section class="scenario-list" aria-label="Risultati per scenario">
        <h4>Clique massime per scenario</h4>
        {#each visibleScenarios as scenario (scenario.scenarioId)}
          <article class="scenario-row">
            <strong>{scenario.scenarioLabel}</strong>
            <span>{scenario.nodesCount} nodi proiettati{scenario.candidateNodeCount === undefined
              ? ""
              : ` · ${scenario.candidateNodeCount} candidati clique`} · {scenario.linksCount} archi</span>
            <span>Taglia massima {scenario.maximumCliqueSize} · {scenario.maximumCliqueCount} soluzioni a pari merito</span>
            <small>{formatItalianNumber(scenario.timeMs, 1)} ms</small>
          </article>
        {/each}
        <ResultListPager
          total={comparison.scenarios.length}
          visible={visibleScenarios.length}
          pageSize={scenarioPageSize}
          label="scenari"
          showMore={() => visibleScenarioLimit += scenarioPageSize}
        />
      </section>

      <div class="membership-heading">
        <h4>Nodi e presenza nelle clique massime</h4>
        <button type="button" on:click={exportComparison}>Esporta CSV</button>
      </div>
      {#if comparison.memberships.length === 0}
        <div class="empty-memberships">
          <p>Nessun nodo compare nelle clique massime trovate.</p>
          <small>Se l'esito è inatteso, rivedi gli scenari, i gruppi candidati e i filtri applicati.</small>
          <button type="button" on:click={() => dispatch("openData")}>Rivedi scenari e dati</button>
        </div>
      {:else}
        <ul class="membership-list">
          {#each visibleMemberships as membership (membership.nodeId)}
            <li>
              <button type="button" aria-pressed={isMembershipRowSelected(membership.nodeId)} class:stable={membership.stableAcrossEveryOptimalAnswerSet} on:click={() => highlightNode(membership.nodeId)}>
                <span class="node-name">{displayNodeResultLabel(membership.nodeId, nodeLabels, sourceIdByNodeId)}</span>
                {#if membership.candidateScenarioSupportCount !== undefined}
                  <span>Candidato in {membership.candidateScenarioSupportCount}/{comparison.scenarioCount} scenari</span>
                {/if}
                <span>Presente in {membership.scenarioSupportCount}/{comparison.scenarioCount} scenari</span>
                <span>Presente in {membership.optimalAnswerSetCount}/{membership.totalOptimalAnswerSetCount} clique massime calcolate</span>
                {#if comparison.worldAssumption === "finite-exhaustive-worlds"}
                  <strong>{membership.stableAcrossEveryOptimalAnswerSet
                    ? "Presente in tutte le clique massime di ogni scenario"
                    : membership.optimalAnswerSetCount === 0
                      ? "Candidato ma mai presente in una clique massima"
                      : "Presente in almeno una clique massima, ma non in tutte"}</strong>
                {:else}
                  <strong>{membership.stableAcrossEveryOptimalAnswerSet
                    ? "Presente in tutte le clique massime di ogni scenario"
                    : membership.optimalAnswerSetCount === 0 ? "Mai presente in una clique massima" : "Non presente in tutte le clique massime"}</strong>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
        <ResultListPager
          total={comparison.memberships.length}
          visible={visibleMemberships.length}
          pageSize={membershipPageSize}
          label="nodi"
          showMore={() => visibleMembershipLimit += membershipPageSize}
        />
      {/if}

      <details class="semantics">
        <summary>Come interpretare la presenza dei nodi</summary>
        {#if comparison.worldAssumption === "finite-exhaustive-worlds"}
          <p>“In almeno uno” indica che il nodo compare in una clique massima di almeno uno scenario; “in tutti” richiede che compaia in ogni clique massima di ogni scenario, inclusi i pareggi.
            {#if candidateDomainDeclared}I candidati mai selezionati restano visibili con supporto zero; i nodi fuori da tutti i domini candidati non fanno parte del confronto.{/if}
            La conclusione presuppone che gli scenari elencati siano esaustivi: non assegna probabilità né affidabilità alle fonti.</p>
        {:else}
          <p>“Presente in tutti” include ogni clique massima a pari merito in ciascuno scenario. Una presenza non universale può dipendere dal cambio degli archi fra scenari o da più ottimi nello stesso scenario.
            {#if candidateDomainDeclared}I nodi candidati mai selezionati restano visibili con supporto zero; quelli fuori da tutti i domini non fanno parte del confronto.{/if}</p>
        {/if}
        <p>L'insieme dei nodi usa la stessa finestra temporale e gli stessi filtri. Quando l'analisi lo richiede, viene ricalcolato usando gli archi di ciascuno scenario; altrimenti rimane comune.</p>
      </details>
    {/if}
  </section>
{/if}

<style>
  .scenario-comparison-panel {
    position: absolute;
    top: var(--solver-top);
    right: var(--solver-right);
    z-index: var(--solver-z);
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: var(--solver-width);
    max-height: var(--solver-max-height);
    overflow: auto;
    box-sizing: border-box;
    padding: var(--solver-padding);
    border-radius: var(--solver-radius);
    background: var(--solver-bg);
    box-shadow: var(--solver-shadow);
    color: #0f172a;
    font: 13px/1.45 Arial, Helvetica, sans-serif;
  }

  header,
  .membership-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  h3,
  h4,
  p {
    margin: 0;
  }

  header p,
  small,
  .context {
    color: #475569;
  }

  .close {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 22px;
    line-height: 1;
  }

  .status,
  .summary {
    padding: 8px 10px;
    border-radius: 6px;
    background: #f1f5f9;
  }

  .context {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    min-width: 0;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .context > *,
  .scenario-row > *,
  .membership-list button > * {
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  .scenario-list,
  .membership-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .scenario-list h4,
  .membership-heading h4 {
    margin-bottom: 2px;
  }

  .scenario-row,
  .membership-list button {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #fff;
    color: inherit;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .scenario-row {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .membership-list,
  .membership-list li {
    min-width: 0;
  }

  .membership-list button {
    cursor: pointer;
  }

  .membership-list button:hover {
    background: #f8fafc;
  }

  .membership-list button.stable {
    border-color: #86efac;
    background: #f0fdf4;
  }

  .membership-list button[aria-pressed="true"] {
    border-color: #0f766e;
    background: #ccfbf1;
    outline: 2px solid #0f766e;
    outline-offset: 1px;
  }

  .membership-list button strong {
    color: #334155;
  }

  .membership-list button.stable strong {
    color: #166534;
  }

  .empty-memberships {
    display: grid;
    justify-items: start;
    gap: 7px;
    padding: 10px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #f8fafc;
  }

  .empty-memberships p,
  .empty-memberships small {
    margin: 0;
    color: #475569;
    line-height: 1.45;
  }

  .empty-memberships button {
    min-height: 32px;
    padding: 6px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #fff;
    color: #164e63;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .empty-memberships button:focus-visible {
    outline: 3px solid #0284c7;
    outline-offset: 2px;
  }

  .node-name {
    font-weight: 650;
  }

  .membership-heading button {
    flex: none;
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 5px;
    background: #f8fafc;
    color: inherit;
    cursor: pointer;
  }

  .semantics {
    line-height: 1.4;
    color: #475569;
  }

  .semantics summary {
    color: #334155;
    cursor: pointer;
    font-weight: 600;
  }

  .semantics summary:focus-visible {
    border-radius: 2px;
    outline: 2px solid #0284c7;
    outline-offset: 2px;
  }

  .semantics p {
    margin: 7px 0 0;
  }

  @media (max-width: 1280px) {
    .scenario-comparison-panel {
      box-sizing: border-box;
      width: min(var(--solver-width), calc(100vw - 20px));
      right: 10px;
      top: calc(var(--toolbar-top) + var(--toolbar-height, 180px) + 10px);
      max-height: calc(100vh - var(--toolbar-height, 180px) - var(--toolbar-top) - 20px - var(--mobile-status-reserve, 48px));
    }
  }
</style>
