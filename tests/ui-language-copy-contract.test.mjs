import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const structuralPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
const jsonEditor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");
const scenarioPanel = await readFile(new URL("../src/lib/kliqueasp/components/ProvenanceScenarioAnalysisPanel.svelte", import.meta.url), "utf8");
const motifPanel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");
const infoPanel = await readFile(new URL("../src/lib/kliqueasp/components/InfoPanel.svelte", import.meta.url), "utf8");
const contextualPanel = await readFile(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8");
const solverPanel = await readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8");
const integrityPanel = await readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8");
const structuralCompletionPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url), "utf8");
const typedPathCounterfactualPanel = await readFile(new URL("../src/lib/kliqueasp/components/TypedPathCounterfactualPanel.svelte", import.meta.url), "utf8");
const workerMemoryReadout = await readFile(new URL("../src/lib/kliqueasp/components/WorkerMemoryReadout.svelte", import.meta.url), "utf8");
const counterfactualConfigHint = await readFile(new URL("../src/lib/kliqueasp/components/CounterfactualConfigHint.svelte", import.meta.url), "utf8");
const structuralGraphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const sandboxPage = await readFile(new URL("../src/routes/Sandbox/+page.svelte", import.meta.url), "utf8");
const homePage = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
const graph2DExportPanel = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");
const analysisErrorMessage = await readFile(new URL("../src/lib/kliqueasp/components/AnalysisErrorMessage.svelte", import.meta.url), "utf8");
const analysisErrorPanels = await Promise.all([
  readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/ProvenanceScenarioAnalysisPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/TypedPathCounterfactualPanel.svelte", import.meta.url), "utf8")
]);

test("the home page metadata uses the same Italian graph-analysis language as the interface", () => {
  assert.match(homePage, /name="description"\s+content="Esplora la struttura dei tuoi grafi, analizza le relazioni e porta con te i risultati\."/);
  assert.doesNotMatch(homePage, /interactive graph reasoning environment/i);
});

test("k-core number export uses a concise Italian label", () => {
  assert.match(structuralPanel, /Esporta numeri di core \(CSV\)/);
  assert.doesNotMatch(structuralPanel, /Esporta core number CSV/i);
});

test("2D export controls and graph-scope messages consistently use Italian wording", () => {
  assert.match(graph2DExportPanel, /aria-label="Chiudi esportazione 2D" title="Chiudi esportazione 2D"/);
  assert.match(graph2DExportPanel, /aria-label="Opzioni di esportazione 2D"/);
  assert.match(infoPanel, /L'analisi e le esportazioni restano riferite all'intero grafo filtrato/);
  assert.match(structuralGraphApp, /Analisi ed esportazioni usano l'intera proiezione filtrata/);
});

test("community topology counterfactual uses concise Italian graph-analysis language", () => {
  const titleStart = structuralPanel.indexOf('aria-labelledby="community-topology-counterfactual-title"');
  const titleEnd = structuralPanel.indexOf("</section>", titleStart);
  assert.ok(titleStart >= 0 && titleEnd > titleStart, "community topology section should remain present");
  const topologySection = structuralPanel.slice(titleStart, titleEnd);

  assert.match(topologySection, /Modifiche topologiche ipotetiche per la coppia/);
  assert.match(topologySection, /Cerca modifiche a costo minimo/);
  assert.match(topologySection, /Valori esatti della modularità/);
  assert.match(topologySection, /non ammissibile/);
  assert.doesNotMatch(topologySection, /edge edit|Cerca il costo minimo con ASP|Clingo cerca gli edit|infeasible/i);
});

test("community topology no-candidate errors use Italian instead of implementation terminology", () => {
  assert.match(structuralGraphApp, /structuralCommunityTopologyCounterfactualError = "Nessuna modifica di arco configurata è applicabile al gruppo e alla proiezione visibile correnti\."/);
  assert.doesNotMatch(structuralGraphApp, /"[^"\n]*edge edit/i);
});

test("community-constraint diagnosis summarizes its cost and non-mutating scope concisely", () => {
  assert.match(structuralPanel, /<p>Elenca le sospensioni di costo totale minimo per categoria \(peso predefinito 1\)\. Non modifica i dati e non stabilisce quali vincoli siano errati\.<\/p>/);
  assert.doesNotMatch(structuralPanel, /Ogni elemento elencato è una regola che si potrebbe sospendere/);
});

test("the 2D export affordance reflects whether an analysis result is available", () => {
  assert.match(structuralGraphApp, /class="toolbar-button export-action desktop-toolbar-control" class:result-ready=\{analysisResultsAvailable\}/);
  assert.match(structuralGraphApp, /class="export-action" class:result-ready=\{analysisResultsAvailable\}/);
  assert.match(structuralGraphApp, /Esporta il grafo 2D con il risultato corrente/);
  assert.match(structuralGraphApp, /Esporta la proiezione corrente del grafo in 2D/);
  assert.doesNotMatch(structuralGraphApp, /Modifiche da esportare|Modifiche non salvate|Progetto modificato/);
});

test("2D selected-result export labels its subset consistently in the dialog and SVG", () => {
  assert.match(graph2DExportPanel, /\$: exportScopeLabel = mode === "witness" \? "Sottoinsieme evidenziato" : scopeLabel \|\| "Grafo corrente";/);
  assert.match(graph2DExportPanel, /scopeLabel: exportScopeLabel/);
  assert.match(graph2DExportPanel, /<p class="scope">\{exportScopeLabel\}<\/p>/);
});

test("motif and graph-image controls describe results without ASP implementation terms", () => {
  const motifMarkup = motifPanel.slice(motifPanel.indexOf("</script>") + "</script>".length).split("<style>")[0];
  const graph2DMarkup = graph2DExportPanel.slice(graph2DExportPanel.indexOf("</script>") + "</script>".length).split("<style>")[0];

  assert.match(motifMarkup, /\n\s*Motivo\s*\n\s*<SearchableNodeSelect\s+id="motif-analysis-template"\s+bind:value=\{selectedTemplateIndex\}/);
  assert.match(motifMarkup, /ariaLabel="Cerca un motivo configurato"/);
  assert.match(motifMarkup, /istanza del motivo/);
  assert.match(motifMarkup, /Motivi e gruppi disponibili dipendono dalla configurazione/);
  assert.doesNotMatch(motifMarkup, />\s*Template\s*</);
  assert.doesNotMatch(motifMarkup, /\btestimone\b|\btestimoni\b/i);
  assert.doesNotMatch(motifMarkup, /·\s*witness:/i);

  assert.match(graph2DMarkup, /<strong>Solo risultato selezionato<\/strong>/);
  assert.match(graph2DExportPanel, /"Risultato selezionato"/);
  assert.doesNotMatch(graph2DMarkup, /\btestimone\b|\btestimoni\b/i);
});

test("technical disclosures keep predicate identifiers and use Italian field labels", () => {
  assert.match(motifPanel, /dati di ingresso: \{signedTriadContract\.inputPredicates\.join/);
  assert.match(solverPanel, /<strong>Dati di ingresso:<\/strong> \{cliqueMembershipQueryContract\.inputPredicates\.join/);
  assert.match(structuralPanel, /Predicati ASP di ingresso:/);
  assert.match(structuralPanel, /<strong>Dati di ingresso:<\/strong> \{supportingQuery\.inputPredicates\.join/);
  assert.match(structuralPanel, /ID scenario: \{provenanceDominatingSetScenarioWhyNot\.scenarioId\}/);
  assert.doesNotMatch(motifPanel + solverPanel + structuralPanel, /Scenario ID:|<strong>Input:<\/strong>|input: \{signedTriadContract/);
});

test("a new typed path step asks for its edge type before allowing execution", () => {
  assert.match(structuralPanel, /if \(task === "typedPath" && pathEdgeTypeSequence\.length === 0\) \{\s*pathEdgeTypeSequence = \[""\];\s*\}/);
  assert.match(structuralPanel, /pathEdgeTypeSequence = \[\.\.\.pathEdgeTypeSequence, ""\]/);
  assert.match(structuralPanel, /pathEdgeTypeSequence\.some\(\(edgeType\) => !availableEdgeTypes\.includes\(edgeType\)\)/);
  assert.match(structuralPanel, /\$: availableEdgeTypeSearchOptions = availableEdgeTypes\.map\(\(edgeType\) => \(\{ value: edgeType, label: edgeType \}\)\)/);
  assert.match(structuralPanel, /id=\{`typed-path-edge-type-\$\{index\}`\}[\s\S]*?options=\{availableEdgeTypeSearchOptions\}[\s\S]*?ariaLabel=\{`Cerca il tipo d'arco per il passo \$\{index \+ 1\}`\}[\s\S]*?on:change=\{\(event\) => updatePathTypeStep\(index, event\.detail\.value\)\}/);
  assert.match(structuralPanel, /function updatePathTypeStep\(index: number, value: string\)/);
  assert.match(structuralPanel, /function removePathTypeStep\(index: number\) \{\s*if \(pathEdgeTypeSequence\.length <= 1\) return;/);
  assert.match(structuralPanel, /\{#if pathEdgeTypeSequence\.length > 1\}/);
  const runButtonStart = structuralPanel.indexOf('class="run"');
  const runButtonEnd = structuralPanel.indexOf(">", runButtonStart);
  assert.ok(runButtonStart >= 0 && runButtonEnd > runButtonStart);
  assert.match(structuralPanel.slice(runButtonStart, runButtonEnd), /invalidTypedPath/);
});

test("edge mapping placeholders use the same Italian terms as their visible field labels", () => {
  assert.match(jsonEditor, /<label>Origine arco\s*<SearchableFieldSelect id="mapping-edge-source"[\s\S]*?emptyOptionLabel="Campo origine"/);
  assert.match(jsonEditor, /<label>Destinazione arco\s*<SearchableFieldSelect id="mapping-edge-target"[\s\S]*?emptyOptionLabel="Campo destinazione"/);
  assert.doesNotMatch(jsonEditor, /Campo (?:source|target)/);
});

test("scenario clique comparison presents presence and stability without ASP jargon", () => {
  assert.match(scenarioPanel, /Presenza dei nodi nelle clique massime/);
  assert.match(scenarioPanel, /presenti in tutte le clique massime di ogni scenario/);
  assert.match(scenarioPanel, /presenti in almeno una clique massima ma non in tutte/);
  assert.match(scenarioPanel, /non presenti in tutte le clique massime/);
  assert.match(scenarioPanel, /soluzioni a pari merito/);
  assert.match(scenarioPanel, /assume che gli scenari configurati coprano tutti i casi da considerare/);
  assert.match(scenarioPanel, /Come interpretare la presenza dei nodi/);
  assert.match(scenarioPanel, /\.semantics summary:focus-visible/);
  assert.doesNotMatch(scenarioPanel, /mondi plausibili/);
  assert.doesNotMatch(scenarioPanel, /Membership brave e cautious nei mondi|Cautious:|Not brave:|Answer set ottimi complessivi|proiezioni ASP/i);
});

test("2D scenario summaries use the same graph terms as their analysis panels", () => {
  assert.match(structuralGraphApp, /istanze in almeno uno scenario/);
  assert.match(structuralGraphApp, /Confronto completo · \$\{motifScenarioComparison\.scenarios\.length\} scenari/);
  assert.match(structuralGraphApp, /triadi classificate in almeno uno scenario/);
  assert.match(structuralGraphApp, /nodi con presenza valutata/);
  assert.doesNotMatch(structuralGraphApp, /istanze in almeno un mondo|triadi classificate in almeno un mondo|nodi con membership valutata/);
});

test("motif and triad comparisons describe scenario presence and graph evidence", () => {
  assert.match(motifPanel, /Confronta istanze tra scenari/);
  assert.match(motifPanel, /presenti in tutti gli scenari/);
  assert.match(motifPanel, /Presente in alcuni scenari/);
  assert.match(motifPanel, /passaggi completati/);
  assert.match(motifPanel, /Regole di classificazione/);
  assert.doesNotMatch(motifPanel, /Record ASP del primo arco|partizioni ASP complete|Brave e cautious|Brave-only|Gruppo ASP:|Solver in esecuzione/);
});

test("visible motif diagnostics and structural exports use Italian names", () => {
  assert.match(motifPanel, /configurazione più vicina/);
  assert.match(motifPanel, /Corrispondenze temporali più vicine/);
  assert.match(motifPanel, /Corrispondenze strutturali più vicine/);
  assert.doesNotMatch(motifPanel, /Diagnostica why-not temporale|Diagnostica why-not strutturale/);
  assert.match(structuralPanel, /Esporta diagnosi del cammino tipizzato CSV/);
  assert.match(structuralPanel, /Diagnosi della copertura nello scenario/);
  assert.doesNotMatch(structuralPanel, /Esporta certificato why-not|Esporta why-not dello scenario/);
});

test("temporal motif diagnostics describe required relations without English pattern jargon", () => {
  const motifMarkup = motifPanel.slice(motifPanel.indexOf("</script>") + "</script>".length).split("<style>")[0];
  assert.match(motifMarkup, /temporalmente attive più relazioni richieste/);
  assert.match(motifMarkup, /relazioni senza intervalli validi/);
  assert.match(motifMarkup, /rende attive contemporaneamente più relazioni/);
  assert.match(motifMarkup, /Ordine invertito tra relazioni/);
  assert.doesNotMatch(motifMarkup, /(?<![A-Za-z])patterns?(?![A-Za-z])/i);
});

test("temporal path diagnostics and optional engine details use Italian graph-analysis terms", () => {
  assert.match(structuralPanel, /cammino temporale con ripetizioni di lunghezza massima/);
  assert.match(structuralPanel, /Gli inizi di validità dei record scelti sono non decrescenti lungo il percorso; gli intervalli possono sovrapporsi\./);
  assert.doesNotMatch(structuralPanel, /Gli intervalli non devono sovrapporsi/);
  assert.doesNotMatch(structuralPanel, /massimo temporal walk/);
  assert.match(workerMemoryReadout, /tempo prima della ricerca è il totale meno la ricerca/);
  assert.match(workerMemoryReadout, /programma convertito e contatori del motore/);
  assert.doesNotMatch(workerMemoryReadout, /pre-solving|grounding|solver per l'ultima invocazione/i);
});

test("graph context panels avoid exposing implementation jargon in primary copy", () => {
  assert.match(infoPanel, /L'analisi e le esportazioni restano riferite all'intero grafo filtrato/);
  assert.doesNotMatch(infoPanel, /Proiezione ASP/);
  assert.match(contextualPanel, /Configura i tipi di nodi focali/);
  assert.doesNotMatch(contextualPanel, /graphAnalysis\.contextualClique|Solver in esecuzione/);
  assert.match(solverPanel, /Esclusione dalla clique massima verificata/);
  assert.doesNotMatch(solverPanel, /Esclusione dalla clique massima verificata da ASP|La query ASP ha trovato/);
});

test("clique membership diagnosis reflects the solver's running state", () => {
  assert.match(solverPanel, /export let running:\s*boolean = false/);
  const diagnosisClick = solverPanel.indexOf('on:click={() => dispatch("diagnoseMaximumMembership"');
  assert.ok(diagnosisClick >= 0, "the clique membership diagnosis action should remain present");
  const buttonStart = solverPanel.lastIndexOf("<button", diagnosisClick);
  const buttonEnd = solverPanel.indexOf("</button>", diagnosisClick);
  assert.ok(buttonStart >= 0 && buttonEnd > diagnosisClick, "the diagnosis action should be a complete button");
  assert.match(solverPanel.slice(buttonStart, buttonEnd), /disabled={running \|\| cliqueMembershipDiagnosisRunning}/);

  const solverPanelStart = structuralGraphApp.indexOf("<SolverPanel");
  const solverPanelEnd = structuralGraphApp.indexOf("<ProvenanceScenarioAnalysisPanel", solverPanelStart);
  assert.ok(solverPanelStart >= 0 && solverPanelEnd > solverPanelStart);
  assert.match(structuralGraphApp.slice(solverPanelStart, solverPanelEnd), /running={solverRunning}/);
});

test("scenario witness inspection is disabled while another analysis is running", () => {
  for (const handler of ["inspectScenarioMatch", "inspectSignedTriadScenarioWitness"]) {
    const click = motifPanel.indexOf(`on:click={() => ${handler}(`);
    assert.ok(click >= 0, `${handler} action should remain present`);
    const buttonStart = motifPanel.lastIndexOf("<button", click);
    const openingEnd = motifPanel.indexOf(">", click);
    assert.ok(buttonStart >= 0 && openingEnd > click, `${handler} should be attached to a button`);
    assert.match(motifPanel.slice(buttonStart, openingEnd), /disabled={running}/,
      `${handler} should be disabled while a calculation is running`);
  }

  const motifPanelStart = structuralGraphApp.indexOf("<MotifAnalysisPanel");
  const motifPanelEnd = structuralGraphApp.indexOf("/>", motifPanelStart);
  assert.ok(motifPanelStart >= 0 && motifPanelEnd > motifPanelStart);
  assert.match(structuralGraphApp.slice(motifPanelStart, motifPanelEnd), /running={solverRunning}/);
});

test("structural and toolbar copy explains comparisons without solver terminology", () => {
  assert.match(structuralPanel, /presenti in tutti i k-core/);
  assert.match(structuralPanel, /Nodi nei k-plex massimi/);
  assert.match(structuralPanel, /Stessa componente in almeno uno scenario/);
  assert.match(structuralPanel, /Verifica la relazione della coppia/);
  assert.doesNotMatch(structuralPanel, /cautious: presente in ogni mondo|membership cautious:|answer set:|Verifica ASP della membership|Clingo confronta gli ottimi/);
  assert.match(structuralPanel, /Tutti i k-plex massimali \(può richiedere molto tempo\)/);
  assert.match(structuralPanel, /Presenza nei k-plex massimi:/);
  assert.doesNotMatch(structuralPanel, /Tutti i modelli massimali|Membership:|Sono enumerate tutte|Sono enumerati tutti|ottimi enumerati/);
  assert.match(structuralPanel, /Ogni k-plex soddisfa il vincolo/);
  assert.match(structuralPanel, /Calcolo in corso/);
  assert.doesNotMatch(structuralPanel, /Enumerazione<\/span>|Solver in esecuzione|Ogni modello soddisfa il k-plex/);
  assert.match(structuralGraphApp, /Analisi ed esportazioni usano l'intera proiezione filtrata/);
  assert.match(structuralGraphApp, /Confronta le clique di cardinalità massima di ogni scenario; mostra solo confronti completi\./);
  assert.match(structuralGraphApp, /<details class="clique-comparison-details">\s*<summary>Dettagli del confronto<\/summary>/);
  assert.match(structuralGraphApp, /Usa la stessa finestra temporale, gli stessi filtri e la soglia di confidenza\. Il limite di calcolo è condiviso; se il tempo scade, il confronto si interrompe senza mostrare risultati parziali\./);
  assert.match(structuralGraphApp, /\.clique-comparison-details summary:focus-visible/);
  assert.doesNotMatch(structuralGraphApp, /ASP, risultati ed export|Confronto brave\/cautious|Confronta tutti gli scenari dichiarati con ASP/);
  assert.match(structuralGraphApp, /Per confrontare gli scenari, dichiarali come insieme finito ed esaustivo/);
  assert.match(structuralGraphApp, /Per confrontare le triadi, dichiara gli scenari come insieme finito ed esaustivo/);
  assert.doesNotMatch(structuralGraphApp, /Il confronto brave\/cautious richiede worldAssumption|Il confronto richiede worldAssumption/);
});

test("structural completion counterfactuals stay secondary until requested", () => {
  const disclosureStart = structuralCompletionPanel.indexOf('<details class="kplex-counterfactual"');
  const summaryEnd = structuralCompletionPanel.indexOf("</summary>", disclosureStart);
  assert.ok(disclosureStart >= 0 && summaryEnd > disclosureStart,
    "the structural completion action should have a concise disclosure summary");
  const summary = structuralCompletionPanel.slice(disclosureStart, summaryEnd);
  assert.match(summary, /open={hasRun \|\| Boolean\(error\)}/,
    "completed results and errors should open their evidence automatically");
  assert.match(summary, /Richiede archi candidati/);
  assert.match(summary, /candidat/);
  assert.match(structuralCompletionPanel, /<div class="counterfactual-content">[\s\S]*<CounterfactualConfigHint/,
    "the expanded disclosure should retain the direct path to configure candidates");
});

test("community pair scoring keeps exact solver values optional and in Italian", () => {
  const titleStart = structuralPanel.indexOf('aria-labelledby="community-pair-membership-title"');
  const titleEnd = structuralPanel.indexOf("</section>", titleStart);
  assert.ok(titleStart >= 0 && titleEnd > titleStart, "pair stability section should remain present");
  const pairSection = structuralPanel.slice(titleStart, titleEnd);

  assert.match(pairSection, /<summary>Dettagli dei punteggi<\/summary>/);
  assert.match(pairSection, /Imposta la coppia nella stessa comunità/);
  assert.match(pairSection, /Imposta la coppia in comunità separate/);
  assert.match(pairSection, /nessuna partizione ammissibile/);
  assert.doesNotMatch(pairSection, /Must-link|Cannot-link|infeasible/i);

  assert.match(structuralPanel, /l'appartenenza viene verificata sull'elenco completo/);
  assert.match(structuralCompletionPanel, /Turno \{step\.round\}/);
  assert.match(structuralCompletionPanel, /label="turni del peeling"/);
  assert.doesNotMatch(structuralCompletionPanel, /Round \{step\.round\}|round del peeling| al round /);
});

test("clique, k-plex, k-core, and typed-path explanations use Italian graph terms", () => {
  assert.match(structuralPanel, /Vincoli di coppia configurati \(insieme o separate\)/);
  assert.match(structuralPanel, /Evidenzia il testimone/);
  assert.match(structuralPanel, /In ogni turno simultaneo/);
  assert.match(structuralPanel, /cammino temporale con ripetizioni/);
  assert.match(structuralPanel, /Insieme obbligatorio.*Separazione obbligatoria/);
  assert.doesNotMatch(structuralPanel, /Atomi del witness ASP|Membership non classificata|Evidenzia witness|must-link\/cannot-link|eleggibilità e membership|membership condizionale|round sincrono|Round \{step\.round\}/i);

  assert.match(solverPanel, /<strong>Testimone:<\/strong>/);
  assert.doesNotMatch(solverPanel, /<strong>Witness:<\/strong>|Evidenzia witness 3D/);
  assert.match(structuralCompletionPanel, /Evidenzia i turni che eliminano il nodo obiettivo/);
  assert.match(structuralCompletionPanel, /Testimone di appartenenza al k-core/);
  assert.doesNotMatch(structuralCompletionPanel, /Evidenzia i round|Witness che certifica/i);
});

test("dynamic community-pair progress labels and missing node types use Italian", () => {
  assert.match(structuralGraphApp, /function getCommunityPairConstraintLabel\(kind: "together" \| "separate"\): string \{\s*return kind === "together" \? "vincolo di co-appartenenza" : "vincolo di separazione";/);
  assert.match(structuralGraphApp, /ottimo con il \$\{getCommunityPairConstraintLabel\(kind\)\}/);
  assert.doesNotMatch(structuralGraphApp, /must-link|cannot-link/i);
  assert.match(structuralGraphApp, /tipo: node\.type \?\? "non specificato"/);
  assert.doesNotMatch(structuralGraphApp, /tipo: node\.type \?\? "unknown"/i);
});

test("typed-path counterfactual explains repeated-node routes without English walk labels", () => {
  assert.match(typedPathCounterfactualPanel, /Diagnosi temporale nel grafo massimo dichiarato/);
  assert.match(typedPathCounterfactualPanel, /La meta è raggiungibile solo ripetendo nodi; non esiste un cammino semplice/);
  assert.match(typedPathCounterfactualPanel, /La sequenza completa non raggiunge la meta, ma alcuni prefissi intermedi sono possibili/);
  assert.match(typedPathCounterfactualPanel, /Prefisso massimo raggiungibile · \{whyNot\.maximumPrefixLength\} passi · \{whyNot\.walk\.nodeIds\.length\} nodi/);
  assert.match(typedPathCounterfactualPanel, /temporalSemanticsLabel\(whyNot\.temporalSemantics\)/);
  assert.doesNotMatch(typedPathCounterfactualPanel, /(?:come walk|walk temporale|walk completa|Walk massima|ogni walk)/i);
  assert.match(structuralPanel, /maximumPrefixLength\} \{typedPathNoRouteCertificate\.maximumPrefixLength === 1 \? "passo" : "passi"\}/);
});

test("k-plex summaries describe missing ties with correct singular and plural forms", () => {
  assert.match(structuralPanel, /describeKPlexMissingTieAllowance\(Number\(parameter\)\)/);
  assert.match(structuralPanel, /describeNonAdjacencyScope\(\)/);
  assert.match(structuralPanel, /countForm\(Math\.max\(0, Number\(parameter\) - 1\), "coppia", "coppie"\)/);
  assert.doesNotMatch(structuralPanel, /non più di \{Math\.max\(0, Number\(parameter\) - 1\)\} membri/);
  assert.doesNotMatch(structuralPanel, /parameter\) - 1\)\} coppie/);
});

test("separator summaries distinguish solution count from the selected witness size", () => {
  assert.match(structuralPanel, /task === "minimumCostNodeSeparator" \? "soluzione a costo minimo" : "soluzione minima"/);
  assert.match(structuralPanel, /countForm\(resultSize, "nodo rimosso nel testimone", "nodi rimossi nel testimone"\)/);
  assert.match(structuralPanel, /task === "minimumCostEdgeSeparator" \? "soluzione a costo minimo" : "soluzione minima"/);
  assert.match(structuralPanel, /countForm\(resultSize, "arco rimosso nel testimone", "archi rimossi nel testimone"\)/);
  assert.doesNotMatch(structuralPanel, /countForm\(resultSets\.length, "separatore minimo"|countForm\(resultSets\.length, "taglio minimo"/);
});

test("analysis errors use a concise message with optional technical details", () => {
  assert.match(analysisErrorMessage, /Dettagli tecnici/);
  assert.match(analysisErrorMessage, /<details>/);
  assert.match(analysisErrorMessage, /role="alert"/);
  for (const panel of analysisErrorPanels) {
    assert.match(panel, /AnalysisErrorMessage/, "analysis error panel should use the shared presentation");
  }
  assert.match(typedPathCounterfactualPanel, /\{:else if whyNotError\}\s*<AnalysisErrorMessage message=\{whyNotError\} \/>/);
});

test("the clique solver fallback error is Italian before shared error presentation", () => {
  assert.match(structuralGraphApp, /solverError = result\.Error \|\| "Errore del worker clingo\."/);
  assert.match(structuralGraphApp, /Error: e\.message \|\| "Errore del worker clingo\."/);
  assert.doesNotMatch(structuralGraphApp, /"Clingo worker error"/i);
  assert.doesNotMatch(structuralGraphApp, /"Clingo error"/i);
});

test("invalid configuration and dataset JSON use Italian summaries with optional parser details", () => {
  assert.match(sandboxPage, /parseGraphJsonTexts\(configText, datasetText\)/);
  assert.match(sandboxPage, /errorMessage = error\.message/);
  assert.match(sandboxPage, /errorTechnicalDetails = error\.technicalDetails/);
  assert.doesNotMatch(sandboxPage, /errorMessage = error\?\.message \?\? "Invalid JSON"/);
  assert.match(jsonEditor, /<div id="graph-apply-error" class="error-box" role="alert">[\s\S]*?<summary>Dettagli tecnici<\/summary>[\s\S]*?<pre>\{errorTechnicalDetails\}<\/pre>/);
});

test("the empty graph next step uses concise Italian data and mapping labels", () => {
  assert.match(structuralGraphApp, /Carica i dati del grafo da un file JSON o apri un progetto; controlla i campi riconosciuti e applica la rete/);
  assert.match(structuralGraphApp, /La mappatura rapida riconosce gli ID e gli estremi pi\u00f9 comuni/);
  assert.match(jsonEditor, /<label for="graph-dataset">Dati del grafo \(JSON\)<\/label>/);
});

test("weighted edge cuts explain cost mapping with visible field names", () => {
  assert.match(structuralPanel, /Minimizza la somma dei costi di rimozione degli archi/);
  assert.match(structuralPanel, /In Dati, apri Mappatura avanzata e associa "Costo rimozione arco" a un campo con un intero positivo per ogni arco/);
  assert.doesNotMatch(structuralPanel, /graphMapping\.edge\.removalCostField/);
});

test("integrity repair configuration paths stay optional and the primary guidance stays in Italian", () => {
  const repairStart = integrityPanel.indexOf("<strong>Proposta minima non configurata</strong>");
  const repairEnd = integrityPanel.indexOf("</div>", repairStart);
  assert.ok(repairStart >= 0 && repairEnd > repairStart);
  const repairHint = integrityPanel.slice(repairStart, repairEnd);
  assert.match(repairHint, /aggiungi le azioni candidate nell'editor JSON avanzato/);
  assert.match(repairHint, /<details>[\s\S]*?<summary>Percorso del campo nella configurazione JSON<\/summary>[\s\S]*?<code>graphIntegrity\.repairSuggestions<\/code>/);
  assert.doesNotMatch(repairHint.slice(0, repairHint.indexOf("<details>")), /graphIntegrity\.repairSuggestions/);
});

test("counterfactual results explain their status without solver jargon", () => {
  assert.match(structuralCompletionPanel, /non è possibile ottenere un k-plex di valore \{whyNot\.targetS\}/);
  assert.match(structuralCompletionPanel, /non è possibile ottenere un k-core con soglia \{kCoreWhyNot\.targetK\}/);
  assert.match(structuralPanel, /Nodi obiettivo non coperti nello scenario/);
  assert.match(structuralPanel, /Copertura dell'obiettivo selezionato/);
  assert.match(structuralPanel, /targetLabel="Soglia k"/);
  assert.match(structuralPanel, /targetLabel="Valore richiesto t"/);
  assert.doesNotMatch(structuralPanel, /Questi target|gruppo target|Copertura del target selezionato/);
  assert.doesNotMatch(structuralCompletionPanel, /certificato ASP/i);
  assert.match(typedPathCounterfactualPanel, /Tempo di calcolo:/);
  assert.match(typedPathCounterfactualPanel, /tutte le combinazioni ammissibili con costo minimo/);
  assert.doesNotMatch(typedPathCounterfactualPanel, /Solver:|enumerate dal solver/i);
  assert.match(structuralCompletionPanel, /Saranno mostrate tutte le proposte con costo minimo/);
  assert.doesNotMatch(structuralCompletionPanel, /saranno enumerati/i);
  assert.match(contextualPanel, /Mostra tutti i gruppi massimi/);
  assert.match(contextualPanel, /gruppi massimi elencati/);
  assert.doesNotMatch(contextualPanel, /gruppi massimi enumerati/i);
});

test("structural counterfactual parsing failures use concise Italian messages", () => {
  assert.match(structuralGraphApp, /structuralKPlexCounterfactualError = "Il risultato non è interpretabile e non è stato mostrato\."/);
  assert.match(structuralGraphApp, /structuralKCoreCounterfactualError = "Il risultato non è interpretabile e non è stato mostrato\."/);
  assert.match(structuralGraphApp, /structuralKCoreMembershipCounterfactualError = "Non è stato possibile verificare tutte le modifiche a costo minimo per includere il nodo selezionato nel k-core; i risultati parziali non vengono mostrati\."/);
  assert.match(structuralGraphApp, /structuralKCoreMembershipCounterfactualError = "La proposta non è stata verificata e non è stata mostrata\."/);
});

test("integrity implementation metadata stays behind an optional technical disclosure", () => {
  assert.match(integrityPanel, /<details class="asp-contract">\s*<summary>Dettagli tecnici della verifica<\/summary>/);
  assert.match(integrityPanel, /integrityDiagnosisContract\.aspEncoding/);
});

test("counterfactual configuration guidance stays readable and keeps the JSON path optional", () => {
  assert.match(counterfactualConfigHint, /<summary>Percorso del campo nella configurazione JSON<\/summary>/);
  assert.match(counterfactualConfigHint, /graphAnalysis\.counterfactuals\.edgeAdditions/);
  for (const panel of [structuralCompletionPanel, typedPathCounterfactualPanel, motifPanel, structuralPanel]) {
    assert.match(panel, /<CounterfactualConfigHint/);
    assert.doesNotMatch(panel, /graphAnalysis\.counterfactuals\.edgeAdditions/);
  }
  assert.match(structuralPanel, /stessa cardinalità massima del risultato complessivo/);
});

test("the 3D graph navigation hint is localized", () => {
  assert.match(structuralGraphApp, /scene-nav-info/);
  assert.match(structuralGraphApp, /Trascina per ruotare · Usa Vista per lo zoom/);
  assert.doesNotMatch(structuralGraphApp, /Rotella o clic centrale per zoomare|Tasto destro per spostare/);
});

test("the configured typeface is inherited by the graph workspace and analysis panels", () => {
  assert.match(structuralGraphApp, /\.app-root \{[\s\S]*?font-family: var\(--body-font, Arial, Helvetica, sans-serif\)/);
});

test("the node card uses Italian labels for its built-in graph fields", () => {
  assert.match(infoPanel, /<strong>Grado:<\/strong>/);
  assert.match(infoPanel, /active_from: "Attivo dal"/);
  assert.match(infoPanel, /active_to: "Attivo fino al"/);
  assert.doesNotMatch(infoPanel, /<strong>Degree:<\/strong>/);
});
test("typed-motif evidence copy uses grammatical Italian for its mapping description", () => {
  assert.match(motifPanel, /Tipi e intervalli seguono la mappatura e lo schema del motivo/);
  assert.doesNotMatch(motifPanel, /Tipi e intervalli seguono il mappatura/);
});
