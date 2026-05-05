<script lang="ts">
  import GraphApp from "$lib/kliqueasp/GraphApp.svelte";
  import JsonEditor from "$lib/kliqueasp/components/JsonEditor.svelte";

  const DEFAULT_CONFIG_TEXT = `{
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

  function normalizeDataset(dataset: any) {
    return {
      nodes: Array.isArray(dataset?.nodes) ? dataset.nodes : [],
      edges: Array.isArray(dataset?.edges)
        ? dataset.edges
        : Array.isArray(dataset?.links)
          ? dataset.links
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