<script lang="ts">
  import ProgressiveList from "./ProgressiveList.svelte";

  export let types: string[] = [];
  export let groups: string[] = [];

  $: hasFilters = types.length > 0 || groups.length > 0;
  $: typeCountLabel = types.length === 1 ? "1 tipo" : `${types.length} tipi`;
  $: groupCountLabel = groups.length === 1 ? "1 gruppo" : `${groups.length} gruppi`;
</script>

<div class="graph-filter-summary">
  <span>Filtri vista: {types.length ? typeCountLabel : "tutti i tipi"} · {groups.length ? groupCountLabel : "tutti i gruppi"}</span>
  {#if hasFilters}
    <details>
      <summary>Valori dei filtri</summary>
      {#if types.length > 0}
        <div class="filter-values">
          <strong>Tipi di relazione · {types.length}</strong>
          <ProgressiveList items={types} resetKey={types} label="tipi di relazione" let:item>
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
