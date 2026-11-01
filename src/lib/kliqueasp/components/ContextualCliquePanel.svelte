<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { formatItalianNumber } from "../graph/formatItalianNumber.ts";
  import { downloadCsvText } from "../csvExport";
  import AnalysisErrorMessage from "./AnalysisErrorMessage.svelte";
  import ResultListPager from "./ResultListPager.svelte";
  import ProgressiveList from "./ProgressiveList.svelte";
  import SearchableNodeSelect from "./SearchableNodeSelect.svelte";
  import type { GraphContextualCliqueConfig } from "../graph/graphModel";
  import {
    buildContextualCliqueCsv,
    getContextualCliqueEvidenceCounts,
    type ContextualCliqueResult
  } from "../graph/contextualCliqueTask";

  export let config: GraphContextualCliqueConfig | undefined = undefined;
  export let running = false;
  export let available = false;
  export let requirementReasons: string[] = [];
  export let selectedGroup = "";
  export let enumerateAllOptima = false;
  export let results: ContextualCliqueResult[] = [];
  export let hasRun = false;
  export let error = "";
  export let timeMs: number | undefined;
  export let graphNodesCount = 0;
  export let graphEdgesCount = 0;
  export let availableGroups: string[] = [];
  export let nodeLabelById: Record<string, string> = {};
  export let visibleLimit = 30;

  const dispatch = createEventDispatcher();
  const pairWitnessPageSize = 25;
  let pairWitnessLimits: Record<string, number> = {};
  let expandedResultKey: string | null = null;
  let previousResults = results;
  let criteriaChangedAfterRun = false;
  $: maximumSize = results[0]?.nodeIds.length ?? 0;
  $: searchableGroupOptions = availableGroups.map((group) => ({ value: group, label: group }));
  $: visibleResults = results.slice(0, visibleLimit);
  $: if (results !== previousResults) {
    previousResults = results;
    pairWitnessLimits = {};
    expandedResultKey = null;
  }

  function pairWitnessKey(result: ContextualCliqueResult): string {
    return `${result.sourceNodeIds.join("\u0000")}\u0001${result.nodeIds.join("\u0000")}`;
  }

  function visiblePairWitnesses(result: ContextualCliqueResult) {
    return result.pairWitnesses.slice(0, pairWitnessLimits[pairWitnessKey(result)] ?? pairWitnessPageSize);
  }

  function showMorePairWitnesses(result: ContextualCliqueResult) {
    const key = pairWitnessKey(result);
    pairWitnessLimits = { ...pairWitnessLimits, [key]: (pairWitnessLimits[key] ?? pairWitnessPageSize) + pairWitnessPageSize };
  }

  function evidenceIsOpen(result: ContextualCliqueResult): boolean {
    return expandedResultKey === pairWitnessKey(result);
  }

  function setEvidenceOpen(result: ContextualCliqueResult, open: boolean) {
    if (open) expandedResultKey = pairWitnessKey(result);
    else if (evidenceIsOpen(result)) expandedResultKey = null;
  }

  function run() {
    visibleLimit = 30;
    criteriaChangedAfterRun = false;
    expandedResultKey = null;
    dispatch("run", { selectedGroup, enumerateAllOptima });
  }

  function criteriaChanged() {
    if (hasRun || results.length > 0) criteriaChangedAfterRun = true;
    dispatch("criteriaChange");
  }

  function clear() {
    visibleLimit = 30;
    criteriaChangedAfterRun = false;
    expandedResultKey = null;
    dispatch("clear");
  }

  function exportCsv() {
    if (!config || !hasRun) return;
    downloadCsvText("contextual_cliques.csv", buildContextualCliqueCsv(results, config, selectedGroup));
  }

  function displayNode(nodeId: string, sourceId: string): string {
    const label = nodeLabelById[nodeId] ?? nodeId;
    return `${label} (${sourceId})`;
  }

  function highlight(result: ContextualCliqueResult) {
    dispatch("highlight", result);
  }

  function evidenceSummary(result: ContextualCliqueResult): string {
    const { distinctPairCount, pairContextWitnessCount } = getContextualCliqueEvidenceCounts(result);
    const pairLabel = distinctPairCount === 1 ? "coppia verificata" : "coppie verificate";
    const witnessLabel = pairContextWitnessCount === 1 ? "testimone coppia-contesto" : "testimoni coppia-contesto";
    return `${distinctPairCount} ${pairLabel} · ${pairContextWitnessCount} ${witnessLabel}`;
  }
</script>

<section class="contextual-clique" aria-labelledby="contextual-clique-title">
  <div class="heading">
    <div>
      <h4 id="contextual-clique-title">Gruppo coeso contestuale</h4>
      {#if config}
        <small>
          Focus: <code>{JSON.stringify(config.focusNodeTypes)}</code> · contesti: <code>{JSON.stringify(config.contextNodeTypes)}</code> · relazioni: <code>{JSON.stringify(config.edgeTypes)}</code>.
          Cerca il massimo gruppo in cui ogni coppia di nodi focali condivide almeno un contesto nella proiezione corrente.
        </small>
      {:else}
        <small>Configura i tipi di nodi focali, i nodi di contesto e le relazioni che li collegano per rendere disponibile questa analisi.</small>
      {/if}
    </div>
  </div>

  <p class="semantics">
    La coesione è pairwise: coppie diverse possono essere sostenute da contesti diversi. Il risultato non richiede che tutto il gruppo condivida un unico contesto e non assegna da solo un significato sociale alle relazioni.
  </p>

  <div class="controls">
    <label>
      Gruppo dei nodi focali
      <SearchableNodeSelect
        id="contextual-clique-group"
        bind:value={selectedGroup}
        options={searchableGroupOptions}
        ariaLabel="Cerca un gruppo di nodi focali"
        placeholder="Tutti i nodi focali"
        disabled={running}
        on:change={criteriaChanged}
      />
    </label>
    <label class="all-optima">
      <input type="checkbox" bind:checked={enumerateAllOptima} disabled={running} on:change={criteriaChanged} />
      Mostra tutti i gruppi massimi
    </label>
    <button type="button" class="run" on:click={run} disabled={running || !available || !config}>
      {running ? "Ricerca in corso…" : "Trova gruppo contestuale massimo"}
    </button>
  </div>

  {#if criteriaChangedAfterRun}
    <p class="criteria-change" role="status">Criteri modificati: rilancia la ricerca per aggiornare il risultato.</p>
  {/if}

  <div class="readiness" role="status">
    <strong>{available ? "Prerequisiti disponibili" : "Prerequisiti non soddisfatti"}</strong>
    <span>{graphNodesCount} nodi · {graphEdgesCount} archi visibili · cardinalità minima {config?.minimumSize ?? 3}</span>
    {#if requirementReasons.length > 0}
      <ul>{#each requirementReasons as reason}<li>{reason}</li>{/each}</ul>
      <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Apri Dati e mapping</button>
    {/if}
  </div>

  {#if error}
    <AnalysisErrorMessage message={error} />
  {/if}

  {#if hasRun}
    <div class="summary" role="status">
      {#if results.length === 0}
        Nessun gruppo contestuale raggiunge la cardinalità minima configurata.
      {:else}
        {#if enumerateAllOptima}{results.length} gruppi massimi elencati · {/if}
        cardinalità ottima: <strong>{maximumSize}</strong> nodi focali
      {/if}
      {#if timeMs !== undefined}<span> · {formatItalianNumber(timeMs, 1)} ms</span>{/if}
    </div>
    <div class="results-heading">
      <strong>Gruppi e contesti testimoni</strong>
      <div>
        <button type="button" on:click={exportCsv}>Esporta CSV</button>
        <button type="button" on:click={clear}>Cancella</button>
      </div>
    </div>
    {#if results.length > 0}
      <ol class="results">
        {#each visibleResults as result, index (`${result.sourceNodeIds.join("\u0000")}-${index}`)}
          <li>
            <div class="group-heading">
              <strong>Gruppo {index + 1} · {result.sourceNodeIds.length} nodi focali</strong>
              <button type="button" on:click={() => highlight(result)}>Evidenzia in 3D e apri la vista 2D</button>
            </div>
            <span class="members">
              {result.sourceNodeIds.slice(0, 20).map((sourceId, memberIndex) => displayNode(result.nodeIds[memberIndex], sourceId)).join(" · ")}
              {#if result.sourceNodeIds.length > 20} · +{result.sourceNodeIds.length - 20} altri nodi{/if}
            </span>
            <details class="member-evidence">
              <summary>Elenco completo dei nodi focali · {result.sourceNodeIds.length}</summary>
              <ProgressiveList items={result.sourceNodeIds} resetKey={result} label="nodi focali" let:item let:index>
                <span>{displayNode(result.nodeIds[index], item)}</span>
              </ProgressiveList>
            </details>
            <details
              open={evidenceIsOpen(result)}
              on:toggle={(event) => setEvidenceOpen(result, event.currentTarget.open)}
            >
              <summary>{evidenceSummary(result)}</summary>
              {#if evidenceIsOpen(result)}
                <ul>
                  {#each visiblePairWitnesses(result) as pair, pairIndex (`${pair.focusSourceIds.join("\u0000")}-${pair.contextSourceId}-${pairIndex}`)}
                    <li>
                      <strong>{pair.focusSourceIds.join(" — ")}</strong> condividono
                      <strong>{displayNode(pair.contextNodeId, pair.contextSourceId)}</strong>
                      <div class="supporting-records">
                        <small>Record di supporto · {pair.supportingEdges.length}</small>
                        <ProgressiveList items={pair.supportingEdges} resetKey={pair} label="record d'arco" let:item>
                          <span>{item.edgeId}{item.edgeIdGenerated ? " (ID generato)" : ""}</span>
                        </ProgressiveList>
                      </div>
                    </li>
                  {/each}
                </ul>
                <ResultListPager
                  total={result.pairWitnesses.length}
                  visible={visiblePairWitnesses(result).length}
                  pageSize={pairWitnessPageSize}
                  label="testimoni coppia-contesto"
                  showMore={() => showMorePairWitnesses(result)}
                />
              {/if}
            </details>
          </li>
        {/each}
      </ol>
      <ResultListPager
        total={results.length}
        visible={visibleResults.length}
        pageSize={30}
        label="gruppi"
        showMore={() => visibleLimit += 30}
      />
    {/if}
  {/if}
</section>

<style>
  .contextual-clique { display: grid; gap: 8px; padding: 12px 0; border-top: 1px solid #cbd5e1; }
  h4 { margin: 0 0 3px; }
  .heading small, .semantics, .readiness { color: #475569; }
  .semantics { margin: 0; }
  .member-evidence { min-width: 0; margin-top: 4px; color: #475569; font-size: 0.82rem; }
  .member-evidence summary { width: fit-content; cursor: pointer; font-weight: 650; }
  .controls { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; }
  .criteria-change { margin: 0; color: #7c2d12; font-size: 0.9rem; }
  label { display: grid; gap: 3px; font-size: 0.9rem; }
  label :global(.searchable-node-select) { min-width: 150px; }
  .all-optima { display: flex; align-items: center; gap: 6px; }
  .readiness, .summary { display: grid; gap: 3px; padding: 7px; border-radius: 5px; background: #f8fafc; }
  .readiness ul { margin: 0; padding-left: 18px; }
  .run { min-height: 36px; padding: 7px 10px; border: 1px solid #1e645d; border-radius: 8px; background: #1e645d; color: #fff; font: inherit; font-weight: 650; cursor: pointer; }
  .run:hover:not(:disabled) { border-color: #174f49; background: #174f49; }
  .readiness-action { justify-self: start; min-height: 30px; padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #0f172a; font: inherit; font-weight: 650; }
  .readiness-action:focus-visible { outline: 3px solid #0284c7; outline-offset: 2px; }
  .results-heading, .group-heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; }
  .results-heading > div { display: flex; gap: 5px; }
  .results { display: grid; gap: 8px; margin: 0; padding-left: 25px; }
  .results > li { display: grid; gap: 5px; min-width: 0; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; overflow-wrap: anywhere; }
  .members { color: #334155; }
  .supporting-records { display: grid; gap: 3px; margin-top: 4px; color: #475569; }
  details summary { cursor: pointer; }
  details ul { display: grid; gap: 5px; margin: 5px 0 0; padding-left: 18px; }
  details small { display: block; color: #475569; }
  button { cursor: pointer; }
</style>
