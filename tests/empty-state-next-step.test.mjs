import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [solverPanel, contextualPanel, graphExportPanel, motifPanel, provenancePanel, graphApp, structuralCompletionPanel, typedPathCounterfactualPanel, structuralPanel, infoPanel] = await Promise.all([
  readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/ProvenanceScenarioAnalysisPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/TypedPathCounterfactualPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/InfoPanel.svelte", import.meta.url), "utf8")
]);

test("clique empty state distinguishes no results, stale group scope, and client-side filters", () => {
  assert.match(solverPanel, /cliqueAnalysisCompleted = Boolean\(completionLabel\) \|\| stats\?\.timeMs !== undefined/);
  assert.match(solverPanel, /grouped\.length === 0 && cliqueAnalysisCompleted/);
  assert.match(solverPanel, /Il gruppo selezionato è diverso da quello analizzato\. Ricalcola per aggiornare i risultati\./);
  assert.match(solverPanel, /La taglia minima o i filtri dei risultati escludono tutte le clique trovate\./);
  assert.match(solverPanel, /function resetResultFilters\(\)[\s\S]*?minSize = 1;[\s\S]*?showOnlyMaximum = false;[\s\S]*?filterBySelectedNode = false;/);
  assert.match(solverPanel, /Rimuovi i filtri dei risultati/);
});

test("empty contextual-clique outcome points to its configurable threshold and data mapping", () => {
  assert.match(contextualPanel, /Abbassa la cardinalità minima oppure rivedi in Dati i tipi di nodo e le relazioni/);
  assert.match(contextualPanel, /class="readiness-action" on:click=\{\(\) => dispatch\("openData"\)\}>Rivedi configurazione/);
});

test("an unconfigured motif analysis points to motif configuration in Data", () => {
  const emptyConfiguration = motifPanel.indexOf('{:else if ["typedMotif", "motifScenarioComparison", "motifCount", "motifNearMatch", "motifCounterfactual"]');
  const emptyMessage = motifPanel.indexOf("Nessun motivo tipizzato", emptyConfiguration);
  const openDataAction = motifPanel.indexOf(
    'on:click={() => dispatch("openData")}>Configura motivi in Dati</button>',
    emptyMessage
  );
  const contextualPanel = motifPanel.indexOf("{#if contextualCliqueConfig}", emptyConfiguration);

  assert.ok(emptyConfiguration >= 0 && emptyMessage > emptyConfiguration);
  assert.ok(openDataAction > emptyMessage && openDataAction < contextualPanel,
    "l'azione deve trovarsi nello stato senza motivi e prima delle analisi relazionali indipendenti");
  assert.match(motifPanel, /empty-motif-configuration" role="status"/);
  assert.match(motifPanel, /\(!activeAnalysisKind && !signedTriadsEnabled && !contextualCliqueConfig\)/,
    "lo stato non deve confondere la mancanza di motivi con triadi o clique contestuali disponibili");
});

test("oversized graph export explains a recovery step for each export scope", () => {
  assert.match(graphExportPanel, /Anteprima sospesa per la dimensione del risultato/);
  assert.match(graphExportPanel, /mode === "projection" && hasWitness/);
  assert.match(graphExportPanel, /Riduci i filtri in Vista oppure passa a «Solo risultato selezionato»/);
  assert.match(graphExportPanel, /Restringi il perimetro dell'analisi, ricalcola e riapri la finestra di esportazione/);
});

test("empty triad and scenario results point to their relevant graph configuration", () => {
  assert.match(motifPanel, /signedTriadHasRun && !signedTriadError && signedTriadResults\.length === 0/);
  assert.match(motifPanel, /controlla i filtri correnti e la mappatura di polarità e tipi di arco/);
  assert.match(motifPanel, /dispatch\("openData"\)\}>Rivedi Dati e mappatura/);
  assert.match(provenancePanel, /Se l'esito è inatteso, rivedi gli scenari, i gruppi candidati e i filtri applicati/);
  assert.match(provenancePanel, /dispatch\("openData"\)\}>Rivedi scenari e dati/);
  assert.match(motifPanel, /Nessuna assegnazione di ruoli realizza il motivo in alcuno degli scenari dichiarati\.<\/p>\s*<button type="button" class="readiness-action" on:click=\{\(\) => dispatch\("openData"\)\}>Rivedi motivo e scenari in Dati<\/button>/);
  assert.match(graphApp, /<ProvenanceScenarioAnalysisPanel[\s\S]*?on:openData=\{openDataPanel\}/);

  const triadComparisonEmpty = motifPanel.indexOf("{#if signedTriadScenarioComparison.memberships.length === 0}");
  const triadComparisonNonEmpty = motifPanel.indexOf("{:else}", triadComparisonEmpty);
  const triadRecovery = motifPanel.indexOf("Rivedi tipi, polarità e scenari in Dati", triadComparisonEmpty);
  assert.ok(triadComparisonEmpty >= 0 && triadRecovery > triadComparisonEmpty && triadRecovery < triadComparisonNonEmpty,
    "il confronto di triadi senza risultati deve offrire un'azione nello stesso stato vuoto");
  assert.match(motifPanel, /on:click=\{\(\) => dispatch\("openData"\)\}>Rivedi tipi, polarità e scenari in Dati<\/button>/);
  assert.match(graphApp, /on:openData=\{\(\) => \{\s*openDataPanel\(\);/);
});

test("an empty k-core points to the threshold and projection settings to review", () => {
  assert.ok(structuralPanel.includes('task === "kCore" ? "Il k-core è vuoto per questa soglia."'));
  const kCoreEmptyState = structuralPanel.indexOf('<small class="empty-next-step">Rivedi il valore di k, il gruppo e i filtri della proiezione, poi ricalcola.</small>');
  const kCoreEmptyBranch = structuralPanel.indexOf('{#if task === "kCore" && explainKCoreExclusions}');
  assert.ok(kCoreEmptyState >= 0 && kCoreEmptyState < kCoreEmptyBranch,
    "il passo successivo deve comparire nello stato vuoto del k-core, prima dei dettagli del certificato");
});

test("an empty dominating-set target domain points to its group mapping and filters", () => {
  const emptyWitnessBranch = structuralPanel.indexOf('{:else if resultSets[0].length === 0}');
  const nextStep = structuralPanel.indexOf(
    "Se ti aspettavi nodi da coprire, rivedi il gruppo obiettivo e i filtri in Vista, oppure controlla la mappatura dei gruppi in Dati.",
    emptyWitnessBranch
  );
  const openDataAction = structuralPanel.indexOf('on:click={() => dispatch("openData")}>Rivedi i gruppi in Dati</button>', nextStep);
  const kCoreBranch = structuralPanel.indexOf('{#if task === "kCore"}', emptyWitnessBranch);

  assert.ok(emptyWitnessBranch >= 0 && nextStep > emptyWitnessBranch && openDataAction > nextStep && openDataAction < kCoreBranch,
    "il rimedio deve apparire soltanto nell'esito vuoto del set dominante, prima del rimedio specifico per k-core");
});

test("an empty k-plex domain explains how to change candidates and review group mapping", () => {
  const emptyWitness = structuralPanel.indexOf("Nessun nodo è stato restituito nel testimone.");
  const domainNextStep = structuralPanel.indexOf("Il dominio candidato non contiene nodi.", emptyWitness);
  const groupNextStep = structuralPanel.indexOf(
    "Se ti aspettavi nodi, cambia il gruppo o rimuovi i filtri; se il gruppo atteso non compare, verifica la mappatura in Dati.",
    domainNextStep
  );
  const openDataAction = structuralPanel.indexOf(
    'on:click={() => dispatch("openData")}>Rivedi i gruppi in Dati</button>',
    groupNextStep
  );
  const kCoreBranch = structuralPanel.indexOf('{#if task === "kCore"}', emptyWitness);

  assert.ok(emptyWitness >= 0 && domainNextStep > emptyWitness && groupNextStep > domainNextStep);
  assert.ok(openDataAction > groupNextStep && openDataAction < kCoreBranch,
    "il passo successivo deve appartenere solo allo stato vuoto di k-plex e massimali");
});

test("an empty k-plex membership domain explains how to restore eligible nodes", () => {
  const membershipDomain = structuralPanel.indexOf("Nessun nodo appartiene al dominio candidato del gruppo corrente.");
  const nextStep = structuralPanel.indexOf("Se ti aspettavi nodi, rivedi il gruppo e i filtri, poi ricalcola il k-plex massimo.", membershipDomain);
  const membershipError = structuralPanel.indexOf("{#if kPlexMembershipDiagnosisError}", membershipDomain);

  assert.ok(membershipDomain >= 0 && nextStep > membershipDomain && membershipError > nextStep,
    "il suggerimento deve appartenere allo stato senza nodi candidati e precedere i messaggi d'errore della diagnosi");
});

test("an isolated node distinguishes the current projection from the source graph", () => {
  const emptyNeighbors = infoPanel.indexOf("Nessun vicino nella proiezione corrente.");
  const nextStep = infoPanel.indexOf("Se ti aspettavi collegamenti, amplia la proiezione o rivedi i filtri in Vista.");
  const neighborList = infoPanel.indexOf("{:else}", emptyNeighbors);
  assert.ok(emptyNeighbors >= 0 && nextStep > emptyNeighbors && neighborList > nextStep,
    "l'indicazione deve riguardare solo lo stato senza vicini, prima della lista ordinaria");
});

test("empty structural scenario comparisons point to the relevant candidate and threshold settings", () => {
  const kCoreEmpty = structuralPanel.indexOf('<p class="empty">Nessun nodo compare nel k-core di uno scenario.</p>');
  const kCoreNextStep = structuralPanel.indexOf("Se te lo aspettavi, riduci k o rivedi gruppo, filtri e finestra temporale, poi ripeti il confronto.");
  const kPlexEmpty = structuralPanel.indexOf('<p class="empty">Nessun nodo candidato negli scenari confrontati.</p>');
  const kPlexNextStep = structuralPanel.indexOf("Se ti aspettavi nodi confrontabili, allarga il gruppo candidato o rivedi filtri e soglia s, poi ripeti il confronto.");
  const dominatingEmpty = structuralPanel.indexOf('<p class="empty">Non ci sono nodi eleggibili come candidati in almeno uno scenario.</p>');
  const dominatingNextStep = structuralPanel.indexOf("Rivedi gruppo candidato, gruppo obiettivo e filtri degli scenari, poi ripeti il confronto.");

  assert.ok(kCoreEmpty >= 0 && kCoreNextStep > kCoreEmpty);
  assert.ok(kPlexEmpty >= 0 && kPlexNextStep > kPlexEmpty);
  assert.ok(dominatingEmpty >= 0 && dominatingNextStep > dominatingEmpty);
});

test("an empty scenario-component comparison names its local settings to review", () => {
  const componentEmpty = structuralPanel.indexOf("{#if provenanceComponentComparison.memberships.length === 0}");
  const componentNextStep = structuralPanel.indexOf(
    "Se ti aspettavi altri nodi, rivedi riferimento, gruppo candidato e filtri degli scenari, poi ripeti il confronto.",
    componentEmpty
  );
  const componentResults = structuralPanel.indexOf("{:else}", componentEmpty);

  assert.ok(componentEmpty >= 0 && componentNextStep > componentEmpty && componentResults > componentNextStep,
    "il suggerimento deve appartenere allo stato senza nodi candidati e non comparire con risultati presenti");
});

test("counterfactual results without a solution link directly to candidate configuration", () => {
  assert.match(structuralCompletionPanel, /\{#if proposals\.length === 0\}[\s\S]*?dispatch\("openData"\)\}>Rivedi archi candidati<\/button>/);
  assert.match(typedPathCounterfactualPanel, /\{#if proposals\.length === 0\}[\s\S]*?dispatch\("openData"\)\}>Rivedi archi candidati in Dati<\/button>/);
  assert.match(motifPanel, /counterfactualHasRun && counterfactuals\.length === 0[\s\S]*?dispatch\("openData"\)\}>Rivedi candidati e vincoli del motivo<\/button>/);
});

test("an unavailable k-plex membership counterfactual links to its candidate-edge configuration", () => {
  const notFoundStart = structuralPanel.indexOf('{:else if kPlexMembershipCounterfactual?.status === "not-found"}');
  const notFoundEnd = structuralPanel.indexOf("\n            {/if}", notFoundStart);
  const notFoundState = structuralPanel.slice(notFoundStart, notFoundEnd);

  assert.ok(notFoundStart >= 0 && notFoundEnd > notFoundStart);
  assert.match(notFoundState, /Il risultato vale per gli archi candidati e i costi configurati\./);
  assert.match(notFoundState, /dispatch\("openData"\)\}>Rivedi archi candidati in Dati<\/button>/);
});
