<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let description: string;
  export let actionLabel = "Apri Dati e configurazione";

  const dispatch = createEventDispatcher();
</script>

<div class="counterfactual-config-hint">
  <small>{description}</small>
  <details>
    <summary>Percorso del campo nella configurazione JSON</summary>
    <code>graphAnalysis.counterfactuals.edgeAdditions</code>
  </details>
  <button type="button" on:click={() => dispatch("openData")}>{actionLabel}</button>
</div>

<style>
  .counterfactual-config-hint {
    display: grid;
    gap: 0.45rem;
  }

  .counterfactual-config-hint small {
    line-height: 1.45;
  }

  .counterfactual-config-hint details {
    color: #475569;
    font-size: 0.82rem;
  }

  .counterfactual-config-hint summary {
    cursor: pointer;
    font-weight: 600;
  }

  .counterfactual-config-hint code {
    display: block;
    margin-top: 0.35rem;
    overflow-wrap: anywhere;
  }

  .counterfactual-config-hint button {
    justify-self: start;
    min-height: 32px;
    padding: 6px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #f8fafc;
    color: #1e4d68;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .counterfactual-config-hint button:focus-visible,
  .counterfactual-config-hint summary:focus-visible {
    outline: 3px solid #0284c7;
    outline-offset: 2px;
  }
</style>
