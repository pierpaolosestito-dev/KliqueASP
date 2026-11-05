<script lang="ts">
  import { base } from "$app/paths";
  import { onMount } from "svelte";

  import graphConfig from "$lib/kliqueasp/config/graph.config.json";
  import graphDataUrl from "$lib/kliqueasp/data/my-dataset.json?url";

  let GraphAppComponent: any = null;
  let graphData: any = null;
  let isLoading = true;
  let loadError = "";
  let loadAttempt = 0;
  const workspaceHref = `${base}/Sandbox/`;

  async function loadGraphData() {
    const attempt = ++loadAttempt;
    isLoading = true;
    loadError = "";

    try {
      const [response, graphAppModule] = await Promise.all([
        fetch(graphDataUrl),
        import("$lib/kliqueasp/GraphApp.svelte")
      ]);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: unknown = await response.json();
      if (
        typeof data !== "object" ||
        data === null ||
        !("nodes" in data) ||
        !Array.isArray(data.nodes) ||
        !("edges" in data) ||
        !Array.isArray(data.edges)
      ) {
        throw new Error("Formato del grafo non valido");
      }

      if (attempt === loadAttempt) {
        GraphAppComponent = graphAppModule.default;
        graphData = data;
      }
    } catch {
      if (attempt === loadAttempt) {
        loadError = "Non è stato possibile preparare il caso studio. Controlla la connessione e riprova.";
      }
    } finally {
      if (attempt === loadAttempt) isLoading = false;
    }
  }

  onMount(() => {
    void loadGraphData();
  });
</script>

<svelte:head>
  <title>KliqueASP | Caso studio psicologi</title>
  <meta
    name="description"
    content="Esplora e analizza la rete del caso studio sulla storia della psicologia con KliqueASP."
  />
</svelte:head>

{#if graphData && GraphAppComponent}
  <svelte:component this={GraphAppComponent} {graphConfig} {graphData} workspaceNavigationHref={workspaceHref} />
{:else if loadError}
  <main class="dataset-state dataset-state--error" role="alert">
    <div class="dataset-state__card">
      <h1>Il caso studio non è disponibile</h1>
      <p>{loadError}</p>
      <button type="button" onclick={loadGraphData}>Riprova</button>
    </div>
  </main>
{:else}
  <main class="dataset-state" role="status" aria-live="polite">
    <span class="dataset-state__spinner" aria-hidden="true"></span>
    <p>Caricamento del grafo del caso psicologi…</p>
  </main>
{/if}

<style>
  .dataset-state {
    position: fixed;
    z-index: 20;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 14px;
    padding: 24px;
    color: #edf2f7;
    background: #10151d;
    text-align: center;
  }

  .dataset-state p {
    max-width: 34rem;
    margin: 0;
    color: #b9c3d0;
    line-height: 1.5;
  }

  .dataset-state__spinner {
    width: 30px;
    height: 30px;
    border: 3px solid #425064;
    border-top-color: #8ab4ff;
    border-radius: 50%;
    animation: dataset-spin 0.8s linear infinite;
  }

  .dataset-state__card {
    width: min(100%, 30rem);
    padding: 26px;
    border: 1px solid #3b4656;
    border-radius: 14px;
    background: #1a222d;
    box-shadow: 0 18px 48px rgb(0 0 0 / 24%);
  }

  .dataset-state__card h1 {
    margin: 0 0 10px;
    font-size: 1.2rem;
  }

  .dataset-state__card button {
    margin-top: 20px;
    padding: 9px 16px;
    border: 1px solid #8ab4ff;
    border-radius: 8px;
    color: #10151d;
    background: #8ab4ff;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .dataset-state__card button:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 3px;
  }

  .dataset-state__card button:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  @keyframes dataset-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dataset-state__spinner {
      animation-duration: 2.4s;
    }
  }
</style>
