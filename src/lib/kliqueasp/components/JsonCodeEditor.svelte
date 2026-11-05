<script lang="ts">
  import { highlightJson, shouldHighlightJson } from "../graph/jsonSyntaxHighlight.ts";

  export let id: string;
  export let ariaLabel: string = "";
  export let value: string = "";
  export let invalid: boolean = false;
  export let describedBy: string | undefined = undefined;
  export let onValueChange: (value: string) => void = () => {};

  let scrollLeft = 0;
  let scrollTop = 0;

  $: highlightingEnabled = shouldHighlightJson(value);
  $: highlightedSource = highlightingEnabled ? highlightJson(value) : "";

  function syncHighlightScroll(event: Event) {
    const editor = event.currentTarget as HTMLTextAreaElement;
    scrollLeft = editor.scrollLeft;
    scrollTop = editor.scrollTop;
  }
</script>

<div class="json-code-editor" class:json-code-editor-invalid={invalid} class:json-code-editor-highlighted={highlightingEnabled}>
  <pre class="json-code-highlight" hidden={!highlightingEnabled} aria-hidden="true" role="presentation" style:transform={'translate(-' + scrollLeft + 'px, -' + scrollTop + 'px)'}>{@html highlightedSource}</pre>
  <textarea
    class="json-code-input"
    {id}
    aria-label={ariaLabel}
    spellcheck="false"
    aria-invalid={invalid ? "true" : undefined}
    aria-describedby={describedBy}
    value={value}
    on:input={(event) => onValueChange((event.currentTarget as HTMLTextAreaElement).value)}
    on:scroll={syncHighlightScroll}
  ></textarea>
</div>

<style>
  .json-code-editor {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 96px;
    flex: 1 1 96px;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 10px;
    outline: none;
    background: #020617;
  }

  .json-code-highlight,
  .json-code-input {
    box-sizing: border-box;
    width: 100%;
    margin: 0;
    padding: 12px;
    border: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.45;
    letter-spacing: normal;
    tab-size: 2;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .json-code-highlight {
    position: absolute;
    inset: 0;
    overflow: hidden;
    color: #e5e7eb;
    pointer-events: none;
    user-select: none;
  }

  .json-code-input {
    position: relative;
    z-index: 1;
    min-height: 96px;
    height: auto;
    flex: 1 1 96px;
    resize: vertical;
    outline: none;
    background: transparent;
    color: #e5e7eb;
    caret-color: #f8fafc;
  }

  .json-code-editor-highlighted .json-code-input {
    color: transparent;
    -webkit-text-fill-color: transparent;
  }

  .json-code-editor-highlighted .json-code-input::selection {
    background: rgba(56, 189, 248, 0.28);
    color: transparent;
    -webkit-text-fill-color: transparent;
  }

  .json-code-editor:focus-within {
    border-color: #38bdf8;
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16);
  }

  .json-code-editor-invalid {
    border-color: #f87171;
  }

  .json-code-editor-invalid:focus-within {
    border-color: #f87171;
    box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.16);
  }

  :global(.json-code-editor .json-token-key) { color: #7dd3fc; }
  :global(.json-code-editor .json-token-string) { color: #86efac; }
  :global(.json-code-editor .json-token-number) { color: #fcd34d; }
  :global(.json-code-editor .json-token-literal) { color: #c4b5fd; }
  :global(.json-code-editor .json-token-punctuation) { color: #94a3b8; }

  @media (forced-colors: active) {
    .json-code-highlight { display: none; }
    .json-code-input {
      background: Canvas;
      color: CanvasText;
      -webkit-text-fill-color: CanvasText;
      caret-color: CanvasText;
    }
    .json-code-editor:focus-within { outline: 2px solid Highlight; outline-offset: 2px; }
  }
</style>
