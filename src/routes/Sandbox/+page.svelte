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
  import syntheticGraphConfig from "$lib/kliqueasp/data/examples/synthetic-graph.config.json";
  import syntheticGraphDirectedConfig from "$lib/kliqueasp/data/examples/synthetic-graph-directed.config.json";
  import syntheticGraphDataset from "$lib/kliqueasp/data/examples/synthetic-graph.json";
  import bitcoinOtcConfig from "$lib/kliqueasp/data/examples/bitcoin-otc.config.json";
  import bitcoinOtcManifest from "$lib/kliqueasp/data/examples/bitcoin-otc.manifest.json";
  import {
    buildKliqueAspProject,
    createKliqueAspProjectFilename,
    DEFAULT_KLIQUEASP_PROJECT_NAME,
    normalizeKliqueAspProjectName,
    parseKliqueAspProject
  } from "$lib/kliqueasp/graph/projectFile";
  import { GraphJsonUploadReadError } from "$lib/kliqueasp/graph/graphJsonUpload";
  import { GraphJsonTextParseError, parseGraphJsonTexts, type GraphJsonTextInput } from "$lib/kliqueasp/graph/graphJsonText";
  import { parseWorkspaceExampleId, type WorkspaceExampleId } from "$lib/kliqueasp/graph/exampleCatalog";
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
  const DEFAULT_PROJECT_NAME = "Rete demo";

  let configText = DEFAULT_CONFIG_TEXT;
  let datasetText = DEFAULT_DATASET_TEXT;

  let graphConfig: any = JSON.parse(DEFAULT_CONFIG_TEXT);
  let graphData: any = normalizeDataset(JSON.parse(DEFAULT_DATASET_TEXT));
  let appliedConfigText = DEFAULT_CONFIG_TEXT;
  let appliedDatasetText = DEFAULT_DATASET_TEXT;
  let appliedGraphKey = createWorkbenchGraphKey(appliedConfigText, appliedDatasetText);
  let projectName = DEFAULT_PROJECT_NAME;

  let graphKey = 0;
  let nodeLabelsVisible = true;
  let GraphAppComponent: any = null;
  let graphAppLoading = true;
  let graphAppLoadError = "";
  let graphAppLoadAttempt = 0;
  let bitcoinLoadStatus: "idle" | "loading" | "failed" | "complete" = "idle";
  let bitcoinLoadedEdges = 0;
  let bitcoinFailedShardIndex = 0;
  let bitcoinLoadError = "";
  let bitcoinLoadNotice = "";
  let bitcoinEdges: any[] = [];
  let errorMessage = "";
  let errorTechnicalDetails = "";
  let errorInput: GraphJsonTextInput | "" = "";
  let editorOpen = false;
  let projectDirty = false;
  let navigationHistory: WorkbenchHistoryEntry[] = [];
  let analysisSessionState: WorkbenchAnalysisSessionSnapshot | null = null;
  let analysisArchiveState: WorkbenchAnalysisArchiveSnapshot | null = null;
  let sessionReady = false;
  let sessionPersistenceEnabled = true;
  let sessionRestored = false;
  let sessionStatus = "";
  let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let skipNextSessionSave = false;

  type WorkspaceStartAction = "data" | "project" | "example";

  function readWorkspaceStartAction(search: string): WorkspaceStartAction | null {
    const action = new URLSearchParams(search).get("start");
    return action === "data" || action === "project" || action === "example" ? action : null;
  }

  function readWorkspaceExampleId(search: string): WorkspaceExampleId {
    return parseWorkspaceExampleId(new URLSearchParams(search).get("example"));
  }

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

  $: sessionSnapshot = sessionReady && sessionPersistenceEnabled ? {
    version: 3 as const,
    draftConfigText: configText,
    draftDatasetText: datasetText,
    appliedConfigText: appliedConfigText !== configText ? appliedConfigText : undefined,
    appliedDatasetText: appliedDatasetText !== datasetText ? appliedDatasetText : undefined,
    projectName: normalizeKliqueAspProjectName(projectName),
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
    const startAction = readWorkspaceStartAction(window.location.search);
    const exampleId = readWorkspaceExampleId(window.location.search);
    if (startAction) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("start");
      if (startAction === "example") cleanUrl.searchParams.delete("example");
      window.history.replaceState(window.history.state, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
    const flushSessionBeforeLeaving = () => {
      if (!sessionReady || !sessionPersistenceEnabled) return;
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
    if (startAction === "example") {
      sessionPersistenceEnabled = false;
      sessionStatus = "Esempio aperto in una scheda isolata. Esporta il progetto per conservarne una copia.";
      void loadWorkspaceExample(exampleId).finally(() => {
        sessionReady = true;
      });
    } else {
      void restoreWorkbenchSession().then(() => {
        if (startAction === "data" || startAction === "project") editorOpen = true;
      });
    }
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
    errorTechnicalDetails,
    errorInput,
    projectName,
    projectDirty,
    sessionStatus,

    onConfigTextChange: (value: string) => {
      configText = value;
      projectDirty = true;
      errorMessage = "";
      errorTechnicalDetails = "";
      errorInput = "";
    },

    onDatasetTextChange: (value: string, sourceName?: string) => {
      datasetText = value;
      if (sourceName) projectName = normalizeKliqueAspProjectName(sourceName);
      projectDirty = true;
      errorMessage = "";
      errorTechnicalDetails = "";
      errorInput = "";
    },

    onProjectNameChange: (value: string) => {
      projectName = value;
      projectDirty = true;
    },

    onApply: applyJson,

    onCreateProject: createNewProject,

    onReset: resetEditors,

    onLoadProject: loadProject,

    onSaveProject: saveProject,

    onOpen: () => {
      if (bitcoinLoadStatus === "loading" || bitcoinLoadStatus === "failed") {
        bitcoinLoadNotice = "Dati e progetto si sbloccano quando termina il caricamento.";
        return;
      }
      editorOpen = true;
    },

    onClose: () => {
      editorOpen = false;
    }
  };

  function applyJson() {
    try {
      const { graphConfig: parsedConfig, graphData: parsedDataset } = parseGraphJsonTexts(configText, datasetText);

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
      errorTechnicalDetails = "";
      errorInput = "";
    } catch (error: unknown) {
      if (error instanceof GraphJsonTextParseError) {
        errorMessage = error.message;
        errorTechnicalDetails = error.technicalDetails;
        errorInput = error.input;
      } else {
        errorMessage = "Impossibile applicare il grafo. Verifica i dati e riprova.";
        errorTechnicalDetails = error instanceof Error ? error.message : String(error ?? "Errore non specificato.");
        errorInput = "";
      }
    }
  }

  function loadProject(project: unknown) {
    errorMessage = "";
    errorTechnicalDetails = "";
    errorInput = "";
    const parsedProject = parseKliqueAspProject(project);
    configText = JSON.stringify(parsedProject.graphConfig, null, 2);
    datasetText = JSON.stringify(parsedProject.graphData, null, 2);
    applyJson();
    if (errorMessage) {
      const message = errorMessage;
      const technicalDetails = errorTechnicalDetails;
      errorMessage = "";
      errorTechnicalDetails = "";
      errorInput = "";
      throw new GraphJsonUploadReadError(message, technicalDetails);
    }
    projectName = parsedProject.name ?? "Progetto importato";
    projectDirty = false;
    editorOpen = false;
  }

  function createNewProject() {
    projectName = "Nuovo progetto";
    configText = DEFAULT_CONFIG_TEXT;
    datasetText = JSON.stringify({ nodes: [], edges: [] }, null, 2);
    applyJson();
    projectDirty = true;
  }

  function saveProject() {
    if (bitcoinLoadStatus === "loading" || bitcoinLoadStatus === "failed") {
      return "Attendi il caricamento completo di Bitcoin OTC prima di esportare il progetto.";
    }
    try {
      const project = buildKliqueAspProject(JSON.parse(configText), JSON.parse(datasetText), projectName);
      projectName = project.name ?? DEFAULT_KLIQUEASP_PROJECT_NAME;
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = createKliqueAspProjectFilename(projectName);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      errorMessage = "";
      errorTechnicalDetails = "";
      errorInput = "";
      projectDirty = false;
      return `Richiesta di download inviata al browser: ${anchor.download}`;
    } catch (error: any) {
      errorMessage = "Il progetto non è stato esportato. Verifica configurazione e dataset, poi riprova.";
      errorTechnicalDetails = error instanceof Error ? error.message : String(error ?? "Errore non specificato.");
      errorInput = "";
    }
  }

  function resetEditors() {
    projectName = DEFAULT_PROJECT_NAME;
    configText = DEFAULT_CONFIG_TEXT;
    datasetText = DEFAULT_DATASET_TEXT;
    applyJson();
    projectDirty = true;
  }

  function loadDavisExample() {
    projectName = "Davis Southern Women";
    configText = JSON.stringify(davisConfig, null, 2);
    datasetText = JSON.stringify(davisDataset, null, 2);
    applyJson();
    projectDirty = true;
  }

  function loadKarateExample() {
    projectName = "Karate Club";
    configText = JSON.stringify(karateConfig, null, 2);
    datasetText = JSON.stringify(karateDataset, null, 2);
    applyJson();
    projectDirty = true;
  }

  async function loadWorkspaceExample(exampleId: WorkspaceExampleId) {
    switch (exampleId) {
      case "davis-southern-women":
        loadDavisExample();
        break;
      case "gahuku-gama-signed":
        loadGahukuGamaExample();
        break;
      case "temporal-edge-projection":
        loadTemporalEdgeExample();
        break;
      case "sociopatterns-invs-100-minute":
        loadInVSExample();
        break;
      case "sociopatterns-invs-full":
        await loadFullInVSExample();
        break;
      case "synthetic-graph":
        loadSyntheticGraphExample(false);
        break;
      case "synthetic-graph-directed":
        loadSyntheticGraphExample(true);
        break;
      case "bitcoin-otc":
        await loadBitcoinOtcExample();
        break;
      case "karate-club":
      default:
        loadKarateExample();
        break;
    }
  }

  function loadGahukuGamaExample() {
    projectName = "Gahuku-Gama";
    configText = JSON.stringify(gahukuGamaConfig, null, 2);
    datasetText = JSON.stringify(gahukuGamaDataset, null, 2);
    applyJson();
    projectDirty = true;
  }

  function loadTemporalEdgeExample() {
    projectName = "Rete temporale";
    configText = JSON.stringify(temporalEdgeConfig, null, 2);
    datasetText = JSON.stringify(temporalEdgeDataset, null, 2);
    applyJson();
    projectDirty = true;
  }

  function loadInVSExample() {
    projectName = "SocioPatterns InVS";
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
      projectName = "SocioPatterns InVS completo";
      configText = JSON.stringify(invsFullConfig, null, 2);
      datasetText = JSON.stringify(fullDataset, null, 2);
      applyJson();
      projectDirty = true;
    } catch (error: any) {
      errorMessage = "Impossibile caricare il dataset InVS completo. Controlla la connessione e riprova.";
      errorTechnicalDetails = error instanceof Error ? error.message : String(error ?? "Errore non specificato.");
      errorInput = "";
    }
  }

  function loadSyntheticGraphExample(directed: boolean) {
    projectName = directed ? "Synthetic Graph · orientato" : "Synthetic Graph";
    configText = JSON.stringify(directed ? syntheticGraphDirectedConfig : syntheticGraphConfig, null, 2);
    datasetText = JSON.stringify(syntheticGraphDataset, null, 2);
    applyJson();
    projectDirty = true;
  }

  async function loadBitcoinOtcExample() {
    try {
      bitcoinLoadStatus = "loading";
      bitcoinLoadedEdges = 0;
      bitcoinFailedShardIndex = 0;
      bitcoinLoadError = "";
      bitcoinLoadNotice = "";
      bitcoinEdges = [];
      const response = await fetch(`${base}/examples/${bitcoinOtcManifest.bootstrapPath}`);
      if (!response.ok) throw new Error(`HTTP ${response.status} caricando il periodo iniziale Bitcoin OTC.`);
      const bootstrap = await response.json();
      if (bootstrap?.nodes?.length !== bitcoinOtcManifest.nodeCount ||
        bootstrap?.edges?.length !== bitcoinOtcManifest.initialWindowEdgeCount) {
        throw new Error("Il pacchetto iniziale Bitcoin OTC non corrisponde al manifest.");
      }
      projectName = "Bitcoin OTC · SNAP";
      configText = JSON.stringify(bitcoinOtcConfig, null, 2);
      datasetText = JSON.stringify(bootstrap);
      bitcoinEdges = [...bootstrap.edges];
      bitcoinLoadedEdges = bitcoinEdges.length;
      applyJson();
      projectDirty = true;
      void continueBitcoinOtcLoading(0);
    } catch (error: any) {
      bitcoinLoadStatus = "failed";
      bitcoinLoadError = error instanceof Error ? error.message : String(error ?? "Errore non specificato.");
      errorMessage = "Impossibile caricare il dataset Bitcoin OTC. Controlla la connessione e riprova.";
      errorTechnicalDetails = bitcoinLoadError;
      errorInput = "";
    }
  }

  function waitForWorkspaceFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async function continueBitcoinOtcLoading(startIndex: number) {
    if (bitcoinLoadStatus === "loading" && startIndex > 0) return;
    bitcoinLoadStatus = "loading";
    bitcoinLoadError = "";
    bitcoinLoadNotice = "";
    try {
      if (startIndex === 0) {
        // Let the ready initial projection mount before downloading the remaining archive.
        await waitForWorkspaceFrame();
        await waitForWorkspaceFrame();
      }
      for (let index = startIndex; index < bitcoinOtcManifest.shards.length; index += 1) {
        const shard = bitcoinOtcManifest.shards[index];
        const response = await fetch(`${base}/examples/${shard.path}`);
        if (!response.ok) throw new Error(`HTTP ${response.status} caricando il pacchetto ${index + 1} di Bitcoin OTC.`);
        const payload = await response.json();
        if (!Array.isArray(payload?.edges) || payload.edges.length !== shard.edgeCount) {
          throw new Error(`Il pacchetto ${index + 1} di Bitcoin OTC è incompleto.`);
        }
        bitcoinEdges = [...bitcoinEdges, ...payload.edges];
        bitcoinFailedShardIndex = index + 1;
        bitcoinLoadedEdges = bitcoinEdges.length;
        await waitForWorkspaceFrame();
      }

      if (bitcoinEdges.length !== bitcoinOtcManifest.edgeCount) {
        throw new Error("Il numero totale dei rating Bitcoin OTC non corrisponde al manifest.");
      }
      const fullEdges = [...bitcoinEdges].sort((left, right) => Number(left.validFrom) - Number(right.validFrom));
      const fullDataset = { ...graphData, edges: fullEdges };
      graphData = fullDataset;
      datasetText = JSON.stringify(fullDataset);
      appliedDatasetText = datasetText;
      bitcoinLoadStatus = "complete";
      bitcoinLoadError = "";
      bitcoinLoadNotice = "";
    } catch (error: unknown) {
      bitcoinLoadStatus = "failed";
      bitcoinLoadError = error instanceof Error ? error.message : String(error ?? "Errore non specificato.");
      errorMessage = "Il periodo iniziale è pronto, ma il resto del dataset Bitcoin OTC non è stato caricato.";
      errorTechnicalDetails = bitcoinLoadError;
      errorInput = "";
    }
  }

  function retryBitcoinOtcLoading() {
    if (bitcoinEdges.length === 0) void loadBitcoinOtcExample();
    else void continueBitcoinOtcLoading(bitcoinFailedShardIndex);
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
        projectName = snapshot.projectName ?? DEFAULT_PROJECT_NAME;
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
      projectName: normalizeKliqueAspProjectName(projectName),
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
        <button type="button" onclick={loadGraphApp}>Riprova</button>
      </div>
    </main>
  {:else if sessionReady && GraphAppComponent}
    {#key graphKey}
      <svelte:component
        this={GraphAppComponent}
        {graphConfig}
        {graphData}
        datasetIsComplete={bitcoinLoadStatus === "idle" || bitcoinLoadStatus === "complete"}
        incrementalDatasetUpdates={graphData?.datasetMetadata?.id === "bitcoin-otc"}
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
  {#if bitcoinLoadStatus === "loading" || bitcoinLoadStatus === "failed"}
    <section class="bitcoin-load-banner" aria-label="Caricamento del dataset Bitcoin OTC">
      <div class="bitcoin-load-copy">
        <strong>Bitcoin OTC</strong>
        <p role="status" aria-live="polite" aria-atomic="true">
          {#if bitcoinLoadNotice}
            {bitcoinLoadNotice}
          {:else if bitcoinLoadStatus === "failed"}
            {bitcoinEdges.length > 0
              ? `Il periodo iniziale è pronto; caricati ${bitcoinLoadedEdges.toLocaleString("it-IT")} di ${bitcoinOtcManifest.edgeCount.toLocaleString("it-IT")} rating.`
              : "Non è stato caricato il pacchetto iniziale."}
          {:else if bitcoinLoadedEdges < bitcoinOtcManifest.initialWindowEdgeCount}
            Preparazione della finestra iniziale…
          {:else}
            Finestra iniziale pronta · scaricati {bitcoinLoadedEdges.toLocaleString("it-IT")} di {bitcoinOtcManifest.edgeCount.toLocaleString("it-IT")} rating
          {/if}
        </p>
      </div>
      <progress
        max={bitcoinOtcManifest.edgeCount}
        value={bitcoinLoadedEdges}
        aria-label="Avanzamento caricamento Bitcoin OTC"
      ></progress>
      {#if bitcoinLoadStatus === "failed"}
        <button type="button" onclick={retryBitcoinOtcLoading}>Riprendi</button>
      {/if}
    </section>
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
    font: 500 14px/1.4 Arial, Helvetica, sans-serif;
  }

  .bitcoin-load-banner {
    position: fixed;
    z-index: 1100;
    top: 66px;
    left: 50%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px 14px;
    width: min(460px, calc(100vw - 28px));
    box-sizing: border-box;
    padding: 11px 14px;
    transform: translateX(-50%);
    border: 1px solid rgba(148, 163, 184, 0.38);
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.96);
    color: #f8fafc;
    box-shadow: 0 10px 32px rgba(2, 6, 23, 0.32);
    font: 12px/1.4 Arial, Helvetica, sans-serif;
  }

  .bitcoin-load-copy { min-width: 0; }
  .bitcoin-load-copy strong { font-size: 12px; }
  .bitcoin-load-copy p { margin: 2px 0 0; color: #cbd5e1; }
  .bitcoin-load-banner progress { grid-column: 1; width: 100%; height: 7px; align-self: center; accent-color: #38bdf8; }
  .bitcoin-load-banner button {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    padding: 7px 11px;
    border: 1px solid #64748b;
    border-radius: 8px;
    background: #1e293b;
    color: #fff;
    font: inherit;
    cursor: pointer;
  }
  .bitcoin-load-banner button:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 2px; }

  @media (max-width: 520px) {
    .bitcoin-load-banner { top: 58px; padding: 9px 11px; }
  }

  .workspace-load-error {
    display: grid;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    place-items: center;
    padding: 24px;
    color: #e2e8f0;
    font: 500 14px/1.5 Arial, Helvetica, sans-serif;
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
