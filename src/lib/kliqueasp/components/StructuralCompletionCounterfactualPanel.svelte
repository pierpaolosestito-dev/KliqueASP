<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { formatItalianNumber } from "../graph/formatItalianNumber.ts";
  import AnalysisErrorMessage from "./AnalysisErrorMessage.svelte";
  import CounterfactualConfigHint from "./CounterfactualConfigHint.svelte";
  import SearchableNodeSelect from "./SearchableNodeSelect.svelte";
  import ProgressiveList from "./ProgressiveList.svelte";
  import { describeStructuralCounterfactualBlocker } from "../graph/analysisReadiness";
  import { csvCell, downloadCsvText } from "../csvExport";
  import { buildKCoreCompletionWhyNotCsv, buildKCoreMembershipCompletionWhyNotCsv, buildKPlexCompletionWhyNotCsv } from "../graph/structuralCsvExport.ts";
  import ResultListPager from "./ResultListPager.svelte";
  import type { KPlexCompletionWhyNot, KCoreCompletionWhyNot, KCoreMembershipCompletionWhyNot, StructuralEdgeCompletionProposal } from "../graph/structuralTasks";

  export let running = false;
  let searchPending = false;
  $: if (!running && searchPending) searchPending = false;
  export let title = "Completamento controfattuale";
  export let contextText = "";
  export let targetLabel = "Valore richiesto";
  export let target = 1;
  export let minimumTarget = 1;
  export let maximumTarget: number | undefined;
  export let targetHelp = "";
  export let unavailableReason = "";
  export let candidateEnabled = false;
  export let candidateCount = 0;
  export let proposals: StructuralEdgeCompletionProposal[] = [];
  export let whyNot: KPlexCompletionWhyNot | null = null;
  export let whyNotMessage = "";
  export let kCoreWhyNot: KCoreCompletionWhyNot | null = null;
  export let kCoreWhyNotMessage = "";
  export let kCoreMembershipWhyNot: KCoreMembershipCompletionWhyNot | null = null;
  export let kCoreMembershipWhyNotMessage = "";
  export let hasRun = false;
  export let error = "";
  export let timeMs: number | undefined;
  export let excludedCandidateCount = 0;
  export let cohortNodeIds: string[] = [];
  export let sourceIdByNodeId: Record<string, string> = {};
  export let targetNodeSelection = false;
  export let targetNodeId = "";
  export let targetNodeFieldLabel = "Nodo obiettivo";
  export let targetNodeOptions: Array<{ id: string; label: string }> = [];
  export let enumerateAllOptima = false;
  export let showEnumeration = false;

  const dispatch = createEventDispatcher();
  const counterfactualPageSize = 25;
  let visibleProposalLimit = counterfactualPageSize;
  let visibleWhyNotBlockerLimit = counterfactualPageSize;
  let visibleKCoreWhyNotBlockerLimit = counterfactualPageSize;
  let visibleKCoreMembershipPeelingLimit = counterfactualPageSize;
  let visibleProposalEdgeLimits: Record<number, number> = {};
  let previousProposals = proposals;
  let previousWhyNot = whyNot;
  let previousKCoreWhyNot = kCoreWhyNot;
  let previousKCoreMembershipWhyNot = kCoreMembershipWhyNot;
  $: if (proposals !== previousProposals) {
    previousProposals = proposals;
    visibleProposalLimit = counterfactualPageSize;
    visibleProposalEdgeLimits = {};
  }
  $: visibleProposals = proposals.slice(0, visibleProposalLimit);
  $: if (whyNot !== previousWhyNot) {
    previousWhyNot = whyNot;
    visibleWhyNotBlockerLimit = counterfactualPageSize;
  }
  $: visibleWhyNotBlockers = whyNot?.blockers.slice(0, visibleWhyNotBlockerLimit) ?? [];
  $: if (kCoreWhyNot !== previousKCoreWhyNot) {
    previousKCoreWhyNot = kCoreWhyNot;
    visibleKCoreWhyNotBlockerLimit = counterfactualPageSize;
  }
  $: visibleKCoreWhyNotBlockers = kCoreWhyNot?.blockers.slice(0, visibleKCoreWhyNotBlockerLimit) ?? [];
  $: if (kCoreMembershipWhyNot !== previousKCoreMembershipWhyNot) {
    previousKCoreMembershipWhyNot = kCoreMembershipWhyNot;
    visibleKCoreMembershipPeelingLimit = counterfactualPageSize;
  }
  $: visibleKCoreMembershipPeeling = kCoreMembershipWhyNot?.peeling.slice(0, visibleKCoreMembershipPeelingLimit) ?? [];

  function showMoreProposalEdges(proposalIndex: number) {
    visibleProposalEdgeLimits = {
      ...visibleProposalEdgeLimits,
      [proposalIndex]: (visibleProposalEdgeLimits[proposalIndex] ?? counterfactualPageSize) + counterfactualPageSize
    };
  }
  $: invalidTarget = !Number.isSafeInteger(Number(target)) || Number(target) < minimumTarget ||
    (maximumTarget !== undefined && Number(target) > maximumTarget);
  $: prerequisiteMessage = describeStructuralCounterfactualBlocker({
    invalidTarget,
    minimumTarget,
    maximumTarget,
    cohortNodeCount: cohortNodeIds.length,
    targetNodeSelection,
    targetNodeCount: targetNodeOptions.length,
    targetNodeSelected: targetNodeOptions.some((option) => option.id === targetNodeId)
  });
  $: searchableTargetNodeOptions = targetNodeOptions.map((option) => ({
    value: option.id,
    label: sourceIdByNodeId[option.id] ?? option.label
  }));

  function run() {
    if (!candidateEnabled || invalidTarget || cohortNodeIds.length === 0 ||
      (targetNodeSelection && !targetNodeOptions.some((option) => option.id === targetNodeId))) return;
    searchPending = true;
    dispatch("run", {
      target: Number(target),
      cohortNodeIds: [...cohortNodeIds],
      targetNodeId: targetNodeSelection ? targetNodeId : undefined,
      enumerateAllOptima
    });
  }

  function highlight(proposal: StructuralEdgeCompletionProposal) {
    const nodeIds = [...new Set([
      ...(proposal.coreWitnessNodeIds ?? []),
      ...proposal.addedEdges.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId])
    ])];
    if (nodeIds.length > 0) {
      dispatch("highlight", nodeIds);
      dispatch("highlightCounterfactual", { proposal, nodeIds, title });
    }
  }

  function highlightWhyNot() {
    if (!whyNot) return;
    const nodeIds = [...new Set([
      ...whyNot.blockers.map((blocker) => blocker.nodeId),
      ...whyNot.blockers.flatMap((blocker) => blocker.unfillableMissingNeighborIds)
    ])];
    if (nodeIds.length > 0) dispatch("highlight", nodeIds);
  }

  function exportWhyNot() {
    if (!whyNot) return;
    downloadCsvText("k_plex_completion_why_not.csv", buildKPlexCompletionWhyNotCsv(whyNot, sourceIdByNodeId));
  }

  function highlightKCoreWhyNot() {
    if (!kCoreWhyNot) return;
    const nodeIds = [...new Set(kCoreWhyNot.blockers.flatMap((blocker) => [
      blocker.nodeId,
      ...blocker.currentNeighborIds,
      ...blocker.additionalCandidateNeighborIds
    ]))];
    if (nodeIds.length > 0) dispatch("highlight", nodeIds);
  }

  function exportKCoreWhyNot() {
    if (!kCoreWhyNot) return;
    downloadCsvText("k_core_completion_why_not.csv", buildKCoreCompletionWhyNotCsv(kCoreWhyNot, sourceIdByNodeId));
  }

  function highlightKCoreMembershipWhyNot() {
    if (!kCoreMembershipWhyNot) return;
    const nodeIds = [...new Set(kCoreMembershipWhyNot.peeling.flatMap((step) => [
      step.nodeId,
      ...step.survivingNeighborIds
    ]))];
    if (nodeIds.length > 0) dispatch("highlight", nodeIds);
  }

  function exportKCoreMembershipWhyNot() {
    if (!kCoreMembershipWhyNot) return;
    downloadCsvText("k_core_membership_completion_why_not.csv",
      buildKCoreMembershipCompletionWhyNotCsv(kCoreMembershipWhyNot, sourceIdByNodeId));
  }

  function exportProposals() {
    if (!hasRun) return;
    const headers = [
      "candidate_edge_id", "source_node_id", "target_node_id", "edge_type", "candidate_cost",
      "total_cost", "target", "cohort_node_ids",
      ...(targetNodeSelection ? ["target_node_id", "core_witness_node_ids"] : []),
      "hypothetical", "structured_witness_json"
    ];
    const rows = [headers.map(csvCell).join(",")];
    for (const proposal of proposals) {
      const witnessNodeIds = proposal.coreWitnessNodeIds ?? cohortNodeIds;
      const sourceCohort = witnessNodeIds.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId);
      const sourceTargetNodeId = sourceIdByNodeId[targetNodeId] ?? targetNodeId;
      if (proposal.addedEdges.length === 0) {
        rows.push(["", "", "", "", 0, proposal.totalCost, target, sourceCohort.join(" | "),
          ...(targetNodeSelection ? [sourceTargetNodeId, sourceCohort.join(" | ")] : []), true,
          JSON.stringify({
            kind: targetNodeSelection ? "k_core_membership_counterfactual" : "structural_edge_completion_counterfactual",
            target,
            cohort_node_ids: sourceCohort,
            ...(targetNodeSelection ? { target_node_id: sourceTargetNodeId, core_witness_node_ids: sourceCohort } : {}),
            added_edges: []
          })]
          .map(csvCell).join(","));
      }
      for (const edge of proposal.addedEdges) {
        const sourceNodeId = sourceIdByNodeId[edge.sourceNodeId] ?? edge.sourceNodeId;
        const targetNodeId = sourceIdByNodeId[edge.targetNodeId] ?? edge.targetNodeId;
        rows.push([
          edge.id, sourceNodeId, targetNodeId, edge.edgeType, edge.cost, proposal.totalCost,
          target, sourceCohort.join(" | "),
          ...(targetNodeSelection ? [sourceTargetNodeId, sourceCohort.join(" | ")] : []), true,
          JSON.stringify({
            kind: targetNodeSelection ? "k_core_membership_counterfactual" : "structural_edge_completion_counterfactual",
            target,
            cohort_node_ids: sourceCohort,
            ...(targetNodeSelection ? { target_node_id: sourceTargetNodeId, core_witness_node_ids: sourceCohort } : {}),
            added_edge: { id: edge.id, source_node_id: sourceNodeId, target_node_id: targetNodeId, edge_type: edge.edgeType, cost: edge.cost }
          })
        ].map(csvCell).join(","));
      }
    }
    downloadCsvText("structural_counterfactual_proposals.csv", rows.join("\n"));
  }
</script>

<details class="kplex-counterfactual" open={hasRun || Boolean(error)}>
  <summary>
    <strong>{title}</strong>
    <small role="status" aria-live="polite">
      {#if error}
        Verifica non disponibile
      {:else if hasRun && proposals.length === 0}
        Nessun completamento possibile
      {:else if hasRun}
        {proposals.length} {proposals.length === 1 ? "proposta a costo minimo" : "proposte a costo minimo"}
      {:else if unavailableReason}
        Non applicabile al grafo
      {:else if candidateEnabled}
        {candidateCount} {candidateCount === 1 ? "arco candidato" : "archi candidati"}
      {:else}
        Richiede archi candidati
      {/if}
    </small>
  </summary>
  <div class="counterfactual-content">
  <p>{contextText} Le proposte restano ipotetiche: non cambiano i dati del grafo.</p>
  {#if targetNodeSelection}
    {#if targetNodeOptions.length > 0}
      <label class="counterfactual-field">
        {targetNodeFieldLabel}
        <SearchableNodeSelect
          id="structural-counterfactual-target-node"
          bind:value={targetNodeId}
          options={searchableTargetNodeOptions}
          ariaLabel={targetNodeFieldLabel}
          placeholder="Cerca nodo…"
          disabled={running}
          on:change={() => dispatch("criteriaChange")}
        />
      </label>
    {/if}
  {/if}
  <label class="counterfactual-field">
    {targetLabel}
    <input type="number" bind:value={target} on:input={() => dispatch("criteriaChange")} min={minimumTarget} max={maximumTarget} step="1" />
  </label>
  <small>{targetHelp}</small>
  {#if unavailableReason}
    <small>{unavailableReason}</small>
  {:else if !candidateEnabled}
    <CounterfactualConfigHint
      description="Aggiungi archi candidati e costi positivi per attivare il completamento ipotetico."
      on:openData={() => dispatch("openData")}
    />
  {:else}
    <small>Candidati configurati: {candidateCount}. Il tipo d'arco resta informazione descrittiva; i vincoli usano adiacenza non orientata.{showEnumeration ? ` ${enumerateAllOptima ? "Saranno mostrate tutte le proposte con costo minimo." : "Sarà mostrata una proposta minima."}` : ""}</small>
  {/if}
  {#if !unavailableReason && candidateEnabled && prerequisiteMessage}
    <small class="readiness-message" role="status">{prerequisiteMessage}</small>
  {/if}
  {#if showEnumeration && !unavailableReason && candidateEnabled}
    <label class="checkbox-label">
      <span>Proposte</span>
      <span><input type="checkbox" bind:checked={enumerateAllOptima} on:change={() => dispatch("criteriaChange")} /> Tutte le proposte minime</span>
    </label>
  {/if}
  <button type="button" disabled={running || !candidateEnabled || Boolean(unavailableReason) || invalidTarget || cohortNodeIds.length === 0 ||
    (targetNodeSelection && !targetNodeOptions.some((option) => option.id === targetNodeId))} on:click={run}>
    {running && searchPending ? "Ricerca in corso…" : "Calcola completamento minimo"}
  </button>
  {#if error}
      <AnalysisErrorMessage message={error} />
  {/if}
  {#if hasRun}
    {#if excludedCandidateCount > 0}
      <p>{excludedCandidateCount} candidati esclusi perché fuori dal testimone, dalla proiezione visibile o già adiacenti.</p>
    {/if}
    <div class="counterfactual-result">
      {#if proposals.length === 0}
        <strong>Nessun completamento possibile</strong>
        {#if whyNot}
          <p>La verifica mostra perché non è possibile ottenere un k-plex di valore {whyNot.targetS} con i candidati autorizzati. Ogni nodo può avere al massimo {Math.max(0, whyNot.targetS - 1)} coppie mancanti; i nodi seguenti superano questo limite anche aggiungendo tutti gli archi candidati disponibili:</p>
          <ul>
            {#each visibleWhyNotBlockers as blocker}
              <li>
                <strong>{sourceIdByNodeId[blocker.nodeId] ?? blocker.nodeId}</strong>: {blocker.unfillableMissingNeighborIds.length} coppie mancanti senza candidato.
                {#if blocker.unfillableMissingNeighborIds.length > 0}
                  <div class="counterfactual-evidence-list">
                    <strong>Nodi senza arco candidato</strong>
                    <ProgressiveList items={blocker.unfillableMissingNeighborIds} resetKey={blocker} label="nodi senza arco candidato" let:item>
                      <span>{sourceIdByNodeId[item] ?? item}</span>
                    </ProgressiveList>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
          <ResultListPager
            total={whyNot.blockers.length}
            visible={visibleWhyNotBlockers.length}
            pageSize={counterfactualPageSize}
            label="nodi bloccanti"
            showMore={() => visibleWhyNotBlockerLimit += counterfactualPageSize}
          />
          <small>Coppie mancanti impossibili da colmare: {whyNot.unfillableMissingPairs.length}.</small>
          <div class="why-not-actions">
            <button type="button" on:click={highlightWhyNot}>Evidenzia nodi e vicini bloccanti</button>
            <button type="button" on:click={exportWhyNot}>Esporta certificato CSV</button>
          </div>
        {:else if kCoreWhyNot}
          <p>La verifica mostra perché non è possibile ottenere un k-core con soglia {kCoreWhyNot.targetK} usando i candidati autorizzati. Per questi nodi, anche aggiungendo tutti i candidati pertinenti, il grado interno massimo resta sotto k:</p>
          <ul>
            {#each visibleKCoreWhyNotBlockers as blocker}
              <li>
                <strong>{sourceIdByNodeId[blocker.nodeId] ?? blocker.nodeId}</strong>: grado attuale {blocker.currentNeighborIds.length}; massimo raggiungibile {blocker.maximumAchievableDegree} &lt; {kCoreWhyNot.targetK}.
                {#if blocker.additionalCandidateNeighborIds.length > 0}
                  <div class="counterfactual-evidence-list">
                    <strong>Vicini aggiungibili · {blocker.additionalCandidateNeighborIds.length}</strong>
                    <ProgressiveList items={blocker.additionalCandidateNeighborIds} resetKey={blocker} label="vicini aggiungibili" let:item>
                      <span>{sourceIdByNodeId[item] ?? item}</span>
                    </ProgressiveList>
                  </div>
                {:else}
                  Nessun vicino aggiuntivo autorizzato.
                {/if}
              </li>
            {/each}
          </ul>
          <ResultListPager
            total={kCoreWhyNot.blockers.length}
            visible={visibleKCoreWhyNotBlockers.length}
            pageSize={counterfactualPageSize}
            label="nodi bloccanti"
            showMore={() => visibleKCoreWhyNotBlockerLimit += counterfactualPageSize}
          />
          <div class="why-not-actions">
            <button type="button" on:click={highlightKCoreWhyNot}>Evidenzia nodi e vicini bloccanti</button>
            <button type="button" on:click={exportKCoreWhyNot}>Esporta certificato CSV</button>
          </div>
        {:else if kCoreMembershipWhyNot}
          {@const targetStep = kCoreMembershipWhyNot.peeling.find((step) => step.nodeId === kCoreMembershipWhyNot.targetNodeId)}
          <p>Anche aggiungendo tutti gli archi candidati autorizzati nel dominio selezionato, {sourceIdByNodeId[kCoreMembershipWhyNot.targetNodeId] ?? kCoreMembershipWhyNot.targetNodeId} viene eliminato dal {kCoreMembershipWhyNot.targetK}-core al turno {targetStep?.round}. I turni mostrati bastano a spiegare l'esclusione del nodo: ogni sottoinsieme di queste aggiunte produce un grafo contenuto nel grafo massimo esaminato, quindi il nodo non può appartenere al core nei completamenti ammessi.</p>
          <ol>
            {#each visibleKCoreMembershipPeeling as step}
              <li>
                Turno {step.round}: <strong>{sourceIdByNodeId[step.nodeId] ?? step.nodeId}</strong> ha {step.survivingNeighborIds.length} vicini ancora attivi, meno della soglia {kCoreMembershipWhyNot.targetK}.
                {#if step.survivingNeighborIds.length > 0}
                  <div class="counterfactual-evidence-list">
                    <strong>Vicini ancora attivi · {step.survivingNeighborIds.length}</strong>
                    <ProgressiveList items={step.survivingNeighborIds} resetKey={step} label="vicini ancora attivi" let:item>
                      <span>{sourceIdByNodeId[item] ?? item}</span>
                    </ProgressiveList>
                  </div>
                {/if}
              </li>
            {/each}
          </ol>
          <ResultListPager
            total={kCoreMembershipWhyNot.peeling.length}
            visible={visibleKCoreMembershipPeeling.length}
            pageSize={counterfactualPageSize}
            label="turni del peeling"
            showMore={() => visibleKCoreMembershipPeelingLimit += counterfactualPageSize}
          />
          <div class="why-not-actions">
          <button type="button" on:click={highlightKCoreMembershipWhyNot}>Evidenzia i turni che eliminano il nodo obiettivo</button>
            <button type="button" on:click={exportKCoreMembershipWhyNot}>Esporta certificato CSV</button>
          </div>
        {:else}
          <p>I candidati autorizzati non bastano a raggiungere il valore richiesto.</p>
          {#if whyNotMessage}<small>{whyNotMessage}</small>{/if}
          {#if kCoreWhyNotMessage}<small>{kCoreWhyNotMessage}</small>{/if}
          {#if kCoreMembershipWhyNotMessage}<small>{kCoreMembershipWhyNotMessage}</small>{/if}
        {/if}
      {:else}
        <strong>{proposals.length}</strong> proposta{proposals.length === 1 ? " minima" : " minime"} a costo minimo {#if timeMs !== undefined}<span>· {formatItalianNumber(timeMs, 1)} ms</span>{/if}
        {#each visibleProposals as proposal, proposalIndex}
          {@const visibleAddedEdges = proposal.addedEdges.slice(0, visibleProposalEdgeLimits[proposalIndex] ?? counterfactualPageSize)}
          <div class="counterfactual-proposal">
            <strong>Proposta {proposalIndex + 1} · costo totale {proposal.totalCost}</strong>
            {#if proposal.coreWitnessNodeIds && proposal.coreWitnessNodeIds.length > 0}
              <div class="counterfactual-evidence-list">
                <strong>Testimone di appartenenza al k-core · {proposal.coreWitnessNodeIds.length} nodi</strong>
                <ProgressiveList items={proposal.coreWitnessNodeIds} resetKey={proposal} label="nodi del testimone k-core" let:item>
                  <span>{sourceIdByNodeId[item] ?? item}</span>
                </ProgressiveList>
              </div>
            {/if}
            {#if proposal.addedEdges.length > 0}
              <ul>
                {#each visibleAddedEdges as edge}
                  <li>{sourceIdByNodeId[edge.sourceNodeId] ?? edge.sourceNodeId} — {sourceIdByNodeId[edge.targetNodeId] ?? edge.targetNodeId} · {edge.edgeType} · costo {edge.cost} · ID {edge.id}</li>
                {/each}
              </ul>
              <ResultListPager
                total={proposal.addedEdges.length}
                visible={visibleAddedEdges.length}
                pageSize={counterfactualPageSize}
                label="archi proposti"
                showMore={() => showMoreProposalEdges(proposalIndex)}
              />
              <button type="button" on:click={() => highlight(proposal)}>Evidenzia gli estremi proposti</button>
            {:else}
              <p>{targetNodeSelection ? "Il nodo obiettivo appartiene già a un k-core con questa soglia; non serve aggiungere archi." : "I nodi selezionati soddisfano già il valore richiesto; non serve aggiungere archi."}</p>
              <button type="button" on:click={() => highlight(proposal)}>Visualizza risultato in 2D</button>
            {/if}
          </div>
        {/each}
        <ResultListPager
          total={proposals.length}
          visible={visibleProposals.length}
          pageSize={counterfactualPageSize}
          label="proposte minime"
          showMore={() => visibleProposalLimit += counterfactualPageSize}
        />
        <button type="button" on:click={exportProposals}>Esporta proposte CSV</button>
      {/if}
    </div>
  {/if}
</div>
</details>

<style>
  .kplex-counterfactual {
    min-width: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
  }

  .kplex-counterfactual > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px;
    cursor: pointer;
  }

  .kplex-counterfactual > summary small {
    color: #475569;
    font-weight: 500;
    text-align: right;
  }

  .counterfactual-content {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: 0 10px 10px;
  }

  .counterfactual-content > p {
    margin: 0;
  }

  .counterfactual-field {
    display: grid;
    gap: 4px;
    min-width: 0;
    font-weight: 600;
  }

  .counterfactual-field input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: 5px 7px;
    font: inherit;
  }

  .counterfactual-content > small {
    display: block;
    color: #475569;
    line-height: 1.45;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .counterfactual-content > button,
  .counterfactual-proposal button,
  .counterfactual-result > button {
    justify-self: start;
    max-width: 100%;
    padding: 6px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #fff;
    color: #0f172a;
    font: inherit;
    cursor: pointer;
  }
  .kplex-counterfactual button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .counterfactual-result,
  .counterfactual-proposal {
    display: grid;
    gap: 6px;
    min-width: 0;
  }

  .counterfactual-evidence-list {
    display: grid;
    gap: 4px;
    min-width: 0;
    margin-top: 4px;
    padding: 7px;
    border-radius: 5px;
    background: #f8fafc;
    overflow-wrap: anywhere;
  }

  .why-not-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .counterfactual-result > p,
  .counterfactual-proposal > p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .counterfactual-proposal {
    padding: 8px;
    border-radius: 6px;
    background: #fff;
  }

  .counterfactual-proposal ul {
    margin: 0;
    padding-inline-start: 20px;
    overflow-wrap: anywhere;
  }

</style>
