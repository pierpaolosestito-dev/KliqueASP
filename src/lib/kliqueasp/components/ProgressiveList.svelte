<script lang="ts">
  import ResultListPager from "./ResultListPager.svelte";

  export let items: any[] = [];
  export let pageSize = 20;
  export let label = "elementi";
  export let resetKey: unknown = items;

  let visibleLimit = pageSize;
  let previousResetKey = resetKey;

  $: if (resetKey !== previousResetKey) {
    previousResetKey = resetKey;
    visibleLimit = pageSize;
  }
  $: visibleItems = items.slice(0, visibleLimit);

  function showMore() {
    visibleLimit += pageSize;
  }
</script>

{#each visibleItems as item, index}
  <slot {item} {index} />
{/each}

<ResultListPager
  total={items.length}
  visible={visibleItems.length}
  {pageSize}
  {label}
  {showMore}
/>
