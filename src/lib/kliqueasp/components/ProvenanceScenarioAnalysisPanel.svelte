<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { downloadCsvText } from "../csvExport";
  import {
    buildProvenanceScenarioCliqueCsv,
    type ProvenanceScenarioCliqueComparison
  } from "../graph/provenanceScenarioAnalysis";

  export let open = false;
  export let running = false;
  export let progress = "";
  export let error = "";
  export let comparison: ProvenanceScenarioCliqueComparison | null = null;
  export let nodeLabels: Record<string, string> = {};
  export let selectedGroup = "";
  export let confidenceThreshold: number | null = null;
  export let timelineWindow = "";
  export let viewFilters: { types: string[]; groups: string[] } = { types: [], groups: [] };

  const dispatch = createEventDispatcher();

  function highlightNode(nodeId: string) {
    dispatch("highlight", [nodeId]);
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
    aria-label={comparison?.worldAssumption === "finite-exhaustive-worlds"
      ? "Membership brave e cautious nei mondi di provenienza"
      : "Stabilità delle clique tra scenari di provenienza"}
  >
    <header>
      <div>
        {#if comparison?.worldAssumption === "finite-exhaustive-worlds"}
          <h3>Membership brave e cautious nei mondi</h3>
          <p>Clingo calcola tutti i massimi per ogni scenario; la configurazione dichiara esaustivo l'insieme finito dei mondi.</p>
        {:else}
          <h3>Stabilità della clique tra scenari</h3>
          <p>Clingo calcola tutte le clique massime separatamente per ciascuno scenario configurato.</p>
        {/if}
      </div>
      <button type="button" class="close" aria-label="Chiudi" on:click={() => dispatch("close")}>×</button>
    </header>

    {#if running}
      <div class="status" role="status">{progress || "Esecuzione delle proiezioni ASP…"}</div>
    {/if}

    {#if error}
      <div class="error" role="alert">{error}</div>
    {/if}

    {#if comparison && !error}
      <div class="summary" role="status">
        {#if comparison.worldAssumption === "finite-exhaustive-worlds"}
          <strong>{comparison.stableNodeIds.length}</strong> membership cautious ·
          <strong>{braveOnlyCount}</strong> brave-only ·
          <strong>{notBraveCount}</strong> not-brave ·
        {:else}
          <strong>{comparison.stableNodeIds.length}</strong> nodi stabili ·
          <strong>{comparison.nonUniversalNodeIds.length}</strong> membership non universali ·
        {/if}
        {comparison.scenarioCount} scenari · {comparison.totalOptimalAnswerSetCount} answer set ottimi complessivi
      </div>

      <div class="context">
        {#if comparison.worldAssumption === "finite-exhaustive-worlds"}
          <span>Assunzione esplicita: questi scenari sono l'intero insieme finito dei mondi plausibili per questa analisi.</span>
        {/if}
        <span>La coorte dei nodi è ricalcolata per scenario con la finestra temporale e i filtri correnti.</span>
        <span>Gruppo clique: {selectedGroup || "tutti"}</span>
        <span>Soglia confidenza: {confidenceThreshold ?? "non attiva"}</span>
        {#if timelineWindow}<span>Finestra: {timelineWindow}</span>{/if}
        <span>Tipi vista: {viewFilters.types.length ? viewFilters.types.join(", ") : "tutti"}</span>
        <span>Gruppi vista: {viewFilters.groups.length ? viewFilters.groups.join(", ") : "tutti"}</span>
      </div>

      <section class="scenario-list" aria-label="Risultati per scenario">
        <h4>Massimi per scenario</h4>
        {#each comparison.scenarios as scenario (scenario.scenarioId)}
          <article class="scenario-row">
            <strong>{scenario.scenarioLabel}</strong>
            <span>{scenario.nodesCount} nodi proiettati{scenario.candidateNodeCount === undefined
              ? ""
              : ` · ${scenario.candidateNodeCount} candidati clique`} · {scenario.linksCount} archi</span>
            <span>Taglia massima {scenario.maximumCliqueSize} · {scenario.maximumCliqueCount} ottimi</span>
            <small>{scenario.timeMs.toFixed(1)} ms</small>
          </article>
        {/each}
      </section>

      <div class="membership-heading">
        <h4>{comparison.worldAssumption === "finite-exhaustive-worlds" ? "Candidati e membership brave nei massimi" : "Candidati e membership nei massimi"}</h4>
        <button type="button" on:click={exportComparison}>Esporta CSV</button>
      </div>
      {#if comparison.memberships.length === 0}
        <p>{comparison.worldAssumption === "finite-exhaustive-worlds"
          ? "Nessun nodo ha membership brave in una clique massima dei mondi configurati."
          : "Nessun nodo compare nelle clique massime trovate."}</p>
      {:else}
        <ul class="membership-list">
          {#each comparison.memberships as membership (membership.nodeId)}
            <li>
              <button type="button" class:stable={membership.stableAcrossEveryOptimalAnswerSet} on:click={() => highlightNode(membership.nodeId)}>
                <span class="node-name">{nodeLabels[membership.nodeId] ?? membership.nodeId}</span>
                <span class="node-id">ID: {membership.nodeId}</span>
                {#if membership.candidateScenarioSupportCount !== undefined}
                  <span>Nel dominio candidato: {membership.candidateScenarioSupportCount}/{comparison.scenarioCount} scenari</span>
                {/if}
                <span>Scenari: {membership.scenarioSupportCount}/{comparison.scenarioCount}</span>
                <span>Ottimi: {membership.optimalAnswerSetCount}/{membership.totalOptimalAnswerSetCount}</span>
                {#if comparison.worldAssumption === "finite-exhaustive-worlds"}
                  <strong>{membership.stableAcrossEveryOptimalAnswerSet
                    ? "Cautious: presente in ogni ottimo di ogni mondo"
                    : membership.optimalAnswerSetCount === 0
                      ? "Not brave: candidato ma assente da ogni clique massima"
                      : "Brave: presente in almeno un ottimo; non cautious"}</strong>
                {:else}
                  <strong>{membership.stableAcrossEveryOptimalAnswerSet
                    ? "Presente in tutti gli ottimi"
                    : membership.optimalAnswerSetCount === 0 ? "Mai selezionato in una clique massima" : "Non presente in tutti gli ottimi"}</strong>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <small class="semantics">
        {#if comparison.worldAssumption === "finite-exhaustive-worlds"}
          “Brave” significa che esiste almeno un mondo configurato e una sua clique massima che contiene il nodo; “cautious” significa che il nodo compare in tutte le clique massime di tutti i mondi configurati, inclusi i pareggi. “Not brave” indica un nodo candidato in almeno uno scenario ma assente da ogni massimo. I nodi fuori da tutti i domini candidati non fanno parte della query. La conclusione è condizionata all'assunzione dell'analista che la lista dei mondi sia esaustiva. Non si assegnano probabilità né affidabilità alle fonti.
        {:else}
          “Stabile” significa che il nodo appartiene a ogni clique massima di ogni scenario configurato, inclusi tutti i pareggi. Una membership non universale può dipendere dal cambio di scenario oppure da un pareggio fra ottimi nello stesso scenario. Quando il dominio candidato è dichiarato, i candidati mai selezionati restano visibili con supporto zero; i nodi fuori da tutti i domini candidati non fanno parte del confronto. La copertura per scenario conta gli scenari in cui compare in almeno un massimo. Non è una probabilità né una valutazione di attendibilità delle fonti.
        {/if}
        In modalità graph-aware ogni scenario ricalcola la coorte con la stessa finestra temporale e gli stessi filtri, usando i propri archi; in modalità simple la coorte resta comune.
      </small>
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
    font: 13px/1.45 system-ui, sans-serif;
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
  .context,
  .node-id {
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
  .error,
  .summary {
    padding: 8px 10px;
    border-radius: 6px;
    background: #f1f5f9;
  }

  .error {
    background: #fef2f2;
    color: #991b1b;
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

  .membership-list button strong {
    color: #334155;
  }

  .membership-list button.stable strong {
    color: #166534;
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
