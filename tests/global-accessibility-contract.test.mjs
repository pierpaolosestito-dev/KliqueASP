import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const layout = await readFile(new URL("../src/routes/+layout.svelte", import.meta.url), "utf8");
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const graph2DExportPanel = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");
const workerMemoryReadout = await readFile(new URL("../src/lib/kliqueasp/components/WorkerMemoryReadout.svelte", import.meta.url), "utf8");
const solverPanel = await readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8");
const solverDiagnostics = await readFile(new URL("../src/lib/kliqueasp/components/SolverDiagnosticsDetails.svelte", import.meta.url), "utf8");
const structuralPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
const structuralCompletionPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url), "utf8");
const typedPathCounterfactualPanel = await readFile(new URL("../src/lib/kliqueasp/components/TypedPathCounterfactualPanel.svelte", import.meta.url), "utf8");
const motifPanel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");
const integrityPanel = await readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8");
const contextualPanel = await readFile(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8");

function hexRgb(hex) {
  const value = hex.replace(/^#/, "");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

function composite(foreground, background, opacity) {
  return foreground.map((value, index) => value * opacity + background[index] * (1 - opacity));
}

function relativeLuminance(rgb) {
  const [red, green, blue] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test("the shared layout gives every common keyboard control a visible focus indicator", () => {
  for (const selector of [
    "button:focus-visible",
    "a:focus-visible",
    "input:focus-visible",
    "select:focus-visible",
    "textarea:focus-visible",
    "summary:focus-visible",
    "[tabindex]:focus-visible"
  ]) {
    assert.ok(layout.includes(selector), `manca l'indicatore di focus per ${selector}`);
  }
  assert.match(layout, /outline:\s*3px solid #0c4a6e/);
  assert.match(layout, /box-shadow:\s*0 0 0 1px #fff/);
});

test("the active export dialog keeps a visible focus indicator", () => {
  assert.match(layout, /dialog\[open\]:focus/);
  assert.match(layout, /outline-offset:\s*3px/);
});

test("the 2D export dialog restores focus to its opener when it is still available", () => {
  assert.match(graph2DExportPanel, /let dialogTrigger: HTMLElement \| null = null/);
  assert.match(graph2DExportPanel, /if \(open && !wasOpen\) \{\s*const activeElement = document\.activeElement;\s*dialogTrigger = activeElement instanceof HTMLElement && activeElement !== document\.body/);
  assert.match(graph2DExportPanel, /function closeDialog\(\) \{\s*const trigger = dialogTrigger;\s*onClose\(\);\s*setTimeout\(\(\) => \{\s*if \(trigger\?\.isConnected\) trigger\.focus\(\);\s*else document\.querySelector<HTMLElement>\("\.export-action"\)\?\.focus\(\);/);
});

test("analysis menu controls include accessible naming markup for their visible labels", () => {
  const start = graphApp.indexOf('<details class="toolbar-menu" bind:this={analysisMenuElement}>');
  const end = graphApp.indexOf('    {#if clingoWorkerStatus === "error"}', start);
  assert.ok(start >= 0 && end > start, "menu Analisi della toolbar non trovato");
  const menu = graphApp.slice(start, end);
  const controls = [...menu.matchAll(/<(?:button|summary)\b[^>]*>/g)].map(([tag]) => tag);
  assert.ok(controls.length > 0, "il menu Analisi non contiene controlli");
  for (const control of controls) {
    assert.match(control, /aria-(?:label|labelledby)=/, `nome accessibile mancante: ${control}`);
  }
  assert.match(menu, /aria-labelledby="analysis-menu-label"[\s\S]*?<span id="analysis-menu-label">Analisi<\/span>/);
  assert.match(menu, /aria-labelledby="analysis-clique-label"[\s\S]*?<span id="analysis-clique-label">\{solverRunning \?/);
  for (const label of ["Analisi", "Clique massima", "Calcolo in corso…", "Riavvia analisi", "k-plex, k-core e struttura…", "Motivi, triadi e gruppi contestuali…", "Verifica e riparazione…", "Requisiti mancanti", "Requisiti per la riparazione", "Confronta clique massime", "Confronto in corso…", "Apri Dati e mapping", "Apri Dati e configurazione scenari", "Configura scenari"]) {
    assert.ok(menu.includes(label), `etichetta visibile mancante: ${label}`);
  }
});

test("scenario menu starts the clique comparison and explains blocking requirements", () => {
  assert.match(graphApp, /provenanceCliqueComparisonBlocker = provenanceScenarios\.length < 2/);
  assert.match(graphApp, /disabled=\{solverRunning \|\| provenanceCliqueComparisonBlocker !== ""\}\s*class:running=\{solverRunning && lastGraph2DAnalysisKind === "provenanceClique"\}\s*on:click=\{runProvenanceScenarioCliqueComparison\}/);
  assert.match(graphApp, /Dichiara almeno due scenari per confrontare le clique massime/);
  assert.match(graphApp, /Il confronto delle clique richiede un grafo non orientato/);
  assert.match(graphApp, /Confronto in corso…\" : \"Confronta clique massime/);
});

test("closed toolbar menus are removed from keyboard access and open menus stay above the graph", () => {
  assert.match(graphApp, /\.toolbar-menu:not\(\[open\]\) > \.menu-content\s*\{\s*display:\s*none;/);
  assert.match(graphApp, /\.toolbar:has\(\.toolbar-menu\[open\]\)\s*\{\s*z-index:\s*80;/);
});

test("view menu actions use visible labels and name the icon-only zoom buttons", () => {
  const start = graphApp.indexOf('<details class="toolbar-menu" bind:this={viewMenuElement}>');
  const end = graphApp.indexOf("  </details>", start);
  assert.ok(start >= 0 && end > start, "menu Vista della toolbar non trovato");
  const menu = graphApp.slice(start, end);
  const controls = [...menu.matchAll(/<(?:button|summary)\b[^>]*>/g)].map(([tag]) => tag);
  assert.ok(controls.length > 0, "il menu Vista non contiene controlli");
  assert.doesNotMatch(menu, /aria-label="(?:Vista|Nascondi etichette|Mostra etichette|Adatta alla rete|Rimuovi evidenziazione|Reimposta filtri e vista)"/);
  assert.match(menu, /aria-label="Riduci zoom"/);
  assert.match(menu, /aria-label="Aumenta zoom"/);
  for (const label of ["Vista", "Nascondi etichette", "Mostra etichette", "Adatta alla rete", "Rimuovi evidenziazione", "Reimposta filtri e vista"]) {
    assert.ok(menu.includes(label), `etichetta visibile mancante: ${label}`);
  }
  assert.ok(controls.length >= 7, "mancano controlli del menu Vista");
});

test("node-label visibility remains user-controllable when a graph config omits the capability", () => {
  assert.match(graphApp, /features:\s*\{\s*filters:\s*true,\s*timeline:\s*false,\s*labelVisibilityToggle:\s*true/);
  assert.match(graphApp, /const labelVisibilityToggleEnabled = GRAPH_CONFIG\.features\?\.labelVisibilityToggle === true/);
});

test("the shared layout respects the reduced-motion preference", () => {
  assert.match(layout, /prefers-reduced-motion:\s*reduce/);
  assert.match(layout, /scroll-behavior:\s*auto\s*!important/);
  assert.match(layout, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(layout, /transition-duration:\s*0\.01ms\s*!important/);
});

test("graph navigation hints and status text meet AA contrast on their surfaces", () => {
  const navigationRule = graphApp.match(/:global\(\.app-root \.scene-container \.scene-nav-info\)\s*\{([^}]+)\}/);
  assert.ok(navigationRule, "manca la regola di contrasto per le istruzioni di navigazione 3D");
  const navigationColor = navigationRule[1].match(/color:\s*(#[0-9a-f]{6})/i)?.[1];
  const navigationOpacity = Number(navigationRule[1].match(/opacity:\s*([0-9.]+)/)?.[1]);
  const navigationBackground = navigationRule[1].match(/background:\s*rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)/i);
  assert.ok(navigationColor, "manca il colore leggibile delle istruzioni 3D");
  assert.equal(navigationOpacity, 1, "le istruzioni 3D non devono essere sbiadite");
  assert.ok(navigationBackground, "le istruzioni 3D devono avere uno sfondo indipendente dal grafo");
  assert.match(navigationRule[1], /width:\s*fit-content/);
  assert.match(navigationRule[1], /max-width:\s*calc\(100vw\s*-\s*24px\)/);
  assert.match(graphApp, /graphNavigationInfo\.textContent\s*=\s*"Trascina per ruotare · Usa Vista per lo zoom"/);
  assert.match(graphApp, /:global\(\.app-root \.scene-container \.scene-nav-info\)\s*\{[^}]*left:\s*0;[^}]*right:\s*0;[^}]*margin:\s*0 auto;/s);
  const mobileNavigationRule = graphApp.match(/@media \(max-width:\s*600px\)\s*\{\s*:global\(\.app-root \.scene-container \.scene-nav-info\)\s*\{([^}]+)\}/);
  assert.ok(mobileNavigationRule, "le istruzioni devono restare nella zona libera della toolbar mobile");
  assert.match(mobileNavigationRule[1], /top:\s*calc\(var\(--toolbar-top\)\s*\+\s*var\(--toolbar-height,\s*48px\)\s*\+\s*40px\)/);
  assert.match(mobileNavigationRule[1], /bottom:\s*auto/);
  const pillColor = navigationBackground.slice(1, 4).map(Number);
  const pillOpacity = Number(navigationBackground[4]);
  for (const canvasColor of ["#020617", "#ffffff"]) {
    const pillBackground = composite(pillColor, hexRgb(canvasColor), pillOpacity);
    assert.ok(contrastRatio(hexRgb(navigationColor), pillBackground) >= 4.5);
  }

  const statusRule = graphApp.match(/\.graph-status-bar\s*\{([^}]+)\}/);
  assert.ok(statusRule, "manca la regola della barra di stato del grafo");
  const statusColor = statusRule[1].match(/color:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(statusColor, "manca il colore della barra di stato del grafo");
  const statusBackground = composite(hexRgb("#ffffff"), hexRgb("#020617"), 0.88);
  assert.ok(contrastRatio(hexRgb(statusColor), statusBackground) >= 4.5);
});

test("worker memory notes retain AA contrast when shown in analysis details", () => {
  const rule = workerMemoryReadout.match(/\.worker-memory\s*\{([^}]+)\}/)?.[1];
  const smallRule = workerMemoryReadout.match(/\.worker-memory small\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule, "manca lo stile dei dettagli memoria");
  assert.ok(smallRule, "manca lo stile delle note memoria");
  const mutedColor = rule.match(/color:\s*var\(--text-muted,\s*(#[0-9a-f]{6})\)/i)?.[1];
  assert.ok(mutedColor, "manca il colore di testo secondario usato dalla nota");
  assert.doesNotMatch(smallRule, /opacity:/, "le note non devono perdere contrasto per opacità");
  assert.ok(contrastRatio(hexRgb(mutedColor), hexRgb("#ffffff")) >= 4.5);
});

test("clique filters and actions use the shared panel control styling", () => {
  assert.match(solverPanel, /<label class="solver-filter-field">\s*Gruppo/);
  assert.match(solverPanel, /<label class="solver-filter-field">\s*Taglia minima/);
  assert.match(solverPanel, /<label class="solver-toggle">\s*<input type="checkbox"/);
  assert.match(solverPanel, /class="solver-export-action"/);
  assert.match(solverPanel, /<SearchableNodeSelect[\s\S]*?id="clique-analysis-group"/);
  assert.match(solverPanel, /\.solver-controls input\[type="number"\]\s*\{[^}]*min-height:\s*32px;[^}]*border:\s*1px solid #cbd5e1;[^}]*background:\s*#fff;/);
  assert.match(solverPanel, /\.solver-filter-field :global\(\.searchable-node-select\)\s*\{[^}]*min-width:\s*132px;[^}]*margin-left:\s*auto;/);
  assert.match(solverPanel, /\.solver-toggle input\[type="checkbox"\]\s*\{[^}]*accent-color:\s*#1e645d;/);
  assert.match(solverPanel, /\.clique-item\[aria-pressed="true"\]\s*\{[^}]*outline:\s*2px solid #1e645d;/);
  assert.ok(contrastRatio(hexRgb("#334155"), hexRgb("#ffffff")) >= 4.5);
});

test("expanded calculation details explain when a reopened result has no diagnostics", () => {
  assert.match(solverDiagnostics, /workerWasmMemoryStats \|\| \(showClingoTiming && clingoTiming\) \|\| \(showClingoStats && clingoStats\)/);
  assert.match(solverDiagnostics, /Dettagli tecnici non disponibili per questo risultato\./);
  assert.match(solverDiagnostics, /\.diagnostics-unavailable\s*\{[^}]*color:\s*#475569;[^}]*line-height:\s*1\.4;/);
  assert.ok(contrastRatio(hexRgb("#475569"), hexRgb("#f8fafc")) >= 4.5);
});

test("structural filters use readable fields and distinguish the primary run action", () => {
  assert.match(structuralPanel, /input:not\(\[type="checkbox"\]\),\s*select\s*\{[^}]*min-height:\s*34px;/);
  assert.match(structuralPanel, /input,\s*select\s*\{[^}]*box-sizing:\s*border-box;/);
  assert.match(structuralPanel, /input,\s*select\s*\{[^}]*border:\s*1px solid #cbd5e1;[^}]*border-radius:\s*8px;[^}]*background:\s*#fff;/);
  assert.match(structuralPanel, /input\[type="checkbox"\]\s*\{[^}]*accent-color:\s*#1e645d;/);
  assert.match(structuralPanel, /\.run\s*\{[^}]*background:\s*#1e645d;[^}]*color:\s*#fff;/);
  assert.match(structuralPanel, /\.run:hover:not\(:disabled\)/);
  assert.ok(contrastRatio(hexRgb("#ffffff"), hexRgb("#1e645d")) >= 4.5);
});

test("community count labels keep a readable width beside their inputs", () => {
  assert.match(structuralPanel, /<label class="community-count-field">\s*Numero minimo di comunità/);
  assert.match(structuralPanel, /<label class="community-count-field">\s*Numero massimo di comunità/);
  assert.match(structuralPanel, /\.community-count-field\s*\{\s*grid-template-columns:\s*minmax\(120px,\s*132px\)\s+1fr;/);
});

test("primary actions in structural, motif, integrity, and contextual analysis share AA styling", () => {
  for (const [name, source] of [
    ["strutturale", structuralPanel],
    ["motivi e triadi", motifPanel],
    ["integrità", integrityPanel],
    ["gruppo contestuale", contextualPanel]
  ]) {
    const rule = source.match(/\.run\s*\{([^}]+)\}/)?.[1];
    assert.ok(rule, `manca lo stile dell'azione principale nel pannello ${name}`);
    assert.match(rule, /background:\s*#1e645d;/);
    assert.match(rule, /color:\s*#fff;/);
    assert.match(source, /\.run:hover:not\(:disabled\)/);
  }
  assert.ok(contrastRatio(hexRgb("#ffffff"), hexRgb("#1e645d")) >= 4.5);
});

test("scenario comparison has a clear primary action and visible running state", () => {
  const rule = graphApp.match(/\.provenance-analysis-run\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule, "manca lo stile primario del confronto tra scenari");
  assert.match(rule, /min-height:\s*36px/);
  assert.match(rule, /background:\s*#1e645d/);
  assert.match(rule, /color:\s*#fff/);
  assert.match(graphApp, /\.provenance-analysis-run:hover:not\(:disabled\)/);
  assert.match(graphApp, /solverRunning && lastGraph2DAnalysisKind === "provenanceClique" \? "Confronto in corso…" : "Confronta clique massime"/);
  assert.match(graphApp, /class:running=\{solverRunning && lastGraph2DAnalysisKind === "provenanceClique"\}/);
  assert.ok(contrastRatio(hexRgb("#ffffff"), hexRgb("#1e645d")) >= 4.5);
});

test("scenario comparisons stay secondary and name the active comparison", () => {
  assert.equal((structuralPanel.match(/class:running=\{pendingScenarioComparison ===/g) ?? []).length, 4);
  assert.equal((motifPanel.match(/class:running=\{pendingScenarioComparison ===/g) ?? []).length, 2);
  for (const source of [structuralPanel, motifPanel]) {
    assert.match(source, /pendingScenarioComparison:.*\| null/);
    assert.match(source, /!running && pendingScenarioComparison !== null/);
    assert.match(source, /"Confronto in corso…"/);
    assert.match(source, /\.scenario-run\s*\{[^}]*background:\s*#fff;[^}]*color:\s*#174d47;/);
    assert.match(source, /\.scenario-run:hover:not\(:disabled\)/);
  }
});

test("counterfactual search actions announce their running state", () => {
  assert.match(structuralCompletionPanel, /running && searchPending \? "Ricerca in corso…" : "Calcola completamento minimo"/);
  assert.match(typedPathCounterfactualPanel, /running && searchPending \? "Ricerca in corso…" : "Calcola le aggiunte minime"/);
  for (const source of [structuralCompletionPanel, typedPathCounterfactualPanel]) {
    assert.match(source, /disabled=\{running \|\|/);
    assert.match(source, /searchPending = true/);
    assert.match(source, /!running && searchPending/);
  }
  assert.match(motifPanel, /running && activeAnalysisKind === "motifCount" \? "Conteggio in corso…"/);
  assert.match(motifPanel, /running && activeAnalysisKind === "typedMotif" \? "Ricerca in corso…"/);
  assert.match(motifPanel, /running && activeAnalysisKind === "motifNearMatch" \? "Ricerca in corso…"/);
  assert.match(motifPanel, /running && activeAnalysisKind === "motifCounterfactual" \? "Ricerca in corso…"/);
  assert.match(motifPanel, /running && activeAnalysisKind === "signedTriads" \? "Classificazione in corso…"/);
});

test("structural panel children keep their height inside the scrollable panel", () => {
  assert.match(structuralPanel, /\.structural-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*max-height:\s*var\(--solver-max-height\);[^}]*overflow:\s*auto;/);
  assert.match(structuralPanel, /\.structural-panel\s*>\s*\*\s*\{\s*flex-shrink:\s*0;/);
});

test("the 3D graph responds to reduced motion without changing default camera timing", () => {
  assert.match(graphApp, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(graphApp, /addEventListener\("change", motionPreferenceChangeHandler\)/);
  assert.match(graphApp, /removeEventListener\("change", motionPreferenceChangeHandler\)/);
  assert.match(graphApp, /\.warmupTicks\(motionSettings\.warmupTicks\)/);
  assert.match(graphApp, /\.cooldownTicks\(motionSettings\.cooldownTicks\)/);

  const cameraCalls = graphApp.match(/\.cameraPosition\([\s\S]*?\);/g) ?? [];
  const fitCalls = graphApp.match(/\.zoomToFit\([^;]*\);/g) ?? [];
  assert.ok(cameraCalls.length > 0);
  assert.ok(fitCalls.length > 0);
  assert.ok(cameraCalls.every((call) => call.includes("graphTransitionDuration(")));
  assert.ok(fitCalls.every((call) => call.includes("graphTransitionDuration(")));
});
