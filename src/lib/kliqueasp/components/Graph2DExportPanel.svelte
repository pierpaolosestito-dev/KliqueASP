<script lang="ts">
  import { buildGraph2DScene, buildGraph2DSvg, canShowGraph2DNodeText, countGraph2DNodeLabelOverlaps, estimateGraph2DSceneSize, formatGraph2DSceneCountSummary, GRAPH2D_NODE_TEXT_LIMIT, type Graph2DEdgeAnnotation, type Graph2DLinkInput, type Graph2DMode, type Graph2DNodeInput } from "../graph/graph2dExport.ts";
  import { buildGraph2DDownloadFilename, scheduleGraph2DObjectUrlRevocation } from "../graph/graph2dDownload.ts";
  import { clampGraph2DPartitionIndex, parseGraph2DPartitionNumber, resolveGraph2DModeOnOpen } from "../graph/graph2DExportSelection.ts";

  export let open = false;
  export let nodes: Graph2DNodeInput[] = [];
  export let links: Graph2DLinkInput[] = [];
  export let highlightedNodeIds: string[] = [];
  export let highlightedEdgeIds: string[] = [];
  export let nodeAnnotations: Record<string, string> = {};
  export let edgeAnnotations: Record<string, Graph2DEdgeAnnotation> = {};
  export let communityPartitions: string[][][] = [];
  export let highlightedCommunityPartitionIndex = -1;
  export let coreNumbers: Record<string, number> | null = null;
  export let orderedNodeIds: string[] = [];
  export let resultLabel = "";
  export let completionLabel = "";
  export let resultKind: "aggregate" | "collection" | undefined = undefined;
  export let graphDirection: "directed" | "undirected" = "undirected";
  export let edgeColors: unknown = {};
  export let scopeLabel = "";
  export let onClose: () => void = () => {};

  const MAX_PREVIEW_NODES = 5000;
  const MAX_PREVIEW_EDGES = 20000;
  let mode: Graph2DMode = "projection";
  let showLabels = true;
  let showNodeIds = false;
  let showLegend = true;
  let transparentBackground = false;
  let width = 1280;
  let height = 820;
  let previewScale = 100;
  let selectedPartitionIndex = 0;
  let partitionInputValue = "1";
  let partitionInputError = "";
  let wasOpen = false;
  let showNodeAnnotations = false;
  let labelDisplayManuallyConfigured = false;
  let exportError = "";
  let downloadStatus = "";
  let downloading = false;
  let dialogElement: HTMLDialogElement;
  let dialogTrigger: HTMLElement | null = null;

  function communityColor(index: number): string {
    const hue = ((index * 137.508 + 218) % 360 + 360) % 360;
    const saturation = 0.62;
    const lightness = 0.43;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const segment = hue / 60;
    const second = chroma * (1 - Math.abs(segment % 2 - 1));
    const [red, green, blue] = segment < 1 ? [chroma, second, 0]
      : segment < 2 ? [second, chroma, 0]
        : segment < 3 ? [0, chroma, second]
          : segment < 4 ? [0, second, chroma]
            : segment < 5 ? [second, 0, chroma]
              : [chroma, 0, second];
    const offset = lightness - chroma / 2;
    return "#" + [red, green, blue]
      .map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0"))
      .join("");
  }

  function choosePartition(value: string, inputElement?: HTMLInputElement) {
    const zeroBasedIndex = parseGraph2DPartitionNumber(value, communityPartitions.length);
    if (zeroBasedIndex === null) {
      partitionInputError = `Inserisci un intero da 1 a ${communityPartitions.length}.`;
      partitionInputValue = String(selectedPartitionIndex + 1);
      if (inputElement) inputElement.value = partitionInputValue;
      return;
    }
    selectPartitionIndex(zeroBasedIndex);
    if (inputElement) inputElement.value = partitionInputValue;
  }

  function selectPartitionIndex(index: number) {
    selectedPartitionIndex = clampGraph2DPartitionIndex(index, communityPartitions.length);
    partitionInputValue = String(selectedPartitionIndex + 1);
    partitionInputError = "";
  }

  $: hasWitness = highlightedNodeIds.length > 0 || highlightedEdgeIds.length > 0;
  $: exportScopeLabel = mode === "witness" ? "Sottoinsieme evidenziato" : scopeLabel || "Grafo corrente";
  $: if (communityPartitions.length > 0 && selectedPartitionIndex >= communityPartitions.length) {
    selectPartitionIndex(communityPartitions.length - 1);
  }
  $: currentCommunities = communityPartitions[selectedPartitionIndex] ?? [];
  $: communityByNodeId = Object.fromEntries(currentCommunities.flatMap((community, index) =>
    community.map((nodeId) => [nodeId, `c${index + 1}`])
  ));
  $: nodeColors = Object.fromEntries(currentCommunities.flatMap((community, index) =>
    community.map((nodeId) => [nodeId, communityColor(index)])
  ));
  $: communityLegend = currentCommunities.map((_community, index) => ({
    id: `c${index + 1}`,
    label: `Comunità ${index + 1}`,
    color: communityColor(index)
  }));
  $: communitySelectionIndex = currentCommunities.findIndex((community) =>
    community.some((nodeId) => highlightedNodeIds.includes(nodeId))
  );
  $: annotationByNodeId = {
    ...nodeAnnotations,
    ...(showNodeAnnotations && coreNumbers
      ? Object.fromEntries(Object.entries(coreNumbers).map(([nodeId, coreNumber]) => [nodeId, `core ${coreNumber}`]))
      : {}),
    ...(orderedNodeIds.length
      ? Object.fromEntries(orderedNodeIds.map((nodeId, index) => [nodeId, `passo ${index + 1}`]))
      : {})
  };
  $: annotationAvailable = orderedNodeIds.length > 0 || Object.keys(coreNumbers ?? {}).length > 0 || Object.keys(nodeAnnotations).length > 0;
  $: sceneHypotheticalCount = scene?.links.filter((link) => link.hypothetical).length ?? 0;
  $: sceneObservedCount = (scene?.links.length ?? 0) - sceneHypotheticalCount;
  $: sceneCountSummary = scene
    ? formatGraph2DSceneCountSummary(scene.nodes.length, sceneObservedCount, sceneHypotheticalCount)
    : "";
  $: inputHypotheticalCount = links.filter((link) => link.hypothetical === true || link.analysis?.hypothetical === true).length;
  $: exportResultLabel = communityLegend.length
    ? `${communitySelectionIndex >= 0 ? `Comunità ${communitySelectionIndex + 1} evidenziata · ` : ""}partizione ottima ${selectedPartitionIndex + 1}`
    : resultLabel;
  $: {
    if (open && !wasOpen) {
      const activeElement = document.activeElement;
      dialogTrigger = activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : null;
      mode = resolveGraph2DModeOnOpen(mode, highlightedNodeIds.length > 0 || highlightedEdgeIds.length > 0);
      labelDisplayManuallyConfigured = false;
      exportError = "";
      downloadStatus = "";
      if (highlightedCommunityPartitionIndex >= 0 && highlightedCommunityPartitionIndex < communityPartitions.length) {
        selectPartitionIndex(highlightedCommunityPartitionIndex);
      } else {
        selectPartitionIndex(0);
      }
      if (Object.keys(nodeAnnotations).length > 0) showNodeAnnotations = true;
    }
    wasOpen = open;
  }
  $: exportEstimate = open
    ? estimateGraph2DSceneSize(nodes, links, { mode, highlightedNodeIds, highlightedEdgeIds })
    : { nodeCount: 0, edgeCount: 0 };
  $: exportTooLarge = exportEstimate.nodeCount > MAX_PREVIEW_NODES || exportEstimate.edgeCount > MAX_PREVIEW_EDGES;
  $: scene = open && !exportTooLarge
    ? buildGraph2DScene(nodes, links, {
        mode,
        width,
        height,
        graphDirection,
        highlightedNodeIds,
        highlightedEdgeIds,
        edgeColors,
        nodeColors,
        communityByNodeId,
        nodeAnnotations: annotationByNodeId,
        edgeAnnotations
      })
    : null;
  $: nodeTextAvailable = !!scene && canShowGraph2DNodeText(scene.nodes.length);
  $: estimatedLabelOverlaps = scene && nodeTextAvailable
    ? countGraph2DNodeLabelOverlaps(scene, {
        showLabels: true,
        showNodeIds,
        showAnnotations: showNodeAnnotations || orderedNodeIds.length > 0
      })
    : 0;
  $: if (open && scene && nodeTextAvailable && !labelDisplayManuallyConfigured) {
    showLabels = estimatedLabelOverlaps === 0;
  }
  $: effectiveShowLabels = showLabels && nodeTextAvailable;
  $: effectiveShowNodeIds = showNodeIds && nodeTextAvailable;
  $: effectiveShowNodeAnnotations = (showNodeAnnotations || orderedNodeIds.length > 0) && nodeTextAvailable;
  $: activeLabelOverlaps = scene
    ? countGraph2DNodeLabelOverlaps(scene, {
        showLabels: effectiveShowLabels,
        showNodeIds: effectiveShowNodeIds,
        showAnnotations: effectiveShowNodeAnnotations
      })
    : 0;
  $: svg = scene
    ? buildGraph2DSvg(scene, {
        title: mode === "witness"
          ? resultKind === "aggregate" ? "Elementi evidenziati" : "Risultato selezionato"
          : "Proiezione del grafo",
        scopeLabel: exportScopeLabel,
        showLabels: effectiveShowLabels,
        showNodeIds: effectiveShowNodeIds,
        showLegend,
        transparentBackground,
        showAnnotations: effectiveShowNodeAnnotations,
        communityLegend,
        resultLabel: exportResultLabel,
        completionLabel
      })
    : "";
  $: if (open && dialogElement) queueMicrotask(() => dialogElement?.focus());

  function closeDialog() {
    const trigger = dialogTrigger;
    onClose();
    setTimeout(() => {
      if (trigger?.isConnected) trigger.focus();
      else document.querySelector<HTMLElement>(".export-action")?.focus();
    }, 0);
  }

  function handleDialogKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab" || !dialogElement) return;
    const controls = [...dialogElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )].filter((element) => element.offsetParent !== null);
    if (!controls.length) {
      event.preventDefault();
      dialogElement.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogElement)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function downloadSvg() {
    if (!svg || exportTooLarge) return;
    exportError = "";
    saveBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "svg");
  }

  async function downloadPng() {
    if (!svg || exportTooLarge || downloading) return;
    exportError = "";
    downloading = true;
    let objectUrl = "";
    try {
      const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      objectUrl = URL.createObjectURL(svgBlob);
      const image = new Image();
      image.decoding = "async";
      image.src = objectUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = scene?.width ?? width;
      canvas.height = scene?.height ?? height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Il browser non ha reso disponibile il canvas per creare il PNG.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const png = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Il browser non ha creato il file PNG.")), "image/png");
      });
      saveBlob(png, "png");
    } catch (error) {
      exportError = error instanceof Error ? error.message : "Esportazione PNG non riuscita.";
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      downloading = false;
    }
  }

  function saveBlob(blob: Blob, extension: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = buildGraph2DDownloadFilename(mode, exportResultLabel, extension === "png" ? "png" : "svg");
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    downloadStatus = `Richiesta di download inviata al browser: ${anchor.download}`;
    scheduleGraph2DObjectUrlRevocation(url, (objectUrl) => URL.revokeObjectURL(objectUrl));
  }
</script>

{#if open}
  <div class="backdrop" role="presentation" on:click={(event) => event.target === event.currentTarget && closeDialog()}>
    <dialog
      open
      class="dialog"
      aria-modal="true"
      aria-labelledby="graph-export-title"
      tabindex="-1"
      bind:this={dialogElement}
      on:keydown={handleDialogKeydown}
    >
      <header class="dialog-header">
        <div>
          <p class="eyebrow">ESPORTA</p>
          <h2 id="graph-export-title">Grafo 2D</h2>
          <p class="scope">{exportScopeLabel}</p>
        </div>
        <button class="icon-button" type="button" aria-label="Chiudi export 2D" on:click={closeDialog}>×</button>
      </header>

      <div class="body">
        <aside class="controls" aria-label="Opzioni export 2D">
          <fieldset>
            <legend>Elementi inclusi</legend>
            <label class="radio-row">
              <input type="radio" name="graph-2d-mode" value="projection" bind:group={mode} />
              <span><strong>Proiezione completa</strong><small>{nodes.length} nodi · {links.length - inputHypotheticalCount} archi{#if inputHypotheticalCount} · {inputHypotheticalCount} proposte{/if}</small></span>
            </label>
            <label class="radio-row" class:disabled={!hasWitness}>
              <input type="radio" name="graph-2d-mode" value="witness" bind:group={mode} disabled={!hasWitness} />
              <span><strong>Solo risultato selezionato</strong><small>{hasWitness ? "Elementi evidenziati nell'analisi" : "Seleziona prima un risultato"}</small></span>
            </label>
          </fieldset>

          {#if communityPartitions.length > 1}
            <fieldset>
              <legend>Partizione da mostrare</legend>
              <label class="partition-index" for="graph-2d-partition">Indice della partizione ottima (1–{communityPartitions.length})
                <input
                  id="graph-2d-partition"
                  aria-label={`Numero della partizione ottima, da 1 a ${communityPartitions.length}`}
                  type="number"
                  min="1"
                  max={communityPartitions.length}
                  step="1"
                  value={partitionInputValue}
                  on:change={(event) => choosePartition((event.currentTarget as HTMLInputElement).value, event.currentTarget as HTMLInputElement)}
                />
              </label>
              {#if partitionInputError}<small class="partition-error" role="alert">{partitionInputError}</small>{/if}
              <div class="partition-stepper" role="group" aria-label="Scorri le partizioni ottime">
                <button type="button" disabled={selectedPartitionIndex <= 0} on:click={() => selectPartitionIndex(selectedPartitionIndex - 1)}>Precedente</button>
                <span>Partizione {selectedPartitionIndex + 1} di {communityPartitions.length} · {currentCommunities.length} comunità</span>
                <button type="button" disabled={selectedPartitionIndex >= communityPartitions.length - 1} on:click={() => selectPartitionIndex(selectedPartitionIndex + 1)}>Successiva</button>
              </div>
            </fieldset>
          {/if}

          <fieldset>
            <legend>Visualizzazione</legend>
            <label class="check-row"><input type="checkbox" bind:checked={showLabels} on:change={() => labelDisplayManuallyConfigured = true} disabled={!nodeTextAvailable} /> Nomi dei nodi</label>
            <label class="check-row"><input type="checkbox" bind:checked={showNodeIds} on:change={() => labelDisplayManuallyConfigured = true} disabled={!nodeTextAvailable} /> Mostra ID dei nodi</label>
            <label class="check-row"><input type="checkbox" bind:checked={showLegend} /> Legenda</label>
            <label class="check-row"><input type="checkbox" bind:checked={transparentBackground} /> Sfondo trasparente</label>
            {#if annotationAvailable && !orderedNodeIds.length}
              <label class="check-row"><input type="checkbox" bind:checked={showNodeAnnotations} on:change={() => labelDisplayManuallyConfigured = true} disabled={!nodeTextAvailable} /> Annotazioni dei nodi</label>
            {:else if orderedNodeIds.length}
              <label class="check-row"><input type="checkbox" checked disabled /> Ordine del cammino</label>
            {/if}
          </fieldset>

          <label class="preview-zoom">Zoom anteprima <strong>{previewScale}%</strong>
            <input aria-label="Zoom anteprima del grafo 2D" type="range" min="100" max="300" step="25" bind:value={previewScale} />
          </label>

          <fieldset class="dimensions">
            <legend>Dimensioni dell'immagine</legend>
            <label>Larghezza <input type="number" min="240" max="8192" step="80" bind:value={width} /></label>
            <label>Altezza <input type="number" min="240" max="8192" step="80" bind:value={height} /></label>
          </fieldset>

          {#if scene}
            <div class="count-summary" role="status" aria-live="polite">
              <strong>{sceneCountSummary}</strong>
              {#if completionLabel}<span class="completion-status">{completionLabel}</span>{/if}
              <span>{graphDirection === "directed" ? "Le frecce indicano la direzione." : "Rete non orientata."}</span>
              {#if scene.links.some((link) => link.contextOnly)}<span>Linee puntinate: relazioni osservate fra i nodi del risultato, non parte dell'evidenza restituita dall'analisi.</span>{/if}
              {#if sceneHypotheticalCount}<span>Le linee tratteggiate sono proposte ipotetiche e non archi osservati.</span>{/if}
              {#if communityLegend.length}<span>{currentCommunities.length} comunità distinte per colore; il contorno evidenzia la selezione.</span>{/if}
              {#if scene.nodes.length > 700}<span>Layout circolare leggero per questa dimensione.</span>{/if}
              {#if scene && !nodeTextAvailable}<span>Nomi, ID e annotazioni sono disattivati oltre {GRAPH2D_NODE_TEXT_LIMIT} nodi per mantenere leggibile la preview.</span>{/if}
              {#if estimatedLabelOverlaps > 0 && !showLabels && !labelDisplayManuallyConfigured}<span class="label-warning">Nomi nascosti inizialmente: {estimatedLabelOverlaps} coppie di etichette si sovrapporrebbero. Puoi attivarli o selezionare «Solo risultato selezionato».</span>{/if}
              {#if activeLabelOverlaps > 0}<span class="label-warning">Le etichette attive si sovrappongono in {activeLabelOverlaps} coppie; puoi nascondere nomi/ID o restringere il grafo al risultato selezionato.</span>{/if}
            </div>
          {/if}

          {#if exportTooLarge}
            <div class="warning" role="status">
              {mode === "projection" ? "La proiezione completa" : "Il risultato selezionato"} comprende {exportEstimate.nodeCount} {exportEstimate.nodeCount === 1 ? "nodo" : "nodi"} e {exportEstimate.edgeCount} {exportEstimate.edgeCount === 1 ? "arco" : "archi"}.
              {#if exportEstimate.nodeCount > MAX_PREVIEW_NODES} Limite nodi: {MAX_PREVIEW_NODES}.{/if}
              {#if exportEstimate.edgeCount > MAX_PREVIEW_EDGES} Limite archi: {MAX_PREVIEW_EDGES}.{/if}
              {#if mode === "projection"}
                Riduci la proiezione oppure seleziona Solo risultato selezionato; non vengono rimossi elementi in automatico.
              {:else}
                Restringi il risultato selezionato prima di generare l'immagine; non vengono rimossi elementi in automatico.
              {/if}
            </div>
          {/if}
          {#if exportError}<div class="warning" role="alert">{exportError}</div>{/if}
          {#if downloadStatus}<div class="download-status" role="status" aria-live="polite">{downloadStatus}</div>{/if}
        </aside>

        <div class="preview-wrap">
          {#if svg}
            <div class:transparent={transparentBackground} class="preview" style={`--preview-scale: ${previewScale / 100}`} aria-label="Anteprima del grafo 2D">
              {@html svg}
            </div>
          {:else}
            <div class="empty-preview">
              <span aria-hidden="true">↗</span>
              <strong>Anteprima non generata</strong>
              <p>Riduci il perimetro dell'immagine per mantenere reattiva l'applicazione.</p>
            </div>
          {/if}
        </div>
      </div>

      <footer class="dialog-footer">
        <span class="format-note">SVG vettoriale · PNG raster</span>
        <div>
          <button class="secondary" type="button" on:click={closeDialog}>Chiudi</button>
          <button type="button" disabled={!svg || exportTooLarge} on:click={downloadSvg}>Scarica SVG</button>
          <button type="button" disabled={!svg || exportTooLarge || downloading} on:click={downloadPng}>
            {downloading ? "Creo PNG…" : "Scarica PNG"}
          </button>
        </div>
      </footer>
    </dialog>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 12px; background: rgba(8, 15, 28, .62); backdrop-filter: blur(5px); }
.dialog { box-sizing: border-box; display: flex; flex-direction: column; width: min(1354px, calc(100% - 24px)); height: min(900px, calc(100dvh - 24px)); max-height: min(900px, calc(100dvh - 24px)); padding: 16px; overflow: hidden; border: 1px solid #dbe3ed; border-radius: 18px; background: #f8fafc; color: #172033; box-shadow: 0 28px 90px rgba(15, 23, 42, .32); outline: none; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .dialog-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px 24px 16px; border-bottom: 1px solid #e2e8f0; background: #fff; }
  .eyebrow { margin: 0 0 5px; color: #708096; font-size: 10px; font-weight: 750; letter-spacing: .12em; }
  h2 { margin: 0; font-size: 21px; line-height: 1.2; }
  .scope { margin: 5px 0 0; color: #64748b; font-size: 12px; }
  .icon-button { width: 36px; height: 36px; border: 0; border-radius: 10px; background: #f1f5f9; color: #334155; font-size: 23px; cursor: pointer; }
  .body { display: grid; grid-template-columns: 252px minmax(0, 1fr); min-height: 0; flex: 1; }
  .controls { display: flex; flex-direction: column; gap: 18px; overflow-y: auto; padding: 18px; border-right: 1px solid #e2e8f0; background: #fff; }
  fieldset { display: flex; flex-direction: column; gap: 11px; min-width: 0; margin: 0; padding: 0; border: 0; }
  legend { margin-bottom: 2px; color: #475569; font-size: 11px; font-weight: 750; letter-spacing: .04em; text-transform: uppercase; }
  .radio-row { display: flex; align-items: flex-start; gap: 9px; cursor: pointer; }
  .radio-row input, .check-row input { margin-top: 2px; accent-color: #256e67; }
  .radio-row span { display: flex; flex-direction: column; gap: 2px; }
  .radio-row strong { font-size: 12px; font-weight: 650; }
  .radio-row small { color: #64748b; font-size: 11px; line-height: 1.4; }
  .radio-row.disabled { color: #94a3b8; cursor: not-allowed; }
  .check-row { display: flex; align-items: center; gap: 8px; color: #334155; font-size: 12px; cursor: pointer; }
  .partition-index { display: grid; gap: 5px; color: #334155; font-size: 12px; }
  .partition-index input { width: 120px; padding: 6px 7px; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; color: #172033; font: inherit; }
  .partition-error { color: #a12622; }
  .partition-stepper { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 6px; color: #475569; font-size: 11px; }
  .partition-stepper button { padding: 5px 7px; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; color: #26384b; font: inherit; cursor: pointer; }
  .partition-stepper button:disabled { color: #94a3b8; cursor: not-allowed; }
  .partition-stepper button:focus-visible, .partition-index input:focus-visible { outline: 2px solid #176b80; outline-offset: 2px; }
  .dimensions label { display: flex; justify-content: space-between; align-items: center; gap: 8px; color: #475569; font-size: 12px; }
  .dimensions input { width: 86px; padding: 6px 7px; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; color: #172033; font: inherit; }
  .count-summary { display: flex; flex-direction: column; gap: 4px; padding: 10px; border: 1px solid #d8e7e4; border-radius: 10px; background: #f2f8f7; color: #52616f; font-size: 11px; line-height: 1.45; }
  .count-summary strong { color: #1b554f; font-size: 12px; }
  .label-warning { color: #854d0e; font-weight: 600; }
  .completion-status { color: #1e645c; font-weight: 700; }
  .download-status { padding: 9px 10px; border: 1px solid #b9ddd5; border-radius: 9px; background: #f0faf7; color: #155e52; font-size: 11px; line-height: 1.45; overflow-wrap: anywhere; }
  .warning { padding: 10px; border: 1px solid #f3cf91; border-radius: 9px; background: #fff8eb; color: #854d0e; font-size: 11px; line-height: 1.45; }
  .preview-wrap { display: grid; min-width: 0; min-height: 0; padding: 16px; background: #edf2f7; }
  .preview { display: grid; min-height: 0; height: 100%; max-height: 100%; place-items: center; overflow: auto; border: 1px solid #dbe3ed; border-radius: 12px; background: #fff; }
  .preview.transparent { background-color: #eef2f7; background-image: linear-gradient(45deg, #e0e7ef 25%, transparent 25%), linear-gradient(-45deg, #e0e7ef 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e0e7ef 75%), linear-gradient(-45deg, transparent 75%, #e0e7ef 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; }
  .preview :global(svg) { display: block; width: calc(var(--preview-scale, 1) * 100%); height: calc(var(--preview-scale, 1) * 100%); max-width: none; max-height: none; object-fit: contain; flex: none; }
  .preview-zoom { display: grid; grid-template-columns: 1fr auto; gap: 6px 10px; color: #334155; font-size: 12px; }
  .preview-zoom input { grid-column: 1 / -1; width: 100%; accent-color: #1e645d; }
  .empty-preview { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 420px; color: #64748b; text-align: center; }
  .empty-preview > span { color: #68817e; font-size: 28px; }
  .empty-preview strong { color: #334155; font-size: 14px; }
  .empty-preview p { max-width: 300px; margin: 0; font-size: 12px; line-height: 1.5; }
  .dialog-footer { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 14px 20px; border-top: 1px solid #e2e8f0; background: #fff; }
  .format-note { color: #64748b; font-size: 11px; }
  .dialog-footer > div { display: flex; gap: 8px; }
  .dialog-footer button { min-height: 36px; padding: 8px 12px; border: 1px solid #1e645d; border-radius: 8px; background: #1e645d; color: #fff; font: 600 12px/1 system-ui, sans-serif; cursor: pointer; }
  .dialog-footer button.secondary { border-color: #cbd5e1; background: #fff; color: #334155; }
  .dialog-footer button:disabled { cursor: not-allowed; opacity: .45; }
  button:focus-visible, input:focus-visible { outline: 3px solid rgba(20, 126, 113, .3); outline-offset: 2px; }
  @media (max-width: 800px) {
    .backdrop { padding: 0; place-items: stretch; }
    .dialog { width: 100%; height: 100dvh; max-height: 100dvh; padding: 0; border: 0; border-radius: 0; }
    .body { grid-template-columns: 1fr; grid-template-rows: auto minmax(240px, 1fr); overflow: auto; }
    .controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; overflow: visible; padding: 14px; border-right: 0; border-bottom: 1px solid #e2e8f0; }
    .preview-wrap { min-height: 0; padding: 10px; }
    .preview, .empty-preview { min-height: 300px; }
    .dialog-footer { align-items: flex-start; flex-direction: column; }
    .dialog-footer > div { width: 100%; }
    .dialog-footer button { flex: 1; }
  }
  @media (max-width: 480px) {
    .controls { grid-template-columns: 1fr; }
    .dialog-footer > div { flex-wrap: wrap; }
    .dialog-footer button { min-width: 28%; }
  }
</style>
