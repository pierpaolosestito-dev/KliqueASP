<script lang="ts">
  export let open: boolean = false;

  export let configText: string = "";
  export let datasetText: string = "";
  export let errorMessage: string = "";

  export let onConfigTextChange: (value: string) => void = () => {};
  export let onDatasetTextChange: (value: string) => void = () => {};
  export let onApply: () => void = () => {};
  export let onReset: () => void = () => {};
  export let onClose: () => void = () => {};
</script>

{#if open}
  <aside class="json-editor-panel" aria-label="JSON editor">
    <div class="json-editor-header">
      <div>
        <h1>KliqueASP Sandbox</h1>
      </div>

      <button
        class="ghost-button"
        type="button"
        on:click={onClose}
      >
        Hide
      </button>
    </div>

    <div class="json-editor-body">
      <section class="json-editor-section">
        <label for="graph-config">graph.config.json</label>
        <textarea
          id="graph-config"
          spellcheck="false"
          value={configText}
          on:input={(e) =>
            onConfigTextChange((e.currentTarget as HTMLTextAreaElement).value)}
        ></textarea>
      </section>

      <section class="json-editor-section">
        <label for="graph-dataset">my-dataset.json</label>
        <textarea
          id="graph-dataset"
          spellcheck="false"
          value={datasetText}
          on:input={(e) =>
            onDatasetTextChange((e.currentTarget as HTMLTextAreaElement).value)}
        ></textarea>
      </section>

      {#if errorMessage}
        <div class="error-box">
          <strong>JSON error</strong>
          <span>{errorMessage}</span>
        </div>
      {/if}
    </div>

    <div class="json-editor-actions">
      <button type="button" on:click={onApply}>
        Apply JSON
      </button>

      <button
        class="secondary-button"
        type="button"
        on:click={onReset}
      >
        Reset example
      </button>
    </div>
  </aside>
{/if}

<style>
  .json-editor-panel {
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

  .json-editor-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .json-editor-header h1 {
    margin: 0 0 6px;
    font-size: 20px;
    line-height: 1.2;
  }

  .json-editor-body {
    min-height: 0;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 14px;
  }

  .json-editor-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    flex: 1;
  }

  .json-editor-section label {
    font-size: 13px;
    font-weight: 700;
    color: #f8fafc;
  }

  textarea {
    width: 100%;
    height: 100%;
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

  .json-editor-actions {
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

  @media (max-width: 900px) {
    .json-editor-panel {
      width: min(420px, 92vw);
    }
  }
</style>