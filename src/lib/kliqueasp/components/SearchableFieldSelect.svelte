<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { SearchableNodeOption } from "../graph/searchableNodeOptions";
  import SearchableNodeSelect from "./SearchableNodeSelect.svelte";

  export let id = "searchable-field-select";
  export let value = "";
  export let options: SearchableNodeOption[] = [];
  export let ariaLabel = "Cerca un campo JSON";
  export let emptyOptionLabel = "Nessun campo";
  export let required = false;

  const dispatch = createEventDispatcher();
</script>

<SearchableNodeSelect
  {id}
  bind:value
  {options}
  {ariaLabel}
  {required}
  placeholder={emptyOptionLabel}
  includeEmptyOption
  {emptyOptionLabel}
  emptyMessage="Nessun campo JSON disponibile."
  noResultsMessage="Nessun campo JSON corrisponde alla ricerca."
  singularResultLabel="campo trovato"
  pluralResultLabel="campi trovati"
  on:change={(event) => dispatch("change", event.detail)}
/>
