<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { downloadCsvText } from "../csvExport";
  import { buildTypedPathCounterfactualCsv, buildTypedPathCounterfactualWhyNotCsv, buildTypedPathTemporalCounterfactualCsv, buildTypedPathTemporalNoRouteCsv } from "../graph/structuralCsvExport";
  import type { TypedPathCounterfactualProposal, TypedPathCounterfactualWhyNot, TypedPathTemporalResult, TypedPathTemporalSemantics } from "../graph/structuralTasks";

  export let running = false;
  export let enabled = false;
  export let requirementReasons: string[] = [];
  export let candidateCount = 0;
  export let excludedCandidateCount = 0;
  export let proposals: TypedPathCounterfactualProposal[] = [];
  export let hasRun = false;
  export let error = "";
  export let timeMs: number | undefined;
  export let edgeTypeSequence: string[] = [];
  export let startNodeId = "";
  export let goalNodeId = "";
  export let selectedGroup = "";
  export let sourceIdByNodeId: Record<string, string> = {};
  export let sourceIdByEdgeId: Record<string, string> = {};
  export let nodeLabelById: Record<string, string> = {};
  export let whyNot: TypedPathCounterfactualWhyNot | undefined;
  export let whyNotError = "";
  export let temporalSemantics: "static" | TypedPathTemporalSemantics = "static";
  export let strictTemporalOrder = false;

  let enumerateAllOptima = false;
  const dispatch = createEventDispatcher();

  function nodeLabel(nodeId: string): string {
    return nodeLabelById[nodeId] ?? sourceIdByNodeId[nodeId] ?? nodeId;
  }

  function nodeIdForSourceId(sourceId: string): string {
    return Object.entries(sourceIdByNodeId).find(([, value]) => value === sourceId)?.[0] ?? sourceId;
  }

  function requestRun() {
    if (!enabled || requirementReasons.length > 0 || !startNodeId || !goalNodeId ||
      startNodeId === goalNodeId || edgeTypeSequence.length === 0 || edgeTypeSequence.some((type) => !type.trim())) return;
    dispatch("run", {
      startNodeId,
      goalNodeId,
      edgeTypeSequence: [...edgeTypeSequence],
      group: selectedGroup,
      enumerateAllOptima,
      temporalSemantics,
      strictTemporalOrder
    });
  }

  function exportProposals() {
    if (!hasRun) return;
    if (temporalSemantics === "static") {
      const csv = buildTypedPathCounterfactualCsv({
        proposals,
        edgeTypeSequence,
        selectedGroup,
        sourceIdByNodeId,
        sourceIdByEdgeId
      });
      downloadCsvText("typed_path_counterfactuals.csv", csv);
      return;
    }
    const temporalProposals = proposals.flatMap((proposal) =>
      "temporalSemantics" in proposal.path ? [{ ...proposal, path: proposal.path as TypedPathTemporalResult }] : []
    );
    const csv = buildTypedPathTemporalCounterfactualCsv({
      proposals: temporalProposals,
      edgeTypeSequence,
      selectedGroup,
      sourceIdByNodeId,
      sourceIdByEdgeId
    });
    downloadCsvText("typed_path_temporal_counterfactuals.csv", csv);
  }

  function exportWhyNot() {
    if (!whyNot) return;
    if ("temporalSemantics" in whyNot) {
      const csv = buildTypedPathTemporalNoRouteCsv({
        certificate: whyNot,
        candidateEdgeIds: whyNot.candidateEdgeIds,
        startNodeId,
        goalNodeId,
        selectedGroup,
        sourceIdByNodeId,
        sourceIdByEdgeId
      });
      downloadCsvText("typed_path_temporal_counterfactual_why_not.csv", csv);
      return;
    }
    const csv = buildTypedPathCounterfactualWhyNotCsv({
      certificate: whyNot,
      startNodeId,
      goalNodeId,
      selectedGroup,
      sourceIdByNodeId
    });
    downloadCsvText("typed_path_counterfactual_why_not.csv", csv);
  }
</script>

<section class="typed-path-counterfactual" aria-live="polite">
  <strong>Completamento controfattuale del cammino</strong>
  <p>Trova la combinazione di archi candidati dichiarati a costo minimo che consente il cammino fra i terminali, rispettando sequenza e direzione. I candidati sono ipotetici: il grafo osservato resta invariato.</p>
  {#if requirementReasons.length > 0}
    <small>{requirementReasons.join("; ")}</small>
  {:else if !enabled}
    <small>Configura `graphAnalysis.counterfactuals.edgeAdditions` con archi candidati e costi positivi.</small>
  {:else}
    <small>Candidati configurati: {candidateCount}. {temporalSemantics === "static"
      ? "In modalità statica i candidati devono omettere validity; costi e tipi sono quelli dichiarati nella configurazione."
      : "Gli intervalli validity dei candidati sono richiesti e partecipano al vincolo temporale; il costo e il tipo sono quelli dichiarati nella configurazione."}</small>
  {/if}
  <label class="checkbox-label">
    <span>Enumerazione</span>
    <span><input type="checkbox" bind:checked={enumerateAllOptima} on:change={() => dispatch("criteriaChange")} /> Tutte le proposte minime</span>
  </label>
  <button type="button" disabled={running || !enabled || requirementReasons.length > 0 || !startNodeId || !goalNodeId || startNodeId === goalNodeId || edgeTypeSequence.length === 0} on:click={requestRun}>
    Calcola le aggiunte minime
  </button>
  {#if error}<div class="error" role="alert">{error}</div>{/if}
  {#if hasRun}
    {#if timeMs !== undefined}<small>Solver: {timeMs.toFixed(1)} ms.</small>{/if}
    {#if excludedCandidateCount > 0}<small>{excludedCandidateCount} candidati esclusi perché fuori dalla proiezione/gruppo, irrilevanti per la sequenza o già osservati con lo stesso tipo e verso.</small>{/if}
    {#if proposals.length === 0}
      <p>Nessuna combinazione degli archi candidati autorizzati realizza la sequenza richiesta.</p>
      {#if whyNot}
        <div class="why-not" aria-label="Diagnosi dei prefissi del cammino tipizzato">
          {#if "temporalSemantics" in whyNot}
            <strong>Diagnosi temporale nel grafo massimo dichiarato</strong>
            <p>
              La verifica include tutti gli archi osservati e tutti i {whyNot.candidateEdgeIds.length} candidati eleggibili. Semantica: {whyNot.temporalSemantics}.
              {#if whyNot.goalReachableAsWalk}
                La meta è raggiungibile come walk temporale, ma non esiste un cammino semplice: la walk rivisita {whyNot.repeatedNodeIds.map(nodeLabel).join(", ") || "almeno un nodo"}.
              {:else if whyNot.firstBlockedStep !== undefined}
                Il prefisso massimo si ferma a {whyNot.maximumPrefixLength} passi; il passo {whyNot.firstBlockedStep} ({edgeTypeSequence[whyNot.firstBlockedStep - 1] ?? "tipo non disponibile"}) non è compatibile con gli intervalli e l'ordine temporale.
              {/if}
            </p>
            {#if whyNot.commonTimeValue !== undefined}<small>Istante comune: {whyNot.commonTimeValue}.</small>{/if}
            {#if whyNot.startTimeValuesByStep}<small>Inizi temporali per passo: {whyNot.startTimeValuesByStep.join(" → ")}.</small>{/if}
            <small>Candidati inclusi: {whyNot.candidateEdgeIds.length > 0 ? whyNot.candidateEdgeIds.join(", ") : "nessuno"}.</small>
            <div class="proposal-heading">
              <span>Walk massima: {whyNot.walk.nodeIds.map(nodeLabel).join(" → ")}</span>
              <button type="button" on:click={() => dispatch("highlight", whyNot.walk.nodeIds)}>Evidenzia</button>
            </div>
          {:else}
            <strong>Diagnosi nel grafo massimo dichiarato</strong>
            <p>
              La verifica include tutti gli archi osservati e tutti i {whyNot.candidateEdgeIds.length} candidati eleggibili.
              {#if whyNot.firstEmptyStep !== undefined}
                Dopo il passo {whyNot.firstEmptyStep} ({edgeTypeSequence[whyNot.firstEmptyStep - 1] ?? "tipo non disponibile"}) non resta alcun nodo raggiungibile.
              {:else if whyNot.goalReachableAsWalk}
                La meta è raggiungibile rispettando i tipi come walk, ma non esiste un cammino semplice: ogni walk completo deve rivisitare un nodo.
              {:else}
                La meta non è raggiungibile dopo la sequenza completa, anche se alcuni prefissi intermedi hanno nodi raggiungibili.
              {/if}
            </p>
            <small>Candidati inclusi: {whyNot.candidateEdgeIds.length > 0 ? whyNot.candidateEdgeIds.join(", ") : "nessuno"}.</small>
            <ol class="prefix-list">
              {#each whyNot.reachableByStep as layer}
                <li>
                  <div class="proposal-heading">
                    <span>Prefisso {layer.step}{layer.step > 0 ? `: ${edgeTypeSequence[layer.step - 1] ?? ""}` : ": nodo iniziale"}: {layer.nodeIds.length} nodi</span>
                    <button type="button" disabled={layer.nodeIds.length === 0} on:click={() => dispatch("highlight", layer.nodeIds)}>Evidenzia</button>
                  </div>
                  <span>{layer.nodeIds.length > 0 ? layer.nodeIds.map(nodeLabel).join(", ") : "nessuno"}</span>
                </li>
              {/each}
            </ol>
          {/if}
          <button type="button" on:click={exportWhyNot}>Esporta diagnosi CSV</button>
        </div>
      {:else if whyNotError}
        <p class="error" role="status">{whyNotError}</p>
      {/if}
    {:else}
      <ol class="proposal-list">
        {#each proposals as proposal, index}
          <li>
            <div class="proposal-heading">
              <strong>Proposta {index + 1} · costo totale {proposal.totalCost}</strong>
              <button type="button" on:click={() => dispatch("highlight", proposal.path.nodeIds)}>Evidenzia i nodi del cammino</button>
            </div>
            <p>{proposal.path.nodeIds.map(nodeLabel).join(" → ")}</p>
            {#if "temporalSemantics" in proposal.path && proposal.path.temporalSemantics === "coValid"}
              <small>Primo istante comune: {proposal.path.commonTimeValue}</small>
            {:else if "temporalSemantics" in proposal.path && proposal.path.temporalSemantics === "orderedByStart"}
              <small>Inizi di validità per passo: {proposal.path.startTimeValuesByStep?.join(" → ") ?? "non disponibili"}{strictTemporalOrder ? " (ordine stretto)" : " (ordine non stretto)"}</small>
            {/if}
            <ul>
              {#each proposal.addedEdges as edge}
                <li><strong>{edge.id}</strong>: {nodeLabel(nodeIdForSourceId(edge.sourceNodeId))} → {nodeLabel(nodeIdForSourceId(edge.targetNodeId))} · {edge.edgeType} · costo {edge.cost}</li>
              {/each}
            </ul>
          </li>
        {/each}
      </ol>
      <small>{enumerateAllOptima ? "Sono mostrate le combinazioni di archi ottime enumerate dal solver." : "È mostrata una combinazione minima; possono esistere altri ottimi."}</small>
    {/if}
    {#if proposals.length > 0}
      <button type="button" on:click={exportProposals}>Esporta proposte CSV</button>
    {/if}
  {/if}
</section>

<style>
  .typed-path-counterfactual { display: grid; gap: 0.55rem; margin-top: 0.8rem; padding: 0.75rem; border: 1px solid var(--panel-border, #555); border-radius: 0.5rem; }
  .typed-path-counterfactual p, .typed-path-counterfactual small { margin: 0; }
  .proposal-list, .proposal-list ul { margin: 0; padding-left: 1.25rem; }
  .proposal-list > li { margin-top: 0.5rem; }
  .why-not { display: grid; gap: 0.4rem; }
  .prefix-list { margin: 0; padding-left: 1.25rem; }
  .prefix-list > li { margin-top: 0.25rem; }
  .proposal-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .error { color: var(--error-color, #c44); }
</style>
