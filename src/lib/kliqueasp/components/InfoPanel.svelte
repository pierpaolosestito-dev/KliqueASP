<script lang="ts">
  import { tick } from "svelte";
  import type { NeighborhoodDirection } from "../graph/graphVisualization.ts";
  import ProgressiveList from "./ProgressiveList.svelte";
  import ResultListPager from "./ResultListPager.svelte";

  type Neighbor = {
    id: string;
    label: string;
  };

  type GenericRecord = Record<string, any>;

  // Props dal parent
  export let selectedNode: any = null;
  export let selectedDetails: GenericRecord | null = null;
  export let rootSelectedId: string | null = null;
  export let directedGraph = false;
  export let neighborhoodFocus: {
    rootNodeId: string;
    maxHops: number;
    direction: NeighborhoodDirection;
    nodeCount: number;
    recordCount: number;
    renderedLinkCount: number;
  } | null = null;
  export let totalGraphNodeCount = 0;
  export let neighborIds: Neighbor[] = [];
  export let highlightedNeighbors: Set<string> = new Set();

  export let onBackToRoot: () => void = () => {};
  export let onFocusNeighborhood: (rootNodeId: string, maxHops: number, direction: NeighborhoodDirection) => void = () => {};
  export let onClearNeighborhoodFocus: () => void = () => {};
  export let onViewNeighbor: (id: string) => void = () => {};
  export let onCommitNeighbor: (id: string) => void = () => {};

  let neighborhoodRadius: number | undefined = 1;
  let maximumNeighborhoodRadius = 1;
  let neighborhoodRadiusIsValid = true;
  let neighborhoodDirection: NeighborhoodDirection = "weak";
  const neighborPageSize = 50;
  let visibleNeighborLimit = neighborPageSize;
  let genericDetails: Array<{ key: string; label: string; value: any }> = [];
  let previousSelectedNodeId = "";
  let previousNeighborCount = -1;

  $: maximumNeighborhoodRadius = Math.max(1, totalGraphNodeCount);
  $: neighborhoodRadiusIsValid = Number.isSafeInteger(Number(neighborhoodRadius)) &&
    Number(neighborhoodRadius) >= 1 && Number(neighborhoodRadius) <= maximumNeighborhoodRadius;
  $: selectedNodeId = selectedNode?.id == null ? "" : String(selectedNode.id);
  $: if (selectedNodeId !== previousSelectedNodeId || neighborIds.length !== previousNeighborCount) {
    previousSelectedNodeId = selectedNodeId;
    previousNeighborCount = neighborIds.length;
    visibleNeighborLimit = neighborPageSize;
  }
  $: visibleNeighborIds = neighborIds.slice(0, visibleNeighborLimit);
  $: genericDetails = getGenericDetails(selectedDetails);

  function showMoreNeighbors() {
    visibleNeighborLimit += neighborPageSize;
  }

  let showModal = false;
  let modalElement: HTMLDivElement | null = null;
  let modalTrigger: HTMLButtonElement | null = null;

  function openModal(event: MouseEvent) {
    modalTrigger = event.currentTarget as HTMLButtonElement;
    showModal = true;
  }

  function closeModal() {
    if (!showModal) return;
    showModal = false;
    const trigger = modalTrigger;
    modalTrigger = null;
    void tick().then(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!showModal) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeModal();
      return;
    }
    if (e.key !== "Tab" || !modalElement) return;

    const focusable = Array.from(modalElement.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;

    if (!first || !last) {
      e.preventDefault();
      modalElement.focus();
    } else if (e.shiftKey && (activeElement === first || activeElement === modalElement)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (activeElement === last || activeElement === modalElement)) {
      e.preventDefault();
      first.focus();
    }
  }

  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  // I campi HTML del dataset (biografia_html, contenuto) vengono renderizzati
  // con {@html}: teniamo solo tag di formattazione e link http(s)/mailto.
  const ALLOWED_TAGS = new Set([
    "a", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4",
    "h5", "h6", "hr", "i", "li", "ol", "p", "pre", "small", "span", "strong",
    "sub", "sup", "u", "ul"
  ]);

  const DROPPED_TAGS = new Set([
    "script", "style", "iframe", "object", "embed", "template", "noscript",
    "link", "meta", "base", "form", "svg", "math"
  ]);

  function sanitizeHtml(html: string): string {
    const doc = new DOMParser().parseFromString(String(html ?? ""), "text/html");

    const clean = (parent: Node) => {
      for (const child of Array.from(parent.childNodes)) {
        if (child.nodeType === Node.COMMENT_NODE) {
          child.remove();
          continue;
        }

        if (child.nodeType !== Node.ELEMENT_NODE) continue;

        const el = child as Element;
        const tag = el.tagName.toLowerCase();

        if (DROPPED_TAGS.has(tag)) {
          el.remove();
          continue;
        }

        clean(el);

        if (!ALLOWED_TAGS.has(tag)) {
          el.replaceWith(...Array.from(el.childNodes));
          continue;
        }

        const href = tag === "a" ? el.getAttribute("href") ?? "" : "";

        for (const attr of Array.from(el.attributes)) {
          el.removeAttribute(attr.name);
        }

        if (tag === "a" && /^(https?:|mailto:)/i.test(href.trim())) {
          el.setAttribute("href", href.trim());
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
    };

    clean(doc.body);
    return doc.body.innerHTML;
  }

  // Alcune immagini del dataset sono URL dell'ottimizzatore Next.js del sito
  // di origine ("/_next/image?url=<originale>&w=..."): usiamo l'URL originale.
  function resolveImageUrl(url: string): string {
    const value = String(url ?? "").trim();
    const match = /^\/_next\/image\?(.*)$/.exec(value);
    if (!match) return value;

    const original = new URLSearchParams(match[1]).get("url");
    return original && /^https?:\/\//i.test(original) ? original : value;
  }

  let failedImageUrl = "";

  function onBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) closeModal();
  }

  function isRenderablePrimitive(value: any) {
    return (
      value !== null &&
      value !== undefined &&
      (typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean")
    );
  }

  function formatKey(key: string) {
    const knownLabels: Record<string, string> = {
      active_from: "Attivo dal",
      active_to: "Attivo fino al"
    };
    const knownLabel = knownLabels[key.trim().toLowerCase()];
    if (knownLabel) return knownLabel;

    return key
      .replace(/_/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function getGenericDetails(details: GenericRecord | null) {
    if (!details) return [];

    const excluded = new Set([
      "tipo",
      "titolo",
      "roles",
      "biografia_html",
      "contenuto",
      "immagine_url"
    ]);

    return Object.entries(details)
      .filter(([key, value]) => !excluded.has(key) && isRenderablePrimitive(value))
      .map(([key, value]) => ({
        key,
        label: formatKey(key),
        value
      }));
  }
</script>

{#if selectedNode}
  <div class="info-panel">
    <h3 class="info-title">
      <button class="title-btn" type="button" on:click={openModal}>{selectedNode.label}</button>
    </h3>

    <p><strong>Grado:</strong> {selectedNode.degree}</p>

    <section class="neighborhood-focus">
      <strong>Focus del vicinato (solo vista)</strong>
      <label>
        Raggio in archi
        <input
          type="number"
          min="1"
          max={maximumNeighborhoodRadius}
          step="1"
          bind:value={neighborhoodRadius}
        />
      </label>
      {#if directedGraph}
        <label>
          Direzione
          <select bind:value={neighborhoodDirection}>
            <option value="weak">Debole: segue gli archi in entrambi i sensi</option>
            <option value="outgoing">In uscita</option>
            <option value="incoming">In ingresso</option>
          </select>
        </label>
      {/if}
      <button
        type="button"
        disabled={!neighborhoodRadiusIsValid}
        on:click={() => neighborhoodRadiusIsValid && onFocusNeighborhood(
          String(selectedNode.id),
          Number(neighborhoodRadius),
          directedGraph ? neighborhoodDirection : "weak"
        )}
      >Isola questo vicinato</button>
      {#if neighborhoodFocus}
        <small role="status">
          {#if neighborhoodFocus.nodeCount >= totalGraphNodeCount}
            Il raggio di {neighborhoodFocus.maxHops} archi da {neighborhoodFocus.rootNodeId} ({neighborhoodFocus.direction}) raggiunge tutti i {totalGraphNodeCount} nodi filtrati: questo focus non esclude nodi.
          {:else}
            Vista limitata a {neighborhoodFocus.nodeCount} di {totalGraphNodeCount} nodi entro {neighborhoodFocus.maxHops} archi da {neighborhoodFocus.rootNodeId} ({neighborhoodFocus.direction}).
          {/if}
          Mostra {neighborhoodFocus.recordCount} record in {neighborhoodFocus.renderedLinkCount} linee. L'analisi e gli export restano riferiti all'intero grafo filtrato.
        </small>
        <button type="button" on:click={onClearNeighborhoodFocus}>Mostra tutta la proiezione</button>
      {/if}
    </section>

    {#if rootSelectedId && selectedNode.id !== rootSelectedId}
      <button class="back-btn" type="button" on:click={onBackToRoot}>
        Torna al nodo principale
      </button>
    {/if}

    <strong>Vicini · {neighborIds.length}</strong>
    {#if neighborIds.length === 0}
      <p>Nessun vicino nella proiezione corrente.</p>
    {:else}
    <ul>
      {#each visibleNeighborIds as n}
        <li style="display:flex; align-items:center; gap:6px;">
          <label style="flex:1; display:flex; align-items:center; gap:6px;">
            <input
              type="checkbox"
              checked={highlightedNeighbors.has(n.id)}
              on:change={(e) => {
                const checked = (e.currentTarget as HTMLInputElement).checked;
                if (checked) onViewNeighbor(n.id);
                else onBackToRoot();
              }}
            />
            {n.label}
          </label>

          <button
            aria-label={`Esplora ${n.label}`}
            title="Esplora questo nodo"
            type="button"
            on:click={() => onCommitNeighbor(n.id)}
            class="explore-btn"
          >
            →
          </button>
        </li>
      {/each}
    </ul>
    <ResultListPager
      total={neighborIds.length}
      visible={visibleNeighborIds.length}
      pageSize={neighborPageSize}
      label="vicini"
      showMore={showMoreNeighbors}
    />
    {/if}
  </div>

  {#if showModal}
    <div
      bind:this={modalElement}
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="node-details-title"
      on:click={onBackdropClick}
      on:keydown={handleKeydown}
      tabindex="-1"
      use:focusOnMount
    >
      <div class="modal-card">

        <!-- HEADER -->
        <div class="modal-header" id="node-details-title">
          Dettagli del nodo {selectedNode.label}
        </div>

        <!-- BODY -->
        <div class="modal-body">

          {#if selectedDetails}

            {#if selectedDetails.tipo === "person"}

              {#if selectedDetails.luogo_nascita || selectedDetails.anno_nascita}
                <p>
                  <strong>Nascita:</strong>
                  {#if selectedDetails.luogo_nascita}
                    {selectedDetails.luogo_nascita}
                  {/if}
                  {#if selectedDetails.anno_nascita}
                    ({selectedDetails.anno_nascita})
                  {/if}
                </p>
              {/if}

              {#if selectedDetails.anno_morte}
                <p><strong>Morte:</strong> {selectedDetails.anno_morte}</p>
              {/if}

              {#if selectedDetails.periodo}
                <p><strong>Periodo:</strong> {selectedDetails.periodo}</p>
              {/if}

              {#if selectedDetails.description}
                <p><strong>Descrizione:</strong> {selectedDetails.description}</p>
              {/if}

              {#if selectedDetails.roles && selectedDetails.roles.length > 0}
                <hr />
                <p><strong>Ambiti professionali:</strong></p>
                <div class="node-detail-list">
                  <ProgressiveList items={selectedDetails.roles} resetKey={selectedDetails} label="ambiti professionali" let:item={role}>
                    <div class="role-entry">
                      {#if role.professione}
                        <strong>{role.professione}</strong>
                      {/if}

                      {#if role.macro_area || role.sotto_area}
                        —
                        {#if role.macro_area}
                          {role.macro_area}
                        {/if}
                        {#if role.sotto_area}
                          / {role.sotto_area}
                        {/if}
                      {/if}
                    </div>
                  </ProgressiveList>
                </div>
              {/if}

              {#if genericDetails.length > 0}
                <hr />
                <div class="node-detail-list">
                  <ProgressiveList items={genericDetails} resetKey={selectedDetails} label="campi aggiuntivi" let:item>
                    <p><strong>{item.label}:</strong> {item.value}</p>
                  </ProgressiveList>
                </div>
              {/if}

              {#if selectedDetails.biografia_html}
                <hr />
                <div class="biografia">
                  {@html sanitizeHtml(selectedDetails.biografia_html)}
                </div>
              {/if}

            {:else if selectedDetails.tipo === "place"}

              {#if selectedDetails.immagine_url && resolveImageUrl(selectedDetails.immagine_url) !== failedImageUrl}
                <img
                  src={resolveImageUrl(selectedDetails.immagine_url)}
                  alt={selectedDetails.titolo}
                  class="place-image"
                  on:error={() => (failedImageUrl = resolveImageUrl(selectedDetails?.immagine_url))}
                />
              {/if}

              {#if selectedDetails.citta}
                <p><strong>Città:</strong> {selectedDetails.citta}</p>
              {/if}

              {#if selectedDetails.kind}
                <p><strong>Tipo:</strong> {selectedDetails.kind}</p>
              {/if}

              {#if selectedDetails.description}
                <p><strong>Descrizione:</strong> {selectedDetails.description}</p>
              {/if}

              {#if genericDetails.length > 0}
                <hr />
                <div class="node-detail-list">
                  <ProgressiveList items={genericDetails} resetKey={selectedDetails} label="campi aggiuntivi" let:item>
                    <p><strong>{item.label}:</strong> {item.value}</p>
                  </ProgressiveList>
                </div>
              {/if}

              {#if selectedDetails.contenuto}
                <div class="contenuto">
                  {@html sanitizeHtml(selectedDetails.contenuto)}
                </div>
              {/if}

            {:else}

              {#if genericDetails.length > 0}
                <div class="node-detail-list">
                  <ProgressiveList items={genericDetails} resetKey={selectedDetails} label="campi aggiuntivi" let:item>
                    <p><strong>{item.label}:</strong> {item.value}</p>
                  </ProgressiveList>
                </div>
              {:else}
                <p>Nessun dettaglio disponibile.</p>
              {/if}

            {/if}

          {:else}
            <p>Nessun dettaglio disponibile.</p>
          {/if}

        </div>

        <!-- FOOTER -->
        <div class="modal-footer">
          <button class="modal-close" type="button" aria-label={`Chiudi dettagli di ${selectedNode.label}`} on:click={closeModal}>
            ✕
          </button>
        </div>

      </div>
    </div>
  {/if}
{/if}

<style>
  .info-panel {
    position: absolute;
    top: var(--info-top);
    right: var(--info-right);
    width: var(--info-width);
    max-height: var(--info-max-height);
    overflow-y: auto;
    background: var(--info-bg);
    padding: var(--info-padding);
    border-radius: var(--info-radius);
    z-index: var(--info-z);
  }

  .title-btn {
    display: block;
    text-align: left;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    color: inherit;
    font: inherit;
    text-decoration: underline;
  }

  .title-btn:focus-visible,
  .modal-close:focus-visible {
    outline: 2px solid var(--focus-color, #2563eb);
    outline-offset: 2px;
  }

  .info-title {
    margin: 0;
    font-size: var(--info-title-size);
  }

  .back-btn {
    margin-bottom: 10px;
    cursor: pointer;
  }

  .neighborhood-focus {
    display: grid;
    gap: 6px;
    margin: 12px 0;
    padding: 8px;
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 8px;
  }

  .neighborhood-focus label {
    display: grid;
    gap: 4px;
  }

  .neighborhood-focus select {
    max-width: 100%;
    min-width: 0;
  }

  .neighborhood-focus input[type="number"] {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  .explore-btn {
    cursor: pointer;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: var(--modal-backdrop);
    z-index: var(--modal-z);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
  }

  .modal-backdrop:focus-visible {
    outline: 2px solid var(--focus-color, #2563eb);
    outline-offset: -4px;
  }

  .modal-card {
    width: var(--modal-card-width);
    max-height: var(--modal-card-max-height);
    overflow-y: auto;
    background: var(--modal-card-bg);
    border-radius: var(--modal-card-radius);
    padding-bottom: 20px;
  }

  .modal-header {
    padding: 16px;
    font-size: var(--modal-header-size);
    font-weight: 600;
    border-bottom: var(--modal-header-border);
  }

  .modal-body {
    padding: var(--modal-body-padding);
    line-height: var(--modal-line-height);
  }

  .node-detail-list {
    display: grid;
    gap: 4px;
  }

  .node-detail-list :global(p) {
    margin: 2px 0;
  }

  .role-entry {
    overflow-wrap: anywhere;
  }

  .biografia {
    font-size: 14px;
  }

  .place-image {
    width: 100%;
    border-radius: 8px;
    margin-bottom: 12px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--modal-footer-padding);
  }

  .modal-close {
    border: none;
    background: var(--modal-close-bg);
    color: var(--modal-close-color);
    border-radius: 8px;
    width: 36px;
    height: 36px;
    cursor: pointer;
  }

  @media (max-width: 600px) {
    .info-panel {
      top: calc(var(--toolbar-top, 10px) + var(--toolbar-height, 180px) + 10px);
      right: 10px;
      width: min(
        calc(var(--info-width, 260px) + var(--info-padding, 12px) + var(--info-padding, 12px)),
        calc(100vw - 20px)
      );
      box-sizing: border-box;
      max-height: min(
        var(--info-max-height, 340px),
        max(120px, calc(100vh - var(--toolbar-top, 10px) - var(--toolbar-height, 180px) - 150px))
      );
      z-index: calc(var(--toolbar-z, 30) - 1);
    }
  }
</style>
