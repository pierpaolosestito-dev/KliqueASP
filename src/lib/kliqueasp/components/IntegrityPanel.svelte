<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { csvCell, downloadCsvText } from "../csvExport";
  import WorkerMemoryReadout from "./WorkerMemoryReadout.svelte";
  import { summarizeEdgeProvenance } from "../graph/structuralTasks";
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";
  import type { IntegrityRepairProposal, IntegrityViolation } from "../graph/integrityTask";

  export let open = false;
  export let running = false;
  export let error = "";
  export let hasRun = false;
  export let violations: IntegrityViolation[] = [];
  export let timeMs: number | undefined;
  export let repairEnabled = false;
  export let repairRunning = false;
  export let repairError = "";
  export let repairProposal: IntegrityRepairProposal | null = null;
  export let edgeProvenanceBySourceId: Record<string, string> = {};
  export let edgeProvenanceReferencesBySourceId: Record<string, string[]> = {};
  export let workerWasmMemoryStats: WorkerWasmMemoryStats | null = null;
  export let clingoTiming: ClingoInvocationTiming | null = null;
  export let showClingoTiming: boolean = false;
  export let clingoStats: ClingoInvocationStats | null = null;
  export let showClingoStats: boolean = false;

  const dispatch = createEventDispatcher();

  function provenanceForEdges(edgeIds: string[]): string {
    return summarizeEdgeProvenance(edgeIds, edgeProvenanceBySourceId);
  }

  function structuredEdgeEvidence(edgeIds: string[]) {
    return edgeIds.map((edgeId) => ({
      edge_id: edgeId,
      provenance_references: edgeProvenanceReferencesBySourceId[edgeId] ?? []
    }));
  }

  const labels: Record<string, string> = {
    edge_endpoint_type: "Tipo degli estremi incompatibile",
    missing_endpoint_node_type: "Tipo nodo mancante su un estremo",
    missing_node_type: "Tipo nodo richiesto ma assente",
    missing_edge_type: "Tipo arco richiesto ma assente",
    node_type_out_of_domain: "Tipo nodo fuori dal vocabolario dichiarato",
    edge_type_out_of_domain: "Tipo arco fuori dal vocabolario dichiarato",
    missing_node_attribute: "Attributo nodo obbligatorio assente",
    missing_edge_attribute: "Attributo arco obbligatorio assente",
    node_attribute_out_of_domain: "Attributo nodo fuori dal dominio dichiarato",
    edge_attribute_out_of_domain: "Attributo arco fuori dal dominio dichiarato",
    missing_edge_interval: "Estremo dell'intervallo temporale assente",
    invalid_edge_interval_value: "Valore temporale non interpretabile",
    invalid_edge_interval: "Intervallo temporale invertito",
    duplicate_node_attribute: "Valore univoco duplicato",
    duplicate_edge_attribute: "Valore arco univoco duplicato",
    cardinality_min: "Cardinalità minima non rispettata",
    cardinality_max: "Cardinalità massima superata"
  };

  const edgeSubjectKinds = new Set([
    "edge_endpoint_type", "missing_endpoint_node_type", "edge_type_out_of_domain", "missing_edge_type",
    "missing_edge_attribute", "edge_attribute_out_of_domain", "missing_edge_interval",
    "invalid_edge_interval_value", "invalid_edge_interval", "duplicate_edge_attribute"
  ]);

  function violationEdgeIds(violation: IntegrityViolation): string[] {
    if (violation.edgeIds?.length) return violation.edgeIds;
    return violation.subjectId && edgeSubjectKinds.has(violation.kind) ? [violation.subjectId] : [];
  }

  function exportResults() {
    if (!violations.length) return;
    const rows: unknown[][] = [["kind", "subject_id", "node_ids", "edge_ids", "edge_provenance", "edge_type", "attribute", "value", "expected", "actual", "structured_witness_json"]];
    for (const violation of violations) {
      rows.push([
        violation.kind,
        violation.subjectId ?? "",
        violation.nodeIds.join(" | "),
        violation.edgeIds?.join(" | ") ?? "",
        provenanceForEdges(violationEdgeIds(violation)),
        violation.edgeType ?? "",
        violation.attribute ?? "",
        violation.value ?? "",
        violation.expectedDescription ?? violation.expected ?? "",
        violation.actual ?? "",
        JSON.stringify({
          node_ids: violation.nodeIds,
          edge_ids: violationEdgeIds(violation),
          supporting_edge_evidence: structuredEdgeEvidence(violationEdgeIds(violation))
        })
      ]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    downloadCsvText("graph_integrity_violations.csv", csv);
  }

  function exportRepairProposal() {
    if (!repairProposal) return;
    const rows: unknown[][] = [["action", "edge_id", "edge_provenance", "node_id", "attribute", "expected_value", "proposed_value", "cost"]];
    for (const edgeId of repairProposal.edgeIds) {
      rows.push(["remove_edge", edgeId, provenanceForEdges([edgeId]), "", "", "", "", repairProposal.edgeCosts?.[edgeId] ?? ""]);
    }
    for (const candidate of repairProposal.nodeAttributes ?? []) {
      rows.push([
        "fill_node_attribute",
        "",
        "",
        candidate.nodeId,
        candidate.attribute,
        "",
        JSON.stringify(candidate.value),
        candidate.cost
      ]);
    }
    for (const candidate of repairProposal.edgeAttributes ?? []) {
      rows.push([
        "fill_edge_attribute",
        candidate.edgeId,
        provenanceForEdges([candidate.edgeId]),
        "",
        candidate.attribute,
        "",
        JSON.stringify(candidate.value),
        candidate.cost
      ]);
    }
    for (const candidate of repairProposal.nodeAttributeReplacements ?? []) {
      rows.push([
        "replace_node_attribute",
        "",
        "",
        candidate.nodeId,
        candidate.attribute,
        JSON.stringify(candidate.expectedValue),
        JSON.stringify(candidate.value),
        candidate.cost
      ]);
    }
    for (const candidate of repairProposal.edgeAttributeReplacements ?? []) {
      rows.push([
        "replace_edge_attribute",
        candidate.edgeId,
        provenanceForEdges([candidate.edgeId]),
        "",
        candidate.attribute,
        JSON.stringify(candidate.expectedValue),
        JSON.stringify(candidate.value),
        candidate.cost
      ]);
    }
    for (const candidate of repairProposal.nodeTypeReplacements ?? []) {
      rows.push([
        "replace_node_type",
        "",
        "",
        candidate.nodeId,
        "type",
        JSON.stringify(candidate.expectedType),
        JSON.stringify(candidate.newType),
        candidate.cost
      ]);
    }
    for (const candidate of repairProposal.edgeTypeReplacements ?? []) {
      rows.push([
        "replace_edge_type",
        candidate.edgeId,
        provenanceForEdges([candidate.edgeId]),
        "",
        "type",
        JSON.stringify(candidate.expectedType),
        JSON.stringify(candidate.newType),
        candidate.cost
      ]);
    }
    for (const candidate of repairProposal.edgeIntervalReplacements ?? []) {
      rows.push([
        "replace_edge_interval",
        candidate.edgeId,
        provenanceForEdges([candidate.edgeId]),
        "",
        "validity interval",
        JSON.stringify({ from: candidate.expectedFrom, to: candidate.expectedTo }),
        JSON.stringify({ from: candidate.from, to: candidate.to }),
        candidate.cost
      ]);
    }
    if (rows.length === 1) rows.push(["no_change", "", "", "", "", "", "", 0]);
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    downloadCsvText("graph_integrity_repair_proposal.csv", csv);
  }
</script>

{#if open}
  <section class="integrity-panel" aria-label="Diagnosi ASP d'integrità del grafo">
    <header>
      <div>
        <h3>Integrità del grafo · ASP</h3>
        <p>Verifica i vincoli dichiarati sul grafo importato completo dopo l'eventuale scenario di provenienza selezionato. I filtri visivi e temporali non si applicano; nessuna correzione viene eseguita.</p>
      </div>
      <button type="button" class="close" aria-label="Chiudi" on:click={() => dispatch("close")}>×</button>
    </header>

    <button type="button" class="run" on:click={() => dispatch("run")} disabled={running}>
      {running ? "Verifica in esecuzione…" : "Esegui verifica ASP"}
    </button>

    {#if error}
      <div class="error" role="alert">{error}</div>
    {/if}

    {#if repairError}
      <div class="error" role="alert">{repairError}</div>
    {/if}

    {#if hasRun && !error}
      <div class="summary" role="status">
        <strong>{violations.length}</strong> violazioni dichiarate trovate
        {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
        <WorkerMemoryReadout stats={workerWasmMemoryStats} {clingoTiming} showClingoTiming={showClingoTiming} {clingoStats} showClingoStats={showClingoStats} />
        {#if violations.length === 0}<p>Nessuna violazione dei vincoli configurati.</p>{/if}
      </div>
    {/if}

    {#if violations.length > 0}
      <div class="results-heading">
        <strong>Testimoni ASP</strong>
        <button type="button" on:click={exportResults}>Esporta CSV</button>
      </div>
      <ul class="results">
        {#each violations as violation, index}
          <li>
            <button type="button" class="violation" on:click={() => dispatch("highlight", violation)}>
              <span class="title">{index + 1}. {labels[violation.kind] ?? violation.kind}</span>
              {#if violation.subjectId}<span>ID: {violation.subjectId}</span>{/if}
              {#if violation.nodeIds.length}<span>Nodi: {violation.nodeIds.join(", ")}</span>{/if}
              {#if violation.edgeIds?.length}
                <span>Archi: {violation.edgeIds.join(", ")}</span>
              {/if}
              {#if provenanceForEdges(violationEdgeIds(violation))}<span>Fonti dichiarate: {provenanceForEdges(violationEdgeIds(violation))}</span>{/if}
              {#if violation.edgeType}<span>Relazione: {violation.edgeType}</span>{/if}
              {#if violation.attribute}<span>Attributo: {violation.attribute}</span>{/if}
              {#if violation.value !== undefined}<span>Valore: {violation.value}</span>{/if}
              {#if violation.expectedDescription}
                <span>Atteso: {violation.expectedDescription}</span>
              {:else if violation.expected !== undefined}
                <span>Atteso: {violation.expected} · rilevato: {violation.actual}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
      <small>Seleziona un testimone per evidenziare i nodi e gli archi coinvolti attualmente visibili. I risultati descrivono i vincoli configurati, non la verità dei dati.</small>
    {/if}

    {#if repairEnabled && hasRun && violations.length > 0}
      <button type="button" class="run repair-run" on:click={() => dispatch("repair")} disabled={running || repairRunning}>
        {repairRunning ? "Ricerca proposta minima…" : "Calcola proposta minima"}
      </button>
    {/if}

    {#if repairProposal}
      <div class="repair-proposal" role="status">
        <strong>Proposta di riparazione · costo {repairProposal.cost}</strong>
        {#if repairProposal.edgeIds.length > 0}
          <span>Rimuovere gli archi: {repairProposal.edgeIds.map((edgeId) => `${edgeId} (costo ${repairProposal?.edgeCosts?.[edgeId] ?? "?"})`).join(", ")}</span>
          {#if provenanceForEdges(repairProposal.edgeIds)}<span>Fonti dichiarate: {provenanceForEdges(repairProposal.edgeIds)}</span>{/if}
        {/if}
        {#each repairProposal.nodeAttributes ?? [] as candidate}
          <span>Assegnare {candidate.attribute} = {JSON.stringify(candidate.value)} al nodo {candidate.nodeId} · costo {candidate.cost}</span>
        {/each}
        {#each repairProposal.edgeAttributes ?? [] as candidate}
          <span>Assegnare {candidate.attribute} = {JSON.stringify(candidate.value)} all'arco {candidate.edgeId}{#if edgeProvenanceBySourceId[candidate.edgeId]} · fonte dichiarata: {edgeProvenanceBySourceId[candidate.edgeId]}{/if} · costo {candidate.cost}</span>
        {/each}
        {#each repairProposal.nodeAttributeReplacements ?? [] as candidate}
          <span>Sostituire {candidate.attribute} del nodo {candidate.nodeId}: {JSON.stringify(candidate.expectedValue)} → {JSON.stringify(candidate.value)} · costo {candidate.cost}</span>
        {/each}
        {#each repairProposal.edgeAttributeReplacements ?? [] as candidate}
          <span>Sostituire {candidate.attribute} dell'arco {candidate.edgeId}{#if edgeProvenanceBySourceId[candidate.edgeId]} · fonte dichiarata: {edgeProvenanceBySourceId[candidate.edgeId]}{/if}: {JSON.stringify(candidate.expectedValue)} → {JSON.stringify(candidate.value)} · costo {candidate.cost}</span>
        {/each}
        {#each repairProposal.nodeTypeReplacements ?? [] as candidate}
          <span>Correggere il tipo del nodo {candidate.nodeId}: {candidate.expectedType} → {candidate.newType} · costo {candidate.cost}</span>
        {/each}
        {#each repairProposal.edgeTypeReplacements ?? [] as candidate}
          <span>Correggere il tipo dell'arco {candidate.edgeId}{#if edgeProvenanceBySourceId[candidate.edgeId]} · fonte dichiarata: {edgeProvenanceBySourceId[candidate.edgeId]}{/if}: {candidate.expectedType} → {candidate.newType} · costo {candidate.cost}</span>
        {/each}
        {#each repairProposal.edgeIntervalReplacements ?? [] as candidate}
          <span>
            Sostituire l'intervallo chiuso dell'arco {candidate.edgeId}{#if edgeProvenanceBySourceId[candidate.edgeId]} · fonte dichiarata: {edgeProvenanceBySourceId[candidate.edgeId]}{/if}: [{candidate.expectedFrom === undefined ? "assente" : JSON.stringify(candidate.expectedFrom)}, {candidate.expectedTo === undefined ? "assente" : JSON.stringify(candidate.expectedTo)}] → [{JSON.stringify(candidate.from)}, {JSON.stringify(candidate.to)}] · costo {candidate.cost}
            <button type="button" on:click={() => dispatch("highlight", { kind: "invalid_edge_interval", subjectId: candidate.edgeId, edgeIds: [candidate.edgeId], nodeIds: [] })}>Evidenzia arco</button>
          </span>
        {/each}
        <button type="button" on:click={exportRepairProposal}>Esporta proposta CSV</button>
        <small>La proposta usa solo azioni candidate dichiarate nella configurazione e non modifica il grafo. Le sostituzioni temporali usano intervalli chiusi con estremi interi oppure date ISO.</small>
      </div>
    {/if}
  </section>
{/if}

<style>
  .integrity-panel {
    position: absolute;
    top: var(--solver-top);
    right: var(--solver-right);
    z-index: var(--solver-z);
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: var(--solver-width);
    max-height: var(--solver-max-height);
    overflow: auto;
    box-sizing: border-box;
    padding: var(--solver-padding);
    border-radius: var(--solver-radius);
    background: var(--solver-bg);
    box-shadow: var(--solver-shadow);
    color: #0f172a;
    font: 13px/1.45 system-ui, sans-serif;
  }

  header,
  .results-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  h3,
  header p,
  .summary p {
    margin: 0;
  }

  header p,
  small {
    color: #475569;
  }

  .close {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 22px;
  }

  .run,
  .results-heading button {
    padding: 7px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #f8fafc;
    color: #0f172a;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.6;
  }

  .error {
    padding: 8px;
    border-radius: 6px;
    background: #fef2f2;
    color: #991b1b;
  }

  .summary {
    padding: 9px;
    border-radius: 7px;
    background: #eff6ff;
  }

  .repair-run {
    border-color: #fdba74;
    background: #fff7ed;
  }

  .repair-proposal {
    display: grid;
    gap: 4px;
    padding: 9px;
    border-radius: 7px;
    background: #f0fdf4;
    overflow-wrap: anywhere;
  }

  .results {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .violation {
    display: grid;
    gap: 2px;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: 5px;
    background: #fff7ed;
    color: inherit;
    text-align: left;
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .violation:hover {
    background: #ffedd5;
  }

  .title {
    font-weight: 650;
  }

  @media (max-width: 1280px) {
    .integrity-panel {
      right: 12px;
      width: min(var(--solver-width), calc(100vw - 24px));
      top: calc(var(--toolbar-top) + var(--toolbar-height, 180px) + 10px);
      max-height: calc(100vh - var(--toolbar-height, 180px) - var(--toolbar-top) - 20px);
    }
  }
</style>
