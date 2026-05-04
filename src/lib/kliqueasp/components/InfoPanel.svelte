<script lang="ts">
  import type { NodeDetails } from "../data/details";

  type Neighbor = {
    id: string;
    label: string;
  };

  type GenericRecord = Record<string, any>;

  // Props dal parent
  export let selectedNode: any = null;
  export let selectedDetails: NodeDetails | GenericRecord | null = null;
  export let rootSelectedId: string | null = null;
  export let neighborIds: Neighbor[] = [];
  export let highlightedNeighbors: Set<string> = new Set();

  export let onBackToRoot: () => void = () => {};
  export let onViewNeighbor: (id: string) => void = () => {};
  export let onCommitNeighbor: (id: string) => void = () => {};

  let showModal = false;

  function openModal() {
    showModal = true;
  }

  function closeModal() {
    showModal = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") closeModal();
  }

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
    <button class="title-btn" type="button" on:click={openModal}>
      <h3>{selectedNode.label}</h3>
    </button>

    <p><strong>Degree:</strong> {selectedNode.degree}</p>

    {#if rootSelectedId && selectedNode.id !== rootSelectedId}
      <button class="back-btn" type="button" on:click={onBackToRoot}>
        Torna al nodo principale
      </button>
    {/if}

    <strong>Neighbors:</strong>
    <ul>
      {#each neighborIds as n}
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
  </div>

  {#if showModal}
    <div
      class="modal-backdrop"
      role="dialog"
      aria-modal="true"
      on:click={onBackdropClick}
      on:keydown={handleKeydown}
      tabindex="0"
    >
      <div class="modal-card">

        <!-- HEADER -->
        <div class="modal-header">
          {selectedNode.label}
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
                <ul>
                  {#each selectedDetails.roles as role}
                    <li>
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
                    </li>
                  {/each}
                </ul>
              {/if}

              {#if getGenericDetails(selectedDetails).length > 0}
                <hr />
                {#each getGenericDetails(selectedDetails) as item}
                  <p><strong>{item.label}:</strong> {item.value}</p>
                {/each}
              {/if}

              {#if selectedDetails.biografia_html}
                <hr />
                <div class="biografia">
                  {@html selectedDetails.biografia_html}
                </div>
              {/if}

            {:else if selectedDetails.tipo === "place"}

              {#if selectedDetails.immagine_url}
                <img
                  src={selectedDetails.immagine_url}
                  alt={selectedDetails.titolo}
                  class="place-image"
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

              {#if getGenericDetails(selectedDetails).length > 0}
                <hr />
                {#each getGenericDetails(selectedDetails) as item}
                  <p><strong>{item.label}:</strong> {item.value}</p>
                {/each}
              {/if}

              {#if selectedDetails.contenuto}
                <div class="contenuto">
                  {@html selectedDetails.contenuto}
                </div>
              {/if}

            {:else}

              {#if getGenericDetails(selectedDetails).length > 0}
                {#each getGenericDetails(selectedDetails) as item}
                  <p><strong>{item.label}:</strong> {item.value}</p>
                {/each}
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
          <button class="modal-close" type="button" on:click={closeModal}>
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
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0 0 6px 0;
    cursor: pointer;
    color: inherit;
  }

  .title-btn h3 {
    margin: 0;
    font-size: var(--info-title-size);
    text-decoration: underline;
  }

  .back-btn {
    margin-bottom: 10px;
    cursor: pointer;
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
</style>