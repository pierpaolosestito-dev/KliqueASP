<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { tick } from "svelte";
  import {
    filterSearchableNodeOptions,
    describeSearchableNodeResults,
    getSearchableOptionsWithCurrentValue,
    getNextSearchableNodeOptionPage,
    getNextEnabledNodeOptionIndex,
    getActiveNodeOptionScrollAdjustment,
    type SearchableNodeOption
  } from "../graph/searchableNodeOptions";

  export let id = "searchable-node-select";
  export let value = "";
  export let options: SearchableNodeOption[] = [];
  export let ariaLabel = "Cerca un nodo";
  export let placeholder = "Cerca un nodo…";
  export let includeEmptyOption = false;
  export let emptyOptionLabel = "";
  export let emptyMessage = "Nessun nodo disponibile.";
  export let noResultsMessage = "Nessun nodo corrisponde alla ricerca.";
  export let singularResultLabel = "nodo trovato";
  export let pluralResultLabel = "nodi trovati";
  export let required = false;
  export let disabled = false;
  export let disabledDescriptionId: string | undefined = undefined;

  const dispatch = createEventDispatcher();
  const pageSize = 30;
  let query = "";
  let open = false;
  let activeIndex = -1;
  let visibleLimit = pageSize;
  let rootElement: HTMLDivElement;

  $: searchableOptions = getSearchableOptionsWithCurrentValue(
    options,
    value,
    includeEmptyOption && (options.length > 0 || value) ? emptyOptionLabel : ""
  );
  $: selectedOption = searchableOptions.find((option) => option.value === value);
  $: matchingOptions = filterSearchableNodeOptions(searchableOptions, query);
  $: visibleOptions = matchingOptions.slice(0, visibleLimit);
  $: countedMatchingOptions = matchingOptions.filter((option) => option.countable !== false);
  $: countedVisibleOptions = visibleOptions.filter((option) => option.countable !== false);
  $: hasSearchableResults = countedMatchingOptions.length > 0;
  $: resultAnnouncement = open
    ? describeSearchableNodeResults(query, countedMatchingOptions.length, countedVisibleOptions.length, {
        emptyMessage,
        noResultsMessage,
        singularResultLabel,
        pluralResultLabel
      })
    : "";
  $: listboxId = `${id}-options`;
  $: activeOptionId = open && hasSearchableResults && activeIndex >= 0 && activeIndex < visibleOptions.length
    ? `${id}-option-${activeIndex}`
    : undefined;

  function revealActiveOption() {
    void tick().then(() => {
      if (!open || !activeOptionId) return;
      const listbox = document.getElementById(listboxId);
      const activeOption = document.getElementById(activeOptionId);
      if (!listbox || !activeOption) return;

      const optionBounds = activeOption.getBoundingClientRect();
      const listBounds = listbox.getBoundingClientRect();
      const visibleListTop = listBounds.top + listbox.clientTop + 1;
      const visibleListBottom = visibleListTop + listbox.clientHeight - 2;
      listbox.scrollTop += getActiveNodeOptionScrollAdjustment(
        optionBounds.top,
        optionBounds.bottom,
        visibleListTop,
        visibleListBottom
      );
      activeOption.scrollIntoView({ block: "nearest" });
    });
  }

  function openOptions() {
    if (disabled) return;
    if (open) return;
    open = true;
    visibleLimit = pageSize;
    activeIndex = visibleOptions.findIndex((option) => option.value === value && !option.disabled);
    if (activeIndex < 0) activeIndex = visibleOptions.findIndex((option) => !option.disabled);
    revealActiveOption();
  }

  function updateQuery(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    open = true;
    visibleLimit = pageSize;
    const firstPage = filterSearchableNodeOptions(searchableOptions, query).slice(0, pageSize);
    activeIndex = getNextEnabledNodeOptionIndex(firstPage, -1, 1);
    revealActiveOption();
  }

  function clearSearchQuery() {
    query = "";
    open = true;
    visibleLimit = pageSize;
    activeIndex = getNextEnabledNodeOptionIndex(
      filterSearchableNodeOptions(searchableOptions, "").slice(0, pageSize),
      -1,
      1
    );
    rootElement?.querySelector("input")?.focus();
    revealActiveOption();
  }

  function choose(option: SearchableNodeOption) {
    if (option.disabled) return;
    value = option.value;
    query = "";
    open = false;
    activeIndex = -1;
    visibleLimit = pageSize;
    dispatch("change", { value: option.value });
  }

  function nextEnabledOption(direction: 1 | -1): number {
    return getNextEnabledNodeOptionIndex(visibleOptions, activeIndex, direction);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openOptions();
      else {
        const next = getNextSearchableNodeOptionPage(matchingOptions, activeIndex, visibleLimit, pageSize);
        visibleLimit = next.visibleLimit;
        activeIndex = next.activeIndex;
        revealActiveOption();
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openOptions();
      else {
        activeIndex = nextEnabledOption(-1);
        revealActiveOption();
      }
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      const option = visibleOptions[activeIndex];
      if (option && !option.disabled) {
        event.preventDefault();
        choose(option);
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      open = false;
      query = "";
      activeIndex = -1;
    }
  }

  function handleBlur(event: FocusEvent) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && rootElement?.contains(nextTarget)) return;
    setTimeout(() => {
      if (rootElement?.contains(document.activeElement)) return;
      open = false;
      query = "";
      activeIndex = -1;
      visibleLimit = pageSize;
    }, 0);
  }

  function showMore() {
    visibleLimit = Math.min(matchingOptions.length, visibleLimit + pageSize);
    rootElement?.querySelector("input")?.focus();
  }
</script>

<div class="searchable-node-select" bind:this={rootElement} on:focusout={handleBlur}>
  <input
    id={id}
    type="search"
    role="combobox"
    aria-label={ariaLabel}
    aria-required={required}
    aria-describedby={disabledDescriptionId}
    aria-expanded={open}
    aria-controls={open && hasSearchableResults && visibleOptions.length > 0 ? listboxId : undefined}
    aria-activedescendant={activeOptionId}
    aria-autocomplete="list"
    autocomplete="off"
    placeholder={placeholder}
    bind:value={query}
    {disabled}
    on:click={openOptions}
    on:input={updateQuery}

    on:keydown={handleKeydown}
  />
  <p class="visually-hidden" aria-live="polite" aria-atomic="true">{resultAnnouncement}</p>
  {#if value}
    <small class="selected-value">Selezionato: {selectedOption?.label ?? value}</small>
  {/if}

  {#if open}
    {#if visibleOptions.length > 0 && hasSearchableResults}
      <div class="option-list" id={listboxId} role="listbox" aria-label={`Risultati per ${ariaLabel}`}>
        {#each visibleOptions as option, index (`${option.value}-${index}`)}
          <button
            id={`${id}-option-${index}`}
            type="button"
            role="option"
            aria-selected={option.value === value}
            aria-disabled={option.disabled ?? false}
            tabindex="-1"
            class:active={index === activeIndex}
            class:disabled={option.disabled}
            on:mousedown|preventDefault
            on:click={() => choose(option)}
          >{option.label}</button>
        {/each}
      </div>
      {#if countedMatchingOptions.length > countedVisibleOptions.length}
        <button class="show-more" type="button" on:mousedown|preventDefault on:click={showMore}>
          Mostra altri {Math.min(pageSize, countedMatchingOptions.length - countedVisibleOptions.length)} · {countedMatchingOptions.length} risultati
        </button>
      {/if}
    {:else}
      <p class="empty-options">
        {query.trim() ? noResultsMessage : emptyMessage}
      </p>
      {#if query.trim()}
        <button
          class="clear-search"
          type="button"
          on:mousedown|preventDefault
          on:click={clearSearchQuery}
        >Cancella ricerca</button>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .searchable-node-select { width: 100%; min-width: 0; }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  input {
    box-sizing: border-box;
    width: 100%;
    border: 1px solid #b8c4d1;
    border-radius: 0.4rem;
    background: #fff;
    color: #172536;
    padding: 0.45rem 0.55rem;
    font: inherit;
  }
  input:focus-visible, button:focus-visible { outline: 2px solid #176b80; outline-offset: 2px; }
  .selected-value, .empty-options { display: block; margin: 0.3rem 0; color: #536273; font-size: 0.78rem; }
  .option-list {
    display: grid;
    max-height: 11rem;
    overflow: auto;
    margin-top: 0.25rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.4rem;
    background: #fff;
  }
  .option-list button, .show-more {
    border: 0;
    background: #fff;
    color: #172536;
    padding: 0.4rem 0.55rem;
    text-align: left;
    font: inherit;
    cursor: pointer;
  }
  .option-list button:hover, .option-list button.active, .show-more:hover { background: #edf5f7; }
  .option-list button.disabled { color: #8995a3; cursor: not-allowed; }
  .show-more { width: 100%; margin-top: 0.2rem; color: #176b80; font-size: 0.8rem; }
  .clear-search {
    justify-self: start;
    min-height: 32px;
    margin: 0 0 0.2rem;
    padding: 0.3rem 0.55rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.35rem;
    background: #fff;
    color: #176b80;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .clear-search:hover { background: #edf5f7; }
</style>
