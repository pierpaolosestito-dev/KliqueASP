import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [integrity, motif, structural, graphApp, jsonEditor, solverPanel, graph2DExportPanel, typedPathCounterfactual, structuralCompletionCounterfactual] = await Promise.all([
  readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/TypedPathCounterfactualPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url), "utf8")
]);

test("integrity actions reference the visible missing-prerequisite summaries", () => {
  assert.match(integrity, /id="integrity-check-readiness" class="requirements" role="status" aria-live="polite"/);
  assert.match(integrity, /aria-describedby=\{!requirementsAvailable \? "integrity-check-readiness" : undefined\} disabled=\{running \|\| !requirementsAvailable\}/);
  assert.match(integrity, /id="integrity-repair-readiness" class="requirements repair-requirements" role="status" aria-live="polite"/);
  assert.match(integrity, /aria-describedby=\{!repairRequirementsAvailable \? "integrity-repair-readiness" : undefined\} disabled=\{running \|\| repairRunning \|\| !repairRequirementsAvailable\}/);
});

test("motif actions reference their data or scenario readiness reasons", () => {
  assert.match(motif, /id="motif-analysis-readiness" class="readiness" role="status"/);
  assert.match(motif, /motifAnalysisActionDescriptionIds = \[[\s\S]*?running \? "analysis-in-progress-status" : ""[\s\S]*?!selectedRequirementsAvailable \? "motif-analysis-readiness"/);
  assert.match(motif, /on:click=\{run\} aria-describedby=\{motifAnalysisActionDescriptionIds\} disabled=/);
  assert.match(motif, /on:click=\{count\} aria-describedby=\{motifAnalysisActionDescriptionIds\} disabled=/);
  assert.match(motif, /id="motif-scenario-readiness" class="field-note scenario-readiness-note" role="status"/);
  assert.match(motif, /!scenarioComparisonAvailable \? "motif-scenario-readiness"/);
  assert.match(motif, /<button type="button" class="scenario-run"[\s\S]*?aria-describedby=\{motifScenarioDescriptionIds\}/);
  assert.match(motif, /!scenarioComparisonAvailable \? "motif-scenario-readiness"[\s\S]*?\.filter\(Boolean\)\.join\(" "\)/);
  assert.match(motif, /on:click=\{diagnose\} aria-describedby=\{motifAnalysisActionDescriptionIds\} disabled=/);
  assert.match(motif, /on:click=\{proposeCounterfactual\} aria-describedby=\{motifAnalysisActionDescriptionIds\} disabled=/);
  assert.match(motif, /id="signed-triad-readiness" class="readiness" role="status"/);
  assert.match(motif, /signedTriadActionDescriptionIds = \[[\s\S]*?running \? "analysis-in-progress-status" : ""[\s\S]*?!signedTriadRequirementsAvailable \? "signed-triad-readiness"/);
  assert.match(motif, /on:click=\{runSignedTriads\} aria-describedby=\{signedTriadActionDescriptionIds\}/);
  assert.match(motif, /id="signed-triad-scenario-readiness" class="field-note scenario-readiness-note" role="status" aria-live="polite"/);
  assert.match(motif, /aria-describedby=\{signedTriadScenarioDescriptionIds\}/);
  assert.match(motif, /!signedTriadScenarioComparisonAvailable \? "signed-triad-scenario-readiness"[\s\S]*?\.filter\(Boolean\)\.join\(" "\)/);
  assert.equal((motif.match(/disabledDescriptionId=\{running \? "analysis-in-progress-status" : undefined\}/g) ?? []).length, 3);
});

test("community pair actions reference the visible selection or stale-analysis blocker", () => {
  assert.match(structural, /\$:\s*communityPairAnalysisDescriptionIds\s*=\s*\[[\s\S]*?running \? "analysis-in-progress-status" : ""[\s\S]*?communityPairMembershipRunning \? "community-pair-membership-in-progress" : ""[\s\S]*?communityTopologyCounterfactualRunning \? "community-topology-counterfactual-in-progress" : ""[\s\S]*?\.filter\(Boolean\)\.join\(" "\) \|\| undefined/);
  assert.equal((structural.match(/disabledDescriptionId=\{communityPairAnalysisDescriptionIds\}/g) ?? []).length, 2);
  assert.match(structural, /aria-describedby=\{communityPairAnalysisDescriptionIds \|\| \(communityPairMembershipBlocker \? "community-pair-membership-blocker" : undefined\)\}/);
  assert.match(structural, /id="community-pair-membership-in-progress" class="scenario-status" role="status">Confronta le migliori partizioni/);
  assert.match(structural, /id="community-pair-membership-blocker" class="field-note" role="status" aria-live="polite">\{communityPairMembershipBlocker\}/);
  assert.match(structural, /aria-describedby=\{communityPairAnalysisDescriptionIds \|\| \(communityTopologyCounterfactualBlocker \? "community-topology-counterfactual-blocker" : undefined\)\}/);
  assert.match(structural, /aria-describedby=\{communityPairAnalysisDescriptionIds\} disabled=\{running \|\| communityPairAnalysisRunning\}/);
  assert.match(structural, /id="community-topology-counterfactual-blocker" class="field-note" role="status" aria-live="polite">\{communityTopologyCounterfactualBlocker\}/);
  assert.match(structural, /id="community-topology-counterfactual-in-progress" class="scenario-status" role="status">La ricerca valuta le modifiche/);
});

test("structural and typed-path counterfactual controls describe their running state", () => {
  assert.match(structuralCompletionCounterfactual, /running \? "analysis-in-progress-status" : ""/);
  assert.match(structuralCompletionCounterfactual, /disabledDescriptionId=\{running \? "analysis-in-progress-status" : undefined\}[\s\S]*?disabled=\{running\}/);
  assert.match(structuralCompletionCounterfactual, /aria-describedby=\{running \? "analysis-in-progress-status" : invalidTarget \? "structural-counterfactual-target-error" : undefined\}[\s\S]*?disabled=\{running\}/);
  assert.match(structuralCompletionCounterfactual, /aria-describedby=\{running \? "analysis-in-progress-status" : undefined\} disabled=\{running\}/);
  assert.match(typedPathCounterfactual, /running \? "analysis-in-progress-status" : ""/);
  assert.match(typedPathCounterfactual, /aria-describedby=\{running \? "typed-path-counterfactual-enumeration-help analysis-in-progress-status" : "typed-path-counterfactual-enumeration-help"\} disabled=\{running\}/);
  assert.match(typedPathCounterfactual, /aria-describedby=\{runBlockerDescriptionId\} disabled=\{running \|\| !enabled/);
});

test("structural secondary actions reference their task, option, and scenario blockers", () => {
  for (const handler of [
    "requestScenarioKCoreComparison",
    "requestScenarioKPlexComparison",
    "requestScenarioComponentComparison",
    "requestScenarioDominatingSetComparison"
  ]) {
    const escaped = handler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(structural, new RegExp(`on:click=\\{${escaped}\\}\\s+aria-describedby=\\{structuralScenarioComparisonDescriptionIds\\}`));
  }
  assert.match(structural, /id="component-scenario-reference-readiness"/);
  assert.match(structural, /id="kplex-scenario-optima-readiness"/);
  assert.match(structural, /id="dominating-set-scenario-optima-readiness"/);
  assert.match(structural, /id="weak-component-scenario-readiness"/);
  assert.match(structural, /id="strong-component-scenario-readiness"/);
  assert.match(structural, /structuralScenarioComparisonDescriptionIds = \[[\s\S]*?running \? "analysis-in-progress-status" : ""/);
  assert.match(structural, /structuralTaskSelectionDescriptionIds = \[[\s\S]*?weak-component-scenario-readiness[\s\S]*?strong-component-scenario-readiness/);
  assert.match(structural, /<select bind:value=\{task\} aria-describedby=\{structuralTaskSelectionDescriptionIds\}>/);
  assert.match(structural, /<fieldset class="task-controls" aria-describedby=\{running \? "analysis-in-progress-status" : undefined\} disabled=\{running\}/);
  assert.match(structural, /kPlexMembershipAnalysisDescriptionIds = \[[\s\S]*?kPlexMembershipDiagnosisRunning \? "kplex-membership-diagnosis-in-progress" : ""[\s\S]*?kPlexMembershipCounterfactualRunning \? "kplex-membership-counterfactual-in-progress" : ""/);
  assert.match(structural, /id="kplex-membership-diagnosis-in-progress" class="scenario-status" role="status"/);
  assert.match(structural, /id="kplex-membership-counterfactual-in-progress" class="scenario-status" role="status"/);
  assert.equal((structural.match(/disabledDescriptionId=\{kPlexMembershipAnalysisDescriptionIds\}/g) ?? []).length, 1);
  assert.equal((structural.match(/aria-describedby=\{kPlexMembershipAnalysisDescriptionIds \|\| \(kPlexMembershipBlocker \? "kplex-membership-prerequisite" : undefined\)\}/g) ?? []).length, 2);
  assert.match(structural, /id="kplex-membership-prerequisite" class="scenario-readiness-note" role="status" aria-live="polite">\{kPlexMembershipBlocker\}/);
});

test("scenario comparison help keeps the action clear and the detailed scope optional", () => {
  assert.match(structural, /Confronta i k-plex di cardinalità massima in ogni scenario, con gli stessi parametri\./);
  assert.match(structural, /Confronta gli insiemi dominanti minimi in tutti gli scenari, con gli stessi parametri\./);
  assert.equal((structural.match(/<details class="field-note scenario-comparison-details">\s*<summary>Dettagli del confronto<\/summary>/g) ?? []).length, 2);
  assert.match(structural, /Usa lo stesso k, gruppo, direzione, filtri, intervallo temporale e soglia di confidenza\. Il limite di calcolo è condiviso e il confronto può richiedere tempo\./);
  assert.match(structural, /Usa gli stessi gruppi candidati e obiettivo, filtri, intervallo temporale e soglia di confidenza\./);
  assert.match(structural, /Se uno scenario non ha una copertura o la ricerca non è completa, non mostra confronti parziali\./);
  assert.match(structural, /Un gruppo obiettivo vuoto ha copertura minima di taglia zero\./);
  assert.doesNotMatch(structural, /<details class="field-note scenario-comparison-details" open/);
  assert.match(structural, /\.scenario-comparison-details summary:focus-visible/);
});

test("the disabled clique menu action references visible data and engine readiness", () => {
  assert.match(graphApp, /aria-describedby=\{solverRunning \? "analysis-in-progress-status" : cliqueAnalysisMenuBlocker \? "clique-analysis-menu-blocker" : undefined\}/);
  assert.match(graphApp, /id="clique-analysis-menu-blocker" class="menu-requirement" role="status" aria-live="polite">\{cliqueAnalysisMenuBlocker\}/);
  assert.match(graphApp, /workerStatus: clingoWorkerStatus,[\s\S]*?dataAvailable: cliqueDataReadiness\.available,[\s\S]*?dataReasons: cliqueDataReadiness\.reasons/);
});

test("disabled analysis and result actions identify an active calculation", () => {
  assert.match(graphApp, /id="analysis-in-progress-status" class="visually-hidden-analysis-status" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(graphApp, /Calcolo in corso\. Le altre analisi saranno disponibili al termine\./);
  assert.match(graphApp, /aria-describedby=\{solverRunning \? "analysis-in-progress-status" : undefined\} disabled=\{solverRunning\} on:click=\{\(\) => openAnalysisPanel\("structural"\)\}/);
  assert.match(graphApp, /aria-describedby=\{solverRunning \? "analysis-in-progress-status" : undefined\} disabled=\{solverRunning\} on:click=\{\(\) => openAnalysisPanel\("motif"\)\}/);
  assert.match(graphApp, /Attendi il termine del calcolo prima di cancellare i risultati\./);
  assert.match(graphApp, /provenanceCliqueComparisonBlocker && provenanceScenarios\.length > 1\s*\? "provenance-clique-comparison-menu-blocker"\s*:\s*provenanceScenarios\.length < 2 \? "provenance-clique-comparison-menu-readiness"/);
  assert.match(graphApp, /id="provenance-clique-comparison-menu-blocker" class="menu-requirement"/);
  assert.match(graphApp, /id="provenance-clique-comparison-menu-readiness" class="menu-readiness"/);
  assert.equal((graphApp.match(/disabled=\{solverRunning\}\s+aria-describedby=\{solverRunning \? "analysis-in-progress-status" : undefined\}/g) ?? []).length, 8,
    "ricerche, filtri di tipo/gruppo/grado e reset dei tipi devono esporre il motivo del blocco durante il calcolo");
  assert.match(motif, /aria-describedby=\{running \? "analysis-in-progress-status" : undefined\} disabled=\{running\} on:click=\{\(\) => inspectScenarioMatch/);
  assert.match(motif, /class="inspect-signed-triad-scenario"\s+aria-describedby=\{running \? "analysis-in-progress-status" : undefined\}\s+disabled=\{running\}/);
  assert.match(solverPanel, /aria-describedby=\{running \|\| cliqueMembershipDiagnosisRunning \? "analysis-in-progress-status" : undefined\}\s+disabled=\{running \|\| cliqueMembershipDiagnosisRunning\}/);
  assert.match(solverPanel, /class="solver-rerun-action"\s+aria-describedby=\{running \? "analysis-in-progress-status" : undefined\}\s+disabled=\{running\}/);
  assert.match(solverPanel, /id="clique-analysis-group"[\s\S]*?disabledDescriptionId=\{running \? "analysis-in-progress-status" : undefined\}[\s\S]*?disabled=\{running\}/);
  assert.match(motif, /aria-describedby=\{motifCountNotice\.startsWith\("Annullamento"\) \? "motif-count-cancel-status" : undefined\}\s+disabled=\{motifCountNotice\.startsWith\("Annullamento"\)\}/);
});

test("disabled partition and empty-prefix actions explain their boundary state", () => {
  assert.match(graph2DExportPanel, /aria-describedby=\{!hasWitness \? "graph2d-witness-readiness" : undefined\}\s+disabled=\{!hasWitness\}/);
  assert.match(graph2DExportPanel, /<small id="graph2d-witness-readiness">\{hasWitness \? "Elementi evidenziati nell'analisi" : "Seleziona prima un risultato"\}<\/small>/);
  assert.match(graph2DExportPanel, /aria-label=\{selectedPartitionIndex <= 0 \? "Precedente: è già selezionata la prima partizione" : "Partizione ottima precedente"\} disabled=\{selectedPartitionIndex <= 0\}/);
  assert.match(graph2DExportPanel, /aria-label=\{selectedPartitionIndex >= communityPartitions\.length - 1 \? "Successiva: è già selezionata l'ultima partizione" : "Partizione ottima successiva"\} disabled=\{selectedPartitionIndex >= communityPartitions\.length - 1\}/);
  assert.match(typedPathCounterfactual, /aria-describedby=\{layer\.nodeIds\.length === 0 \? `typed-path-prefix-nodes-\$\{layer\.step\}` : undefined\} disabled=\{layer\.nodeIds\.length === 0\}/);
  assert.match(typedPathCounterfactual, /id=\{`typed-path-prefix-nodes-\$\{layer\.step\}`\}[\s\S]*?"Nessun nodo raggiungibile in questo prefisso\."/);
});

test("disabled mapping and k-plex export actions identify their missing prerequisites", () => {
  assert.match(jsonEditor, /aria-describedby=\{nodeAttributeAddBlocker \? "mapping-node-add-blocker" : undefined\}[^\n]*disabled=\{Boolean\(nodeAttributeAddBlocker\)\}/);
  assert.match(jsonEditor, /id="mapping-node-add-blocker" class="field-note" role="status" aria-live="polite">\{nodeAttributeAddBlocker\}/);
  assert.match(jsonEditor, /aria-describedby=\{edgeAttributeAddBlocker \? "mapping-edge-add-blocker" : undefined\}[^\n]*disabled=\{Boolean\(edgeAttributeAddBlocker\)\}/);
  assert.match(jsonEditor, /id="mapping-edge-add-blocker" class="field-note" role="status" aria-live="polite">\{edgeAttributeAddBlocker\}/);
  assert.match(structural, /id="kplex-maximality-export-blocker" class="field-note scenario-readiness-note" role="status"/);
  assert.match(structural, /aria-describedby=\{task === "maximalKPlex" && !selectedKplexMaximality \? "kplex-maximality-export-blocker" : undefined\} disabled=\{task === "maximalKPlex" && !selectedKplexMaximality\}/);
  assert.match(structural, /id="typed-path-add-step-blocker" class="field-note scenario-readiness-note" role="status" aria-live="polite">\{typedPathStepAdditionBlocker\}/);
});
