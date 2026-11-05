<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { formatItalianNumber } from "../graph/formatItalianNumber.ts";
  import { csvCell, downloadCsvText } from "../csvExport";
  import AnalysisErrorMessage from "./AnalysisErrorMessage.svelte";
  import AnalysisCompletionStatus from "./AnalysisCompletionStatus.svelte";
  import SolverDiagnosticsDetails from "./SolverDiagnosticsDetails.svelte";
  import AnalysisProjectionScopeSummary from "./AnalysisProjectionScopeSummary.svelte";
  import { DEFAULT_ANALYSIS_PROJECTION_SCOPE, type AnalysisProjectionScope } from "../graph/analysisProjectionScope.ts";
  import ResultListPager from "./ResultListPager.svelte";
  import ProgressiveList from "./ProgressiveList.svelte";
  import { summarizeEdgeProvenance } from "../graph/structuralTasks";
  import { getOwnRecordValue } from "../graph/recordUtils";
  import { getIntegrityViolationLabel } from "../graph/integrityViolationLabels.ts";
  import { getGraphTaskContract, getTaskEnumerationDescription } from "../graph/graphTaskContracts";
  import { displayNodeResultLabel } from "../graph/nodeResultLabel.ts";
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";
  import type { IntegrityRepairProposal, IntegrityViolation } from "../graph/integrityTask";

  export let open = false;
  export let compactModal = false;
  export let running = false;
  export let analysisScope: AnalysisProjectionScope = { ...DEFAULT_ANALYSIS_PROJECTION_SCOPE, usesVisibleProjection: false };
  export let completionLabel = "";
  export let requirementsAvailable = true;
  export let requirementReasons: string[] = [];
  export let onOpenData: () => void = () => {};
  export let error = "";
  export let hasRun = false;
  export let violations: IntegrityViolation[] = [];
  export let timeMs: number | undefined;
  export let repairEnabled = false;
  export let repairRequirementsAvailable = true;
  export let repairRequirementReasons: string[] = [];
  export let repairRunning = false;
  export let repairError = "";
  export let repairOutcomeMessage = "";
  export let repairProposal: IntegrityRepairProposal | null = null;
  export let nodeLabelById: Record<string, string> = {};
  export let sourceIdByNodeId: Record<string, string> = {};
  export let edgeProvenanceBySourceId: Record<string, string> = {};
  export let edgeProvenanceReferencesBySourceId: Record<string, string[]> = {};
  export let workerWasmMemoryStats: WorkerWasmMemoryStats | null = null;
  export let clingoTiming: ClingoInvocationTiming | null = null;
  export let showClingoTiming: boolean = false;
  export let clingoStats: ClingoInvocationStats | null = null;
  export let showClingoStats: boolean = false;

  const dispatch = createEventDispatcher();
  const integrityDiagnosisContract = getGraphTaskContract("graphIntegrity");
  const integrityRepairContract = getGraphTaskContract("minimumIntegrityRepair");
  const violationPageSize = 50;
  const repairActionPageSize = 50;
  let visibleViolationLimit = violationPageSize;
  let visibleRepairActionLimit = repairActionPageSize;
  let previousViolations = violations;
  let selectedViolationKey = "";
  let expandedViolationIndex: number | null = null;
  let repairProposalDetailsOpen = false;
  let previousRepairProposal = repairProposal;
  $: if (violations !== previousViolations) {
    previousViolations = violations;
    visibleViolationLimit = violationPageSize;
    selectedViolationKey = "";
    expandedViolationIndex = null;
  }
  $: visibleViolations = violations.slice(0, visibleViolationLimit);
  $: if (repairProposal !== previousRepairProposal) {
    previousRepairProposal = repairProposal;
    repairProposalDetailsOpen = false;
    visibleRepairActionLimit = repairActionPageSize;
  }
  $: repairActions = buildRepairActions(repairProposal);
  $: visibleRepairActions = repairActions.slice(0, visibleRepairActionLimit);
  $: repairProposalActionCount = repairProposal
    ? repairProposal.edgeIds.length +
      (repairProposal.nodeAttributes?.length ?? 0) +
      (repairProposal.edgeAttributes?.length ?? 0) +
      (repairProposal.nodeAttributeReplacements?.length ?? 0) +
      (repairProposal.edgeAttributeReplacements?.length ?? 0) +
      (repairProposal.nodeTypeReplacements?.length ?? 0) +
      (repairProposal.edgeTypeReplacements?.length ?? 0) +
      (repairProposal.edgeIntervalReplacements?.length ?? 0)
    : 0;

  function showMoreViolations() {
    visibleViolationLimit += violationPageSize;
  }

  function violationDetailsOpen(index: number): boolean {
    return expandedViolationIndex === index;
  }

  function setViolationDetailsOpen(index: number, open: boolean) {
    if (open) expandedViolationIndex = index;
    else if (expandedViolationIndex === index) expandedViolationIndex = null;
  }

  function showMoreRepairActions() {
    visibleRepairActionLimit += repairActionPageSize;
  }

  function formatRepairValue(value: unknown): string {
    return value === undefined ? "assente" : JSON.stringify(value);
  }

  function displayResultNode(nodeId: string): string {
    return displayNodeResultLabel(nodeId, nodeLabelById, sourceIdByNodeId);
  }

  function buildRepairActions(proposal: IntegrityRepairProposal | null): { description: string; highlightEdgeId?: string }[] {
    if (!proposal) return [];

    const actions: { description: string; highlightEdgeId?: string }[] = [];
    for (const edgeId of proposal.edgeIds) {
      const provenance = edgeProvenance(edgeId);
      actions.push({ description: `Rimuovere l’arco ${edgeId}${provenance ? ` · fonte dichiarata: ${provenance}` : ""} · costo ${proposal.edgeCosts?.[edgeId] ?? "?"}` });
    }
    for (const candidate of proposal.nodeAttributes ?? []) {
      actions.push({ description: `Assegnare ${candidate.attribute} = ${JSON.stringify(candidate.value)} al nodo ${displayResultNode(candidate.nodeId)} · costo ${candidate.cost}` });
    }
    for (const candidate of proposal.edgeAttributes ?? []) {
      const provenance = edgeProvenance(candidate.edgeId);
      actions.push({ description: `Assegnare ${candidate.attribute} = ${JSON.stringify(candidate.value)} all’arco ${candidate.edgeId}${provenance ? ` · fonte dichiarata: ${provenance}` : ""} · costo ${candidate.cost}` });
    }
    for (const candidate of proposal.nodeAttributeReplacements ?? []) {
      actions.push({ description: `Sostituire ${candidate.attribute} del nodo ${displayResultNode(candidate.nodeId)}: ${JSON.stringify(candidate.expectedValue)} → ${JSON.stringify(candidate.value)} · costo ${candidate.cost}` });
    }
    for (const candidate of proposal.edgeAttributeReplacements ?? []) {
      const provenance = edgeProvenance(candidate.edgeId);
      actions.push({ description: `Sostituire ${candidate.attribute} dell’arco ${candidate.edgeId}${provenance ? ` · fonte dichiarata: ${provenance}` : ""}: ${JSON.stringify(candidate.expectedValue)} → ${JSON.stringify(candidate.value)} · costo ${candidate.cost}` });
    }
    for (const candidate of proposal.nodeTypeReplacements ?? []) {
      actions.push({ description: `Correggere il tipo del nodo ${displayResultNode(candidate.nodeId)}: ${candidate.expectedType} → ${candidate.newType} · costo ${candidate.cost}` });
    }
    for (const candidate of proposal.edgeTypeReplacements ?? []) {
      const provenance = edgeProvenance(candidate.edgeId);
      actions.push({ description: `Correggere il tipo dell’arco ${candidate.edgeId}${provenance ? ` · fonte dichiarata: ${provenance}` : ""}: ${candidate.expectedType} → ${candidate.newType} · costo ${candidate.cost}` });
    }
    for (const candidate of proposal.edgeIntervalReplacements ?? []) {
      const provenance = edgeProvenance(candidate.edgeId);
      actions.push({
        description: `Sostituire l’intervallo chiuso dell’arco ${candidate.edgeId}${provenance ? ` · fonte dichiarata: ${provenance}` : ""}: [${formatRepairValue(candidate.expectedFrom)}, ${formatRepairValue(candidate.expectedTo)}] → [${JSON.stringify(candidate.from)}, ${JSON.stringify(candidate.to)}] · costo ${candidate.cost}`,
        highlightEdgeId: candidate.edgeId
      });
    }
    return actions;
  }

  function provenanceForEdges(edgeIds: string[]): string {
    return summarizeEdgeProvenance(edgeIds, edgeProvenanceBySourceId);
  }

  function edgeProvenance(edgeId: string): string | undefined {
    return getOwnRecordValue<string>(edgeProvenanceBySourceId, edgeId);
  }

  function structuredEdgeEvidence(edgeIds: string[]) {
    return edgeIds.map((edgeId) => ({
      edge_id: edgeId,
      provenance_references: getOwnRecordValue<string[]>(edgeProvenanceReferencesBySourceId, edgeId) ?? []
    }));
  }

  const edgeSubjectKinds = new Set([
    "edge_endpoint_type", "missing_endpoint_node_type", "edge_type_out_of_domain", "missing_edge_type",
    "missing_edge_attribute", "edge_attribute_out_of_domain", "missing_edge_interval",
    "invalid_edge_interval_value", "invalid_edge_interval", "duplicate_edge_attribute"
  ]);

  function violationEdgeIds(violation: IntegrityViolation): string[] {
    if (violation.edgeIds?.length) return violation.edgeIds;
    return violation.subjectId && edgeSubjectKinds.has(violation.kind) ? [violation.subjectId] : [];
  }

  function integrityViolationKey(violation: IntegrityViolation): string {
    return JSON.stringify(violation);
  }

  function highlightViolation(violation: IntegrityViolation) {
    selectedViolationKey = integrityViolationKey(violation);
    dispatch("highlight", violation);
  }

  function exportResults() {
    if (!violations.length) return;
    const rows: unknown[][] = [["kind", "subject_id", "node_ids", "edge_ids", "edge_provenance", "edge_type", "attribute", "value", "expected", "actual", "structured_witness_json"]];
    for (const violation of violations) {
      rows.push([
        violation.kind,
        violation.subjectId ?? "",
        violation.nodeIds.join(" | "),
        violationEdgeIds(violation).join(" | "),
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
  <section
    class="integrity-panel"
    role={compactModal ? "dialog" : undefined}
    aria-modal={compactModal ? "true" : undefined}
    aria-labelledby="integrity-panel-title"
    tabindex="-1"
  >
    <header>
      <div>
        <h3 id="integrity-panel-title">Integrità del grafo</h3>
        <p>Verifica i vincoli dichiarati; le proposte di riparazione restano ipotetiche e non modificano il grafo.</p>
      </div>
      <button type="button" class="close" aria-label="Chiudi pannello di integrità" title="Chiudi pannello di integrità" on:click={() => dispatch("close")}>×</button>
    </header>

    <AnalysisProjectionScopeSummary scope={analysisScope} />
    <AnalysisCompletionStatus label={completionLabel} />

    {#if integrityDiagnosisContract && integrityRepairContract}
      <details class="asp-contract">
        <summary>Dettagli tecnici della verifica</summary>
        <div>
          <strong>Diagnosi · {integrityDiagnosisContract.aspEncoding} v{integrityDiagnosisContract.encodingVersion}</strong>
          <p>{integrityDiagnosisContract.querySemantics}</p>
          <small>
            {getTaskEnumerationDescription("graphIntegrity")} · parser: {integrityDiagnosisContract.parser} ·
            atomi: {integrityDiagnosisContract.witnessPredicates.join(", ")} ·
            campi interpretati: {integrityDiagnosisContract.resultFields.join(", ")}.
          </small>
        </div>
        <div>
          <strong>Riparazione · {integrityRepairContract.aspEncoding} v{integrityRepairContract.encodingVersion}</strong>
          <p>{integrityRepairContract.querySemantics}</p>
          <small>
            {getTaskEnumerationDescription("minimumIntegrityRepair")} · parser: {integrityRepairContract.parser} ·
            atomi: {integrityRepairContract.witnessPredicates.join(", ")} ·
            campi interpretati: {integrityRepairContract.resultFields.join(", ")}.
          </small>
        </div>
      </details>
    {/if}

    {#if !requirementsAvailable}
      <div id="integrity-check-readiness" class="requirements" role="status" aria-live="polite">
        <strong>Controllo non disponibile</strong>
        <div class="requirement-reasons">
          <ProgressiveList items={requirementReasons} label="prerequisiti mancanti" let:item>
            <div>{item}</div>
          </ProgressiveList>
        </div>
        <button type="button" on:click={onOpenData}>Apri Dati e configurazione</button>
      </div>
    {/if}

    <button type="button" class="run" on:click={() => dispatch("run")} aria-describedby={!requirementsAvailable ? "integrity-check-readiness" : undefined} disabled={running || !requirementsAvailable}>
      {running ? "Verifica in esecuzione…" : "Esegui verifica"}
    </button>

    {#if error}
      <AnalysisErrorMessage message={error} />
    {/if}

    {#if repairError}
      <AnalysisErrorMessage message={repairError} />
    {/if}

    {#if repairOutcomeMessage}
      <div class="repair-outcome" role="status" aria-live="polite">
        <strong>Esito della riparazione</strong>
        <p>{repairOutcomeMessage}</p>
        <small>La ricerca è stata completata: nessuna delle azioni autorizzate risolve tutti i vincoli.</small>
        <button type="button" on:click={onOpenData}>Rivedi le azioni candidate</button>
      </div>
    {/if}

    {#if hasRun && !error}
      <div class="summary" role="status">
        <strong>{violations.length}</strong> violazioni dichiarate trovate
        {#if timeMs !== undefined}<span> · {formatItalianNumber(timeMs, 1)} ms</span>{/if}
        <SolverDiagnosticsDetails
          {workerWasmMemoryStats}
          {clingoTiming}
          {showClingoTiming}
          {clingoStats}
          {showClingoStats}
        />
        {#if violations.length === 0}<p>Nessuna violazione dei vincoli configurati.</p>{/if}
      </div>
    {/if}

    {#if violations.length > 0}
      <div class="results-heading">
        <strong>Violazioni trovate</strong>
        <button type="button" on:click={exportResults}>Esporta CSV</button>
      </div>
      <ul class="results">
        {#each visibleViolations as violation, index}
          <li>
            <button
              type="button"
              class="violation"
              aria-pressed={selectedViolationKey === integrityViolationKey(violation)}
              on:click={() => highlightViolation(violation)}
            >
              <span class="title">{index + 1}. {getIntegrityViolationLabel(violation.kind)}</span>
              {#if violation.subjectId}<span>ID: {violation.subjectId}</span>{/if}
              <span>{violation.nodeIds.length} nodi · {violationEdgeIds(violation).length} archi coinvolti</span>
            </button>
            <details
              class="violation-evidence"
              open={violationDetailsOpen(index)}
              on:toggle={(event) => setViolationDetailsOpen(index, event.currentTarget.open)}
            >
              <summary>Dettagli della violazione</summary>
              {#if violationDetailsOpen(index)}
                <div class="violation-evidence-content">
                  {#if violation.nodeIds.length}
                    <strong>Nodi coinvolti · {violation.nodeIds.length}</strong>
                    <ProgressiveList items={violation.nodeIds} resetKey={violation} label="nodi della violazione" let:item>
                      <span>{displayResultNode(item)}</span>
                    </ProgressiveList>
                  {/if}
                  {#if violationEdgeIds(violation).length}
                    <strong>Archi e fonti · {violationEdgeIds(violation).length}</strong>
                    <ProgressiveList items={violationEdgeIds(violation)} resetKey={violation} label="archi della violazione" let:item>
                      <span><code>{item}</code>{#if edgeProvenance(item)} · fonte dichiarata: {edgeProvenance(item)}{/if}</span>
                    </ProgressiveList>
                  {/if}
                  {#if violation.edgeType}<span>Relazione: {violation.edgeType}</span>{/if}
                  {#if violation.attribute}<span>Attributo: {violation.attribute}</span>{/if}
                  {#if violation.value !== undefined}<span>Valore: {violation.value}</span>{/if}
                  {#if violation.expectedDescription}
                    <span>Atteso: {violation.expectedDescription}</span>
                  {:else if violation.expected !== undefined}
                    <span>Atteso: {violation.expected} · rilevato: {violation.actual}</span>
                  {/if}
                </div>
              {/if}
            </details>
          </li>
        {/each}
      </ul>
      <ResultListPager
        total={violations.length}
        visible={visibleViolations.length}
        pageSize={violationPageSize}
        label="violazioni"
        showMore={showMoreViolations}
      />
      <small>Seleziona una violazione per evidenziare i nodi e gli archi coinvolti nella vista corrente. I risultati descrivono i vincoli configurati, non la verità dei dati.</small>
    {/if}

    {#if hasRun && !error && violations.length > 0}
      {#if repairEnabled}
        <button type="button" class="run repair-run" on:click={() => dispatch("repair")} aria-describedby={!repairRequirementsAvailable ? "integrity-repair-readiness" : undefined} disabled={running || repairRunning || !repairRequirementsAvailable}>
          {repairRunning ? "Ricerca proposta minima…" : "Calcola proposta minima"}
        </button>
        {#if !repairRequirementsAvailable}
          <div id="integrity-repair-readiness" class="requirements repair-requirements" role="status" aria-live="polite">
            <strong>Proposta di riparazione non disponibile</strong>
            <div class="requirement-reasons">
              <ProgressiveList items={repairRequirementReasons} label="prerequisiti della riparazione" let:item>
                <div>{item}</div>
              </ProgressiveList>
            </div>
            <button type="button" on:click={onOpenData}>Apri Dati e configurazione</button>
          </div>
        {/if}
      {:else}
        <div class="requirements repair-requirements" role="status">
          <strong>Proposta minima non configurata</strong>
          <p>Per calcolare il costo minimo della riparazione, aggiungi le azioni candidate nell'editor JSON avanzato.</p>
          <details>
            <summary>Percorso del campo nella configurazione JSON</summary>
            <code>graphIntegrity.repairSuggestions</code>
          </details>
          <button type="button" on:click={onOpenData}>Apri Dati e configurazione</button>
        </div>
      {/if}
    {/if}

    {#if repairProposal}
      <details class="repair-proposal" bind:open={repairProposalDetailsOpen}>
        <summary><strong>Proposta di riparazione · costo {repairProposal.cost} · {repairProposalActionCount} azioni</strong></summary>
        {#if repairProposalDetailsOpen}
        <div role="status">
        <button type="button" class="visualize-repair" on:click={() => dispatch("highlightRepairProposal", repairProposal)}>Visualizza proposta sul grafo 2D</button>
        {#each visibleRepairActions as action}
          <span>{action.description}
            {#if action.highlightEdgeId}
              <button type="button" on:click={() => dispatch("highlight", { kind: "invalid_edge_interval", subjectId: action.highlightEdgeId, edgeIds: [action.highlightEdgeId], nodeIds: [] })}>Evidenzia arco</button>
            {/if}
          </span>
        {/each}
        <ResultListPager
          total={repairActions.length}
          visible={visibleRepairActions.length}
          pageSize={repairActionPageSize}
          label="azioni di riparazione"
          showMore={showMoreRepairActions}
        />
        <button type="button" on:click={exportRepairProposal}>Esporta proposta CSV</button>
        <small>La proposta usa solo azioni candidate dichiarate nella configurazione e non modifica il grafo. Le sostituzioni temporali usano intervalli chiusi con estremi interi oppure date ISO.</small>
        </div>
        {/if}
      </details>
    {/if}
  </section>
{/if}

<style>
  .asp-contract {
    padding: 8px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
  }

  .requirements {
    padding: 9px 10px;
    border: 1px solid #e8c785;
    border-radius: 8px;
    background: #fff9ec;
    color: #713f12;
  }

  .requirements .requirement-reasons {
    display: grid;
    gap: 3px;
    max-height: 140px;
    margin: 5px 0 8px;
    overflow: auto;
    overflow-wrap: anywhere;
  }

  .requirements button {
    padding: 6px 8px;
    border: 1px solid #bd8c37;
    border-radius: 6px;
    background: #fff;
    color: #713f12;
    cursor: pointer;
  }

  .asp-contract summary {
    cursor: pointer;
    font-weight: 650;
  }

  .asp-contract div {
    margin-top: 8px;
  }

  .asp-contract p {
    margin: 4px 0;
  }

  .asp-contract small {
    display: block;
    color: #475569;
  }

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
    font: 13px/1.45 Arial, Helvetica, sans-serif;
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

  .run {
    min-height: 36px;
    padding: 7px 10px;
    border: 1px solid #1e645d;
    border-radius: 8px;
    background: #1e645d;
    color: #fff;
    font-weight: 650;
    cursor: pointer;
  }

  .run:hover:not(:disabled) {
    border-color: #174f49;
    background: #174f49;
  }

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

  .repair-outcome {
    display: grid;
    gap: 4px;
    padding: 9px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #f8fafc;
    color: #334155;
  }

  .repair-outcome p { margin: 0; }
  .repair-outcome button {
    justify-self: start;
    padding: 6px 8px;
    border: 1px solid #94a3b8;
    border-radius: 6px;
    background: #fff;
    color: #0f172a;
    cursor: pointer;
  }

  .repair-proposal button {
    margin: 4px 5px 4px 0;
    padding: 6px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #fff;
    color: #0f172a;
    cursor: pointer;
  }

  .repair-proposal .visualize-repair {
    border-color: #0f766e;
    background: #f0fdfa;
    color: #115e59;
    font-weight: 650;
  }

  .results {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .results > li {
    overflow: hidden;
    border: 1px solid #fed7aa;
    border-radius: 6px;
    background: #fff;
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

  .violation[aria-pressed="true"] {
    background: #ffedd5;
    outline: 2px solid #9a3412;
    outline-offset: -2px;
  }

  .violation-evidence {
    margin: 0 8px 7px;
    color: #475569;
    font-size: 0.78rem;
  }

  .violation-evidence summary {
    width: fit-content;
    cursor: pointer;
    font-weight: 600;
  }

  .violation-evidence-content {
    display: grid;
    gap: 4px;
    margin-top: 6px;
    padding: 8px;
    border-radius: 5px;
    background: #fff7ed;
    overflow-wrap: anywhere;
  }

  .title {
    font-weight: 650;
  }

  @media (max-width: 1280px) {
    .integrity-panel {
      right: 12px;
      width: min(var(--solver-width), calc(100vw - 24px));
      top: calc(var(--toolbar-top) + var(--toolbar-height, 180px) + 10px);
      max-height: calc(100vh - var(--toolbar-height, 180px) - var(--toolbar-top) - 20px - var(--mobile-status-reserve, 48px));
    }
  }
</style>
