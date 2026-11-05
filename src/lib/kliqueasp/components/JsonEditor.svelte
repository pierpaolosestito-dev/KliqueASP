<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte";
  import { base } from "$app/paths";
  import { getGraphExampleCatalog } from "../graph/exampleCatalog";
  import { GraphJsonUploadReadError, readGraphJsonUpload } from "../graph/graphJsonUpload.ts";
  import { collectGraphFieldPaths, GRAPH_FIELD_DISCOVERY_SAMPLE_LIMIT, updateGraphAttributeMapping, updateGraphFieldMapping } from "../graph/graphFieldMapping.ts";
  import { getSolverTaskTimeoutSeconds, setSolverTaskTimeoutSeconds } from "../graph/solverTimeoutSetting.ts";
  import { MAX_KLIQUEASP_PROJECT_NAME_LENGTH } from "../graph/projectFile.ts";
  import { buildGraphInputPreview, formatGraphDiagnostic, inspectGraphInput, type GraphInputInspection } from "../graph/graphInputValidation.ts";
  import type { GraphJsonTextInput } from "../graph/graphJsonText.ts";
  import { announceWorkbenchStatus } from "../workbenchAnnouncement.ts";
  import ResultListPager from "./ResultListPager.svelte";
  import SearchableFieldSelect from "./SearchableFieldSelect.svelte";
  import JsonCodeEditor from "./JsonCodeEditor.svelte";
  export let open: boolean = false;
  export let focusReturnTarget: HTMLElement | null = null;

  export let configText: string = "";
  export let datasetText: string = "";
  export let errorMessage: string = "";
  export let errorTechnicalDetails: string = "";
  export let errorInput: GraphJsonTextInput | "" = "";
  export let projectName: string = "Progetto senza nome";
  export let sessionStatus: string = "";

  export let onConfigTextChange: (value: string) => void = () => {};
  export let onDatasetTextChange: (value: string, sourceName?: string) => void = () => {};
  export let onProjectNameChange: (value: string) => void = () => {};
  export let onApply: () => void = () => {};
  export let onCreateProject: () => void = () => {};
  export let onReset: () => void = () => {};
  export let onLoadProject: (project: unknown) => void = () => {};
  export let onSaveProject: () => string | void = () => {};
  export let onClose: () => void = () => {};

  let fileMessage = "";
  let fileError = "";
  let fileErrorDetails = "";
  let projectFileInput: HTMLInputElement | null = null;
  let newProjectButton: HTMLButtonElement | null = null;
  let newProjectCancelButton: HTMLButtonElement | null = null;
  let resetExampleButton: HTMLButtonElement | null = null;
  let resetCancelButton: HTMLButtonElement | null = null;
  let panelElement: HTMLElement | null = null;
  let panelHeading: HTMLHeadingElement | null = null;
  let compactViewport = false;
  let wasOpen = false;
  let showResetConfirmation = false;
  let showNewProjectConfirmation = false;
  const workspaceExamples = getGraphExampleCatalog(base).filter((example) => example.opensWorkspaceExample);

  onMount(() => {
    const mediaQuery = window.matchMedia("(max-width: 600px)");
    const updateCompactViewport = () => {
      compactViewport = mediaQuery.matches;
    };
    updateCompactViewport();
    mediaQuery.addEventListener("change", updateCompactViewport);
    return () => mediaQuery.removeEventListener("change", updateCompactViewport);
  });

  function isInsideClosedDetailsContent(element: HTMLElement): boolean {
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      if (!(current instanceof HTMLDetailsElement) || current.open) continue;
      const summary = current.querySelector<HTMLElement>(":scope > summary");
      if (!summary?.contains(element)) return true;
    }
    return false;
  }

  function isVisibleFocusTarget(element: HTMLElement | null): element is HTMLElement {
    if (!element?.isConnected || element.getClientRects().length === 0 || isInsideClosedDetailsContent(element)) {
      return false;
    }

    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (
        current.hidden || current.inert || current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0
      ) {
        return false;
      }
    }

    return true;
  }

  function isPanelTabStop(element: HTMLElement): boolean {
    if (!element.isConnected || element.getClientRects().length === 0 || isInsideClosedDetailsContent(element)) {
      return false;
    }

    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (
        current.hidden || current.inert || current.getAttribute("aria-hidden") === "true" ||
        style.display === "none" || style.visibility === "hidden"
      ) {
        return false;
      }
    }

    return element.tabIndex >= 0;
  }

  async function restorePanelFocus() {
    await tick();
    // The app removes `inert` from the background in a MutationObserver after
    // this panel closes. Let that observer run before attempting to focus the
    // control that opened the panel.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (isVisibleFocusTarget(focusReturnTarget)) {
      focusReturnTarget.focus({ preventScroll: true });
      return;
    }

    document.querySelector<HTMLElement>(".app-root .toolbar .toolbar-button:not([disabled])")?.focus({ preventScroll: true });
  }

  function handlePanelKeydown(event: KeyboardEvent) {
    if (!open) return;

    if (event.key === "Escape" && !showResetConfirmation) {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab" || !compactViewport || !panelElement) return;

    const focusable = [...panelElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )].filter(isPanelTabStop);
    if (!focusable.length) {
      event.preventDefault();
      panelHeading?.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    if (!panelElement.contains(activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    } else if (event.shiftKey && (activeElement === first || activeElement === panelHeading)) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  $: {
    if (open && !wasOpen) {
      wasOpen = true;
      void tick().then(() => {
        if (open) panelHeading?.focus({ preventScroll: true });
      });
    } else if (!open && wasOpen) {
      wasOpen = false;
      void restorePanelFocus();
    }
  }

  function clearFileError() {
    fileError = "";
    fileErrorDetails = "";
  }

  async function requestResetConfirmation() {
    showNewProjectConfirmation = false;
    showResetConfirmation = true;
    await tick();
    resetCancelButton?.focus();
  }

  async function requestNewProjectConfirmation() {
    showResetConfirmation = false;
    showNewProjectConfirmation = true;
    await tick();
    newProjectCancelButton?.focus();
  }

  async function cancelNewProjectConfirmation() {
    showNewProjectConfirmation = false;
    await tick();
    newProjectButton?.focus();
  }

  function handleNewProjectConfirmationKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    void cancelNewProjectConfirmation();
  }

  async function confirmNewProject() {
    showNewProjectConfirmation = false;
    onCreateProject();
    await tick();
    newProjectButton?.focus();
  }

  async function cancelResetConfirmation() {
    showResetConfirmation = false;
    await tick();
    resetExampleButton?.focus();
  }

  function handleResetConfirmationKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    void cancelResetConfirmation();
  }

  async function confirmResetExample() {
    showResetConfirmation = false;
    onReset();
    await tick();
    resetExampleButton?.focus();
  }

  export function openProjectPicker() {
    projectFileInput?.click();
  }

  function requestProjectExport() {
    fileMessage = "";
    clearFileError();
    const status = onSaveProject();
    if (status) fileMessage = status;
  }

  let nodeFieldPaths: string[] = [];
  let edgeFieldPaths: string[] = [];
  let fieldDiscoveryStats = { nodeSampleCount: 0, nodeRecordCount: 0, edgeSampleCount: 0, edgeRecordCount: 0 };
  let inspectedDatasetText = "";
  let inspectionTimer: ReturnType<typeof setTimeout> | null = null;
  let validationTimer: ReturnType<typeof setTimeout> | null = null;
  let inspectedConfigValidationText: string | null = null;
  let inspectedDatasetValidationText: string | null = null;
  let draftValidation: GraphInputInspection | null = null;
  let draftValidationPending = false;
  let showAllDraftDiagnostics = false;
  const DRAFT_DIAGNOSTICS_PAGE_SIZE = 20;
  let visibleDraftDiagnosticLimit = DRAFT_DIAGNOSTICS_PAGE_SIZE;
  const ATTRIBUTE_MAPPING_PAGE_SIZE = 20;
  let visibleNodeAttributeLimit = ATTRIBUTE_MAPPING_PAGE_SIZE;
  let visibleEdgeAttributeLimit = ATTRIBUTE_MAPPING_PAGE_SIZE;
  let nodeMapping: Record<string, any> = {};
  let edgeMapping: Record<string, any> = {};
  let nodeAttributeAlias = "";
  let nodeAttributePath = "";
  let edgeAttributeAlias = "";
  let edgeAttributePath = "";
  $: nodeAttributeAddBlocker = !nodeAttributeAlias.trim() && !nodeAttributePath
    ? "Inserisci un nome e scegli il campo JSON da associare."
    : !nodeAttributeAlias.trim()
      ? "Inserisci il nome del nuovo attributo nodo."
      : !nodeAttributePath
        ? "Scegli il campo JSON da associare al nuovo attributo nodo."
        : "";
  $: edgeAttributeAddBlocker = !edgeAttributeAlias.trim() && !edgeAttributePath
    ? "Inserisci un nome e scegli il campo JSON da associare."
    : !edgeAttributeAlias.trim()
      ? "Inserisci il nome del nuovo attributo arco."
      : !edgeAttributePath
        ? "Scegli il campo JSON da associare al nuovo attributo arco."
        : "";
  const previewPalette = ["#2a9186", "#3978a8", "#8d6bb0", "#c77942", "#568a55", "#b45f72"];

  $: draftPreview = draftValidation?.status !== "error"
    ? buildGraphInputPreview(draftValidation?.previewNodes ?? [], draftValidation?.previewLinks ?? [], draftValidation?.edgeCount ?? 0)
    : buildGraphInputPreview([], [], 0);
  $: additionalDraftDiagnostics = draftValidation?.diagnostics.slice(6) ?? [];
  $: visibleAdditionalDraftDiagnostics = additionalDraftDiagnostics.slice(0, visibleDraftDiagnosticLimit);
  $: nodeFieldSearchOptions = nodeFieldPaths.map((path) => ({ value: path, label: path }));
  $: edgeFieldSearchOptions = edgeFieldPaths.map((path) => ({ value: path, label: path }));
  $: nodeAttributeEntries = Object.entries(nodeMapping.attributes ?? {}).reverse();
  $: edgeAttributeEntries = Object.entries(edgeMapping.attributes ?? {}).reverse();
  $: visibleNodeAttributeEntries = nodeAttributeEntries.slice(0, visibleNodeAttributeLimit);
  $: visibleEdgeAttributeEntries = edgeAttributeEntries.slice(0, visibleEdgeAttributeLimit);
  $: draftPreviewNodes = draftPreview.nodes.map((node, index, nodes) => {
        const hash = [...node.type].reduce((value, character) => value + character.charCodeAt(0), 0);
        const angle = nodes.length === 1 ? 0 : (Math.PI * 2 * index) / nodes.length - Math.PI / 2;
        return {
          ...node,
          x: nodes.length === 1 ? 300 : 300 + Math.cos(angle) * 190,
          y: nodes.length === 1 ? 106 : 106 + Math.sin(angle) * 72,
          color: previewPalette[hash % previewPalette.length]
        };
      });
  $: draftPreviewPositions = new Map(draftPreviewNodes.map((node) => [node.id, node]));
  $: draftPreviewLinks = draftPreview.links;

  $: {
    const currentConfig = parseRecord(configText);
    const graphMapping = isRecord(currentConfig?.graphMapping) ? currentConfig.graphMapping : {};
    nodeMapping = isRecord(graphMapping.node) ? graphMapping.node : {};
    edgeMapping = isRecord(graphMapping.edge) ? graphMapping.edge : {};
  }
  $: multigraphNeedsId = edgeMapping.identity === "multigraph" && !edgeMapping.idField;
  $: solverTaskTimeoutSeconds = getSolverTaskTimeoutSeconds(parseRecord(configText));
  $: if (open && datasetText !== inspectedDatasetText) scheduleFieldInspection(datasetText);
  $: if (open && (configText !== inspectedConfigValidationText || datasetText !== inspectedDatasetValidationText)) {
    scheduleDraftValidation(configText, datasetText);
  }
  $: if (!open && showResetConfirmation) showResetConfirmation = false;

  function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function parseRecord(text: string): Record<string, any> | null {
    try {
      const parsed: unknown = JSON.parse(text);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function scheduleFieldInspection(text: string) {
    if (inspectionTimer) clearTimeout(inspectionTimer);
    if (text !== inspectedDatasetText) {
      visibleNodeAttributeLimit = ATTRIBUTE_MAPPING_PAGE_SIZE;
      visibleEdgeAttributeLimit = ATTRIBUTE_MAPPING_PAGE_SIZE;
    }
    inspectionTimer = setTimeout(() => {
      const dataset = parseRecord(text);
      nodeFieldPaths = collectGraphFieldPaths(dataset, "nodes");
      const edgeCollection = Array.isArray(dataset?.edges) ? "edges" : "links";
      edgeFieldPaths = collectGraphFieldPaths(dataset, edgeCollection);
      const nodeRecords = Array.isArray(dataset?.nodes) ? dataset.nodes : [];
      const edgeRecords = Array.isArray(dataset?.[edgeCollection]) ? dataset[edgeCollection] : [];
      fieldDiscoveryStats = {
        nodeSampleCount: Math.min(nodeRecords.length, GRAPH_FIELD_DISCOVERY_SAMPLE_LIMIT),
        nodeRecordCount: nodeRecords.length,
        edgeSampleCount: Math.min(edgeRecords.length, GRAPH_FIELD_DISCOVERY_SAMPLE_LIMIT),
        edgeRecordCount: edgeRecords.length
      };
      inspectedDatasetText = text;
      inspectionTimer = null;
    }, 300);
  }

  function scheduleDraftValidation(config: string, dataset: string) {
    if (validationTimer) clearTimeout(validationTimer);
    draftValidationPending = true;
    showAllDraftDiagnostics = false;
    visibleDraftDiagnosticLimit = DRAFT_DIAGNOSTICS_PAGE_SIZE;
    validationTimer = setTimeout(() => {
      draftValidation = inspectGraphInput(config, dataset);
      inspectedConfigValidationText = config;
      inspectedDatasetValidationText = dataset;
      draftValidationPending = false;
      validationTimer = null;
    }, 500);
  }

  function showMoreDraftDiagnostics() {
    visibleDraftDiagnosticLimit += DRAFT_DIAGNOSTICS_PAGE_SIZE;
  }

  function diagnosticTarget(code: string): { id: string; label: string } {
    const normalizedCode = code.toLowerCase();
    if (normalizedCode.includes("node") && normalizedCode.includes("id")) {
      return { id: "mapping-node-id", label: "Vai alla mappatura" };
    }
    if (normalizedCode.includes("node") && normalizedCode.includes("type")) {
      return { id: "mapping-node-type", label: "Vai alla mappatura" };
    }
    if (normalizedCode.includes("endpoint")) {
      return { id: normalizedCode.includes("target") ? "mapping-edge-target" : "mapping-edge-source", label: "Vai alla mappatura" };
    }
    if (normalizedCode.includes("edge") && normalizedCode.includes("id")) {
      return { id: "mapping-edge-id", label: "Vai alla mappatura" };
    }
    if (normalizedCode.includes("edge") && (normalizedCode.includes("identity") || normalizedCode.includes("simple-edge"))) {
      return { id: "mapping-edge-identity", label: "Vai alla mappatura" };
    }
    if (normalizedCode.includes("edge") && normalizedCode.includes("type")) {
      return { id: "mapping-edge-type", label: "Vai alla mappatura" };
    }
    if (normalizedCode.includes("edge") && normalizedCode.includes("direction")) {
      return { id: "mapping-edge-direction", label: "Vai alla mappatura" };
    }
    if (normalizedCode.includes("config-json") || normalizedCode.includes("config-root") || normalizedCode.includes("graph-config")) {
      return { id: "graph-config", label: "Apri configurazione JSON" };
    }
    if (normalizedCode.includes("capability") || normalizedCode.includes("mapping")) {
      return { id: "advanced-mapping-summary", label: "Rivedi la mappatura" };
    }
    return { id: "graph-dataset", label: "Apri dati del grafo (JSON)" };
  }

  function focusDiagnostic(code: string) {
    const targetInfo = diagnosticTarget(code);
    if (targetInfo.id === "advanced-mapping-summary") {
      const details = document.getElementById("advanced-mapping") as HTMLDetailsElement | null;
      if (details) details.open = true;
    }
    const target = document.getElementById(targetInfo.id) as HTMLElement | null;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }

  function updateMappingField(scope: "node" | "edge", field: string, value: string) {
    const config = parseRecord(configText);
    const dataset = parseRecord(datasetText);
    if (!config) {
      fileError = "Correggi prima il JSON della configurazione per modificare la mappatura.";
      fileErrorDetails = "";
      return;
    }
    try {
      const updated = updateGraphFieldMapping(config, dataset, scope, field, value);
      onConfigTextChange(JSON.stringify(updated, null, 2));
      clearFileError();
      fileMessage = "Mappatura aggiornata. Applica il grafo per ricalcolare la rete.";
    } catch (error) {
      fileError = error instanceof Error ? error.message : "Mappatura non aggiornata.";
      fileErrorDetails = "";
    }
  }

  function updateAttributeMapping(scope: "node" | "edge", alias: string, path: string) {
    const config = parseRecord(configText);
    const dataset = parseRecord(datasetText);
    if (!config) {
      fileError = "Correggi prima il JSON della configurazione per modificare gli attributi.";
      fileErrorDetails = "";
      return;
    }
    try {
      const updated = updateGraphAttributeMapping(config, dataset, scope, alias, path);
      onConfigTextChange(JSON.stringify(updated, null, 2));
      clearFileError();
      fileMessage = "Attributo aggiornato. Applica il grafo per ricalcolare le analisi.";
    } catch (error) {
      fileError = error instanceof Error ? error.message : "Attributo non aggiornato.";
      fileErrorDetails = "";
    }
  }

  function updateSolverTaskTimeout(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const config = parseRecord(configText);
    if (!input.validity.valid) {
      fileError = "Inserisci un limite di calcolo compreso tra 1 e 300 secondi.";
      fileErrorDetails = "";
      return;
    }
    if (!config) {
      fileError = "Correggi prima il JSON della configurazione per modificare il limite di calcolo.";
      fileErrorDetails = "";
      return;
    }
    try {
      const updated = setSolverTaskTimeoutSeconds(config, input.valueAsNumber);
      onConfigTextChange(JSON.stringify(updated, null, 2));
      clearFileError();
      fileMessage = "Limite di calcolo aggiornato. Applica il grafo per usarlo.";
    } catch (error) {
      fileError = error instanceof Error ? error.message : "Limite di calcolo non aggiornato.";
      fileErrorDetails = "";
    }
  }

  function addAttributeMapping(scope: "node" | "edge") {
    const alias = scope === "node" ? nodeAttributeAlias : edgeAttributeAlias;
    const path = scope === "node" ? nodeAttributePath : edgeAttributePath;
    if (!path) {
      fileError = "Scegli un campo JSON da associare all'attributo.";
      fileErrorDetails = "";
      return;
    }
    updateAttributeMapping(scope, alias, path);
    if (!fileError) {
      if (scope === "node") {
        visibleNodeAttributeLimit = Math.max(visibleNodeAttributeLimit, ATTRIBUTE_MAPPING_PAGE_SIZE);
        nodeAttributeAlias = "";
        nodeAttributePath = "";
      } else {
        visibleEdgeAttributeLimit = Math.max(visibleEdgeAttributeLimit, ATTRIBUTE_MAPPING_PAGE_SIZE);
        edgeAttributeAlias = "";
        edgeAttributePath = "";
      }
    }
  }

  function showMoreNodeAttributeMappings() {
    visibleNodeAttributeLimit += ATTRIBUTE_MAPPING_PAGE_SIZE;
  }

  function showMoreEdgeAttributeMappings() {
    visibleEdgeAttributeLimit += ATTRIBUTE_MAPPING_PAGE_SIZE;
  }

  async function loadJsonFile(event: Event, kind: "dataset" | "config" | "project") {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    fileMessage = "";
    clearFileError();
    try {
      const parsed = await readGraphJsonUpload(file, kind);
      if (kind === "dataset") {
        onDatasetTextChange(JSON.stringify(parsed, null, 2), file.name.replace(/\.[^.]+$/, ""));
        fileMessage = `Dataset caricato da ${file.name}. Applica il grafo per vedere le modifiche.`;
      } else if (kind === "config") {
        onConfigTextChange(JSON.stringify(parsed, null, 2));
        fileMessage = `Configurazione caricata da ${file.name}. Applica il grafo per vedere le modifiche.`;
      } else {
        onLoadProject(parsed);
        fileMessage = `Progetto caricato da ${file.name}.`;
        // Loading a project remounts the keyed GraphApp. Wait for its global
        // status listener before announcing the result.
        await tick();
        announceWorkbenchStatus(fileMessage);
        onClose();
        void restorePanelFocus();
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        fileError = "Il file selezionato non contiene JSON valido. Correggi la sintassi e riprova.";
        fileErrorDetails = error.message;
      } else if (error instanceof GraphJsonUploadReadError) {
        fileError = error.message;
        fileErrorDetails = error.technicalDetails;
      } else {
        fileError = error instanceof Error ? error.message : "Impossibile leggere il file JSON.";
        fileErrorDetails = "";
      }
    } finally {
      input.value = "";
    }
  }

  onDestroy(() => {
    if (inspectionTimer) clearTimeout(inspectionTimer);
    if (validationTimer) clearTimeout(validationTimer);
  });
</script>

<svelte:window on:keydown={handlePanelKeydown} />

{#if open}
  <aside
    class="json-editor-panel"
    role={compactViewport ? "dialog" : "complementary"}
    aria-modal={compactViewport ? "true" : undefined}
    aria-labelledby="json-editor-heading"
    bind:this={panelElement}
  >
    <div class="json-editor-header">
      <div>
        <p class="eyebrow">KLIQUEASP</p>
        <h1 id="json-editor-heading" tabindex="-1" bind:this={panelHeading}>Dati e configurazione</h1>
      </div>

      <button
        class="ghost-button"
        type="button"
        on:click={onClose}
      >
        Chiudi
      </button>
    </div>

    <div class="json-editor-body">
      <section class="data-actions" aria-label="Gestisci progetti e dati">
        <div class="project-management">
          <div class="project-identity">
            <label class="project-name-field" for="workbench-project-name">
              <span>Nome progetto</span>
              <input
                id="workbench-project-name"
                type="text"
                maxlength={MAX_KLIQUEASP_PROJECT_NAME_LENGTH}
                autocomplete="off"
                value={projectName}
                aria-describedby="project-name-hint"
                on:input={(event) => onProjectNameChange((event.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <p id="project-name-hint" class="project-name-hint">Nome incluso nel file progetto esportato.</p>
          </div>
          <div class="project-file-actions" role="group" aria-label="Azioni progetto">
            <button class="secondary-button" type="button" bind:this={newProjectButton} on:click={requestNewProjectConfirmation}>Nuovo progetto</button>
            <label class="file-button">
              <input type="file" accept=".json,application/json" bind:this={projectFileInput} on:change={(event) => loadJsonFile(event, "project")} />
              Apri progetto
            </label>
            <button class="secondary-button" type="button" on:click={requestProjectExport}>Esporta progetto</button>
          </div>
        </div>
        <div class="source-data-actions" role="group" aria-label="Carica dati e configurazione">
          <label class="file-button">
            <input type="file" accept=".json,application/json" on:change={(event) => loadJsonFile(event, "dataset")} />
            Carica dataset JSON
          </label>
          <label class="file-button">
            <input type="file" accept=".json,application/json" on:change={(event) => loadJsonFile(event, "config")} />
            Carica configurazione
          </label>
        </div>
        {#if showNewProjectConfirmation}
          <div
            class="reset-confirmation"
            role="group"
            aria-labelledby="new-project-confirmation-title"
            aria-describedby="new-project-confirmation-description"
            aria-live="polite"
          >
            <strong id="new-project-confirmation-title">Creare un progetto vuoto?</strong>
            <span id="new-project-confirmation-description">Nome, dati e configurazione correnti saranno sostituiti. Esporta il progetto per conservarne una copia.</span>
            <div class="reset-confirmation-actions">
              <button bind:this={newProjectCancelButton} class="secondary-button" type="button" on:click={cancelNewProjectConfirmation} on:keydown={handleNewProjectConfirmationKeydown}>Annulla</button>
              <button type="button" on:click={confirmNewProject} on:keydown={handleNewProjectConfirmationKeydown}>Crea progetto vuoto</button>
            </div>
          </div>
        {/if}
        <p
          class="session-status"
          class:has-message={Boolean(sessionStatus.trim())}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >{sessionStatus.trim()}</p>
        <p
          class="file-message"
          class:has-message={Boolean(fileMessage.trim())}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >{fileMessage.trim()}</p>
        {#if fileError}
          <div class="file-error">
            <p role="alert">{fileError}</p>
            {#if fileErrorDetails}
              <details>
                <summary>Dettagli tecnici</summary>
                <pre>{fileErrorDetails}</pre>
              </details>
            {/if}
          </div>
        {/if}
        <p class="file-hint">Un progetto contiene dataset e configurazione JSON. Il caricamento dei file singoli li prepara nell'editor; usa <strong>Applica grafo</strong> per aggiornare la rete.</p>
        <details class="example-list">
          <summary>Apri un esempio in una nuova scheda</summary>
          <div>
            {#each workspaceExamples as example (example.id)}
              <a class="example-link" href={example.href} target="_blank" rel="noopener">
                <strong>{example.title}</strong>
                <small>{example.description}</small>
              </a>
            {/each}
          </div>
        </details>
      </section>

      <section
        class="input-validation"
        class:error={draftValidation?.status === "error"}
        class:warning={draftValidation?.status === "warning"}
        aria-labelledby="input-validation-title"
      >
        <div class="validation-heading">
          <strong id="input-validation-title">Controllo prima dell'applicazione</strong>
          <span
            class="validation-state"
            class:has-message={Boolean(draftValidationPending || draftValidation)}
            class:pending={draftValidationPending}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {#if draftValidationPending}
              Controllo in corso…
            {:else if draftValidation?.status === "ready"}
              Pronto
            {:else if draftValidation?.status === "warning"}
              Pronto con avvisi
            {:else if draftValidation?.status === "error"}
              Da correggere
            {/if}
          </span>
        </div>
        {#if draftValidationPending}
          <p>Verifico struttura, mappatura e collegamenti al termine della modifica.</p>
        {:else if draftValidation}
          {#if draftValidation.nodeCount !== null && draftValidation.edgeCount !== null}
            <p>{draftValidation.nodeCount} nodi e {draftValidation.edgeCount} record d'arco nel dataset.</p>
            <p>
              Rete {draftValidation.direction === "directed" ? "orientata" : "non orientata"};
              tipi riconosciuti: {draftValidation.nodeTypeCount} {draftValidation.nodeTypeCount === 1 ? "tipo di nodo" : "tipi di nodo"}
              e {draftValidation.edgeTypeCount} {draftValidation.edgeTypeCount === 1 ? "tipo di arco" : "tipi di arco"};
              attributi opzionali mappati: {draftValidation.mappedAttributeCount} {draftValidation.mappedAttributeCount === 1 ? "attributo" : "attributi"}.
            </p>
          {:else}
            <p>I conteggi saranno disponibili quando entrambi i JSON saranno leggibili.</p>
          {/if}
          {#if draftValidation.errorCount > 0 || draftValidation.warningCount > 0}
            <p class="validation-counts">
              {#if draftValidation.errorCount > 0}{draftValidation.errorCount} {draftValidation.errorCount === 1 ? "errore bloccante" : "errori bloccanti"}{/if}
              {#if draftValidation.errorCount > 0 && draftValidation.warningCount > 0} · {/if}
              {#if draftValidation.warningCount > 0}{draftValidation.warningCount} {draftValidation.warningCount === 1 ? "avviso" : "avvisi"}{/if}
            </p>
            <ul class="validation-list">
              {#each draftValidation.diagnostics.slice(0, 6) as diagnostic}
                <li class:error={diagnostic.severity === "error"}>
                  <span>{formatGraphDiagnostic(diagnostic)}</span>
                  <button type="button" class="text-button" on:click={() => focusDiagnostic(diagnostic.code)}>
                    {diagnosticTarget(diagnostic.code).label}
                  </button>
                </li>
              {/each}
            </ul>
            {#if additionalDraftDiagnostics.length > 0}
              <details class="more-diagnostics" bind:open={showAllDraftDiagnostics}>
                <summary>Mostra altre {additionalDraftDiagnostics.length} diagnosi</summary>
                {#if showAllDraftDiagnostics}
                  <ul class="validation-list">
                    {#each visibleAdditionalDraftDiagnostics as diagnostic}
                      <li class:error={diagnostic.severity === "error"}>
                        <span>{formatGraphDiagnostic(diagnostic)}</span>
                        <button type="button" class="text-button" on:click={() => focusDiagnostic(diagnostic.code)}>
                          {diagnosticTarget(diagnostic.code).label}
                        </button>
                      </li>
                    {/each}
                  </ul>
                  <ResultListPager
                    total={additionalDraftDiagnostics.length}
                    visible={visibleAdditionalDraftDiagnostics.length}
                    pageSize={DRAFT_DIAGNOSTICS_PAGE_SIZE}
                    label="diagnosi aggiuntive"
                    showMore={showMoreDraftDiagnostics}
                  />
                {/if}
              </details>
            {/if}
          {:else}
            <p>Struttura e riferimenti del grafo sono validi.</p>
          {/if}
          {#if draftValidation.status !== "error" && draftValidation.nodeCount !== null}
            {#if draftValidation.nodeCount > 0}
              <figure class="draft-preview">
                <figcaption>{draftPreview.totalNodeCount > draftPreview.nodes.length ? "Anteprima orientativa del draft" : "Anteprima della rete da applicare"}</figcaption>
                <svg viewBox="0 0 600 212" role="img" aria-label={`Anteprima del draft: ${draftPreview.nodes.length} nodi e ${draftPreviewLinks.length} archi mostrati su ${draftPreview.totalNodeCount} nodi e ${draftPreview.datasetEdgeCount} record d'arco`}>
                  <defs>
                    <marker id="draft-preview-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                      <path d="M 0 0 L 8 4 L 0 8 z" fill="#75859a" />
                    </marker>
                  </defs>
                  {#each draftPreviewLinks as link (link.id)}
                    {@const source = draftPreviewPositions.get(link.source)}
                    {@const target = draftPreviewPositions.get(link.target)}
                    {#if source && target}
                      <line
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke="#75859a"
                        stroke-width="1.5"
                        stroke-opacity="0.7"
                        marker-end={link.directed ? "url(#draft-preview-arrow)" : undefined}
                      >
                        <title>{[link.type, link.id].filter(Boolean).join(" · ") || "Arco"}</title>
                      </line>
                    {/if}
                  {/each}
                  {#each draftPreviewNodes as node (node.id)}
                    <g>
                      <circle cx={node.x} cy={node.y} r="7" fill={node.color} stroke="#e2e8f0" stroke-width="2">
                        <title>{[node.label, node.type, `ID ${node.id}`].filter(Boolean).join(" · ")}</title>
                      </circle>
                      {#if draftPreviewNodes.length <= 18}
                        <text x={node.x + 10} y={node.y + 3.5}>{node.label}</text>
                      {/if}
                    </g>
                  {/each}
                </svg>
                {#if draftPreviewNodes.length > 18}<small>Etichette nascoste per mantenere leggibile la preview; passa sui nodi per leggere i dettagli.</small>{/if}
                {#if draftPreview.totalNodeCount > draftPreview.nodes.length}
                  <small>Campione deterministico distribuito lungo i record: {draftPreview.nodes.length} nodi su {draftPreview.totalNodeCount}; non rappresenta la rete completa.</small>
                {/if}
                {#if draftPreview.sampleLinkCount > draftPreviewLinks.length}
                  <small>Mostrati {draftPreviewLinks.length} di {draftPreview.sampleLinkCount} archi fra i nodi campionati.</small>
                {/if}
                {#if draftPreview.totalNodeCount > draftPreview.nodes.length || draftPreview.datasetEdgeCount !== draftPreview.sampleLinkCount}
                  <small>Il dataset contiene {draftPreview.datasetEdgeCount} record d'arco; la rete attiva non cambia finché non applichi il draft.</small>
                {/if}
              </figure>
            {/if}
          {/if}
        {/if}
      </section>

      <section class="mapping-section" aria-labelledby="mapping-title">
        <h2 id="mapping-title">Mappatura rapida</h2>
        <p>Associa i campi JSON più comuni. Gli altri attributi restano modificabili nell'editor avanzato.</p>
        <div class="mapping-grid">
          <label>ID nodo
            <SearchableFieldSelect id="mapping-node-id" value={nodeMapping.idField ?? ""} options={nodeFieldSearchOptions} ariaLabel="Cerca il campo ID nodo" emptyOptionLabel="Automatico / radice" on:change={(event) => updateMappingField("node", "idField", event.detail.value)} />
          </label>
          <label>Etichetta nodo
            <SearchableFieldSelect id="mapping-node-label" value={nodeMapping.labelField ?? ""} options={nodeFieldSearchOptions} ariaLabel="Cerca il campo etichetta nodo" emptyOptionLabel="ID nodo" on:change={(event) => updateMappingField("node", "labelField", event.detail.value)} />
          </label>
          <label>Tipo nodo
            <SearchableFieldSelect id="mapping-node-type" value={nodeMapping.typeField ?? ""} options={nodeFieldSearchOptions} ariaLabel="Cerca il campo tipo nodo" emptyOptionLabel="Nessun tipo" on:change={(event) => updateMappingField("node", "typeField", event.detail.value)} />
          </label>
          <label>Gruppo nodo
            <SearchableFieldSelect id="mapping-node-group" value={nodeMapping.groupFields?.[0] ?? ""} options={nodeFieldSearchOptions} ariaLabel="Cerca il campo gruppo nodo" emptyOptionLabel="Nessun gruppo" on:change={(event) => updateMappingField("node", "groupFields", event.detail.value)} />
          </label>
          <label>Origine arco
            <SearchableFieldSelect id="mapping-edge-source" value={edgeMapping.sourceField ?? ""} options={edgeFieldSearchOptions} ariaLabel="Cerca il campo origine arco" emptyOptionLabel="Campo origine" on:change={(event) => updateMappingField("edge", "sourceField", event.detail.value)} />
          </label>
          <label>Destinazione arco
            <SearchableFieldSelect id="mapping-edge-target" value={edgeMapping.targetField ?? ""} options={edgeFieldSearchOptions} ariaLabel="Cerca il campo destinazione arco" emptyOptionLabel="Campo destinazione" on:change={(event) => updateMappingField("edge", "targetField", event.detail.value)} />
          </label>
          <label>ID record arco
            <SearchableFieldSelect id="mapping-edge-id" value={edgeMapping.idField ?? ""} options={edgeFieldSearchOptions} ariaLabel="Cerca il campo ID record arco" emptyOptionLabel="Genera ID locali" on:change={(event) => updateMappingField("edge", "idField", event.detail.value)} />
          </label>
          <label>Tipo arco
            <SearchableFieldSelect id="mapping-edge-type" value={edgeMapping.typeField ?? ""} options={edgeFieldSearchOptions} ariaLabel="Cerca il campo tipo arco" emptyOptionLabel="Nessun tipo" on:change={(event) => updateMappingField("edge", "typeField", event.detail.value)} />
          </label>
          <label>Direzione
            <select id="mapping-edge-direction" value={edgeMapping.direction ?? "undirected"} on:change={(event) => updateMappingField("edge", "direction", (event.currentTarget as HTMLSelectElement).value)}>
              <option value="undirected">Non orientato</option>
              <option value="directed">Orientato</option>
            </select>
          </label>
          <label>Archi paralleli
            <select id="mapping-edge-identity" value={edgeMapping.identity ?? "simple"} on:change={(event) => updateMappingField("edge", "identity", (event.currentTarget as HTMLSelectElement).value)}>
              <option value="simple">Semplifica per coppia</option>
              <option value="multigraph">Mantieni ogni record</option>
            </select>
          </label>
        </div>
        {#if inspectedDatasetText !== datasetText}
          <small class="mapping-status">Rilevamento dei campi…</small>
        {:else}
          <small class="mapping-status">Trovati {nodeFieldPaths.length} campi nodo e {edgeFieldPaths.length} campi arco.</small>
        {/if}
        {#if inspectedDatasetText === datasetText && (fieldDiscoveryStats.nodeSampleCount < fieldDiscoveryStats.nodeRecordCount || fieldDiscoveryStats.edgeSampleCount < fieldDiscoveryStats.edgeRecordCount)}
          <small class="mapping-warning">
            Rilevamento distribuito su {fieldDiscoveryStats.nodeSampleCount}/{fieldDiscoveryStats.nodeRecordCount} nodi e {fieldDiscoveryStats.edgeSampleCount}/{fieldDiscoveryStats.edgeRecordCount} archi. Un campo presente solo fuori campione si può associare nell'editor JSON avanzato.
          </small>
        {/if}
        {#if multigraphNeedsId}
          <small class="mapping-warning">Mappa un ID univoco per arco per conservare i record paralleli in modalità multigrafo.</small>
        {/if}
        <details id="advanced-mapping" class="advanced-mapping">
          <summary id="advanced-mapping-summary" tabindex="-1">Campi opzionali e attributi</summary>
          <div class="advanced-mapping-body">
            <p>Mappa qui i campi usati da analisi, vincoli e scenari. Mantieni gli alias richiesti dalla configurazione esistente.</p>
            <div class="mapping-grid">
              <label>Ruolo nodo
                <SearchableFieldSelect id="mapping-node-role" value={nodeMapping.roleField ?? ""} options={nodeFieldSearchOptions} ariaLabel="Cerca il campo ruolo nodo" emptyOptionLabel="Nessun ruolo" on:change={(event) => updateMappingField("node", "roleField", event.detail.value)} />
              </label>
              <label>Costo rimozione nodo
                <SearchableFieldSelect id="mapping-node-removal-cost" value={nodeMapping.removalCostField ?? ""} options={nodeFieldSearchOptions} ariaLabel="Cerca il campo costo rimozione nodo" emptyOptionLabel="Nessun costo" on:change={(event) => updateMappingField("node", "removalCostField", event.detail.value)} />
              </label>
              <label>Peso arco
                <SearchableFieldSelect id="mapping-edge-weight" value={edgeMapping.weightField ?? ""} options={edgeFieldSearchOptions} ariaLabel="Cerca il campo peso arco" emptyOptionLabel="Nessun peso" on:change={(event) => updateMappingField("edge", "weightField", event.detail.value)} />
              </label>
              <label>Confidenza arco
                <SearchableFieldSelect id="mapping-edge-confidence" value={edgeMapping.confidenceField ?? ""} options={edgeFieldSearchOptions} ariaLabel="Cerca il campo confidenza arco" emptyOptionLabel="Nessuna confidenza" on:change={(event) => updateMappingField("edge", "confidenceField", event.detail.value)} />
              </label>
              <label>Fonte dell'arco
                <SearchableFieldSelect id="mapping-edge-provenance" value={edgeMapping.provenanceField ?? ""} options={edgeFieldSearchOptions} ariaLabel="Cerca il campo fonte arco" emptyOptionLabel="Nessuna fonte" on:change={(event) => updateMappingField("edge", "provenanceField", event.detail.value)} />
              </label>
              <label>Costo rimozione arco
                <SearchableFieldSelect id="mapping-edge-removal-cost" value={edgeMapping.removalCostField ?? ""} options={edgeFieldSearchOptions} ariaLabel="Cerca il campo costo rimozione arco" emptyOptionLabel="Nessun costo" on:change={(event) => updateMappingField("edge", "removalCostField", event.detail.value)} />
              </label>
              <label>Inizio validità arco
                <SearchableFieldSelect id="mapping-edge-validity-from" value={edgeMapping.validity?.fromField ?? ""} options={edgeFieldSearchOptions} ariaLabel="Cerca il campo inizio validità arco" emptyOptionLabel="Nessun inizio" on:change={(event) => updateMappingField("edge", "validity.fromField", event.detail.value)} />
              </label>
              <label>Fine validità arco
                <SearchableFieldSelect id="mapping-edge-validity-to" value={edgeMapping.validity?.toField ?? ""} options={edgeFieldSearchOptions} ariaLabel="Cerca il campo fine validità arco" emptyOptionLabel="Nessuna fine" on:change={(event) => updateMappingField("edge", "validity.toField", event.detail.value)} />
              </label>
              <label>Unità numerica degli intervalli
                <select value={edgeMapping.validity?.numericUnit ?? ""} on:change={(event) => updateMappingField("edge", "validity.numericUnit", (event.currentTarget as HTMLSelectElement).value)}>
                  <option value="">Rileva / date ISO</option>
                  <option value="milliseconds">Millisecondi</option>
                  <option value="seconds">Secondi</option>
                  <option value="minutes">Minuti</option>
                  <option value="hours">Ore</option>
                  <option value="days">Giorni</option>
                </select>
              </label>
            </div>

            <section class="attribute-mappings" aria-label="Attributi mappati">
              <h3>Attributi nodo</h3>
              {#each visibleNodeAttributeEntries as [alias, path], attributeIndex (alias)}
                <div class="attribute-row">
                  <span title={alias}>{alias}</span>
                  <SearchableFieldSelect id={`mapping-node-attribute-${attributeIndex}`} value={String(path ?? "")} options={nodeFieldSearchOptions} ariaLabel={`Campo per attributo nodo ${alias}`} emptyOptionLabel="Rimuovi mappatura" on:change={(event) => updateAttributeMapping("node", alias, event.detail.value)} />
                  <button type="button" class="remove-attribute" aria-label={`Rimuovi attributo nodo ${alias}`} title={`Rimuovi attributo nodo ${alias}`} on:click={() => updateAttributeMapping("node", alias, "")}>×</button>
                </div>
              {/each}
              <ResultListPager
                total={nodeAttributeEntries.length}
                visible={visibleNodeAttributeEntries.length}
                pageSize={ATTRIBUTE_MAPPING_PAGE_SIZE}
                label="attributi nodo"
                showMore={showMoreNodeAttributeMappings}
              />
              <div class="attribute-add">
                <input aria-label="Nome del nuovo attributo nodo" placeholder="Nome attributo" bind:value={nodeAttributeAlias} required />
                <SearchableFieldSelect id="mapping-node-new-attribute-path" bind:value={nodeAttributePath} options={nodeFieldSearchOptions} ariaLabel="Campo JSON per il nuovo attributo nodo" emptyOptionLabel="Scegli campo JSON" required />
                <button type="button" aria-describedby={nodeAttributeAddBlocker ? "mapping-node-add-blocker" : undefined} on:click={() => addAttributeMapping("node")} disabled={Boolean(nodeAttributeAddBlocker)}>Aggiungi attributo nodo</button>
                {#if nodeAttributeAddBlocker}<small id="mapping-node-add-blocker" class="field-note" role="status" aria-live="polite">{nodeAttributeAddBlocker}</small>{/if}
              </div>
            </section>

            <section class="attribute-mappings" aria-label="Attributi arco">
              <h3>Attributi arco</h3>
              {#each visibleEdgeAttributeEntries as [alias, path], attributeIndex (alias)}
                <div class="attribute-row">
                  <span title={alias}>{alias}</span>
                  <SearchableFieldSelect id={`mapping-edge-attribute-${attributeIndex}`} value={String(path ?? "")} options={edgeFieldSearchOptions} ariaLabel={`Campo per attributo arco ${alias}`} emptyOptionLabel="Rimuovi mappatura" on:change={(event) => updateAttributeMapping("edge", alias, event.detail.value)} />
                  <button type="button" class="remove-attribute" aria-label={`Rimuovi attributo arco ${alias}`} title={`Rimuovi attributo arco ${alias}`} on:click={() => updateAttributeMapping("edge", alias, "")}>×</button>
                </div>
              {/each}
              <ResultListPager
                total={edgeAttributeEntries.length}
                visible={visibleEdgeAttributeEntries.length}
                pageSize={ATTRIBUTE_MAPPING_PAGE_SIZE}
                label="attributi arco"
                showMore={showMoreEdgeAttributeMappings}
              />
              <div class="attribute-add">
                <input aria-label="Nome del nuovo attributo arco" placeholder="Nome attributo" bind:value={edgeAttributeAlias} required />
                <SearchableFieldSelect id="mapping-edge-new-attribute-path" bind:value={edgeAttributePath} options={edgeFieldSearchOptions} ariaLabel="Campo JSON per il nuovo attributo arco" emptyOptionLabel="Scegli campo JSON" required />
                <button type="button" aria-describedby={edgeAttributeAddBlocker ? "mapping-edge-add-blocker" : undefined} on:click={() => addAttributeMapping("edge")} disabled={Boolean(edgeAttributeAddBlocker)}>Aggiungi attributo arco</button>
                {#if edgeAttributeAddBlocker}<small id="mapping-edge-add-blocker" class="field-note" role="status" aria-live="polite">{edgeAttributeAddBlocker}</small>{/if}
              </div>
            </section>
          </div>
        </details>
      </section>

      <details class="compute-options">
        <summary>Opzioni di calcolo</summary>
        <div class="compute-options-body">
          <label for="solver-task-timeout">Tempo massimo per ogni analisi</label>
          <div class="timeout-input-row">
            <input
              id="solver-task-timeout"
              type="number"
              min="1"
              max="300"
              step="any"
              value={solverTaskTimeoutSeconds}
              aria-describedby="solver-task-timeout-help"
              on:change={updateSolverTaskTimeout}
            />
            <span>secondi</span>
          </div>
          <p id="solver-task-timeout-help">Da 1 a 300 secondi. Se il limite scade, il risultato viene indicato come incompleto.</p>
        </div>
      </details>

      <section class="json-editor-section">
        <label for="graph-config">Configurazione JSON</label>
        <JsonCodeEditor
          id="graph-config"
          ariaLabel="Configurazione JSON"
          value={configText}
          invalid={errorInput === "configurazione"}
          describedBy={errorInput === "configurazione" ? "graph-apply-error" : undefined}
          onValueChange={onConfigTextChange}
        />
      </section>

      <section class="json-editor-section">
        <label for="graph-dataset">Dati del grafo (JSON)</label>
        <JsonCodeEditor
          id="graph-dataset"
          ariaLabel="Dati del grafo (JSON)"
          value={datasetText}
          invalid={errorInput === "dataset"}
          describedBy={errorInput === "dataset" ? "graph-apply-error" : undefined}
          onValueChange={onDatasetTextChange}
        />
      </section>

      {#if errorMessage}
        <div id="graph-apply-error" class="error-box" role="alert">
          <strong>Il grafo non è stato applicato</strong>
          <span>{errorMessage}</span>
          {#if errorTechnicalDetails}
            <details>
              <summary>Dettagli tecnici</summary>
              <pre>{errorTechnicalDetails}</pre>
            </details>
          {/if}
        </div>
      {/if}
    </div>

    <div class="json-editor-actions">
      <button type="button" on:click={onApply}>
        Applica grafo
      </button>

      <button
        class="secondary-button"
        type="button"
        bind:this={resetExampleButton}
        on:click={requestResetConfirmation}
      >
        Ripristina esempio iniziale
      </button>
      {#if showResetConfirmation}
        <div
          class="reset-confirmation"
          role="group"
          aria-labelledby="reset-example-title"
          aria-describedby="reset-example-description"
          aria-live="polite"
        >
          <strong id="reset-example-title">Sostituire la rete corrente?</strong>
          <span id="reset-example-description">Dataset e configurazione saranno sostituiti con l'esempio iniziale. Esporta il progetto per conservarne una copia.</span>
          <div class="reset-confirmation-actions">
            <button bind:this={resetCancelButton} class="secondary-button" type="button" on:click={cancelResetConfirmation} on:keydown={handleResetConfirmationKeydown}>Annulla</button>
            <button type="button" on:click={confirmResetExample} on:keydown={handleResetConfirmationKeydown}>Sostituisci con l'esempio</button>
          </div>
        </div>
      {/if}
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
    height: 100dvh;
    box-sizing: border-box;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow: hidden;
    background: rgba(15, 23, 42, 0.96);
    color: #e5e7eb;
    font: 13px/1.4 Arial, Helvetica, sans-serif;
    border-right: 1px solid rgba(148, 163, 184, 0.25);
    box-shadow: 14px 0 40px rgba(0, 0, 0, 0.35);
  }

  .json-editor-panel :global(button),
  .json-editor-panel :global(input),
  .json-editor-panel :global(select) { font-family: inherit; }

  .json-editor-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: flex-start;
  }

  .json-editor-header h1 {
    margin: 0;
    font-size: 19px;
    line-height: 1.2;
  }

  .eyebrow { margin: 0 0 5px; color: #94a3b8; font-size: 9px; font-weight: 750; letter-spacing: .12em; }

  .json-editor-body {
    min-height: 0;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .data-actions { display: flex; flex-direction: column; gap: 9px; padding: 11px; border: 1px solid rgba(148, 163, 184, .2); border-radius: 11px; background: rgba(30, 41, 59, .62); }
  .data-actions > .reset-confirmation { width: 100%; flex: initial; }
  .project-management { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .project-identity { min-width: 0; }
  .project-file-actions { display: flex; flex-wrap: wrap; align-items: stretch; justify-content: stretch; gap: 8px; }
  .project-file-actions :global(button), .project-file-actions .file-button { flex: 1 1 118px; min-width: 0; min-height: 40px; padding: 8px 10px; border: 1px solid rgba(148, 163, 184, .3); border-radius: 8px; font-size: 12px; }
  .source-data-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; padding-top: 9px; border-top: 1px solid rgba(148, 163, 184, .16); }
  .project-name-field { display: grid; gap: 6px; color: #f1f5f9; font-size: 12px; font-weight: 700; }
  .project-name-field input { width: 100%; min-height: 40px; box-sizing: border-box; padding: 8px 10px; border: 1px solid rgba(148, 163, 184, .42); border-radius: 8px; background: rgba(15, 23, 42, .82); color: #f8fafc; font: inherit; font-size: 14px; font-weight: 500; }
  .project-name-field input:focus-visible { outline: 3px solid rgba(56, 189, 248, .32); outline-offset: 2px; }
  .project-name-hint { margin: 5px 0 0; color: #c1ccda; font-size: 11px; line-height: 1.4; }
  .file-button { position: relative; display: inline-flex; justify-content: center; align-items: center; min-height: 36px; padding: 7px 9px; box-sizing: border-box; border: 1px solid rgba(148, 163, 184, .26); border-radius: 8px; background: rgba(148, 163, 184, .12); color: #e2e8f0; cursor: pointer; font-size: 11px; font-weight: 650; text-align: center; }
  .file-button:hover { background: rgba(148, 163, 184, .2); }
  .file-button:focus-within { outline: 3px solid rgba(56, 189, 248, .32); outline-offset: 2px; }
  .file-button input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
  .data-actions > :global(button) { min-height: 36px; padding: 7px 9px; border: 1px solid rgba(148, 163, 184, .26); border-radius: 8px; font-size: 11px; }
  .file-message, .file-error, .file-hint, .session-status { width: 100%; margin: 0; font-size: 11px; line-height: 1.45; }
  .session-status { color: #a7f3d0; }
  .file-message { color: #a7f3d0; }
  .session-status:not(.has-message), .file-message:not(.has-message) {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
    font-size: 0;
    line-height: 0;
  }
  .file-error { color: #fecaca; }
  .file-error p { margin: 0; }
  .file-error details { color: #fee2e2; }
  .file-error summary { width: fit-content; cursor: pointer; font-weight: 650; }
  .file-error summary:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 3px; }
  .file-error pre { max-height: 120px; margin: 5px 0 0; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: #fecaca; font: inherit; font-size: 10px; }
  .file-hint { color: #aab7c8; }

  .input-validation { display: flex; flex-direction: column; gap: 7px; padding: 11px; border: 1px solid rgba(52, 211, 153, .3); border-radius: 11px; background: rgba(6, 78, 59, .28); }
  .input-validation.error { border-color: rgba(248, 113, 113, .58); background: rgba(127, 29, 29, .24); }
  .input-validation.warning { border-color: rgba(251, 191, 36, .48); background: rgba(120, 53, 15, .2); }
  .validation-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; color: #f8fafc; font-size: 11px; }
  .validation-state { flex: 0 0 auto; color: #a7f3d0; font-size: 10px; font-weight: 700; }
  .validation-state:not(.has-message) {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
    font-size: 0;
    line-height: 0;
  }
  .validation-state.pending { color: #cbd5e1; }
  .input-validation.error .validation-state { color: #fecaca; }
  .input-validation.warning .validation-state { color: #fde68a; }
  .input-validation > p { margin: 0; color: #cbd5e1; font-size: 10px; line-height: 1.45; }
  .draft-preview { margin: 2px 0 0; padding: 7px; border: 1px solid rgba(148, 163, 184, .22); border-radius: 8px; background: rgba(2, 6, 23, .28); }
  .draft-preview figcaption { margin-bottom: 4px; color: #e2e8f0; font-size: 10px; font-weight: 700; }
  .draft-preview svg { display: block; width: 100%; max-height: 180px; overflow: visible; }
  .draft-preview text { fill: #e2e8f0; font: 10px Arial, Helvetica, sans-serif; }
  .draft-preview small { display: block; color: #94a3b8; font-size: 9px; }
  .input-validation .validation-counts { color: #fcd78b; font-weight: 700; }
  .input-validation.error .validation-counts { color: #fecaca; }
  .validation-list { display: flex; flex-direction: column; gap: 6px; max-height: 24vh; overflow: auto; margin: 0; padding: 0 2px 0 16px; }
  .validation-list li { padding-left: 2px; color: #e2e8f0; font-size: 10px; line-height: 1.45; }
  .validation-list li.error { color: #fecaca; }
  .validation-list .text-button { margin-left: 4px; padding: 2px 4px; border: 1px solid rgba(148, 163, 184, .26); border-radius: 5px; background: transparent; color: #bae6fd; font-size: 9px; cursor: pointer; }
  .validation-list .text-button:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
  .more-diagnostics > summary { color: #bae6fd; font-size: 10px; cursor: pointer; }
  .more-diagnostics .validation-list { margin-top: 7px; }

  .mapping-section { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid rgba(148, 163, 184, .2); border-radius: 11px; background: rgba(30, 41, 59, .36); }
  .mapping-section > h2 { margin: 0; color: #f8fafc; font-size: 13px; }
  .mapping-section > p { margin: 0; color: #aab7c8; font-size: 10px; line-height: 1.4; }
  .mapping-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .mapping-grid label { display: flex; flex-direction: column; gap: 4px; min-width: 0; color: #dbe4ee; font-size: 10px; font-weight: 650; }
  .mapping-grid select, :global(.mapping-grid .searchable-node-select input) { box-sizing: border-box; width: 100%; min-width: 0; min-height: 32px; padding: 5px 7px; border: 1px solid rgba(148, 163, 184, .3); border-radius: 7px; background: #0f172a; color: #e2e8f0; font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .mapping-status { color: #94a3b8; font-size: 10px; }
  .mapping-warning { color: #fcd78b; font-size: 10px; line-height: 1.4; }
  .advanced-mapping { margin-top: 2px; border-top: 1px solid rgba(148, 163, 184, .17); padding-top: 8px; }
  .advanced-mapping > summary { display: inline-flex; align-items: center; min-height: 28px; color: #c5d4e3; cursor: pointer; font-size: 10px; font-weight: 700; }
  .advanced-mapping-body { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
  .advanced-mapping-body > p { margin: 0; color: #aab7c8; font-size: 10px; line-height: 1.45; }
  .compute-options { padding: 8px 10px; border: 1px solid rgba(148, 163, 184, .2); border-radius: 9px; background: rgba(30, 41, 59, .28); }
  .compute-options > summary { display: flex; align-items: center; min-height: 28px; color: #c5d4e3; cursor: pointer; font-size: 10px; font-weight: 700; }
  .compute-options-body { display: grid; gap: 6px; padding: 5px 0 2px; }
  .compute-options-body label { color: #dbe4ee; font-size: 10px; font-weight: 650; }
  .timeout-input-row { display: flex; align-items: center; gap: 7px; }
  .timeout-input-row input { width: 100px; min-height: 32px; box-sizing: border-box; padding: 5px 7px; border: 1px solid rgba(148, 163, 184, .3); border-radius: 7px; background: #0f172a; color: #e2e8f0; font: 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .timeout-input-row span { color: #aab7c8; font-size: 10px; }
  .compute-options-body p { margin: 0; color: #aab7c8; font-size: 10px; line-height: 1.4; }
  .attribute-mappings { display: flex; flex-direction: column; gap: 7px; }
  .attribute-mappings h3 { margin: 0; color: #dbe4ee; font-size: 11px; }
  .attribute-row, .attribute-add { display: grid; grid-template-columns: minmax(70px, .7fr) minmax(0, 1.4fr) 30px; gap: 6px; align-items: center; }
  .attribute-row > span { overflow: hidden; color: #c8d4e1; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  :global(.attribute-row .searchable-node-select input), :global(.attribute-add .searchable-node-select input), .attribute-add input { width: 100%; min-width: 0; min-height: 31px; box-sizing: border-box; padding: 5px 6px; border: 1px solid rgba(148, 163, 184, .3); border-radius: 7px; background: #0f172a; color: #e2e8f0; font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .attribute-add { grid-template-columns: minmax(72px, .7fr) minmax(0, 1.4fr) auto; }
  .attribute-add .field-note { grid-column: 1 / -1; margin: 0; color: #aab7c8; font-size: 10px; line-height: 1.4; }
  .attribute-add button { min-height: 31px; padding: 5px 7px; border-radius: 7px; font-size: 10px; }
  .attribute-add button:disabled { opacity: .48; cursor: not-allowed; }
  .remove-attribute { display: grid; width: 30px; height: 30px; place-items: center; padding: 0; border-radius: 7px; background: rgba(148, 163, 184, .12); color: #fecaca; font-size: 18px; }

  .json-editor-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 120px;
    flex: 1 0 120px;
  }

  .json-editor-section label {
    font-size: 13px;
    font-weight: 700;
    color: #f8fafc;
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
    flex-wrap: wrap;
    gap: 10px;
    margin-top: auto;
  }

  .reset-confirmation {
    display: grid;
    flex: 1 0 100%;
    gap: 7px;
    padding: 10px 12px;
    border: 1px solid rgba(251, 191, 36, .55);
    border-radius: 9px;
    background: rgba(251, 191, 36, .12);
    color: #fef3c7;
    font-size: 12px;
  }

  .reset-confirmation-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .reset-confirmation button {
    min-height: 34px;
  }

  .example-list { width: 100%; padding-top: 7px; border-top: 1px solid rgba(148, 163, 184, .16); }
  .example-list summary { display: inline-flex; align-items: center; min-height: 35px; padding: 0 10px; border-radius: 8px; background: rgba(148, 163, 184, .12); color: #dbe4ee; cursor: pointer; font-size: 11px; font-weight: 650; }
  .example-list > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 8px; }
  .example-link { display: grid; gap: 4px; min-height: 52px; box-sizing: border-box; padding: 8px; border: 1px solid rgba(148, 163, 184, .2); border-radius: 8px; background: rgba(148, 163, 184, .08); color: #e5e7eb; text-decoration: none; }
  .example-link:hover { border-color: rgba(56, 189, 248, .4); background: rgba(148, 163, 184, .14); }
  .example-link strong { font-size: 10px; }
  .example-link small { color: #aab7c8; font-size: 9px; line-height: 1.35; }

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

  @media (max-width: 520px) {
    .json-editor-panel { width: 100vw; padding: 14px; }
    .project-management { grid-template-columns: minmax(0, 1fr); }
    .project-file-actions { justify-content: stretch; }
    .project-file-actions > * { flex: 1 1 118px; }
    .source-data-actions { grid-template-columns: 1fr; }
    .example-list > div { grid-template-columns: 1fr; }
    .mapping-grid { grid-template-columns: 1fr; }
    .attribute-row, .attribute-add { grid-template-columns: 1fr 30px; }
    .attribute-row > span, .attribute-add input { grid-column: 1 / -1; }
    .attribute-add button { grid-column: 1 / -1; }
  }
</style>
