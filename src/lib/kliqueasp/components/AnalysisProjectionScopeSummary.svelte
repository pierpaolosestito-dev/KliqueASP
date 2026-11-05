<script lang="ts">
  import { formatItalianNumber } from "../graph/formatItalianNumber.ts";
  import type { AnalysisProjectionScope } from "../graph/analysisProjectionScope.ts";
  import GraphFilterSummary from "./GraphFilterSummary.svelte";

  export let scope: AnalysisProjectionScope;

  $: directionLabel = scope.direction === "directed" ? "grafo orientato" : "grafo non orientato";
  $: confidenceLabel = scope.confidenceThreshold === null
    ? ""
    : formatItalianNumber(scope.confidenceThreshold, 6);
</script>

<div class="analysis-scope-summary" role="group" aria-label="Ambito dell'analisi">
  <div class="scope-line">
    <strong>Ambito:</strong>
    {scope.usesVisibleProjection ? "proiezione corrente" : "grafo di origine"}
    · {directionLabel}
    {#if scope.provenanceScenarioAvailable}
      · scenario {scope.provenanceScenarioLabel || "tutte le fonti"}
    {/if}
  </div>
  {#if scope.usesVisibleProjection}
    <GraphFilterSummary types={scope.viewTypes} groups={scope.viewGroups} degreeFilters={scope.viewDegreeFilters} />
    {#if scope.periodLabel}<span>Periodo: {scope.periodLabel}</span>{/if}
    {#if confidenceLabel}<span>Confidenza minima: ≥ {confidenceLabel}</span>{/if}
    <small>Il focus temporaneo di un nodo cambia la vista, non l'insieme analizzato.</small>
  {:else}
    <small>Filtri della vista e periodo non applicati.</small>
  {/if}
</div>

<style>
  .analysis-scope-summary {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding: 6px 8px;
    border-left: 3px solid #94a3b8;
    background: #f8fafc;
    color: #334155;
    font-size: 0.82rem;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .scope-line { min-width: 0; }
  .analysis-scope-summary small { color: #475569; }
</style>
