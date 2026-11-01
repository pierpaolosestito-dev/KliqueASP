<script lang="ts">
  export let total = 0;
  export let visible = 0;
  export let pageSize = 50;
  export let label = "risultati";
  export let showMore: () => void = () => {};

  $: remaining = Math.max(0, total - visible);
  $: nextCount = Math.min(pageSize, remaining);
</script>

{#if remaining > 0}
  <div class="result-list-pager" role="group" aria-label={`Paginazione ${label}`}>
    <span aria-live="polite">Visualizzati {visible} di {total} {label}</span>
    <button type="button" on:click={showMore}>Mostra altri {nextCount}</button>
  </div>
{/if}

<style>
  .result-list-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0.5rem 0;
    color: #536273;
    font-size: 0.78rem;
  }

  .result-list-pager button {
    border: 1px solid #b8c4d1;
    border-radius: 0.4rem;
    background: #fff;
    color: #26384b;
    padding: 0.35rem 0.55rem;
    font: inherit;
    cursor: pointer;
  }

  .result-list-pager button:hover { background: #f1f5f9; }
  .result-list-pager button:focus-visible { outline: 2px solid #176b80; outline-offset: 2px; }

  @media (max-width: 420px) {
    .result-list-pager { align-items: flex-start; flex-direction: column; }
  }
</style>
