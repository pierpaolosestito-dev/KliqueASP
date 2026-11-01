<script lang="ts">
  import WorkerMemoryReadout from "./WorkerMemoryReadout.svelte";
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";

  export let workerWasmMemoryStats: WorkerWasmMemoryStats | null = null;
  export let clingoTiming: ClingoInvocationTiming | null = null;
  export let showClingoTiming = false;
  export let clingoStats: ClingoInvocationStats | null = null;
  export let showClingoStats = false;
</script>

<details class="solver-diagnostics">
  <summary>Dettagli del calcolo</summary>
  <div class="solver-diagnostics-content">
    {#if workerWasmMemoryStats || (showClingoTiming && clingoTiming) || (showClingoStats && clingoStats)}
      <WorkerMemoryReadout
        stats={workerWasmMemoryStats}
        {clingoTiming}
        {showClingoTiming}
        {clingoStats}
        {showClingoStats}
      />
    {:else}
      <small class="diagnostics-unavailable">Dettagli tecnici non disponibili per questo risultato.</small>
    {/if}
  </div>
</details>

<style>
  .solver-diagnostics {
    margin: 8px 0;
    padding: 7px 9px;
    border: 1px solid #dbe3ec;
    border-radius: 8px;
    background: #f8fafc;
    color: #526173;
    font-size: 11px;
  }

  .solver-diagnostics summary {
    color: #536273;
    font-weight: 650;
    cursor: pointer;
  }

  .solver-diagnostics-content {
    padding-top: 6px;
  }

  .diagnostics-unavailable {
    display: block;
    color: #475569;
    line-height: 1.4;
  }
</style>
