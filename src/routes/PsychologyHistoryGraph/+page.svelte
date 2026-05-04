<script lang="ts">
  import GraphApp from "$lib/kliqueasp/GraphApp.svelte";

  import graphConfig from "$lib/kliqueasp/config/graph.config.json";
  import graphData from "$lib/kliqueasp/data/my-dataset.json";
</script>

<svelte:head>
  <title>KliqueASP | Psychology History Graph</title>
  <meta
    name="description"
    content="Static Psychology History Graph case study for KliqueASP"
  />
</svelte:head>

<GraphApp
  {graphConfig}
  {graphData}
/>