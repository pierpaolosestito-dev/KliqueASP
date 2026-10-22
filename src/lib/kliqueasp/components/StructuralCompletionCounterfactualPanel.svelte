<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { csvCell, downloadCsvText } from "../csvExport";
  import type { StructuralEdgeCompletionProposal } from "../graph/structuralTasks";

  export let running = false;
  export let title = "Completamento controfattuale";
  export let contextText = "";
  export let targetLabel = "Valore target";
  export let target = 1;
  export let minimumTarget = 1;
  export let maximumTarget: number | undefined;
  export let targetHelp = "";
  export let unavailableReason = "";
  export let candidateEnabled = false;
  export let candidateCount = 0;
  export let proposals: StructuralEdgeCompletionProposal[] = [];
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
  $: invalidTarget = !Number.isSafeInteger(Number(target)) || Number(target) < minimumTarget ||
    (maximumTarget !== undefined && Number(target) > maximumTarget);

  function run() {
    if (!candidateEnabled || invalidTarget || cohortNodeIds.length === 0 ||
      (targetNodeSelection && !targetNodeOptions.some((option) => option.id === targetNodeId))) return;
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
    if (nodeIds.length > 0) dispatch("highlight", nodeIds);
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

<div class="kplex-counterfactual" aria-live="polite">
  <strong>{title}</strong>
  <p>{contextText} Le proposte restano ipotetiche: non cambiano i dati del grafo.</p>
  {#if targetNodeSelection}
    <label class="counterfactual-field">
      {targetNodeFieldLabel}
      <select bind:value={targetNodeId} on:change={() => dispatch("criteriaChange")}>
        {#each targetNodeOptions as option}
          <option value={option.id}>{sourceIdByNodeId[option.id] ?? option.label}</option>
        {/each}
      </select>
    </label>
  {/if}
  <label class="counterfactual-field">
    {targetLabel}
    <input type="number" bind:value={target} on:input={() => dispatch("criteriaChange")} min={minimumTarget} max={maximumTarget} step="1" />
  </label>
  <small>{targetHelp}</small>
  {#if unavailableReason}
    <small>{unavailableReason}</small>
  {:else if !candidateEnabled}
    <small>Configura `graphAnalysis.counterfactuals.edgeAdditions` con archi ipotetici e costi positivi per attivare questa analisi.</small>
  {:else}
    <small>Candidati configurati: {candidateCount}. Il tipo d'arco resta informazione descrittiva; i vincoli usano adiacenza non orientata.{showEnumeration ? ` ${enumerateAllOptima ? "Tutti gli ottimi saranno enumerati." : "Sara mostrata una proposta minima."}` : ""}</small>
  {/if}
  {#if showEnumeration && !unavailableReason && candidateEnabled}
    <label class="checkbox-label">
      <span>Enumerazione</span>
      <span><input type="checkbox" bind:checked={enumerateAllOptima} on:change={() => dispatch("criteriaChange")} /> Tutte le proposte minime</span>
    </label>
  {/if}
  <button type="button" disabled={running || !candidateEnabled || Boolean(unavailableReason) || invalidTarget ||
    (targetNodeSelection && !targetNodeOptions.some((option) => option.id === targetNodeId))} on:click={run}>
    Calcola completamento minimo
  </button>
  {#if error}
    <div class="error" role="alert">{error}</div>
  {/if}
  {#if hasRun}
    {#if excludedCandidateCount > 0}
      <p>{excludedCandidateCount} candidati esclusi perché fuori dal testimone, dalla proiezione visibile o già adiacenti.</p>
    {/if}
    <div class="counterfactual-result">
      {#if proposals.length === 0}
        <strong>Nessun completamento possibile</strong>
        <p>I candidati autorizzati non bastano a soddisfare il target selezionato.</p>
      {:else}
        <strong>{proposals.length}</strong> proposta{proposals.length === 1 ? " minima" : " minime"} a costo minimo {#if timeMs !== undefined}<span>· {timeMs.toFixed(1)} ms</span>{/if}
        {#each proposals as proposal, proposalIndex}
          <div class="counterfactual-proposal">
            <strong>Proposta {proposalIndex + 1} · costo totale {proposal.totalCost}</strong>
            {#if proposal.coreWitnessNodeIds && proposal.coreWitnessNodeIds.length > 0}
              <p>Witness che certifica l’appartenenza al k-core: {proposal.coreWitnessNodeIds.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId).join(", ")}</p>
            {/if}
            {#if proposal.addedEdges.length > 0}
              <ul>
                {#each proposal.addedEdges as edge}
                  <li>{sourceIdByNodeId[edge.sourceNodeId] ?? edge.sourceNodeId} — {sourceIdByNodeId[edge.targetNodeId] ?? edge.targetNodeId} · {edge.edgeType} · costo {edge.cost} · ID {edge.id}</li>
                {/each}
              </ul>
              <button type="button" on:click={() => highlight(proposal)}>Evidenzia gli estremi proposti</button>
            {:else}
              <p>{targetNodeSelection ? "Il nodo obiettivo appartiene già a un k-core con questa soglia; non serve aggiungere archi." : "Il testimone soddisfa già il target; non serve aggiungere archi."}</p>
            {/if}
          </div>
        {/each}
        <button type="button" on:click={exportProposals}>Esporta proposte CSV</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .kplex-counterfactual {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: 10px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
  }

  .kplex-counterfactual > p {
    margin: 0;
  }

  .counterfactual-field {
    display: grid;
    gap: 4px;
    min-width: 0;
    font-weight: 600;
  }

  .counterfactual-field select,
  .counterfactual-field input {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: 5px 7px;
    font: inherit;
  }

  .kplex-counterfactual > small {
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

  .kplex-counterfactual > button,
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

  .error {
    color: #b91c1c;
    overflow-wrap: anywhere;
  }
</style>
