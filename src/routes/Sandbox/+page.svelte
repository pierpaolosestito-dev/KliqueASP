<script lang="ts">
  import GraphApp from "$lib/kliqueasp/GraphApp.svelte";

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
  let graphData: any = JSON.parse(DEFAULT_DATASET_TEXT);

  let graphKey = 0;
  let errorMessage = "";
  let editorOpen = true;

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
  {#if editorOpen}
    <aside class="editor-panel">
      <div class="editor-header">
        <div>
          <h1>KliqueASP Sandbox</h1>
          <p>
            Modifica <code>graph.config.json</code> e
            <code>my-dataset.json</code>, poi applica il nuovo grafo.
          </p>
        </div>

        <button
          class="ghost-button"
          type="button"
          on:click={() => (editorOpen = false)}
        >
          Hide
        </button>
      </div>

      <div class="editor-section">
        <label for="graph-config">graph.config.json</label>
        <textarea
          id="graph-config"
          spellcheck="false"
          bind:value={configText}
        ></textarea>
      </div>

      <div class="editor-section">
        <label for="graph-dataset">my-dataset.json</label>
        <textarea
          id="graph-dataset"
          spellcheck="false"
          bind:value={datasetText}
        ></textarea>
      </div>

      {#if errorMessage}
        <div class="error-box">
          <strong>JSON error</strong>
          <span>{errorMessage}</span>
        </div>
      {/if}

      <div class="editor-actions">
        <button type="button" on:click={applyJson}>
          Apply JSON
        </button>

        <button
          class="secondary-button"
          type="button"
          on:click={resetEditors}
        >
          Reset example
        </button>
      </div>
    </aside>
  {:else}
    <button
      class="open-editor-button"
      type="button"
      on:click={() => (editorOpen = true)}
    >
      Open JSON editor
    </button>
  {/if}

  <main class:with-editor={editorOpen} class="graph-area">
    {#key graphKey}
      <GraphApp
        {graphConfig}
        {graphData}
      />
    {/key}
  </main>
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

  .graph-area {
    width: 100vw;
    height: 100vh;
  }

  .graph-area.with-editor {
    margin-left: 420px;
    width: calc(100vw - 420px);
  }

  .editor-panel {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 100;
    width: 420px;
    height: 100vh;
    box-sizing: border-box;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: rgba(15, 23, 42, 0.96);
    color: #e5e7eb;
    border-right: 1px solid rgba(148, 163, 184, 0.25);
    box-shadow: 14px 0 40px rgba(0, 0, 0, 0.35);
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .editor-header h1 {
    margin: 0 0 6px;
    font-size: 20px;
    line-height: 1.2;
  }

  .editor-header p {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: #cbd5e1;
  }

  code {
    color: #7dd3fc;
  }

  .editor-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }

  .editor-section label {
    font-size: 13px;
    font-weight: 700;
    color: #f8fafc;
  }

  textarea {
    width: 100%;
    min-height: 190px;
    resize: vertical;
    box-sizing: border-box;
    padding: 12px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 10px;
    outline: none;
    background: #020617;
    color: #e5e7eb;
    font-family:
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      "Liberation Mono",
      "Courier New",
      monospace;
    font-size: 12px;
    line-height: 1.45;
  }

  textarea:focus {
    border-color: #38bdf8;
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16);
  }

  .error-box {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid rgba(248, 113, 113, 0.45);
    color: #fecaca;
    font-size: 13px;
  }

  .editor-actions {
    display: flex;
    gap: 10px;
    margin-top: auto;
  }

  button {
    border: none;
    border-radius: 10px;
    padding: 9px 12px;
    cursor: pointer;
    font-weight: 700;
    background: #38bdf8;
    color: #020617;
  }

  button:hover {
    filter: brightness(1.06);
  }

  .secondary-button,
  .ghost-button {
    background: rgba(148, 163, 184, 0.18);
    color: #e5e7eb;
  }

  .open-editor-button {
    position: fixed;
    top: 14px;
    left: 14px;
    z-index: 200;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  }

  @media (max-width: 900px) {
    .editor-panel {
      width: min(420px, 92vw);
    }

    .graph-area.with-editor {
      margin-left: 0;
      width: 100vw;
    }
  }
</style>