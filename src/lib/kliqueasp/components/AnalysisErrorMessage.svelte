<script lang="ts">
  import { presentAnalysisError } from "../graph/analysisErrorPresentation.ts";

  export let message = "";
  $: presentation = presentAnalysisError(message);
</script>

{#if presentation.message}
  <div class="analysis-error" role="alert">
    <p>{presentation.message}</p>
    {#if presentation.technicalDetails}
      <details>
        <summary>Dettagli tecnici</summary>
        <pre>{presentation.technicalDetails}</pre>
      </details>
    {/if}
  </div>
{/if}

<style>
  .analysis-error {
    display: grid;
    gap: 7px;
    padding: 9px 11px;
    border: 1px solid #e7c3b9;
    border-radius: 8px;
    background: #fff7f4;
    color: #803b2e;
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  p { margin: 0; }

  details { color: #67483f; }

  summary {
    width: fit-content;
    cursor: pointer;
    font-size: 11px;
    font-weight: 650;
  }

  summary:focus-visible {
    outline: 2px solid #176b80;
    outline-offset: 3px;
    border-radius: 2px;
  }

  pre {
    max-height: 180px;
    margin: 7px 0 0;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: inherit;
    font-size: 11px;
  }
</style>
