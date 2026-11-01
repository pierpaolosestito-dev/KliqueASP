<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { CSV_DOWNLOAD_REQUESTED_EVENT } from "../csvExport.ts";

  let message = "";
  let clearMessageTimer: ReturnType<typeof setTimeout> | null = null;

  function announceDownload(event: Event) {
    const filename = (event as CustomEvent<{ filename?: unknown }>).detail?.filename;
    if (typeof filename !== "string" || !filename.trim()) return;

    message = `Richiesta di download inviata al browser: ${filename}`;
    if (clearMessageTimer !== null) clearTimeout(clearMessageTimer);
    clearMessageTimer = setTimeout(() => {
      message = "";
      clearMessageTimer = null;
    }, 6_000);
  }

  onMount(() => window.addEventListener(CSV_DOWNLOAD_REQUESTED_EVENT, announceDownload));

  onDestroy(() => {
    if (typeof window !== "undefined") window.removeEventListener(CSV_DOWNLOAD_REQUESTED_EVENT, announceDownload);
    if (clearMessageTimer !== null) clearTimeout(clearMessageTimer);
  });
</script>

{#if message}
  <div class="download-announcement" role="status" aria-live="polite" aria-atomic="true">
    {message}
  </div>
{/if}

<style>
  .download-announcement {
    position: fixed;
    z-index: 1200;
    top: 72px;
    right: 16px;
    width: max-content;
    max-width: min(380px, calc(100vw - 32px));
    padding: 10px 14px;
    border: 1px solid #b6d8d2;
    border-radius: 10px;
    background: #f2fbf8;
    box-shadow: 0 8px 24px rgb(15 23 42 / 16%);
    color: #155e59;
    font: 600 13px/1.4 system-ui, sans-serif;
    overflow-wrap: anywhere;
    pointer-events: none;
  }

  @media (max-width: 600px) {
    .download-announcement {
      top: 72px;
      right: 8px;
      max-width: calc(100vw - 16px);
      font-size: 12px;
    }
  }
</style>
