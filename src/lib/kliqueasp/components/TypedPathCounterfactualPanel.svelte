<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { formatItalianNumber } from "../graph/formatItalianNumber.ts";
  import AnalysisErrorMessage from "./AnalysisErrorMessage.svelte";
  import CounterfactualConfigHint from "./CounterfactualConfigHint.svelte";
  import { describeTypedPathCounterfactualBlocker } from "../graph/analysisReadiness";
  import { downloadCsvText } from "../csvExport";
  import { buildTypedPathCounterfactualCsv, buildTypedPathCounterfactualWhyNotCsv, buildTypedPathTemporalCounterfactualCsv, buildTypedPathTemporalNoRouteCsv } from "../graph/structuralCsvExport";
  import ResultListPager from "./ResultListPager.svelte";
  import ProgressiveList from "./ProgressiveList.svelte";
  import type { TypedPathCounterfactualProposal, TypedPathCounterfactualWhyNot, TypedPathTemporalResult, TypedPathTemporalSemantics } from "../graph/structuralTasks";

  export let running = false;
  let searchPending = false;
  $: if (!running && searchPending) searchPending = false;
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
  const counterfactualPageSize = 25;
  let visibleProposalLimit = counterfactualPageSize;
  let visibleProposalEdgeLimits: Record<number, number> = {};
  let visibleReachableLimits: Record<number, number> = {};
  let previousProposals = proposals;
  let previousWhyNot = whyNot;
  $: if (proposals !== previousProposals) {
    previousProposals = proposals;
    visibleProposalLimit = counterfactualPageSize;
    visibleProposalEdgeLimits = {};
  }
  $: visibleProposals = proposals.slice(0, visibleProposalLimit);
  $: if (whyNot !== previousWhyNot) {
    previousWhyNot = whyNot;
    visibleReachableLimits = {};
  }
  $: prerequisiteMessage = describeTypedPathCounterfactualBlocker({
    enabled,
    requirementReasons,
    startNodeId,
    goalNodeId,
    edgeTypeSequence
  });

  function nodeLabel(nodeId: string): string {
    return nodeLabelById[nodeId] ?? sourceIdByNodeId[nodeId] ?? nodeId;
  }

  function temporalSemanticsLabel(semantics: TypedPathTemporalSemantics): string {
    return semantics === "coValid"
      ? "un unico istante in cui tutti gli archi sono validi"
      : "l'ordine degli inizi di validità degli archi";
  }

  function nodeIdForSourceId(sourceId: string): string {
    return Object.entries(sourceIdByNodeId).find(([, value]) => value === sourceId)?.[0] ?? sourceId;
  }

  function showMoreProposalEdges(proposalIndex: number) {
    visibleProposalEdgeLimits = {
      ...visibleProposalEdgeLimits,
      [proposalIndex]: (visibleProposalEdgeLimits[proposalIndex] ?? counterfactualPageSize) + counterfactualPageSize
    };
  }

  function showMoreReachableNodes(step: number) {
    visibleReachableLimits = {
      ...visibleReachableLimits,
      [step]: (visibleReachableLimits[step] ?? counterfactualPageSize) + counterfactualPageSize
    };
  }

  function requestRun() {
    if (!enabled || requirementReasons.length > 0 || prerequisiteMessage) return;
    searchPending = true;
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
    <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Apri Dati e mapping</button>
  {:else if !enabled}
    <CounterfactualConfigHint
      description="Aggiungi archi candidati e costi positivi nella configurazione del grafo per abilitare questa ricerca."
      on:openData={() => dispatch("openData")}
    />
  {:else}
    <small>Candidati configurati: {candidateCount}. {temporalSemantics === "static"
      ? "In modalità statica i candidati devono omettere validity; costi e tipi sono quelli dichiarati nella configurazione."
      : "Gli intervalli validity dei candidati sono richiesti e partecipano al vincolo temporale; il costo e il tipo sono quelli dichiarati nella configurazione."}</small>
  {/if}
  {#if prerequisiteMessage}
    <small class="readiness-message" role="status">{prerequisiteMessage}</small>
  {/if}
  <label class="checkbox-label">
    <span>Proposte</span>
    <span><input type="checkbox" bind:checked={enumerateAllOptima} on:change={() => dispatch("criteriaChange")} /> Tutte le proposte minime</span>
  </label>
  <button type="button" disabled={running || !enabled || requirementReasons.length > 0 || Boolean(prerequisiteMessage)} on:click={requestRun}>
    {running && searchPending ? "Ricerca in corso…" : "Calcola le aggiunte minime"}
  </button>
{#if error}<AnalysisErrorMessage message={error} />{/if}
  {#if hasRun}
    {#if timeMs !== undefined}<small>Tempo di calcolo: {formatItalianNumber(timeMs, 1)} ms.</small>{/if}
    {#if excludedCandidateCount > 0}<small>{excludedCandidateCount} candidati esclusi perché fuori dalla proiezione/gruppo, irrilevanti per la sequenza o già osservati con lo stesso tipo e verso.</small>{/if}
    {#if proposals.length === 0}
      <p>Nessuna combinazione degli archi candidati autorizzati realizza la sequenza richiesta.</p>
      {#if whyNot}
        <div class="why-not" aria-label="Diagnosi dei prefissi del cammino tipizzato">
          {#if "temporalSemantics" in whyNot}
            <strong>Diagnosi temporale nel grafo massimo dichiarato</strong>
            <p>
              La verifica include tutti gli archi osservati e tutti i {whyNot.candidateEdgeIds.length} candidati eleggibili; vincolo temporale: {temporalSemanticsLabel(whyNot.temporalSemantics)}.
              {#if whyNot.goalReachableAsWalk}
                La meta è raggiungibile con un cammino temporale con ripetizioni, ma non con un cammino semplice: vengono rivisitati {whyNot.repeatedNodeIds.length} nodi.
              {:else if whyNot.firstBlockedStep !== undefined}
                Il prefisso massimo si ferma a {whyNot.maximumPrefixLength} passi; il passo {whyNot.firstBlockedStep} ({edgeTypeSequence[whyNot.firstBlockedStep - 1] ?? "tipo non disponibile"}) non è compatibile con gli intervalli e l'ordine temporale.
              {/if}
            </p>
            {#if whyNot.goalReachableAsWalk && whyNot.repeatedNodeIds.length > 0}
              <div class="path-sequence">
                <strong>Nodi rivisitati nel cammino · {whyNot.repeatedNodeIds.length}</strong>
                <ProgressiveList items={whyNot.repeatedNodeIds} resetKey={whyNot} label="nodi rivisitati" let:item>
                  <span>{nodeLabel(item)}</span>
                </ProgressiveList>
              </div>
            {/if}
            {#if whyNot.commonTimeValue !== undefined}<small>Istante comune: {whyNot.commonTimeValue}.</small>{/if}
            {#if whyNot.startTimeValuesByStep}
              <div class="path-sequence">
                <small>Inizi temporali per passo · {whyNot.startTimeValuesByStep.length}</small>
                <ProgressiveList items={whyNot.startTimeValuesByStep} resetKey={whyNot} label="inizi temporali" let:item let:index>
                  <span>{index + 1}. {item}</span>
                </ProgressiveList>
              </div>
            {/if}
            <details class="candidate-records">
              <summary>Candidati inclusi · {whyNot.candidateEdgeIds.length}</summary>
              <ProgressiveList items={whyNot.candidateEdgeIds} resetKey={whyNot} label="archi candidati" let:item>
                <code>{item}</code>
              </ProgressiveList>
            </details>
            <div class="proposal-heading">
              <span>Prefisso massimo raggiungibile · {whyNot.maximumPrefixLength} passi · {whyNot.walk.nodeIds.length} nodi</span>
              <button type="button" on:click={() => dispatch("highlight", whyNot.walk.nodeIds)}>Evidenzia</button>
            </div>
            <ProgressiveList items={whyNot.walk.nodeIds} resetKey={whyNot} label="nodi del prefisso" let:item let:index>
              <span>{index + 1}. {nodeLabel(item)}</span>
            </ProgressiveList>
          {:else}
            <strong>Diagnosi nel grafo massimo dichiarato</strong>
            <p>
              La verifica include tutti gli archi osservati e tutti i {whyNot.candidateEdgeIds.length} candidati eleggibili.
              {#if whyNot.firstEmptyStep !== undefined}
                Dopo il passo {whyNot.firstEmptyStep} ({edgeTypeSequence[whyNot.firstEmptyStep - 1] ?? "tipo non disponibile"}) non resta alcun nodo raggiungibile.
              {:else if whyNot.goalReachableAsWalk}
                La meta è raggiungibile rispettando i tipi con un cammino che ripete nodi, ma non esiste un cammino semplice: ogni sequenza completa deve rivisitare un nodo.
              {:else}
                La meta non è raggiungibile dopo la sequenza completa, anche se alcuni prefissi intermedi hanno nodi raggiungibili.
              {/if}
            </p>
            <details class="candidate-records">
              <summary>Candidati inclusi · {whyNot.candidateEdgeIds.length}</summary>
              <ProgressiveList items={whyNot.candidateEdgeIds} resetKey={whyNot} label="archi candidati" let:item>
                <code>{item}</code>
              </ProgressiveList>
            </details>
            <ol class="prefix-list">
              {#each whyNot.reachableByStep as layer}
                {@const visibleLayerNodeIds = layer.nodeIds.slice(0, visibleReachableLimits[layer.step] ?? counterfactualPageSize)}
                <li>
                  <div class="proposal-heading">
                    <span>Prefisso {layer.step}{layer.step > 0 ? `: ${edgeTypeSequence[layer.step - 1] ?? ""}` : ": nodo iniziale"}: {layer.nodeIds.length} nodi</span>
                    <button type="button" disabled={layer.nodeIds.length === 0} on:click={() => dispatch("highlight", layer.nodeIds)}>Evidenzia</button>
                  </div>
                  <span>{layer.nodeIds.length > 0 ? visibleLayerNodeIds.map(nodeLabel).join(", ") : "nessuno"}{layer.nodeIds.length > visibleLayerNodeIds.length ? ` · +${layer.nodeIds.length - visibleLayerNodeIds.length} altri nodi` : ""}</span>
                  <ResultListPager
                    total={layer.nodeIds.length}
                    visible={visibleLayerNodeIds.length}
                    pageSize={counterfactualPageSize}
                    label="nodi raggiungibili"
                    showMore={() => showMoreReachableNodes(layer.step)}
                  />
                </li>
              {/each}
            </ol>
          {/if}
          <button type="button" on:click={exportWhyNot}>Esporta diagnosi CSV</button>
        </div>
      {:else if whyNotError}
        <AnalysisErrorMessage message={whyNotError} />
      {/if}
    {:else}
      <ol class="proposal-list">
        {#each visibleProposals as proposal, index}
          {@const visibleAddedEdges = proposal.addedEdges.slice(0, visibleProposalEdgeLimits[index] ?? counterfactualPageSize)}
          <li>
            <div class="proposal-heading">
              <strong>Proposta {index + 1} · costo totale {proposal.totalCost}</strong>
              <button type="button" on:click={() => {
                dispatch("highlight", proposal.path.nodeIds);
                dispatch("highlightCounterfactual", {
                  proposal,
                  nodeIds: proposal.path.nodeIds,
                  title: "Cammino tipizzato controfattuale"
                });
              }}>Visualizza proposta in 2D</button>
            </div>
            <div class="path-sequence">
              <strong>Cammino · {proposal.path.nodeIds.length} nodi</strong>
              <ProgressiveList items={proposal.path.nodeIds} resetKey={proposal} label="nodi del cammino" let:item let:index>
                <span>{index + 1}. {nodeLabel(item)}</span>
              </ProgressiveList>
            </div>
            {#if "temporalSemantics" in proposal.path && proposal.path.temporalSemantics === "coValid"}
              <small>Primo istante comune: {proposal.path.commonTimeValue}</small>
            {:else if "temporalSemantics" in proposal.path && proposal.path.temporalSemantics === "orderedByStart"}
              <div class="path-sequence">
                <small>Inizi di validità per passo · {proposal.path.startTimeValuesByStep?.length ?? 0}{strictTemporalOrder ? " · ordine stretto" : " · ordine non stretto"}</small>
                {#if proposal.path.startTimeValuesByStep}
                  <ProgressiveList items={proposal.path.startTimeValuesByStep} resetKey={proposal} label="inizi temporali" let:item let:index>
                    <span>{index + 1}. {item}</span>
                  </ProgressiveList>
                {:else}
                  <span>Non disponibili</span>
                {/if}
              </div>
            {/if}
            <ul>
              {#each visibleAddedEdges as edge}
                <li><strong>{edge.id}</strong>: {nodeLabel(nodeIdForSourceId(edge.sourceNodeId))} → {nodeLabel(nodeIdForSourceId(edge.targetNodeId))} · {edge.edgeType} · costo {edge.cost}</li>
              {/each}
            </ul>
            <ResultListPager
              total={proposal.addedEdges.length}
              visible={visibleAddedEdges.length}
              pageSize={counterfactualPageSize}
              label="archi proposti"
              showMore={() => showMoreProposalEdges(index)}
            />
          </li>
        {/each}
        <ResultListPager
          total={proposals.length}
          visible={visibleProposals.length}
          pageSize={counterfactualPageSize}
          label="proposte minime"
          showMore={() => visibleProposalLimit += counterfactualPageSize}
        />
      </ol>
      <small>{enumerateAllOptima ? "Sono mostrate tutte le combinazioni ammissibili con costo minimo." : "È mostrata una combinazione minima; possono esistere altre combinazioni dello stesso costo."}</small>
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
  .path-sequence { display: grid; gap: 0.3rem; min-width: 0; }
  .candidate-records summary { width: fit-content; cursor: pointer; font-weight: 600; }
  .candidate-records code { overflow-wrap: anywhere; }
  .prefix-list { margin: 0; padding-left: 1.25rem; }
  .prefix-list > li { margin-top: 0.25rem; }
  .proposal-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; }
  .readiness-action { justify-self: start; color: #1e4d68; }
</style>
