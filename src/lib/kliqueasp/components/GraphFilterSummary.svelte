<script lang="ts">
  import type { NodeDegreeProjectionFilters } from "../graph/nodeDegreeProjection.ts";
  import ProgressiveList from "./ProgressiveList.svelte";

  export let types: string[] = [];
  export let groups: string[] = [];
  export let degreeFilters: Partial<NodeDegreeProjectionFilters> = {};

  $: degreeFilterLabels = [
    ...(degreeFilters.excludeIsolated ? ["senza archi incidenti"] : []),
    ...(degreeFilters.excludeWithoutIncoming ? ["senza archi entranti"] : []),
    ...(degreeFilters.excludeWithoutOutgoing ? ["senza archi uscenti"] : [])
  ];
  $: hasFilters = types.length > 0 || groups.length > 0 || degreeFilterLabels.length > 0;
  $: typeCountLabel = types.length === 1 ? "1 tipo" : `${types.length} tipi`;
  $: groupCountLabel = groups.length === 1 ? "1 gruppo" : `${groups.length} gruppi`;
</script>

<div class="graph-filter-summary">
  <span>
    Filtri vista: {types.length ? typeCountLabel : "tutti i tipi"} · {groups.length ? groupCountLabel : "tutti i gruppi"}
    {#if degreeFilterLabels.length} · grado: {degreeFilterLabels.join(", ")}{/if}
  </span>
  {#if hasFilters}
    <details>
      <summary>Valori dei filtri</summary>
      {#if types.length > 0}
        <div class="filter-values">
          <strong>Tipi di nodo · {types.length}</strong>
          <ProgressiveList items={types} resetKey={types} label="tipi di nodo" let:item>
            <code>{item}</code>
          </ProgressiveList>
        </div>
      {/if}
      {#if groups.length > 0}
        <div class="filter-values">
          <strong>Gruppi · {groups.length}</strong>
          <ProgressiveList items={groups} resetKey={groups} label="gruppi del filtro" let:item>
            <code>{item}</code>
          </ProgressiveList>
        </div>
      {/if}
      {#if degreeFilterLabels.length > 0}
        <div class="filter-values">
          <strong>Esclusioni per grado · {degreeFilterLabels.length}</strong>
          {#each degreeFilterLabels as filterLabel (filterLabel)}
            <span>{filterLabel}</span>
          {/each}
        </div>
      {/if}
    </details>
  {/if}
</div>

<style>
  .graph-filter-summary {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .graph-filter-summary details {
    min-width: 0;
  }

  .graph-filter-summary summary {
    width: fit-content;
    cursor: pointer;
    font-weight: 600;
  }

  .filter-values {
    display: grid;
    gap: 3px;
    margin-top: 5px;
  }
</style>
