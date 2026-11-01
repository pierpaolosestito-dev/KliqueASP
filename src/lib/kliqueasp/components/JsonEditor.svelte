<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { readGraphJsonUpload } from "../graph/graphJsonUpload.ts";
  import { collectGraphFieldPaths, GRAPH_FIELD_DISCOVERY_SAMPLE_LIMIT, updateGraphAttributeMapping, updateGraphFieldMapping } from "../graph/graphFieldMapping.ts";
  import { getSolverTaskTimeoutSeconds, setSolverTaskTimeoutSeconds } from "../graph/solverTimeoutSetting.ts";
  import { buildGraphInputPreview, formatGraphDiagnostic, inspectGraphInput, type GraphInputInspection } from "../graph/graphInputValidation.ts";
  export let open: boolean = false;

  export let configText: string = "";
  export let datasetText: string = "";
  export let errorMessage: string = "";
  export let sessionStatus: string = "";

  export let onConfigTextChange: (value: string) => void = () => {};
  export let onDatasetTextChange: (value: string) => void = () => {};
  export let onApply: () => void = () => {};
  export let onReset: () => void = () => {};
  export let onLoadDavis: () => void = () => {};
  export let onLoadKarate: () => void = () => {};
  export let onLoadGahukuGama: () => void = () => {};
  export let onLoadTemporalEdges: () => void = () => {};
  export let onLoadInVS: () => void = () => {};
  export let onLoadInVSFull: () => void = () => {};
  export let onLoadProject: (project: unknown) => void = () => {};
  export let onSaveProject: () => string | void = () => {};
  export let onClose: () => void = () => {};

  let fileMessage = "";
  let fileError = "";
  let projectFileInput: HTMLInputElement | null = null;
  let resetExampleButton: HTMLButtonElement | null = null;
  let resetCancelButton: HTMLButtonElement | null = null;
  let showResetConfirmation = false;

  async function requestResetConfirmation() {
    showResetConfirmation = true;
    await tick();
    resetCancelButton?.focus();
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
    fileError = "";
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
  let nodeMapping: Record<string, any> = {};
  let edgeMapping: Record<string, any> = {};
  let nodeAttributeAlias = "";
  let nodeAttributePath = "";
  let edgeAttributeAlias = "";
  let edgeAttributePath = "";
  const previewPalette = ["#2a9186", "#3978a8", "#8d6bb0", "#c77942", "#568a55", "#b45f72"];

  $: draftPreview = draftValidation?.status !== "error"
    ? buildGraphInputPreview(draftValidation?.previewNodes ?? [], draftValidation?.previewLinks ?? [], draftValidation?.edgeCount ?? 0)
    : buildGraphInputPreview([], [], 0);
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
    validationTimer = setTimeout(() => {
      draftValidation = inspectGraphInput(config, dataset);
      inspectedConfigValidationText = config;
      inspectedDatasetValidationText = dataset;
      draftValidationPending = false;
      validationTimer = null;
    }, 500);
  }

  function diagnosticTarget(code: string): { id: string; label: string } {
    const normalizedCode = code.toLowerCase();
    if (normalizedCode.includes("node") && normalizedCode.includes("id")) {
      return { id: "mapping-node-id", label: "Vai al mapping" };
    }
    if (normalizedCode.includes("node") && normalizedCode.includes("type")) {
      return { id: "mapping-node-type", label: "Vai al mapping" };
    }
    if (normalizedCode.includes("endpoint")) {
      return { id: normalizedCode.includes("target") ? "mapping-edge-target" : "mapping-edge-source", label: "Vai al mapping" };
    }
    if (normalizedCode.includes("edge") && normalizedCode.includes("id")) {
      return { id: "mapping-edge-id", label: "Vai al mapping" };
    }
    if (normalizedCode.includes("edge") && (normalizedCode.includes("identity") || normalizedCode.includes("simple-edge"))) {
      return { id: "mapping-edge-identity", label: "Vai al mapping" };
    }
    if (normalizedCode.includes("edge") && normalizedCode.includes("type")) {
      return { id: "mapping-edge-type", label: "Vai al mapping" };
    }
    if (normalizedCode.includes("edge") && normalizedCode.includes("direction")) {
      return { id: "mapping-edge-direction", label: "Vai al mapping" };
    }
    if (normalizedCode.includes("config-json") || normalizedCode.includes("config-root") || normalizedCode.includes("graph-config")) {
      return { id: "graph-config", label: "Apri configurazione JSON" };
    }
    if (normalizedCode.includes("capability") || normalizedCode.includes("mapping")) {
      return { id: "advanced-mapping-summary", label: "Rivedi mapping" };
    }
    return { id: "graph-dataset", label: "Apri dataset JSON" };
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

  function fieldOptions(fields: string[], current: unknown): string[] {
    const value = typeof current === "string" ? current : "";
    return [...new Set([...(value ? [value] : []), ...fields])];
  }

  function updateMappingField(scope: "node" | "edge", field: string, value: string) {
    const config = parseRecord(configText);
    const dataset = parseRecord(datasetText);
    if (!config) {
      fileError = "Correggi prima il JSON della configurazione per modificare il mapping.";
      return;
    }
    try {
      const updated = updateGraphFieldMapping(config, dataset, scope, field, value);
      onConfigTextChange(JSON.stringify(updated, null, 2));
      fileError = "";
      fileMessage = "Mapping aggiornato. Applica il grafo per ricalcolare la rete.";
    } catch (error) {
      fileError = error instanceof Error ? error.message : "Mapping non aggiornato.";
    }
  }

  function updateAttributeMapping(scope: "node" | "edge", alias: string, path: string) {
    const config = parseRecord(configText);
    const dataset = parseRecord(datasetText);
    if (!config) {
      fileError = "Correggi prima il JSON della configurazione per modificare gli attributi.";
      return;
    }
    try {
      const updated = updateGraphAttributeMapping(config, dataset, scope, alias, path);
      onConfigTextChange(JSON.stringify(updated, null, 2));
      fileError = "";
      fileMessage = "Attributo aggiornato. Applica il grafo per ricalcolare le analisi.";
    } catch (error) {
      fileError = error instanceof Error ? error.message : "Attributo non aggiornato.";
    }
  }

  function updateSolverTaskTimeout(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const config = parseRecord(configText);
    if (!input.validity.valid) {
      fileError = "Inserisci un limite di calcolo compreso tra 1 e 300 secondi.";
      return;
    }
    if (!config) {
      fileError = "Correggi prima il JSON della configurazione per modificare il limite di calcolo.";
      return;
    }
    try {
      const updated = setSolverTaskTimeoutSeconds(config, input.valueAsNumber);
      onConfigTextChange(JSON.stringify(updated, null, 2));
      fileError = "";
      fileMessage = "Limite di calcolo aggiornato. Applica il grafo per usarlo.";
    } catch (error) {
      fileError = error instanceof Error ? error.message : "Limite di calcolo non aggiornato.";
    }
  }

  function addAttributeMapping(scope: "node" | "edge") {
    const alias = scope === "node" ? nodeAttributeAlias : edgeAttributeAlias;
    const path = scope === "node" ? nodeAttributePath : edgeAttributePath;
    if (!path) {
      fileError = "Scegli un campo JSON da associare all'attributo.";
      return;
    }
    updateAttributeMapping(scope, alias, path);
    if (!fileError) {
      if (scope === "node") {
        nodeAttributeAlias = "";
        nodeAttributePath = "";
      } else {
        edgeAttributeAlias = "";
        edgeAttributePath = "";
      }
    }
  }

  async function loadJsonFile(event: Event, kind: "dataset" | "config" | "project") {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    fileMessage = "";
    fileError = "";
    try {
      const parsed = await readGraphJsonUpload(file, kind);
      if (kind === "dataset") {
        onDatasetTextChange(JSON.stringify(parsed, null, 2));
        fileMessage = `Dataset caricato da ${file.name}. Applica il grafo per vedere le modifiche.`;
      } else if (kind === "config") {
        onConfigTextChange(JSON.stringify(parsed, null, 2));
        fileMessage = `Configurazione caricata da ${file.name}. Applica il grafo per vedere le modifiche.`;
      } else {
        onLoadProject(parsed);
        fileMessage = `Progetto caricato da ${file.name}.`;
        onClose();
      }
    } catch (error) {
      fileError = error instanceof Error ? error.message : "Impossibile leggere il file JSON.";
    } finally {
      input.value = "";
    }
  }

  onDestroy(() => {
    if (inspectionTimer) clearTimeout(inspectionTimer);
    if (validationTimer) clearTimeout(validationTimer);
  });
</script>

{#if open}
  <aside class="json-editor-panel" aria-label="Dati e configurazione del grafo">
    <div class="json-editor-header">
      <div>
        <p class="eyebrow">KLIQUEASP</p>
        <h1>Dati e configurazione</h1>
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
      <section class="data-actions" aria-label="Apri o esporta dati">
        <label class="file-button">
          <input type="file" accept=".json,application/json" on:change={(event) => loadJsonFile(event, "dataset")} />
          Carica dataset JSON
        </label>
        <label class="file-button">
          <input type="file" accept=".json,application/json" on:change={(event) => loadJsonFile(event, "config")} />
          Carica configurazione
        </label>
        <label class="file-button">
          <input type="file" accept=".json,application/json" bind:this={projectFileInput} on:change={(event) => loadJsonFile(event, "project")} />
          Apri progetto
        </label>
        <button class="secondary-button" type="button" on:click={requestProjectExport}>
          Esporta progetto
        </button>
        {#if sessionStatus}<p class="session-status" role="status" aria-live="polite">{sessionStatus}</p>{/if}
        {#if fileMessage}<p class="file-message" role="status" aria-live="polite">{fileMessage}</p>{/if}
        {#if fileError}<p class="file-error" role="alert">{fileError}</p>{/if}
        <p class="file-hint">Un progetto contiene dataset e configurazione JSON. Il caricamento dei file singoli li prepara nell'editor; usa <strong>Applica grafo</strong> per aggiornare la rete.</p>
      </section>

      <section
        class="input-validation"
        class:error={draftValidation?.status === "error"}
        class:warning={draftValidation?.status === "warning"}
        aria-labelledby="input-validation-title"
        aria-live="polite"
      >
        <div class="validation-heading">
          <strong id="input-validation-title">Controllo prima dell'applicazione</strong>
          {#if draftValidationPending}
            <span>Controllo in corso…</span>
          {:else if draftValidation?.status === "ready"}
            <span class="validation-state" role="status">Pronto</span>
          {:else if draftValidation?.status === "warning"}
            <span class="validation-state" role="status">Pronto con avvisi</span>
          {:else if draftValidation?.status === "error"}
            <span class="validation-state" role="alert">Da correggere</span>
          {/if}
        </div>
        {#if draftValidationPending}
          <p>Verifico struttura, mapping e collegamenti al termine della modifica.</p>
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
            {#if draftValidation.diagnostics.length > 6}
              <details class="more-diagnostics" bind:open={showAllDraftDiagnostics}>
                <summary>Mostra altre {draftValidation.diagnostics.length - 6} diagnosi</summary>
                {#if showAllDraftDiagnostics}
                  <ul class="validation-list">
                    {#each draftValidation.diagnostics.slice(6) as diagnostic}
                      <li class:error={diagnostic.severity === "error"}>
                        <span>{formatGraphDiagnostic(diagnostic)}</span>
                        <button type="button" class="text-button" on:click={() => focusDiagnostic(diagnostic.code)}>
                          {diagnosticTarget(diagnostic.code).label}
                        </button>
                      </li>
                    {/each}
                  </ul>
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
        <div class="mapping-heading">
          <h2 id="mapping-title">Mappatura rapida</h2>
          <button type="button" class="text-button" on:click={() => scheduleFieldInspection(datasetText)}>Rileva campi</button>
        </div>
        <p>Associa i campi JSON più comuni. Gli altri attributi restano modificabili nell'editor avanzato.</p>
        <div class="mapping-grid">
          <label>ID nodo
            <select id="mapping-node-id" value={nodeMapping.idField ?? ""} on:change={(event) => updateMappingField("node", "idField", (event.currentTarget as HTMLSelectElement).value)}>
              <option value="">Automatico / radice</option>
              {#each fieldOptions(nodeFieldPaths, nodeMapping.idField) as path}<option value={path}>{path}</option>{/each}
            </select>
          </label>
          <label>Etichetta nodo
            <select value={nodeMapping.labelField ?? ""} on:change={(event) => updateMappingField("node", "labelField", (event.currentTarget as HTMLSelectElement).value)}>
              <option value="">ID nodo</option>
              {#each fieldOptions(nodeFieldPaths, nodeMapping.labelField) as path}<option value={path}>{path}</option>{/each}
            </select>
          </label>
          <label>Tipo nodo
            <select id="mapping-node-type" value={nodeMapping.typeField ?? ""} on:change={(event) => updateMappingField("node", "typeField", (event.currentTarget as HTMLSelectElement).value)}>
              <option value="">Nessun tipo</option>
              {#each fieldOptions(nodeFieldPaths, nodeMapping.typeField) as path}<option value={path}>{path}</option>{/each}
            </select>
          </label>
          <label>Gruppo nodo
            <select value={nodeMapping.groupFields?.[0] ?? ""} on:change={(event) => updateMappingField("node", "groupFields", (event.currentTarget as HTMLSelectElement).value)}>
              <option value="">Nessun gruppo</option>
              {#each fieldOptions(nodeFieldPaths, nodeMapping.groupFields?.[0]) as path}<option value={path}>{path}</option>{/each}
            </select>
          </label>
          <label>Origine arco
            <select id="mapping-edge-source" value={edgeMapping.sourceField ?? ""} on:change={(event) => updateMappingField("edge", "sourceField", (event.currentTarget as HTMLSelectElement).value)}>
              <option value="">Campo origine</option>
              {#each fieldOptions(edgeFieldPaths, edgeMapping.sourceField) as path}<option value={path}>{path}</option>{/each}
            </select>
          </label>
          <label>Destinazione arco
            <select id="mapping-edge-target" value={edgeMapping.targetField ?? ""} on:change={(event) => updateMappingField("edge", "targetField", (event.currentTarget as HTMLSelectElement).value)}>
              <option value="">Campo destinazione</option>
              {#each fieldOptions(edgeFieldPaths, edgeMapping.targetField) as path}<option value={path}>{path}</option>{/each}
            </select>
          </label>
          <label>ID record arco
            <select id="mapping-edge-id" value={edgeMapping.idField ?? ""} on:change={(event) => updateMappingField("edge", "idField", (event.currentTarget as HTMLSelectElement).value)}>
              <option value="">Genera ID locali</option>
              {#each fieldOptions(edgeFieldPaths, edgeMapping.idField) as path}<option value={path}>{path}</option>{/each}
            </select>
          </label>
          <label>Tipo arco
            <select id="mapping-edge-type" value={edgeMapping.typeField ?? ""} on:change={(event) => updateMappingField("edge", "typeField", (event.currentTarget as HTMLSelectElement).value)}>
              <option value="">Nessun tipo</option>
              {#each fieldOptions(edgeFieldPaths, edgeMapping.typeField) as path}<option value={path}>{path}</option>{/each}
            </select>
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
                <select value={nodeMapping.roleField ?? ""} on:change={(event) => updateMappingField("node", "roleField", (event.currentTarget as HTMLSelectElement).value)}>
                  <option value="">Nessun ruolo</option>
                  {#each fieldOptions(nodeFieldPaths, nodeMapping.roleField) as path}<option value={path}>{path}</option>{/each}
                </select>
              </label>
              <label>Costo rimozione nodo
                <select value={nodeMapping.removalCostField ?? ""} on:change={(event) => updateMappingField("node", "removalCostField", (event.currentTarget as HTMLSelectElement).value)}>
                  <option value="">Nessun costo</option>
                  {#each fieldOptions(nodeFieldPaths, nodeMapping.removalCostField) as path}<option value={path}>{path}</option>{/each}
                </select>
              </label>
              <label>Peso arco
                <select value={edgeMapping.weightField ?? ""} on:change={(event) => updateMappingField("edge", "weightField", (event.currentTarget as HTMLSelectElement).value)}>
                  <option value="">Nessun peso</option>
                  {#each fieldOptions(edgeFieldPaths, edgeMapping.weightField) as path}<option value={path}>{path}</option>{/each}
                </select>
              </label>
              <label>Confidenza arco
                <select value={edgeMapping.confidenceField ?? ""} on:change={(event) => updateMappingField("edge", "confidenceField", (event.currentTarget as HTMLSelectElement).value)}>
                  <option value="">Nessuna confidenza</option>
                  {#each fieldOptions(edgeFieldPaths, edgeMapping.confidenceField) as path}<option value={path}>{path}</option>{/each}
                </select>
              </label>
              <label>Fonte dell'arco
                <select value={edgeMapping.provenanceField ?? ""} on:change={(event) => updateMappingField("edge", "provenanceField", (event.currentTarget as HTMLSelectElement).value)}>
                  <option value="">Nessuna fonte</option>
                  {#each fieldOptions(edgeFieldPaths, edgeMapping.provenanceField) as path}<option value={path}>{path}</option>{/each}
                </select>
              </label>
              <label>Costo rimozione arco
                <select value={edgeMapping.removalCostField ?? ""} on:change={(event) => updateMappingField("edge", "removalCostField", (event.currentTarget as HTMLSelectElement).value)}>
                  <option value="">Nessun costo</option>
                  {#each fieldOptions(edgeFieldPaths, edgeMapping.removalCostField) as path}<option value={path}>{path}</option>{/each}
                </select>
              </label>
              <label>Inizio validità arco
                <select value={edgeMapping.validity?.fromField ?? ""} on:change={(event) => updateMappingField("edge", "validity.fromField", (event.currentTarget as HTMLSelectElement).value)}>
                  <option value="">Nessun inizio</option>
                  {#each fieldOptions(edgeFieldPaths, edgeMapping.validity?.fromField) as path}<option value={path}>{path}</option>{/each}
                </select>
              </label>
              <label>Fine validità arco
                <select value={edgeMapping.validity?.toField ?? ""} on:change={(event) => updateMappingField("edge", "validity.toField", (event.currentTarget as HTMLSelectElement).value)}>
                  <option value="">Nessuna fine</option>
                  {#each fieldOptions(edgeFieldPaths, edgeMapping.validity?.toField) as path}<option value={path}>{path}</option>{/each}
                </select>
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
              {#each Object.entries(nodeMapping.attributes ?? {}) as [alias, path]}
                <div class="attribute-row">
                  <span title={alias}>{alias}</span>
                  <select aria-label={`Campo per attributo nodo ${alias}`} value={path} on:change={(event) => updateAttributeMapping("node", alias, (event.currentTarget as HTMLSelectElement).value)}>
                    <option value="">Rimuovi mapping</option>
                    {#each fieldOptions(nodeFieldPaths, path) as field}<option value={field}>{field}</option>{/each}
                  </select>
                  <button type="button" class="remove-attribute" aria-label={`Rimuovi attributo nodo ${alias}`} on:click={() => updateAttributeMapping("node", alias, "")}>×</button>
                </div>
              {/each}
              <div class="attribute-add">
                <input aria-label="Nome del nuovo attributo nodo" placeholder="Nome attributo" bind:value={nodeAttributeAlias} />
                <select aria-label="Campo JSON per il nuovo attributo nodo" bind:value={nodeAttributePath}>
                  <option value="">Scegli campo JSON</option>
                  {#each nodeFieldPaths as field}<option value={field}>{field}</option>{/each}
                </select>
                <button type="button" on:click={() => addAttributeMapping("node")} disabled={!nodeAttributeAlias.trim() || !nodeAttributePath}>Aggiungi</button>
              </div>
            </section>

            <section class="attribute-mappings" aria-label="Attributi arco">
              <h3>Attributi arco</h3>
              {#each Object.entries(edgeMapping.attributes ?? {}) as [alias, path]}
                <div class="attribute-row">
                  <span title={alias}>{alias}</span>
                  <select aria-label={`Campo per attributo arco ${alias}`} value={path} on:change={(event) => updateAttributeMapping("edge", alias, (event.currentTarget as HTMLSelectElement).value)}>
                    <option value="">Rimuovi mapping</option>
                    {#each fieldOptions(edgeFieldPaths, path) as field}<option value={field}>{field}</option>{/each}
                  </select>
                  <button type="button" class="remove-attribute" aria-label={`Rimuovi attributo arco ${alias}`} on:click={() => updateAttributeMapping("edge", alias, "")}>×</button>
                </div>
              {/each}
              <div class="attribute-add">
                <input aria-label="Nome del nuovo attributo arco" placeholder="Nome attributo" bind:value={edgeAttributeAlias} />
                <select aria-label="Campo JSON per il nuovo attributo arco" bind:value={edgeAttributePath}>
                  <option value="">Scegli campo JSON</option>
                  {#each edgeFieldPaths as field}<option value={field}>{field}</option>{/each}
                </select>
                <button type="button" on:click={() => addAttributeMapping("edge")} disabled={!edgeAttributeAlias.trim() || !edgeAttributePath}>Aggiungi</button>
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
        <textarea
          id="graph-config"
          spellcheck="false"
          value={configText}
          on:input={(e) =>
            onConfigTextChange((e.currentTarget as HTMLTextAreaElement).value)}
        ></textarea>
      </section>

      <section class="json-editor-section">
        <label for="graph-dataset">Dataset JSON</label>
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
          <strong>Il grafo non è stato applicato</strong>
          <span>{errorMessage}</span>
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
      <details class="example-list">
        <summary>Apri un esempio</summary>
        <div>
          <button class="secondary-button" type="button" on:click={onLoadDavis} title="Grafo bipartito Davis Southern Women, mapping schema v2">Davis Southern Women · 32 nodi</button>
          <button class="secondary-button" type="button" on:click={onLoadKarate} title="Grafo Zachary Karate Club con mapping schema v2">Karate Club · 34 nodi</button>
          <button class="secondary-button" type="button" on:click={onLoadGahukuGama} title="Rete Gahuku-Gama con segni e triadi firmate">Gahuku-Gama · triadi firmate</button>
          <button class="secondary-button" type="button" on:click={onLoadTemporalEdges} title="Fixture schema v2 con intervalli temporali sugli archi">Rete temporale · 4 nodi</button>
          <button class="secondary-button" type="button" on:click={onLoadInVS} title="Finestra inclusiva [28.800, 34.800] s">SocioPatterns InVS · 45 nodi</button>
          <button class="secondary-button" type="button" on:click={onLoadInVSFull} title="Tutti i contatti della rete InVS">SocioPatterns InVS completo · 92 nodi</button>
        </div>
      </details>
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
    font: 13px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
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

  .data-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; padding: 11px; border: 1px solid rgba(148, 163, 184, .2); border-radius: 11px; background: rgba(30, 41, 59, .62); }
  .file-button { position: relative; display: inline-flex; justify-content: center; align-items: center; min-height: 36px; padding: 7px 9px; box-sizing: border-box; border: 1px solid rgba(148, 163, 184, .26); border-radius: 8px; background: rgba(148, 163, 184, .12); color: #e2e8f0; cursor: pointer; font-size: 11px; font-weight: 650; text-align: center; }
  .file-button:hover { background: rgba(148, 163, 184, .2); }
  .file-button:focus-within { outline: 3px solid rgba(56, 189, 248, .32); outline-offset: 2px; }
  .file-button input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
  .data-actions > :global(button) { min-height: 36px; padding: 7px 9px; border: 1px solid rgba(148, 163, 184, .26); border-radius: 8px; font-size: 11px; }
  .file-message, .file-error, .file-hint, .session-status { grid-column: 1 / -1; margin: 0; font-size: 11px; line-height: 1.45; }
  .session-status { color: #a7f3d0; }
  .file-message { color: #a7f3d0; }
  .file-error { color: #fecaca; }
  .file-hint { color: #aab7c8; }

  .input-validation { display: flex; flex-direction: column; gap: 7px; padding: 11px; border: 1px solid rgba(52, 211, 153, .3); border-radius: 11px; background: rgba(6, 78, 59, .28); }
  .input-validation.error { border-color: rgba(248, 113, 113, .58); background: rgba(127, 29, 29, .24); }
  .input-validation.warning { border-color: rgba(251, 191, 36, .48); background: rgba(120, 53, 15, .2); }
  .validation-heading { display: flex; justify-content: space-between; align-items: center; gap: 10px; color: #f8fafc; font-size: 11px; }
  .validation-state { flex: 0 0 auto; color: #a7f3d0; font-size: 10px; font-weight: 700; }
  .input-validation.error .validation-state { color: #fecaca; }
  .input-validation.warning .validation-state { color: #fde68a; }
  .input-validation > p { margin: 0; color: #cbd5e1; font-size: 10px; line-height: 1.45; }
  .draft-preview { margin: 2px 0 0; padding: 7px; border: 1px solid rgba(148, 163, 184, .22); border-radius: 8px; background: rgba(2, 6, 23, .28); }
  .draft-preview figcaption { margin-bottom: 4px; color: #e2e8f0; font-size: 10px; font-weight: 700; }
  .draft-preview svg { display: block; width: 100%; max-height: 180px; overflow: visible; }
  .draft-preview text { fill: #e2e8f0; font: 10px system-ui, sans-serif; }
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
  .mapping-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .mapping-heading h2 { margin: 0; color: #f8fafc; font-size: 13px; }
  .mapping-heading .text-button { padding: 5px 7px; border: 1px solid rgba(148, 163, 184, .24); border-radius: 6px; background: transparent; color: #b8d8d3; font-size: 10px; }
  .mapping-section > p { margin: 0; color: #aab7c8; font-size: 10px; line-height: 1.4; }
  .mapping-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .mapping-grid label { display: flex; flex-direction: column; gap: 4px; min-width: 0; color: #dbe4ee; font-size: 10px; font-weight: 650; }
  .mapping-grid select { width: 100%; min-width: 0; min-height: 32px; padding: 5px 7px; border: 1px solid rgba(148, 163, 184, .3); border-radius: 7px; background: #0f172a; color: #e2e8f0; font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }
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
  .attribute-row select, .attribute-add select, .attribute-add input { width: 100%; min-width: 0; min-height: 31px; box-sizing: border-box; padding: 5px 6px; border: 1px solid rgba(148, 163, 184, .3); border-radius: 7px; background: #0f172a; color: #e2e8f0; font: 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .attribute-add { grid-template-columns: minmax(72px, .7fr) minmax(0, 1.4fr) auto; }
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

  textarea {
    width: 100%;
    min-height: 96px;
    height: auto;
    flex: 1 1 96px;
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

  .example-list { width: 100%; }
  .example-list summary { display: inline-flex; align-items: center; min-height: 35px; padding: 0 10px; border-radius: 8px; background: rgba(148, 163, 184, .12); color: #dbe4ee; cursor: pointer; font-size: 11px; font-weight: 650; }
  .example-list > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-top: 8px; }
  .example-list button { min-height: 34px; font-size: 10px; text-align: left; }

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
    .data-actions { grid-template-columns: 1fr 1fr; }
    .example-list > div { grid-template-columns: 1fr; }
    .mapping-grid { grid-template-columns: 1fr; }
    .attribute-row, .attribute-add { grid-template-columns: 1fr 30px; }
    .attribute-row > span, .attribute-add input { grid-column: 1 / -1; }
    .attribute-add button { grid-column: 1 / -1; }
  }
</style>
