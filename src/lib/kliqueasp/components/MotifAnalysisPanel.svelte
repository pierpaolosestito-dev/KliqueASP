<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { csvCell, downloadCsvText } from "../csvExport";
  import WorkerMemoryReadout from "./WorkerMemoryReadout.svelte";
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";
  import type { GraphMotifTemplate } from "../graph/graphModel";
  import type { TypedMotifMatch, TypedMotifNearMatch, TypedMotifCounterfactual } from "../graph/motifTask";
  import { summarizeEdgeProvenance } from "../graph/structuralTasks";

  export let open = false;
  export let running = false;
  export let error = "";
  export let hasRun = false;
  export let templates: GraphMotifTemplate[] = [];
  export let selectedTemplateIndex = "0";
  export let selectedGroup = "";
  export let availableGroups: string[] = [];
  export let matches: TypedMotifMatch[] = [];
  export let nearMatches: TypedMotifNearMatch[] = [];
  export let nearMatchHasRun = false;
  export let nearMatchError = "";
  export let nearMatchTimeMs: number | undefined;
  export let counterfactualEnabled = false;
  export let counterfactuals: TypedMotifCounterfactual[] = [];
  export let counterfactualHasRun = false;
  export let counterfactualError = "";
  export let counterfactualTimeMs: number | undefined;
  export let counterfactualExcludedCandidateCount = 0;
  export let counterfactualCandidateCount = 0;
  export let timeMs: number | undefined;
  export let requirementsAvailable = false;
  export let requirementReasons: string[] = [];
  export let temporalRequirementsAvailable = false;
  export let temporalRequirementReasons: string[] = [];
  export let graphNodesCount = 0;
  export let graphEdgesCount = 0;
  export let edgeProvenanceBySourceId: Record<string, string> = {};
  export let edgeProvenanceReferencesBySourceId: Record<string, string[]> = {};
  export let workerWasmMemoryStats: WorkerWasmMemoryStats | null = null;
  export let clingoTiming: ClingoInvocationTiming | null = null;
  export let showClingoTiming: boolean = false;
  export let clingoStats: ClingoInvocationStats | null = null;
  export let showClingoStats: boolean = false;

  let visibleLimit = 100;
  const dispatch = createEventDispatcher();
  $: selectedTemplate = templates[Number(selectedTemplateIndex)];
  $: visibleMatches = matches.slice(0, visibleLimit);
  $: selectedTemporalSemantics = selectedTemplate?.temporal?.semantics;
  $: selectedStrictTemporalOrder = selectedTemplate?.temporal?.semantics === "orderedByStart" &&
    selectedTemplate.temporal.strict === true;
  $: selectedIsTemporal = selectedTemporalSemantics !== undefined;
  $: selectedInducedEdgeTypes = selectedTemplate?.inducedEdgeTypes ?? [];
  $: selectedHasAbsenceConditions = Boolean(selectedTemplate?.absentEdges?.length || selectedInducedEdgeTypes.length);
  $: selectedHasInducedConditions = selectedInducedEdgeTypes.length > 0;
  $: selectedAbsenceSemanticsUnsupported = selectedHasAbsenceConditions && selectedIsTemporal;
  $: selectedRequirementsAvailable = requirementsAvailable &&
    (!selectedIsTemporal || temporalRequirementsAvailable) && !selectedAbsenceSemanticsUnsupported;
  $: selectedRequirementReasons = !requirementsAvailable
    ? requirementReasons
    : selectedAbsenceSemanticsUnsupported
      ? ["I vincoli di assenza sono disponibili solo per template statici; i template temporali richiedono una semantica esplicita di assenza nel tempo."]
    : selectedIsTemporal && !temporalRequirementsAvailable
      ? temporalRequirementReasons
      : [];

  function displayMappedTime(value: number): string {
    if (Math.abs(value) < 100_000_000_000) return String(value);
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
  }

  function provenanceForEdges(edgeIds: string[]): string {
    return summarizeEdgeProvenance(edgeIds, edgeProvenanceBySourceId);
  }

  function structuredEdgeEvidence(edgeIds: string[]) {
    return edgeIds.map((edgeId) => ({
      edge_id: edgeId,
      provenance_references: edgeProvenanceReferencesBySourceId[edgeId] ?? []
    }));
  }

  function structuredRoles(roles: Record<string, { nodeId: string; sourceId: string }>) {
    return Object.fromEntries(Object.entries(roles).map(([role, node]) => [role, node.sourceId]));
  }

  function structuredSupportingEdges(edges: Array<{
    sourceRole: string;
    targetRole: string;
    edgeType: string;
    edgeIds: string[];
    startTimeValue?: number;
  }>) {
    return edges.map((edge) => ({
      source_role: edge.sourceRole,
      target_role: edge.targetRole,
      edge_type: edge.edgeType,
      edge_ids: edge.edgeIds,
      source_edge_evidence: structuredEdgeEvidence(edge.edgeIds),
      ...(edge.startTimeValue === undefined ? {} : { start_time_value: edge.startTimeValue })
    }));
  }

  function run() {
    visibleLimit = 100;
    dispatch("run", {
      templateIndex: Number(selectedTemplateIndex),
      group: selectedGroup
    });
  }

  function diagnose() {
    visibleLimit = 100;
    dispatch("diagnose", {
      templateIndex: Number(selectedTemplateIndex),
      group: selectedGroup
    });
  }

  function proposeCounterfactual() {
    visibleLimit = 100;
    dispatch("counterfactual", {
      templateIndex: Number(selectedTemplateIndex),
      group: selectedGroup
    });
  }

  function clearResults() {
    dispatch("clear");
  }

  function exportResults() {
    if (!matches.length) return;
    const rows: unknown[][] = [["motif_id", "time_value", "role_assignments", "supporting_edges", "supporting_edge_provenance", "closed_world_scope", "induced_edge_types", "required_absences", "structured_witness_json"]];
    for (const match of matches) {
      rows.push([
        match.templateId,
        match.timeValue === undefined ? "" : displayMappedTime(match.timeValue),
        Object.entries(match.roles).map(([role, node]) => `${role}=${node.sourceId}`).join(" | "),
        match.supportingEdges.map((edge) => {
          const edgeIds = edge.edgeIds.map((edgeId) => edge.startTimeValue === undefined
            ? edgeId
            : `${edgeId}@${displayMappedTime(edge.startTimeValue)}`);
          return `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}: ${edgeIds.join("|")}`;
        }).join(" ; "),
        provenanceForEdges(match.supportingEdges.flatMap((edge) => edge.edgeIds)),
        match.absenceConditions?.length ? "visible_projection" : "",
        match.inducedEdgeTypes?.join(" | ") ?? "",
        match.absenceConditions?.map((edge) => `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}`).join(" | ") ?? "",
        JSON.stringify({
          role_assignments: structuredRoles(match.roles),
          supporting_edges: structuredSupportingEdges(match.supportingEdges),
          absence_conditions: match.absenceConditions ?? [],
          induced_edge_types: match.inducedEdgeTypes ?? []
        })
      ]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const fileStem = (selectedTemplate?.id ?? "typed_motif").replace(/[^a-zA-Z0-9_-]+/g, "_");
    downloadCsvText(`${fileStem}_matches.csv`, csv);
  }

  function exportNearMatches() {
    if (!nearMatches.length) return;
    const rows: unknown[][] = [[
      "motif_id", "assigned_roles", "missing_roles", "missing_patterns", "unresolved_patterns",
      "violated_absence_patterns", "violated_absence_provenance", "unresolved_absence_patterns",
      "supporting_edge_records", "supporting_edge_provenance", "temporal_semantics", "selected_time", "temporal_unavailable_patterns",
      "temporal_inactive_patterns", "temporal_order_violations", "temporal_support_records", "temporal_support_provenance", "induced_edge_types",
      "structured_diagnostic_json"
    ]];
    for (const match of nearMatches) {
      rows.push([
        match.templateId,
        Object.entries(match.roles).map(([role, node]) => `${role}=${node.sourceId}`).join(" | "),
        match.missingRoles.join(" | "),
        match.missingPatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | "),
        match.unresolvedPatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | "),
        match.violatedAbsencePatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}: ${pattern.edgeIds.join("|")}`).join(" | "),
        provenanceForEdges(match.violatedAbsencePatterns.flatMap((pattern) => pattern.edgeIds)),
        match.unresolvedAbsencePatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | "),
        match.supportingEdges.map((edge) => `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}: ${edge.edgeIds.join("|")}`).join(" ; "),
        provenanceForEdges(match.supportingEdges.flatMap((edge) => edge.edgeIds)),
        match.temporalEvidence?.semantics ?? "",
        match.temporalEvidence?.timeValue === undefined ? "" : displayMappedTime(match.temporalEvidence.timeValue),
        match.temporalEvidence?.unavailablePatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | ") ?? "",
        match.temporalEvidence?.inactivePatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | ") ?? "",
        match.temporalEvidence?.orderViolations.map((pair) => `${pair.firstIndex}->${pair.secondIndex}`).join(" | ") ?? "",
        match.temporalEvidence?.supportingEdges.map((edge) => {
          const records = edge.edgeIds.map((edgeId) => edge.startTimeValue === undefined
            ? edgeId
            : `${edgeId}@${displayMappedTime(edge.startTimeValue)}`);
          return `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}: ${records.join("|")}`;
        }).join(" ; ") ?? "",
        provenanceForEdges(match.temporalEvidence?.supportingEdges.flatMap((edge) => edge.edgeIds) ?? []),
        selectedTemplate?.inducedEdgeTypes?.join(" | ") ?? "",
        JSON.stringify({
          role_assignments: structuredRoles(match.roles),
          missing_roles: match.missingRoles,
          missing_patterns: match.missingPatterns,
          unresolved_patterns: match.unresolvedPatterns,
          violated_absence_patterns: match.violatedAbsencePatterns.map((pattern) => ({
            ...pattern,
            supporting_edge_evidence: structuredEdgeEvidence(pattern.edgeIds)
          })),
          unresolved_absence_patterns: match.unresolvedAbsencePatterns,
          supporting_edges: structuredSupportingEdges(match.supportingEdges),
          temporal_evidence: match.temporalEvidence ? {
            ...match.temporalEvidence,
            supporting_edges: structuredSupportingEdges(match.temporalEvidence.supportingEdges),
            supporting_edge_evidence: match.temporalEvidence.supportingEdges.map((edge) => structuredEdgeEvidence(edge.edgeIds))
          } : null,
          induced_edge_types: selectedTemplate?.inducedEdgeTypes ?? []
        })
      ]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const fileStem = (selectedTemplate?.id ?? "typed_motif").replace(/[^a-zA-Z0-9_-]+/g, "_");
    downloadCsvText(`${fileStem}_near_matches.csv`, csv);
  }

  function exportCounterfactuals() {
    if (!counterfactuals.length) return;
    const rows: unknown[][] = [[
      "motif_id", "total_cost", "role_assignments", "observed_support_edges", "observed_support_provenance", "hypothetical_additions", "candidate_validity", "closed_world_scope", "induced_edge_types", "required_absences",
      "structured_counterfactual_json"
    ]];
    for (const proposal of counterfactuals) {
      rows.push([
        proposal.templateId,
        proposal.totalCost,
        Object.entries(proposal.match.roles).map(([role, node]) => `${role}=${node.sourceId}`).join(" | "),
        proposal.match.supportingEdges.map((edge) =>
          `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}: ${edge.edgeIds.join("|")}`
        ).join(" ; "),
        provenanceForEdges(proposal.match.supportingEdges.flatMap((edge) => edge.edgeIds)),
        proposal.addedEdges.map((edge) =>
          `${edge.id}: ${edge.sourceNodeId}-${edge.edgeType}->${edge.targetNodeId} (cost=${edge.cost}; patterns=${edge.patternIndexes.join("|")})`
        ).join(" ; "),
        proposal.addedEdges.filter((edge) => edge.validity).map((edge) =>
          `${edge.id}: ${displayMappedTime(edge.validity!.from)}..${displayMappedTime(edge.validity!.to)}`
        ).join(" ; "),
        proposal.match.absenceConditions?.length ? "visible_projection" : "",
        proposal.match.inducedEdgeTypes?.join(" | ") ?? "",
        proposal.match.absenceConditions?.map((edge) => `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}`).join(" | ") ?? "",
        JSON.stringify({
          role_assignments: structuredRoles(proposal.match.roles),
          observed_support_edges: structuredSupportingEdges(proposal.match.supportingEdges),
          hypothetical_additions: proposal.addedEdges.map((edge) => ({
            id: edge.id,
            source_node_id: edge.sourceNodeId,
            target_node_id: edge.targetNodeId,
            edge_type: edge.edgeType,
            cost: edge.cost,
            pattern_indexes: edge.patternIndexes,
            validity: edge.validity ?? null
          })),
          absence_conditions: proposal.match.absenceConditions ?? [],
          induced_edge_types: proposal.match.inducedEdgeTypes ?? []
        })
      ]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const fileStem = (selectedTemplate?.id ?? "typed_motif").replace(/[^a-zA-Z0-9_-]+/g, "_");
    downloadCsvText(`${fileStem}_counterfactual_proposals.csv`, csv);
  }
</script>

{#if open}
  <section class="motif-panel" aria-label="Analisi di motivi tipizzati ASP">
    <header>
      <div>
        <h3>Motivi relazionali · ASP</h3>
        <p>
          {selectedHasInducedConditions
            ? `Le relazioni richieste devono esistere; il motivo è indotto rispetto ai tipi ${selectedInducedEdgeTypes.join(", ")} sulla proiezione visibile.`
            : selectedHasAbsenceConditions
            ? "Le relazioni richieste devono esistere e quelle elencate come assenti si valutano sotto mondo chiuso sulla proiezione visibile."
            : selectedTemporalSemantics === "coValid"
            ? "Gli archi testimoni condividono un istante di validità."
            : selectedTemporalSemantics === "orderedByStart"
              ? `Confronta gli inizi di validità nell’ordine degli archi dichiarato${selectedStrictTemporalOrder ? ", in modo stretto" : ", consentendo parità"}.`
              : "Assegnamenti dei ruoli e archi testimoni sulla proiezione visibile corrente."}
        </p>
      </div>
      <button type="button" class="close" aria-label="Chiudi" on:click={() => dispatch("close")}>×</button>
    </header>

    <WorkerMemoryReadout stats={workerWasmMemoryStats} {clingoTiming} showClingoTiming={showClingoTiming} {clingoStats} showClingoStats={showClingoStats} />

    <div class="controls">
      <label>
        Template
        <select bind:value={selectedTemplateIndex} disabled={running || templates.length === 0} on:change={clearResults}>
          {#each templates as template, index (`${index}-${template.id}`)}
            <option value={String(index)}>{template.label ?? template.id}</option>
          {/each}
        </select>
      </label>
      <label>
        Gruppo
        <select bind:value={selectedGroup} disabled={running} on:change={clearResults}>
          <option value="">Tutti i nodi</option>
          {#each availableGroups as group}
            <option value={group}>{group}</option>
          {/each}
        </select>
      </label>
      <button type="button" class="run" on:click={run} disabled={running || !selectedTemplate || !selectedRequirementsAvailable}>
        {running ? "Solver in esecuzione…" : "Esegui motivo"}
      </button>
    </div>

    <div class="readiness" role="status">
      <strong>{selectedRequirementsAvailable ? "Prerequisiti disponibili" : "Prerequisiti dati mancanti"}</strong>
      <span>{graphNodesCount} nodi · {graphEdgesCount} archi visibili</span>
      {#if selectedRequirementReasons.length > 0}
        <ul>{#each selectedRequirementReasons as reason}<li>{reason}</li>{/each}</ul>
      {/if}
    </div>

    {#if selectedHasAbsenceConditions}
      <div class="readiness" role="note">
        <strong>Ipotesi di mondo chiuso dichiarata nel template</strong>
        <span>
          Le assenze si riferiscono solo alla proiezione visibile corrente. Il template dichiara completi i dati per queste relazioni tipizzate; i filtri attivi possono quindi cambiare il risultato.
          {#if selectedHasInducedConditions} Per i tipi indotti ogni coppia di ruoli viene controllata nella direzione del grafo (incluse le relazioni verso sé stessi); tipi non elencati sono ignorati, salvo gli archi positivi esplicitamente richiesti.{/if}
        </span>
      </div>
    {/if}

    {#if !hasRun && !error}
      <small>
        {selectedTemporalSemantics === "orderedByStart"
          ? "Il task restituisce ogni sequenza valida di archi testimoni; la stessa assegnazione dei ruoli può produrre più sequenze se esistono archi paralleli."
          : "Il task cerca tutte le assegnazioni compatibili."}
        Template e gruppi provengono dalla configurazione; su grafi grandi il numero di modelli può crescere rapidamente.
      </small>
    {/if}

    {#if error}
      <div class="error" role="alert">{error}</div>
    {/if}

    {#if hasRun && matches.length === 0 && !error}
      <div class="near-match-controls">
        <button type="button" on:click={diagnose} disabled={running || !selectedRequirementsAvailable}>
          {running ? "Solver in esecuzione…" : selectedIsTemporal ? "Analizza la struttura più vicina" : "Spiega il mancato match"}
        </button>
        <small>
          Cerca un assegnamento che riempie il maggior numero di ruoli e poi minimizza i vincoli strutturali violati.
          È una query combinatoria separata e può richiedere tempo su grafi grandi.
          {#if selectedIsTemporal}
            {#if selectedTemporalSemantics === "coValid"}
              A parità strutturale sceglie l’istante che rende temporalmente attivi più pattern; distingue pattern senza intervalli validi da quelli inattivi all’istante scelto.
            {:else}
              A parità strutturale sceglie i record con meno inversioni tra inizi consecutivi; distingue pattern senza intervalli validi.
            {/if}
          {:else}
            A parità di ruoli assegnati minimizza insieme le relazioni richieste senza testimone e gli archi presenti che violano un vincolo di assenza.
          {/if}
        </small>
      </div>
    {/if}

    {#if hasRun && matches.length === 0 && !error && counterfactualEnabled}
      <div class="counterfactual-controls">
        <button type="button" on:click={proposeCounterfactual} disabled={running || !selectedRequirementsAvailable}>
          {running ? "Solver in esecuzione…" : "Cerca aggiunte ipotetiche minime"}
        </button>
        <small>
          Valuta solo i {counterfactualCandidateCount} archi esplicitamente configurati con costo positivo.
          La proposta non viene applicata al grafo; il costo ordina gli scenari dichiarati e non esprime probabilità o causalità.
          {#if selectedIsTemporal} Ogni candidato deve dichiarare un intervallo di validità.{/if}
        </small>
      </div>
    {/if}

    {#if counterfactualError}
      <div class="error" role="alert">{counterfactualError}</div>
    {/if}

    {#if counterfactualHasRun}
      <div class="summary" role="status">
        {#if counterfactuals.length > 0}
          <strong>{counterfactuals.length}</strong> proposta{counterfactuals.length === 1 ? " ottima" : " ottime"} a costo minimo
        {:else}
          Nessuna combinazione dei candidati configurati completa il motivo.
        {/if}
        {#if counterfactualTimeMs !== undefined}<span> · {counterfactualTimeMs.toFixed(1)} ms</span>{/if}
        {#if counterfactualExcludedCandidateCount > 0}
          <p>{counterfactualExcludedCandidateCount} candidati esclusi perché fuori dalla proiezione visibile o dal gruppo selezionato.</p>
        {/if}
      </div>
    {/if}

    {#if counterfactuals.length > 0}
      <div class="results-heading">
        <strong>Proposte ipotetiche · costo totale {counterfactuals[0].totalCost}</strong>
        <button type="button" on:click={exportCounterfactuals}>Esporta CSV</button>
      </div>
      <ul class="results">
        {#each counterfactuals as proposal, index}
          <li>
            <button type="button" class="match" on:click={() => dispatch("highlightCounterfactual", proposal)}>
              <strong>{index + 1}. {proposal.label} · costo {proposal.totalCost}</strong>
              {#each Object.entries(proposal.match.roles) as [role, node]}
                <span>{role}: {node.sourceId}</span>
              {/each}
              {#each proposal.addedEdges as edge}
                <span>
                  Aggiunta ipotetica {edge.id}: {edge.sourceNodeId} —{edge.edgeType}→ {edge.targetNodeId} · costo {edge.cost} · relazioni {edge.patternIndexes.join(", ")}
                  {#if edge.validity} · validità {displayMappedTime(edge.validity.from)}–{displayMappedTime(edge.validity.to)}{/if}
                </span>
              {/each}
              {#each proposal.match.supportingEdges.filter((edge) => edge.edgeIds.length > 0) as edge}
                <span>
                  Supporto osservato {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}: {edge.edgeIds.join(", ")}
                  {#if provenanceForEdges(edge.edgeIds)} · fonte dichiarata: {provenanceForEdges(edge.edgeIds)}{/if}
                </span>
              {/each}
              {#each proposal.match.absenceConditions ?? [] as edge}
                <span>Assenza verificata sotto mondo chiuso sulla proiezione visibile: {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}</span>
              {/each}
            </button>
          </li>
        {/each}
      </ul>
      <small>
        L'evidenziazione mostra nodi e archi osservati che sostengono il motivo; gli archi ipotetici restano separati e non entrano nella vista del grafo.
        L'ottimalità vale solo rispetto ai candidati, ai costi, al template e alla proiezione corrente.
      </small>
    {/if}

    {#if nearMatchError}
      <div class="error" role="alert">{nearMatchError}</div>
    {/if}

    {#if hasRun && !error}
      <div class="summary" role="status">
        <strong>{matches.length}</strong>
        {selectedTemporalSemantics === "orderedByStart"
          ? matches.length === 1 ? " sequenza testimone" : " sequenze testimone"
          : matches.length === 1 ? " istanza del template" : " istanze del template"}
        {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
        {#if matches.length === 0}
          <p>
            {selectedTemporalSemantics === "orderedByStart"
              ? "Nessuna sequenza di archi testimoni rispetta l’ordine degli inizi di validità richiesto."
              : selectedTemporalSemantics === "coValid"
                ? "Nessuna assegnazione ha tutti gli archi testimoni attivi nello stesso istante."
                : "Nessuna assegnazione soddisfa tipi e relazioni del template."}
          </p>
        {/if}
      </div>
    {/if}

    {#if matches.length > 0}
      <div class="results-heading">
        <strong>Ruoli e archi testimoni</strong>
        <button type="button" on:click={exportResults}>Esporta CSV</button>
      </div>
      <ul class="results">
        {#each visibleMatches as match, index}
          <li>
            <button type="button" class="match" on:click={() => dispatch("highlight", match)}>
              <strong>{index + 1}. {match.label}</strong>
              {#if match.timeValue !== undefined}<span>Istante comune di validità: {displayMappedTime(match.timeValue)}</span>{/if}
              {#each Object.entries(match.roles) as [role, node]}
                <span>{role}: {node.sourceId}</span>
              {/each}
              {#each match.supportingEdges as edge}
                <span>
                  {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}: {edge.edgeIds.join(", ")}
                  {#if provenanceForEdges(edge.edgeIds)} · fonte dichiarata: {provenanceForEdges(edge.edgeIds)}{/if}
                  {#if edge.startTimeValue !== undefined} · inizio {displayMappedTime(edge.startTimeValue)}{/if}
                </span>
              {/each}
              {#each match.absenceConditions ?? [] as edge}
                <span>Assenza verificata sotto mondo chiuso sulla proiezione visibile: {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}</span>
              {/each}
            </button>
          </li>
        {/each}
      </ul>
      {#if matches.length > visibleMatches.length}
        <button type="button" class="show-more" on:click={() => visibleLimit += 100}>
          Mostra altri 100 ({matches.length - visibleMatches.length} restanti)
        </button>
      {/if}
      <small>
        Il testimone è verificabile: assegna nodi distinti ai ruoli e mostra almeno un record d’arco per ogni relazione richiesta.
        {#if selectedHasAbsenceConditions} Le assenze dichiarate valgono sotto mondo chiuso sulla proiezione visibile e presuppongono dati completi per i tipi indicati.{/if}
        Per co-validità mostra anche l’istante comune; per l’ordine temporale mostra il record e l’inizio di validità usati per ogni passo.
        Tipi e intervalli seguono il mapping/template: il certificato prova compatibilità strutturale, non causalità o verità storica.
      </small>
    {/if}

    {#if nearMatchHasRun && nearMatches.length > 0}
      <div class="summary" role="status">
        <strong>{nearMatches.length}</strong> near-match {nearMatches[0].temporalEvidence ? "temporale" : "strutturale"} {nearMatches.length === 1 ? "ottimo" : "ottimi"}
        {#if nearMatchTimeMs !== undefined}<span> · {nearMatchTimeMs.toFixed(1)} ms</span>{/if}
        {#if nearMatches[0].temporalEvidence}
          <p>Prima si massimizzano i ruoli assegnati, poi le relazioni esistenti; infine si riducono le incompatibilità temporali. In caso di pari merito il solver mostra un risultato ottimo.</p>
        {:else}
          <p>Prima si massimizza il numero di ruoli assegnati; poi si minimizza il numero totale di relazioni richieste mancanti e di vincoli di assenza violati. In caso di pari merito il solver mostra un risultato ottimo.</p>
        {/if}
      </div>
      <div class="results-heading">
        <strong>{nearMatches[0].temporalEvidence ? "Diagnostica why-not temporale" : "Diagnostica why-not strutturale"}</strong>
        <button type="button" on:click={exportNearMatches}>Esporta CSV</button>
      </div>
      <ul class="near-matches">
        {#each nearMatches as nearMatch, index}
          <li class="near-match">
            <button type="button" class="match" on:click={() => dispatch("highlightNearMatch", nearMatch)}>
              <strong>{index + 1}. {nearMatch.label}</strong>
              <span>Ruoli assegnati: {Object.keys(nearMatch.roles).length} / {Object.keys(selectedTemplate?.roles ?? {}).length} · relazioni mancanti: {nearMatch.missingPatterns.length} · assenze violate: {nearMatch.violatedAbsencePatterns.length}</span>
              {#each Object.entries(nearMatch.roles) as [role, node]}
                <span>{role}: {node.sourceId}</span>
              {/each}
              {#each nearMatch.missingRoles as role}
                <span>Ruolo senza candidato assegnato: {role}</span>
              {/each}
              {#each nearMatch.missingPatterns as pattern}
                <span>Relazione non trovata: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}</span>
              {/each}
              {#each nearMatch.unresolvedPatterns as pattern}
                <span>Relazione non valutabile perché manca un ruolo: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}</span>
              {/each}
              {#each nearMatch.violatedAbsencePatterns as pattern}
                <span>
                  Relazione presente ma dichiarata assente: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}: {pattern.edgeIds.join(", ")}
                  {#if provenanceForEdges(pattern.edgeIds)} · fonte dichiarata: {provenanceForEdges(pattern.edgeIds)}{/if}
                </span>
              {/each}
              {#each nearMatch.unresolvedAbsencePatterns as pattern}
                <span>Assenza non valutabile perché manca un ruolo: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}</span>
              {/each}
              {#each nearMatch.supportingEdges.filter((edge) => edge.edgeIds.length > 0) as edge}
                <span>
                  Relazione presente: {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}: {edge.edgeIds.join(", ")}
                  {#if provenanceForEdges(edge.edgeIds)} · fonte dichiarata: {provenanceForEdges(edge.edgeIds)}{/if}
                </span>
              {/each}
              {#if nearMatch.temporalEvidence}
                {#if nearMatch.temporalEvidence.timeValue !== undefined}
                  <span>Istante scelto che massimizza i pattern co-validi: {displayMappedTime(nearMatch.temporalEvidence.timeValue)}</span>
                {/if}
                {#each nearMatch.temporalEvidence.unavailablePatterns as pattern}
                  <span>Intervallo temporale assente o non valido: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}</span>
                {/each}
                {#each nearMatch.temporalEvidence.inactivePatterns as pattern}
                  <span>Nessun record attivo all’istante scelto: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}</span>
                {/each}
                {#each nearMatch.temporalEvidence.orderViolations as pair}
                  <span>Ordine invertito tra pattern {pair.firstIndex} e {pair.secondIndex}</span>
                {/each}
                {#each nearMatch.temporalEvidence.supportingEdges.filter((edge) => edge.edgeIds.length > 0) as edge}
                  <span>
                    Supporto temporale {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}: {edge.edgeIds.join(", ")}
                    {#if provenanceForEdges(edge.edgeIds)} · fonte dichiarata: {provenanceForEdges(edge.edgeIds)}{/if}
                    {#if edge.startTimeValue !== undefined} · inizio {displayMappedTime(edge.startTimeValue)}{/if}
                  </span>
                {/each}
              {/if}
            </button>
          </li>
        {/each}
      </ul>
      <small>
        È una spiegazione strutturale ordinata dal criterio dichiarato: non propone di aggiungere archi e non attribuisce loro significato causale.
        {#if nearMatches[0].temporalEvidence}
          Per co-validità il tempo è scelto fra gli estremi degli intervalli mappati; per l’ordine i testimoni riducono le inversioni consecutive. L’ottimo temporale è una spiegazione del template, non un intervento causale.
        {/if}
      </small>
    {/if}
  </section>
{/if}

<style>
  .motif-panel {
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

  .controls {
    display: grid;
    gap: 8px;
  }

  label {
    display: grid;
    grid-template-columns: 90px 1fr;
    align-items: center;
    gap: 8px;
  }

  select,
  button {
    font: inherit;
  }

  select {
    min-width: 0;
    padding: 5px 7px;
  }

  .run,
  .results-heading button,
  .show-more {
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

  .readiness {
    display: grid;
    gap: 3px;
    padding: 8px;
    border-radius: 6px;
    background: #f1f5f9;
  }

  .readiness span,
  .readiness ul {
    color: #475569;
  }

  .readiness ul {
    margin: 2px 0 0;
    padding-left: 18px;
  }

  .summary {
    padding: 9px;
    border-radius: 7px;
    background: #eff6ff;
  }

  .results {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .near-match-controls {
    display: grid;
    gap: 5px;
    padding: 8px;
    border-radius: 6px;
    background: #fefce8;
  }

  .counterfactual-controls {
    display: grid;
    gap: 5px;
    padding: 8px;
    border-radius: 6px;
    background: #f0fdf4;
  }

  .counterfactual-controls button {
    justify-self: start;
    padding: 6px 8px;
  }

  .near-match-controls button {
    justify-self: start;
    padding: 6px 8px;
  }

  .near-matches {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .match {
    display: grid;
    gap: 3px;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: 5px;
    background: #eef2ff;
    color: inherit;
    text-align: left;
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .match:hover {
    background: #e0e7ff;
  }

  @media (max-width: 1280px) {
    .motif-panel {
      right: 12px;
      width: min(var(--solver-width), calc(100vw - 24px));
      top: calc(var(--toolbar-top) + var(--toolbar-height, 180px) + 10px);
      max-height: calc(100vh - var(--toolbar-height, 180px) - var(--toolbar-top) - 20px);
    }
  }
</style>
