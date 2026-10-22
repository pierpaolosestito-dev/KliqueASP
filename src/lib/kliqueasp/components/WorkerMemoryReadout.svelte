<script lang="ts">
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";

  export let stats: WorkerWasmMemoryStats | null = null;
  export let clingoTiming: ClingoInvocationTiming | null = null;
  export let showClingoTiming: boolean = false;
  export let clingoStats: ClingoInvocationStats | null = null;
  export let showClingoStats: boolean = false;

  function formatBytes(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  }

  function formatMilliseconds(milliseconds: number): string {
    return `${milliseconds.toFixed(2)} ms`;
  }

  function formatClingoTiming(timing: ClingoInvocationTiming): string {
    const measurements: string[] = [];
    if (timing.totalMs !== null) measurements.push(`totale ${formatMilliseconds(timing.totalMs)}`);
    if (timing.solveMs !== null) measurements.push(`solving ${formatMilliseconds(timing.solveMs)}`);
    if (timing.preSolveMs !== null) measurements.push(`pre-solving ${formatMilliseconds(timing.preSolveMs)}`);
    return `Ultima invocazione clingo: ${measurements.join("; ")}.`;
  }

  function formatClingoStats(statistics: ClingoInvocationStats): string {
    const measurements: string[] = [];
    if (statistics.groundAtoms !== null) measurements.push(`${statistics.groundAtoms} atomi ground`);
    if (statistics.groundRulesOriginal !== null && statistics.groundRulesFinal !== null) {
      measurements.push(`${statistics.groundRulesOriginal} regole ground, ${statistics.groundRulesFinal} dopo semplificazione`);
    }
    if (statistics.solverVariables !== null) measurements.push(`${statistics.solverVariables} variabili solver`);
    if (statistics.choices !== null) measurements.push(`${statistics.choices} scelte`);
    if (statistics.conflicts !== null) measurements.push(`${statistics.conflicts} conflitti`);
    return `Statistiche dell'ultima invocazione clingo: ${measurements.join("; ")}.`;
  }

  $: hasClingoDiagnostics = (showClingoTiming && clingoTiming) || (showClingoStats && clingoStats);
</script>

{#if stats || hasClingoDiagnostics}
  <div
    class="worker-memory"
    role="note"
    aria-label={hasClingoDiagnostics ? "Diagnostica clingo" : "Memoria lineare del worker clingo"}
  >
    {#if stats}
      <span>Memoria WASM lineare del worker: {formatBytes(stats.peakBytes)} di picco dall'avvio, {formatBytes(stats.currentBytes)} attuali.</span>
      {#if !stats.peakReliable}<span>Il picco può essere incompleto in questo browser.</span>{/if}
      <small>Non include heap JavaScript, dati del grafo o DOM.</small>
    {/if}
    {#if showClingoTiming && clingoTiming}
      <span>{formatClingoTiming(clingoTiming)}</span>
      <small>Il pre-solving è totale meno solving: comprende lettura del programma, grounding e setup, non misura il solo grounding. Riguarda l'ultima invocazione, non l'intera analisi se usa più query.</small>
    {/if}
    {#if showClingoStats && clingoStats}
      <span>{formatClingoStats(clingoStats)}</span>
      <small>Dimensioni del programma ground e contatori del solver per l'ultima invocazione; le analisi con più query non sono aggregate.</small>
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
    opacity: 0.85;
  }
</style>
