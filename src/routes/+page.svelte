<script lang="ts">
  import GraphApp from "$lib/kliqueasp/GraphApp.svelte";

  const graphConfig = {
    features: {
      filters: false,
      timeline: false
    },

    solver: {
      enabled: false
    },

    graph: {
      backgroundColor: "#050816",
      nodeOpacity: 0.95,
      linkOpacity: 0.35,
      linkWidth: 0.6
    },

    forces: {
      charge: -80,
      linkDistance: 65,
      linkStrength: 0.6
    },

    node: {
      iconSize: 14,
      ring: {
        innerRadius: 0.65,
        outerRadius: 0.85,
        segments: 32,
        scale: 8
      },
      label: {
        font: "26px sans-serif",
        scale: [18, 8],
        offsetY: -10
      }
    },

    ui: {
      toolbar: {
        top: 10,
        left: 10,
        spacing: 8,
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(255, 255, 255, 0.9)",
        zIndex: 30
      }
    },

    nodeTypes: {
      highlight: {
        root: "#facc15",
        neighbor: "#60a5fa",
        preview: "#7dd3fc",
        clique: "#7dd3fc"
      },

      default: {
        color: "#38bdf8"
      },

      logo: {
        color: "#38bdf8"
      }
    }
  };

  const graphData = {
    nodes: [],
    edges: []
  };
</script>

<svelte:head>
  <title>KliqueASP</title>
  <meta
    name="description"
    content="KliqueASP interactive graph reasoning environment"
  />
</svelte:head>

<GraphApp
  {graphConfig}
  {graphData}
  forceEasterEgg={true}
/>