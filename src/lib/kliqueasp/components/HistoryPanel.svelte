<script lang="ts">
  export let history: { id: string; label: string }[] = [];
  export let onJumpTo: (id: string) => void = () => {};
  export let onClear: () => void = () => {};
</script>

{#if history.length > 0}
  <div class="history-panel">
    <div class="history-head">
      <strong>History</strong>
      <button class="clear-btn" type="button" on:click={onClear} title="Clear history">✕</button>
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
  </div>
{/if}

<style>
  .history-panel {
    position: absolute;
    left: var(--history-left);
    bottom: var(--history-bottom);
    max-width: var(--history-max-width);
    background: var(--history-bg);
    border-radius: var(--history-radius);
    padding: var(--history-padding);
    z-index: var(--history-z);
    font-size: var(--history-font);
    color: var(--history-color);
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
</style>