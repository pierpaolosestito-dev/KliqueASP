<script lang="ts">
  import ProgressiveList from "./ProgressiveList.svelte";

  export let references: string[] = [];
  export let fallback = "";
  export let resetKey: unknown = references;
</script>

{#if references.length > 0}
  <details class="provenance-references">
    <summary>Riferimenti di provenienza · {references.length}</summary>
    <ProgressiveList items={references} {resetKey} label="riferimenti di provenienza" let:item>
      <span>{item}</span>
    </ProgressiveList>
  </details>
{:else if fallback}
  <small>Fonte dichiarata: {fallback}</small>
{/if}

<style>
  .provenance-references {
    margin-top: 3px;
    font-size: 0.9em;
  }
</style>
