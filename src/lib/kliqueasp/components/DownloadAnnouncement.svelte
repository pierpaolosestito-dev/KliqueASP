<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { CSV_DOWNLOAD_REQUESTED_EVENT } from "../csvExport.ts";
  import { WORKBENCH_ANNOUNCEMENT_EVENT } from "../workbenchAnnouncement.ts";

  let message = "";
  let clearMessageTimer: ReturnType<typeof setTimeout> | null = null;

  function announce(event: Event) {
    if (event.type === WORKBENCH_ANNOUNCEMENT_EVENT) {
      const message = (event as CustomEvent<{ message?: unknown }>).detail?.message;
      if (typeof message !== "string" || !message.trim()) return;
      showMessage(message);
      return;
    }

    const filename = (event as CustomEvent<{ filename?: unknown }>).detail?.filename;
    if (typeof filename !== "string" || !filename.trim()) return;

    showMessage(`Richiesta di download inviata al browser: ${filename}`);
  }

  function showMessage(nextMessage: string) {
    message = nextMessage;
    if (clearMessageTimer !== null) clearTimeout(clearMessageTimer);
    clearMessageTimer = setTimeout(() => {
      message = "";
      clearMessageTimer = null;
    }, 6_000);
  }

  onMount(() => {
    window.addEventListener(CSV_DOWNLOAD_REQUESTED_EVENT, announce);
    window.addEventListener(WORKBENCH_ANNOUNCEMENT_EVENT, announce);
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener(CSV_DOWNLOAD_REQUESTED_EVENT, announce);
      window.removeEventListener(WORKBENCH_ANNOUNCEMENT_EVENT, announce);
    }
    if (clearMessageTimer !== null) clearTimeout(clearMessageTimer);
  });
</script>

<div class="download-announcement" class:has-message={Boolean(message.trim())} role="status" aria-live="polite" aria-atomic="true">
  {message.trim()}
</div>

<style>
  .download-announcement {
    position: fixed;
    z-index: 1200;
    top: calc(var(--toolbar-top, 16px) + var(--toolbar-height, 48px) + 10px);
    right: 16px;
    width: max-content;
    max-width: min(380px, calc(100vw - 32px));
    padding: 10px 14px;
    border: 1px solid #b6d8d2;
    border-radius: 10px;
    background: #f2fbf8;
    box-shadow: 0 8px 24px rgb(15 23 42 / 16%);
    color: #155e59;
    font: 600 13px/1.4 Arial, Helvetica, sans-serif;
    overflow-wrap: anywhere;
    pointer-events: none;
  }

  .download-announcement:not(.has-message) {
    width: 0;
    max-width: 0;
    padding: 0;
    border: 0;
    box-shadow: none;
    font-size: 0;
    line-height: 0;
  }

  @media (max-width: 600px) {
    .download-announcement {
      top: calc(var(--toolbar-top, 16px) + var(--toolbar-height, 48px) + 10px);
      right: 8px;
      max-width: calc(100vw - 16px);
      font-size: 12px;
    }
  }
</style>
