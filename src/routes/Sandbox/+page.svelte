<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
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
  import { buildKliqueAspProject, parseKliqueAspProject } from "$lib/kliqueasp/graph/projectFile";
  import {
    loadWorkbenchSession,
    parseWorkbenchSession,
    saveWorkbenchSession,
    createWorkbenchGraphKey,
    type WorkbenchHistoryEntry,
    type WorkbenchAnalysisSessionSnapshot,
    type WorkbenchAnalysisArchiveSnapshot,
    type WorkbenchSessionSnapshot
  } from "$lib/kliqueasp/graph/workbenchSession";

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

  const EXIT_SESSION_BACKUP_KEY = "kliqueasp-workbench-exit-backup";
  const EXIT_SESSION_BACKUP_MAX_CHARS = 1_500_000;

  let configText = DEFAULT_CONFIG_TEXT;
  let datasetText = DEFAULT_DATASET_TEXT;

  let graphConfig: any = JSON.parse(DEFAULT_CONFIG_TEXT);
  let graphData: any = normalizeDataset(JSON.parse(DEFAULT_DATASET_TEXT));
  let appliedConfigText = DEFAULT_CONFIG_TEXT;
  let appliedDatasetText = DEFAULT_DATASET_TEXT;
  let appliedGraphKey = createWorkbenchGraphKey(appliedConfigText, appliedDatasetText);

  let graphKey = 0;
  let nodeLabelsVisible = true;
  let GraphAppComponent: any = null;
  let graphAppLoading = true;
  let graphAppLoadError = "";
  let graphAppLoadAttempt = 0;
  let errorMessage = "";
  let editorOpen = false;
  let projectDirty = false;
  let navigationHistory: WorkbenchHistoryEntry[] = [];
  let analysisSessionState: WorkbenchAnalysisSessionSnapshot | null = null;
  let analysisArchiveState: WorkbenchAnalysisArchiveSnapshot | null = null;
  let sessionReady = false;
  let sessionRestored = false;
  let sessionStatus = "";
  let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let skipNextSessionSave = false;

  async function loadGraphApp() {
    const attempt = ++graphAppLoadAttempt;
    graphAppLoading = true;
    graphAppLoadError = "";
    try {
      const graphAppModule = await import("$lib/kliqueasp/GraphApp.svelte");
      if (attempt === graphAppLoadAttempt) GraphAppComponent = graphAppModule.default;
    } catch {
      if (attempt === graphAppLoadAttempt) {
        graphAppLoadError = "Non è stato possibile caricare l’area di lavoro. Controlla la connessione e riprova.";
      }
    } finally {
      if (attempt === graphAppLoadAttempt) graphAppLoading = false;
    }
  }

  $: sessionSnapshot = sessionReady ? {
    version: 3 as const,
    draftConfigText: configText,
    draftDatasetText: datasetText,
    appliedConfigText: appliedConfigText !== configText ? appliedConfigText : undefined,
    appliedDatasetText: appliedDatasetText !== datasetText ? appliedDatasetText : undefined,
    projectDirty,
    nodeLabelsVisible,
    history: navigationHistory,
    analysis: analysisSessionState ?? undefined,
    analysisArchive: analysisArchiveState ?? undefined,
    savedAt: new Date().toISOString()
  } satisfies WorkbenchSessionSnapshot : null;

  $: if (sessionSnapshot) scheduleSessionSave(sessionSnapshot);

  onMount(() => {
    void loadGraphApp();
    const flushSessionBeforeLeaving = () => {
      if (!sessionReady) return;
      if (sessionSaveTimer) {
        clearTimeout(sessionSaveTimer);
        sessionSaveTimer = null;
      }
      const snapshot = captureSessionSnapshot();
      writeExitSessionBackup(snapshot);
      void saveWorkbenchSession(snapshot)
        .then(() => clearExitSessionBackupThrough(snapshot.savedAt))
        .catch(() => {});
    };
    window.addEventListener("pagehide", flushSessionBeforeLeaving);
    void restoreWorkbenchSession();
    return () => {
      window.removeEventListener("pagehide", flushSessionBeforeLeaving);
      if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
    };
  });

  $: jsonEditorProps = {
    open: editorOpen,
    configText,
    datasetText,
    errorMessage,
    projectDirty,
    sessionStatus,

    onConfigTextChange: (value: string) => {
      configText = value;
      projectDirty = true;
    },

    onDatasetTextChange: (value: string) => {
      datasetText = value;
      projectDirty = true;
    },

    onApply: applyJson,

    onReset: resetEditors,

    onLoadDavis: loadDavisExample,

    onLoadKarate: loadKarateExample,

    onLoadGahukuGama: loadGahukuGamaExample,

    onLoadTemporalEdges: loadTemporalEdgeExample,

    onLoadInVS: loadInVSExample,

    onLoadInVSFull: loadFullInVSExample,

    onLoadProject: loadProject,

    onSaveProject: saveProject,

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
      appliedConfigText = configText;
      appliedDatasetText = datasetText;
      appliedGraphKey = createWorkbenchGraphKey(appliedConfigText, appliedDatasetText);
      analysisSessionState = null;
      analysisArchiveState = null;
      sessionRestored = false;

      navigationHistory = [];
      graphKey += 1;
      errorMessage = "";
    } catch (error: any) {
      errorMessage = error?.message ?? "Invalid JSON";
    }
  }

  function loadProject(project: unknown) {
    const parsedProject = parseKliqueAspProject(project);
    configText = JSON.stringify(parsedProject.graphConfig, null, 2);
    datasetText = JSON.stringify(parsedProject.graphData, null, 2);
    applyJson();
    if (errorMessage) throw new Error(errorMessage);
    projectDirty = false;
    editorOpen = false;
  }

  function saveProject() {
    try {
      const project = buildKliqueAspProject(JSON.parse(configText), JSON.parse(datasetText));
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kliqueasp-progetto-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      errorMessage = "";
      projectDirty = false;
      return `Richiesta di download inviata al browser: ${anchor.download}`;
    } catch (error: any) {
      errorMessage = error?.message ?? "Impossibile esportare il progetto.";
    }
  }

  function resetEditors() {
    configText = DEFAULT_CONFIG_TEXT;
    datasetText = DEFAULT_DATASET_TEXT;
    applyJson();
    projectDirty = true;
  }

  function loadDavisExample() {
    configText = JSON.stringify(davisConfig, null, 2);
    datasetText = JSON.stringify(davisDataset, null, 2);
    applyJson();
    projectDirty = true;
  }

  function loadKarateExample() {
    configText = JSON.stringify(karateConfig, null, 2);
    datasetText = JSON.stringify(karateDataset, null, 2);
    applyJson();
    projectDirty = true;
  }

  function loadGahukuGamaExample() {
    configText = JSON.stringify(gahukuGamaConfig, null, 2);
    datasetText = JSON.stringify(gahukuGamaDataset, null, 2);
    applyJson();
    projectDirty = true;
  }

  function loadTemporalEdgeExample() {
    configText = JSON.stringify(temporalEdgeConfig, null, 2);
    datasetText = JSON.stringify(temporalEdgeDataset, null, 2);
    applyJson();
    projectDirty = true;
  }

  function loadInVSExample() {
    configText = JSON.stringify(invsConfig, null, 2);
    datasetText = JSON.stringify(invsDataset, null, 2);
    applyJson();
    projectDirty = true;
  }

  async function loadFullInVSExample() {
    try {
      const response = await fetch(`${base}/examples/sociopatterns-invs-full.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status} caricando il dataset InVS completo.`);
      const fullDataset = await response.json();
      configText = JSON.stringify(invsFullConfig, null, 2);
      datasetText = JSON.stringify(fullDataset, null, 2);
      applyJson();
      projectDirty = true;
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

  async function restoreWorkbenchSession() {
    try {
      let indexedSnapshot: WorkbenchSessionSnapshot | null = null;
      let storageError: unknown = null;
      try {
        indexedSnapshot = await loadWorkbenchSession();
      } catch (error) {
        storageError = error;
      }
      const exitBackup = readExitSessionBackup();
      const snapshot = exitBackup && (!indexedSnapshot || Date.parse(exitBackup.savedAt) > Date.parse(indexedSnapshot.savedAt))
        ? exitBackup
        : indexedSnapshot;
      if (snapshot) {
        sessionRestored = true;
        const restoredConfigText = snapshot.appliedConfigText ?? snapshot.draftConfigText;
        const restoredDatasetText = snapshot.appliedDatasetText ?? snapshot.draftDatasetText;
        configText = snapshot.draftConfigText;
        datasetText = snapshot.draftDatasetText;
        appliedConfigText = restoredConfigText;
        appliedDatasetText = restoredDatasetText;
        appliedGraphKey = createWorkbenchGraphKey(restoredConfigText, restoredDatasetText);
        analysisSessionState = snapshot.analysis?.graphKey === appliedGraphKey ? snapshot.analysis : null;
        analysisArchiveState = snapshot.analysisArchive?.graphKey === appliedGraphKey
          ? snapshot.analysisArchive
          : null;
        graphConfig = JSON.parse(restoredConfigText);
        graphData = normalizeDataset(JSON.parse(restoredDatasetText));
        projectDirty = snapshot.projectDirty;
        nodeLabelsVisible = snapshot.nodeLabelsVisible;
        navigationHistory = snapshot.history;
        graphKey += 1;
        skipNextSessionSave = true;
        sessionStatus = `Ripristinata dal browser · ${new Date(snapshot.savedAt).toLocaleString("it-IT")}`;
        if (snapshot === exitBackup) {
          void saveWorkbenchSession(snapshot)
            .then(() => clearExitSessionBackupThrough(snapshot.savedAt))
            .catch(() => {});
        } else if (exitBackup) {
          clearExitSessionBackupThrough(snapshot.savedAt);
        }
      } else {
        if (storageError) throw storageError;
        sessionStatus = "La sessione si salva automaticamente in questo browser.";
      }
    } catch (error: any) {
      sessionStatus = `Ripristino non riuscito: ${error?.message ?? "sessione locale non disponibile"}`;
    } finally {
      sessionReady = true;
    }
  }

  function scheduleSessionSave(snapshot: WorkbenchSessionSnapshot) {
    if (skipNextSessionSave) {
      skipNextSessionSave = false;
      return;
    }
    if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
    sessionStatus = "Salvataggio sessione…";
    sessionSaveTimer = setTimeout(async () => {
      try {
        await saveWorkbenchSession(snapshot);
        clearExitSessionBackupThrough(snapshot.savedAt);
        sessionStatus = `Salvata nel browser · ${new Date(snapshot.savedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
      } catch (error: any) {
        sessionStatus = `Salvataggio locale non riuscito: ${error?.message ?? "spazio non disponibile"}`;
      }
    }, 700);
  }

  function captureSessionSnapshot(): WorkbenchSessionSnapshot {
    return {
      version: 3,
      draftConfigText: configText,
      draftDatasetText: datasetText,
      ...(appliedConfigText !== configText ? { appliedConfigText } : {}),
      ...(appliedDatasetText !== datasetText ? { appliedDatasetText } : {}),
      projectDirty,
      nodeLabelsVisible,
      history: navigationHistory,
      analysis: analysisSessionState ?? undefined,
      analysisArchive: analysisArchiveState ?? undefined,
      savedAt: new Date().toISOString()
    };
  }

  function readExitSessionBackup(): WorkbenchSessionSnapshot | null {
    try {
      const serialized = localStorage.getItem(EXIT_SESSION_BACKUP_KEY);
      return serialized ? parseWorkbenchSession(JSON.parse(serialized)) : null;
    } catch {
      return null;
    }
  }

  function writeExitSessionBackup(snapshot: WorkbenchSessionSnapshot) {
    try {
      let backupSnapshot = snapshot;
      let serialized = JSON.stringify(backupSnapshot);
      if (serialized.length > EXIT_SESSION_BACKUP_MAX_CHARS && (backupSnapshot.analysis || backupSnapshot.analysisArchive)) {
        const { analysis: _analysis, analysisArchive: _analysisArchive, ...withoutAnalysis } = backupSnapshot;
        backupSnapshot = withoutAnalysis;
        serialized = JSON.stringify(backupSnapshot);
      }
      if (serialized.length > EXIT_SESSION_BACKUP_MAX_CHARS) {
        localStorage.removeItem(EXIT_SESSION_BACKUP_KEY);
        return;
      }
      localStorage.setItem(EXIT_SESSION_BACKUP_KEY, serialized);
    } catch {
      // The primary IndexedDB save remains available when localStorage is full or disabled.
    }
  }

  function clearExitSessionBackupThrough(savedAt: string) {
    try {
      const backup = readExitSessionBackup();
      if (!backup || Date.parse(backup.savedAt) <= Date.parse(savedAt)) {
        localStorage.removeItem(EXIT_SESSION_BACKUP_KEY);
      }
    } catch {
      // A stale temporary backup must not make the primary save fail.
    }
  }
</script>

<svelte:head>
  <title>KliqueASP Sandbox</title>
  <meta
    name="description"
    content="Carica, configura e analizza i tuoi grafi con KliqueASP."
  />
</svelte:head>

<div class="sandbox-page">
  {#if graphAppLoadError}
    <main class="workspace-load-error" role="alert">
      <div>
        <h1>Area di lavoro non disponibile</h1>
        <p>{graphAppLoadError}</p>
        <button type="button" onclick={loadGraphApp} disabled={graphAppLoading}>
          {graphAppLoading ? "Caricamento…" : "Riprova"}
        </button>
      </div>
    </main>
  {:else if sessionReady && GraphAppComponent}
    {#key graphKey}
      <svelte:component
        this={GraphAppComponent}
        {graphConfig}
        {graphData}
        bind:nodeLabelsVisible
        {JsonEditor}
        {jsonEditorProps}
        initialHistory={navigationHistory}
        onHistoryChange={(entries: WorkbenchHistoryEntry[]) => navigationHistory = entries}
        sessionGraphKey={appliedGraphKey}
        initialAnalysisSession={analysisSessionState}
        initialAnalysisArchive={analysisArchiveState}
        onAnalysisSessionChange={(analysis: WorkbenchAnalysisSessionSnapshot | null) => {
          if (analysis === null) analysisSessionState = null;
          else if (analysis.graphKey === appliedGraphKey) analysisSessionState = analysis;
        }}
        onAnalysisArchiveChange={(archive: WorkbenchAnalysisArchiveSnapshot | null) => {
          if (archive === null) analysisArchiveState = null;
          else if (archive.graphKey === appliedGraphKey) analysisArchiveState = archive;
        }}
        sessionRestored={sessionRestored}
      />
    {/key}
  {:else}
    <div class="session-loading" role="status" aria-live="polite">
      {sessionReady ? "Caricamento dell’area di lavoro…" : "Ripristino della sessione…"}
    </div>
  {/if}
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

  .session-loading {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    color: #cbd5e1;
    font: 500 14px/1.4 system-ui, sans-serif;
  }

  .workspace-load-error {
    display: grid;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    place-items: center;
    padding: 24px;
    color: #e2e8f0;
    font: 500 14px/1.5 system-ui, sans-serif;
    text-align: center;
  }

  .workspace-load-error > div {
    width: min(100%, 30rem);
    padding: 26px;
    border: 1px solid #334155;
    border-radius: 14px;
    background: #0f172a;
  }

  .workspace-load-error h1 {
    margin: 0 0 10px;
    font-size: 1.2rem;
  }

  .workspace-load-error p {
    margin: 0;
    color: #cbd5e1;
  }

  .workspace-load-error button {
    margin-top: 20px;
    padding: 9px 16px;
    border: 1px solid #67e8f9;
    border-radius: 8px;
    color: #082f49;
    background: #67e8f9;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .workspace-load-error button:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 3px;
  }

  .workspace-load-error button:disabled {
    cursor: wait;
    opacity: 0.7;
  }
</style>
