<script lang="ts">
  import { base } from "$app/paths";
  import GraphApp from "$lib/kliqueasp/GraphApp.svelte";
  import JsonEditor from "$lib/kliqueasp/components/JsonEditor.svelte";
  import davisConfig from "$lib/kliqueasp/data/examples/davis-southern-women.config.json";
  import davisDataset from "$lib/kliqueasp/data/examples/davis-southern-women.json";
  import gahukuGamaConfig from "$lib/kliqueasp/data/examples/gahuku-gama-signed.config.json";
  import gahukuGamaDataset from "$lib/kliqueasp/data/examples/gahuku-gama-signed.json";
  import karateConfig from "$lib/kliqueasp/data/examples/karate-club.config.json";
  import karateDataset from "$lib/kliqueasp/data/examples/karate-club.json";
  import temporalEdgeConfig from "$lib/kliqueasp/data/examples/temporal-edge-projection.config.json";
  import temporalEdgeDataset from "$lib/kliqueasp/data/examples/temporal-edge-projection.json";
  import invsConfig from "$lib/kliqueasp/data/examples/sociopatterns-invs-100-minute.config.json";
  import invsDataset from "$lib/kliqueasp/data/examples/sociopatterns-invs-100-minute.json";
  import invsFullConfig from "$lib/kliqueasp/data/examples/sociopatterns-invs-full.config.json";

  const DEFAULT_CONFIG_TEXT = `{
  "features": {
    "timeline": true
  },
  "nodeTypes": {
    "actor": {
      "timeline": {
        "startField": "$.data.active_from",
        "endField": "$.data.active_to"
      },
      "group": "$.data.affiliations[*].group"
    }
  }
}`;

  const DEFAULT_DATASET_TEXT = `{
  "nodes": [
    {
      "id": "alice_rossi",
      "label": "Alice Rossi",
      "type": "actor",
      "data": {
        "active_from": 2018,
        "active_to": 2024,
        "affiliations": [
          {
            "group": "Network Analysis"
          }
        ]
      }
    },
    {
      "id": "bruno_verdi",
      "label": "Bruno Verdi",
      "type": "actor",
      "data": {
        "active_from": 2019,
        "active_to": 2025,
        "affiliations": [
          {
            "group": "Network Analysis"
          }
        ]
      }
    },
    {
      "id": "carla_bianchi",
      "label": "Carla Bianchi",
      "type": "actor",
      "data": {
        "active_from": 2020,
        "active_to": 2026,
        "affiliations": [
          {
            "group": "Knowledge Graphs"
          }
        ]
      }
    }
  ],
  "edges": [
    {
      "source": "alice_rossi",
      "target": "bruno_verdi",
      "type": "collaboration"
    },
    {
      "source": "bruno_verdi",
      "target": "carla_bianchi",
      "type": "collaboration"
    },
    {
      "source": "alice_rossi",
      "target": "carla_bianchi",
      "type": "collaboration"
    }
  ]
}`;

  let configText = DEFAULT_CONFIG_TEXT;
  let datasetText = DEFAULT_DATASET_TEXT;

  let graphConfig: any = JSON.parse(DEFAULT_CONFIG_TEXT);
  let graphData: any = normalizeDataset(JSON.parse(DEFAULT_DATASET_TEXT));

  let graphKey = 0;
  let nodeLabelsVisible = true;
  let errorMessage = "";
  let editorOpen = false;

  $: jsonEditorProps = {
    open: editorOpen,
    configText,
    datasetText,
    errorMessage,

    onConfigTextChange: (value: string) => {
      configText = value;
    },

    onDatasetTextChange: (value: string) => {
      datasetText = value;
    },

    onApply: applyJson,

    onReset: resetEditors,

    onLoadDavis: loadDavisExample,

    onLoadKarate: loadKarateExample,

    onLoadGahukuGama: loadGahukuGamaExample,

    onLoadTemporalEdges: loadTemporalEdgeExample,

    onLoadInVS: loadInVSExample,

    onLoadInVSFull: loadFullInVSExample,

    onOpen: () => {
      editorOpen = true;
    },

    onClose: () => {
      editorOpen = false;
    }
  };

  function applyJson() {
    try {
      const parsedConfig = JSON.parse(configText);
      const parsedDataset = JSON.parse(datasetText);

      graphConfig = parsedConfig;
      graphData = normalizeDataset(parsedDataset);

      graphKey += 1;
      errorMessage = "";
    } catch (error: any) {
      errorMessage = error?.message ?? "Invalid JSON";
    }
  }

  function resetEditors() {
    configText = DEFAULT_CONFIG_TEXT;
    datasetText = DEFAULT_DATASET_TEXT;
    applyJson();
  }

  function loadDavisExample() {
    configText = JSON.stringify(davisConfig, null, 2);
    datasetText = JSON.stringify(davisDataset, null, 2);
    applyJson();
  }

  function loadKarateExample() {
    configText = JSON.stringify(karateConfig, null, 2);
    datasetText = JSON.stringify(karateDataset, null, 2);
    applyJson();
  }

  function loadGahukuGamaExample() {
    configText = JSON.stringify(gahukuGamaConfig, null, 2);
    datasetText = JSON.stringify(gahukuGamaDataset, null, 2);
    applyJson();
  }

  function loadTemporalEdgeExample() {
    configText = JSON.stringify(temporalEdgeConfig, null, 2);
    datasetText = JSON.stringify(temporalEdgeDataset, null, 2);
    applyJson();
  }

  function loadInVSExample() {
    configText = JSON.stringify(invsConfig, null, 2);
    datasetText = JSON.stringify(invsDataset, null, 2);
    applyJson();
  }

  async function loadFullInVSExample() {
    try {
      const response = await fetch(`${base}/examples/sociopatterns-invs-full.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status} caricando il dataset InVS completo.`);
      const fullDataset = await response.json();
      configText = JSON.stringify(invsFullConfig, null, 2);
      datasetText = JSON.stringify(fullDataset, null, 2);
      applyJson();
    } catch (error: any) {
      errorMessage = error?.message ?? "Impossibile caricare il dataset InVS completo.";
    }
  }

  function normalizeDataset(dataset: any) {
    const source = dataset && typeof dataset === "object" && !Array.isArray(dataset)
      ? dataset
      : {};
    return {
      ...source,
      nodes: Array.isArray(source.nodes) ? source.nodes : [],
      edges: Array.isArray(source.edges)
        ? source.edges
        : Array.isArray(source.links)
          ? source.links
          : []
    };
  }
</script>

<svelte:head>
  <title>KliqueASP Sandbox</title>
  <meta
    name="description"
    content="Edit graph configuration and dataset for KliqueASP"
  />
</svelte:head>

<div class="sandbox-page">
  {#key graphKey}
    <GraphApp
      {graphConfig}
      {graphData}
      bind:nodeLabelsVisible
      {JsonEditor}
      {jsonEditorProps}
    />
  {/key}
</div>

<style>
  :global(body) {
    margin: 0;
  }

  .sandbox-page {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #020617;
  }
</style>
