<script lang="ts">
  import { base } from "$app/paths";

  export let variant: "home" | "case-study" = "home";

  const workspaceHref = `${base}/Sandbox/`;
  const caseStudyHref = `${base}/PsychologyHistoryGraph/`;
</script>

<nav class="workspace-navigation" class:home={variant === "home"} aria-label="Navigazione KliqueASP">
  {#if variant === "home"}
    <a class="primary" href={workspaceHref}>Apri area di lavoro</a>
    <a class="secondary" href={caseStudyHref}>Caso studio psicologi</a>
  {:else}
    <a class="primary" href={workspaceHref}>Analizza i tuoi dati</a>
  {/if}
</nav>

<style>
  .workspace-navigation {
    position: fixed;
    top: var(--toolbar-top, 10px);
    right: 12px;
    z-index: 42;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    max-width: calc(100vw - 24px);
  }

  .workspace-navigation a {
    display: inline-flex;
    min-height: 38px;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    border: 1px solid transparent;
    border-radius: 9px;
    font: 600 13px/1.2 system-ui, sans-serif;
    text-decoration: none;
    white-space: nowrap;
    transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease;
  }

  .workspace-navigation a:hover {
    transform: translateY(-1px);
  }

  .workspace-navigation a:focus-visible {
    outline: 3px solid #0c4a6e;
    outline-offset: 3px;
    box-shadow: 0 0 0 1px #fff;
  }

  .primary {
    border-color: #17675f !important;
    background: #17675f;
    color: #fff;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
  }

  .primary:hover {
    background: #12554f;
  }

  .secondary {
    border-color: rgba(148, 163, 184, 0.45) !important;
    background: rgba(255, 255, 255, 0.96);
    color: #1e293b;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
  }

  .secondary:hover {
    background: #f1f5f9;
  }

  @media (max-width: 1280px) {
    .workspace-navigation {
      top: calc(var(--toolbar-top, 10px) + var(--toolbar-height, 170px) + 8px);
    }
  }

  @media (max-width: 600px) {
    .workspace-navigation {
      left: 12px;
      right: 12px;
      flex-wrap: wrap;
    }

    .workspace-navigation a {
      min-height: 40px;
      padding: 8px 10px;
      font-size: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .workspace-navigation a {
      transition: none;
    }

    .workspace-navigation a:hover {
      transform: none;
    }
  }
</style>
