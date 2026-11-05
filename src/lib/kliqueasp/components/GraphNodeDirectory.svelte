<script lang="ts">
  import { tick } from "svelte";
  import ResultListPager from "./ResultListPager.svelte";
  import type { GraphNodeDirectoryEntry } from "../graph/nodeDirectory.ts";

  export let nodes: GraphNodeDirectoryEntry[] = [];
  export let selectedNodeId: string | null = null;
  export let onSelect: (id: string) => void = () => {};
  export let searchInputId = "graph-node-directory-search";

  const pageSize = 20;
  let searchInputElement: HTMLInputElement | undefined;
  let query = "";
  let visibleLimit = pageSize;

  $: normalizedQuery = query.trim().toLocaleLowerCase("it");
  $: matchingNodes = normalizedQuery
    ? nodes.filter((node) =>
        node.label.toLocaleLowerCase("it").includes(normalizedQuery) ||
        node.id.toLocaleLowerCase("it").includes(normalizedQuery) ||
        node.type.toLocaleLowerCase("it").includes(normalizedQuery)
      )
    : nodes;
  $: visibleNodes = matchingNodes.slice(0, visibleLimit);

  async function clearSearch() {
    query = "";
    visibleLimit = pageSize;
    await tick();
    searchInputElement?.focus();
  }
</script>

<section class="node-directory" aria-label="Elenco dei nodi visibili">
  <label for={searchInputId}>Cerca per nome, ID o tipo</label>
  <input
    id={searchInputId}
    bind:this={searchInputElement}
    type="search"
    bind:value={query}
    on:input={() => visibleLimit = pageSize}
    placeholder="Cerca nodo…"
    autocomplete="off"
  />
  <p class="node-directory-count" role="status" aria-live="polite">
    {matchingNodes.length} {matchingNodes.length === 1 ? "nodo" : "nodi"}
    {normalizedQuery ? " trovati" : " visibili"}
  </p>

  {#if visibleNodes.length > 0}
    <ul>
      {#each visibleNodes as node (node.id)}
        <li>
          <button
            type="button"
            aria-pressed={selectedNodeId === node.id}
            on:click={() => onSelect(node.id)}
          >
            <span>{node.label}</span>
            <small>{node.type ? `${node.type} · ` : ""}{node.id}</small>
          </button>
        </li>
      {/each}
    </ul>
  {:else if normalizedQuery}
    <p class="node-directory-empty">Nessun nodo corrisponde alla ricerca.</p>
    <button class="directory-clear-search" type="button" on:click={clearSearch}>Cancella ricerca</button>
  {:else}
    <p class="node-directory-empty">Nessun nodo visibile nella vista corrente. Reimposta filtri e vista per ripristinare l'elenco.</p>
  {/if}

  <ResultListPager
    total={matchingNodes.length}
    visible={visibleNodes.length}
    pageSize={pageSize}
    label="nodi"
    showMore={() => visibleLimit += pageSize}
  />
</section>

<style>
  .node-directory {
    display: grid;
    gap: 6px;
    padding: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 9px;
    background: #f8fafc;
  }

  .node-directory > label {
    color: #526173;
    font-size: 11px;
    font-weight: 650;
  }

  .node-directory > input {
    box-sizing: border-box;
    width: 100%;
    min-height: 34px;
    padding: 7px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #fff;
    color: #172033;
    font: 12px/1.2 Arial, Helvetica, sans-serif;
  }

  .node-directory-count,
  .node-directory-empty {
    margin: 0;
    color: #536273;
    font-size: 11px;
    line-height: 1.4;
  }

  .directory-clear-search {
    justify-self: start;
    min-height: 30px;
    padding: 5px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #fff;
    color: #174d47;
    cursor: pointer;
    font: 600 11px/1.2 Arial, Helvetica, sans-serif;
  }

  .directory-clear-search:hover { background: #f0f8f6; }
  .directory-clear-search:focus-visible { outline: 3px solid #0c4a6e; outline-offset: 2px; }

  .node-directory ul {
    display: grid;
    max-height: 240px;
    overflow: auto;
    overscroll-behavior: contain;
    gap: 3px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .node-directory li { min-width: 0; }

  .node-directory li button {
    display: grid;
    width: 100%;
    min-height: 38px;
    gap: 2px;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: #fff;
    color: #263449;
    cursor: pointer;
    font: 12px/1.25 Arial, Helvetica, sans-serif;
    text-align: left;
  }

  .node-directory li button:hover { border-color: #b8d3ce; background: #f0f8f6; }
  .node-directory li button[aria-pressed="true"] { border-color: #1e645d; background: #eaf5f2; color: #174d47; }
  .node-directory li button:focus-visible { outline: 3px solid #0c4a6e; outline-offset: 1px; }
  .node-directory li button > span,
  .node-directory li button > small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .node-directory li button > small { color: #627184; font-size: 10px; }

  :global(.node-directory .result-list-pager) { align-items: flex-start; flex-direction: column; margin: 0; }
</style>
