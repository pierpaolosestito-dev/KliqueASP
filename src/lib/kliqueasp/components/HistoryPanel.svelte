<script lang="ts">
  export let history: { id: string; label: string }[] = [];
  export let analysisArchive: { id: string; label: string; savedAt: string }[] = [];
  export let onJumpTo: (id: string) => void = () => {};
  export let onClear: () => void = () => {};
  export let onRestoreAnalysis: (id: string) => void = () => {};
  export let onClearAnalysisArchive: () => void = () => {};
</script>

{#if history.length > 0 || analysisArchive.length > 0}
  <div class="history-panel">
    {#if history.length > 0}
      <div class="history-head">
        <strong>Cronologia di navigazione</strong>
        <button class="clear-btn" type="button" aria-label="Svuota cronologia" on:click={onClear} title="Svuota cronologia">✕</button>
      </div>

      <div class="crumbs">
        {#each history as item, i}
          <button class="crumb" type="button" on:click={() => onJumpTo(item.id)}>
            {item.label}
          </button>
          {#if i < history.length - 1}
            <span class="sep">→</span>
          {/if}
        {/each}
      </div>
    {/if}

    {#if analysisArchive.length > 0}
      <section class="analysis-history" aria-label="Analisi precedenti dello stesso grafo">
        <div class="history-head analysis-head">
          <strong>Analisi precedenti · stesso grafo</strong>
          <button class="clear-archive" type="button" on:click={onClearAnalysisArchive} title="Elimina le analisi precedenti">
            Svuota
          </button>
        </div>
        <div class="analysis-list">
          {#each analysisArchive as analysis (analysis.id)}
            <button
              class="analysis-entry"
              type="button"
              on:click={() => onRestoreAnalysis(analysis.id)}
              aria-label="Riapri {analysis.label}, salvata il {new Date(analysis.savedAt).toLocaleString('it-IT')}"
            >
              <span class="analysis-label">{analysis.label}</span>
              <time datetime={analysis.savedAt}>{new Date(analysis.savedAt).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  </div>
{/if}

<style>
  .history-panel {
    position: absolute;
    left: var(--history-left);
    bottom: calc(var(--history-bottom) + var(--mobile-status-reserve, 48px));
    max-width: var(--history-max-width);
    background: var(--history-bg);
    border-radius: var(--history-radius);
    padding: var(--history-padding);
    z-index: var(--history-z);
    font-size: var(--history-font);
    color: var(--history-color);
    max-height: min(48vh, 360px);
    overflow: auto;
    box-sizing: border-box;
  }

  .history-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--history-header-mb);
  }

  .clear-btn {
    border: none;
    background: var(--history-clear-bg);
    color: inherit;
    border-radius: var(--history-clear-radius);
    width: var(--history-clear-size);
    height: var(--history-clear-size);
    cursor: pointer;
  }

  .crumbs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--history-gap);
    align-items: center;
  }

  .analysis-history {
    margin-top: 10px;
    padding-top: 9px;
    border-top: 1px solid rgba(148, 163, 184, 0.22);
  }

  .analysis-head {
    margin-bottom: 6px;
  }

  .clear-archive {
    border: 0;
    padding: 3px 6px;
    color: inherit;
    background: transparent;
    border-radius: 5px;
    font: inherit;
    opacity: 0.72;
    cursor: pointer;
  }

  .clear-archive:hover,
  .clear-archive:focus-visible {
    opacity: 1;
    background: rgba(148, 163, 184, 0.16);
  }

  .analysis-list {
    display: grid;
    gap: 4px;
  }

  .analysis-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-width: 0;
    border: 0;
    padding: 6px 8px;
    border-radius: 6px;
    color: inherit;
    background: rgba(148, 163, 184, 0.08);
    text-align: left;
    font: inherit;
    cursor: pointer;
  }

  .analysis-entry:hover,
  .analysis-entry:focus-visible {
    background: rgba(148, 163, 184, 0.2);
  }

  .analysis-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .analysis-entry time {
    flex: 0 0 auto;
    opacity: 0.68;
    font-size: 0.84em;
    font-variant-numeric: tabular-nums;
  }

  .crumb {
    border: none;
    background: var(--history-crumb-bg);
    color: inherit;
    border-radius: var(--history-crumb-radius);
    padding: var(--history-crumb-padding);
    cursor: pointer;
    white-space: nowrap;
    max-width: var(--history-crumb-max);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .crumb:hover {
    background: var(--history-crumb-hover);
  }

  .sep {
    opacity: var(--history-sep-opacity);
  }

  @media (max-width: 600px) {
    .history-panel {
      bottom: calc(var(--history-bottom) + max(var(--mobile-status-reserve, 48px), var(--mobile-filter-timeline-reserve, 0px)));
      width: calc(50vw - 18px);
      max-width: none;
      padding: 8px;
      font-size: 11px;
    }
  }
</style>
