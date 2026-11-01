<script lang="ts">
  import { formatItalianNumber } from "../graph/formatItalianNumber.ts";
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";

  export let stats: WorkerWasmMemoryStats | null = null;
  export let clingoTiming: ClingoInvocationTiming | null = null;
  export let showClingoTiming: boolean = false;
  export let clingoStats: ClingoInvocationStats | null = null;
  export let showClingoStats: boolean = false;

  function formatBytes(bytes: number): string {
    return `${formatItalianNumber(bytes / (1024 * 1024), 2)} MiB`;
  }

  function formatMilliseconds(milliseconds: number): string {
    return `${formatItalianNumber(milliseconds, 2)} ms`;
  }

  function formatClingoTiming(timing: ClingoInvocationTiming): string {
    const measurements: string[] = [];
    if (timing.totalMs !== null) measurements.push(`totale ${formatMilliseconds(timing.totalMs)}`);
    if (timing.solveMs !== null) measurements.push(`ricerca ${formatMilliseconds(timing.solveMs)}`);
    if (timing.preSolveMs !== null) measurements.push(`preparazione ${formatMilliseconds(timing.preSolveMs)}`);
    return `Ultima esecuzione del motore: ${measurements.join("; ")}.`;
  }

  function formatClingoStats(statistics: ClingoInvocationStats): string {
    const measurements: string[] = [];
    if (statistics.groundAtoms !== null) measurements.push(`${statistics.groundAtoms} atomi dopo la preparazione`);
    if (statistics.groundRulesOriginal !== null && statistics.groundRulesFinal !== null) {
      measurements.push(`${statistics.groundRulesOriginal} regole prima della semplificazione, ${statistics.groundRulesFinal} dopo`);
    }
    if (statistics.solverVariables !== null) measurements.push(`${statistics.solverVariables} variabili di ricerca`);
    if (statistics.choices !== null) measurements.push(`${statistics.choices} scelte`);
    if (statistics.conflicts !== null) measurements.push(`${statistics.conflicts} conflitti`);
    return `Statistiche dell'ultima esecuzione del motore: ${measurements.join("; ")}.`;
  }

  $: hasClingoDiagnostics = (showClingoTiming && clingoTiming) || (showClingoStats && clingoStats);
</script>

{#if stats || hasClingoDiagnostics}
  <div
    class="worker-memory"
    role="note"
    aria-label={hasClingoDiagnostics ? "Diagnostica del motore di calcolo" : "Memoria del motore di calcolo"}
  >
    {#if stats}
      <span>Memoria WASM lineare del worker: {formatBytes(stats.peakBytes)} di picco dall'avvio, {formatBytes(stats.currentBytes)} attuali.</span>
      {#if !stats.peakReliable}<span>Il picco può essere incompleto in questo browser.</span>{/if}
      <small>Non include heap JavaScript, dati del grafo o DOM.</small>
    {/if}
    {#if showClingoTiming && clingoTiming}
      <span>{formatClingoTiming(clingoTiming)}</span>
      <small>Il tempo prima della ricerca è il totale meno la ricerca: comprende lettura, conversione e preparazione del programma. Vale per l'ultima esecuzione, non per l'intera analisi quando usa più query.</small>
    {/if}
    {#if showClingoStats && clingoStats}
      <span>{formatClingoStats(clingoStats)}</span>
      <small>Dimensioni del programma convertito e contatori del motore per l'ultima esecuzione. Se un'analisi usa più query, i valori non sono sommati.</small>
    {/if}
  </div>
{/if}

<style>
  .worker-memory {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    margin-top: 6px;
    color: var(--text-muted, #536171);
    font-size: 0.76rem;
    line-height: 1.35;
  }

  .worker-memory small {
    flex-basis: 100%;
  }
</style>
