<script lang="ts">
  import { getAnalysisStatusTone } from "../graph/analysisStatusTone.ts";

  export let label = "";

  $: tone = getAnalysisStatusTone(label);
</script>

<p
  class="analysis-completion-status"
  class:has-content={Boolean(label.trim())}
  data-tone={tone}
  role="status"
  aria-live="polite"
  aria-atomic="true"
>{label.trim()}</p>

<style>
  .analysis-completion-status {
    margin: 0;
    padding: 0;
    border: 0;
    font-size: 0;
    line-height: 0;
  }

  .analysis-completion-status.has-content {
    margin: 8px 0 0;
    padding: 7px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #f8fafc;
    color: #334155;
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .analysis-completion-status[data-tone="success"] {
    border-color: #a7f3d0;
    background: #ecfdf5;
    color: #065f46;
  }

  .analysis-completion-status[data-tone="caution"] {
    border-color: #fcd34d;
    background: #fffbeb;
    color: #78350f;
  }

  .analysis-completion-status[data-tone="error"] {
    border-color: #fecaca;
    background: #fef2f2;
    color: #991b1b;
  }
</style>
