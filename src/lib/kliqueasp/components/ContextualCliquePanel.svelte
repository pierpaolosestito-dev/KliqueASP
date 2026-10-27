<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { downloadCsvText } from "../csvExport";
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
  $: maximumSize = results[0]?.nodeIds.length ?? 0;
  $: visibleResults = results.slice(0, visibleLimit);

  function run() {
    visibleLimit = 30;
    dispatch("run", { selectedGroup, enumerateAllOptima });
  }

  function clear() {
    visibleLimit = 30;
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

<section class="contextual-clique" aria-label="Gruppi massimi sostenuti da contesti condivisi">
  <div class="heading">
    <div>
      <h4>Gruppo coeso contestuale</h4>
      {#if config}
        <small>
          Focus: <code>{JSON.stringify(config.focusNodeTypes)}</code> · contesti: <code>{JSON.stringify(config.contextNodeTypes)}</code> · relazioni: <code>{JSON.stringify(config.edgeTypes)}</code>.
          Cerca il massimo gruppo in cui ogni coppia di nodi focali condivide almeno un contesto nella proiezione corrente.
        </small>
      {:else}
        <small>Configura `graphAnalysis.contextualClique` per abilitare questa query.</small>
      {/if}
    </div>
  </div>

  <p class="semantics">
    La coesione è pairwise: coppie diverse possono essere sostenute da contesti diversi. Il risultato non richiede che tutto il gruppo condivida un unico contesto e non assegna da solo un significato sociale alle relazioni.
  </p>

  <div class="controls">
    <label>
      Gruppo dei nodi focali
      <select bind:value={selectedGroup} disabled={running}>
        <option value="">Tutti i nodi focali</option>
        {#each availableGroups as group (group)}
          <option value={group}>{group}</option>
        {/each}
      </select>
    </label>
    <label class="all-optima">
      <input type="checkbox" bind:checked={enumerateAllOptima} disabled={running} />
      Enumera tutti i gruppi massimi
    </label>
    <button type="button" class="run" on:click={run} disabled={running || !available || !config}>
      {running ? "Solver in esecuzione…" : "Trova gruppo contestuale massimo"}
    </button>
  </div>

  <div class="readiness" role="status">
    <strong>{available ? "Prerequisiti disponibili" : "Prerequisiti non soddisfatti"}</strong>
    <span>{graphNodesCount} nodi · {graphEdgesCount} archi visibili · cardinalità minima {config?.minimumSize ?? 3}</span>
    {#if requirementReasons.length > 0}
      <ul>{#each requirementReasons as reason}<li>{reason}</li>{/each}</ul>
    {/if}
  </div>

  {#if error}
    <div class="error" role="alert">{error}</div>
  {/if}

  {#if hasRun}
    <div class="summary" role="status">
      {#if results.length === 0}
        Nessun gruppo contestuale raggiunge la cardinalità minima configurata.
      {:else}
        {#if enumerateAllOptima}{results.length} gruppi massimi enumerati · {/if}
        cardinalità ottima: <strong>{maximumSize}</strong> nodi focali
      {/if}
      {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
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
              <button type="button" on:click={() => highlight(result)}>Evidenzia contesti e supporti in 3D</button>
            </div>
            <span class="members">{result.sourceNodeIds.map((sourceId, memberIndex) => displayNode(result.nodeIds[memberIndex], sourceId)).join(" · ")}</span>
            <details>
              <summary>{evidenceSummary(result)}</summary>
              <ul>
                {#each result.pairWitnesses as pair, pairIndex (`${pair.focusSourceIds.join("\u0000")}-${pair.contextSourceId}-${pairIndex}`)}
                  <li>
                    <strong>{pair.focusSourceIds.join(" — ")}</strong> condividono
                    <strong>{displayNode(pair.contextNodeId, pair.contextSourceId)}</strong>
                    <small>Record di supporto: {pair.supportingEdges.map((edge) => `${edge.edgeId}${edge.edgeIdGenerated ? " (ID generato)" : ""}`).join(", ")}</small>
                  </li>
                {/each}
              </ul>
            </details>
          </li>
        {/each}
      </ol>
      {#if results.length > visibleResults.length}
        <button type="button" class="show-more" on:click={() => visibleLimit += 30}>
          Mostra altri 30 ({results.length - visibleResults.length} restanti)
        </button>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .contextual-clique { display: grid; gap: 8px; padding: 12px 0; border-top: 1px solid #cbd5e1; }
  h4 { margin: 0 0 3px; }
  .heading small, .semantics, .readiness { color: #475569; }
  .semantics { margin: 0; }
  .controls { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; }
  label { display: grid; gap: 3px; font-size: 0.9rem; }
  select { min-width: 150px; }
  .all-optima { display: flex; align-items: center; gap: 6px; }
  .readiness, .summary { display: grid; gap: 3px; padding: 7px; border-radius: 5px; background: #f8fafc; }
  .readiness ul { margin: 0; padding-left: 18px; }
  .error { padding: 7px; border-radius: 5px; background: #fef2f2; color: #991b1b; }
  .results-heading, .group-heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; }
  .results-heading > div { display: flex; gap: 5px; }
  .results { display: grid; gap: 8px; margin: 0; padding-left: 25px; }
  .results > li { display: grid; gap: 5px; min-width: 0; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #f8fafc; overflow-wrap: anywhere; }
  .members { color: #334155; }
  details summary { cursor: pointer; }
  details ul { display: grid; gap: 5px; margin: 5px 0 0; padding-left: 18px; }
  details small { display: block; color: #475569; }
  button { cursor: pointer; }
</style>
