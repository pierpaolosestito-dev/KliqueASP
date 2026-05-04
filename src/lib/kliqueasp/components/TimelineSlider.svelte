<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import RAW_GRAPH_CONFIG from "../config/graph.config.json";

  const DEFAULT_TIMELINE_UI = {
    bottom: 20,
    width: "min(800px, 90vw)",
    padding: "16px 24px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.9)",
    blur: 8,
    shadow: "0 10px 30px rgba(0,0,0,0.15)",
    zIndex: 25,

    label: {
      gap: 12,
      fontSize: 18,
      fontWeight: 600,
      marginBottom: 12
    },

    slider: {
      height: 40,
      trackHeight: 6,
      trackRadius: 6,
      trackColor: "#cbd5f5",
      thumbSize: 18,
      thumbColor: "#0ea5e9",
      thumbBorder: "2px solid white"
    }
  };

  function isPlainObject(value: any): boolean {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    );
  }

  function deepMerge<T = any>(base: T, override: any): T {
    if (!isPlainObject(base)) return override ?? base;
    if (!isPlainObject(override)) return base;

    const result: any = { ...(base as any) };

    for (const key of Object.keys(override)) {
      const baseValue = (base as any)[key];
      const overrideValue = override[key];

      if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
        result[key] = deepMerge(baseValue, overrideValue);
      } else {
        result[key] = overrideValue;
      }
    }

    return result;
  }

  const UI = {
    timeline: deepMerge(
      DEFAULT_TIMELINE_UI,
      (RAW_GRAPH_CONFIG as any)?.ui?.timeline ?? {}
    )
  };

  const dispatch = createEventDispatcher();

  export let min: number;
  export let max: number;

  // ✅ controllati dal parent (App.svelte)
  export let start = min;
  export let end = max;

  // ✅ stato interno (per drag fluido)
  let localStart = start;
  let localEnd = end;

  // ✅ quando il parent cambia start/end (es. loadDataset reset),
  // aggiorniamo la UI del componente
  $: if (start !== localStart) localStart = start;
  $: if (end !== localEnd) localEnd = end;

  function emit() {
    dispatch("change", { start: localStart, end: localEnd });
  }

  function updateStart(e: Event) {
    const value = Number((e.target as HTMLInputElement).value);
    localStart = Math.min(value, localEnd);
    emit();
  }

  function updateEnd(e: Event) {
    const value = Number((e.target as HTMLInputElement).value);
    localEnd = Math.max(value, localStart);
    emit();
  }
</script>

<div
  class="timeline-container"
  style="
    --tl-bottom: {UI.timeline.bottom}px;
    --tl-width: {UI.timeline.width};
    --tl-padding: {UI.timeline.padding};
    --tl-radius: {UI.timeline.borderRadius}px;
    --tl-bg: {UI.timeline.background};
    --tl-blur: {UI.timeline.blur}px;
    --tl-shadow: {UI.timeline.shadow};
    --tl-z: {UI.timeline.zIndex};

    --tl-label-gap: {UI.timeline.label.gap}px;
    --tl-label-size: {UI.timeline.label.fontSize}px;
    --tl-label-weight: {UI.timeline.label.fontWeight};
    --tl-label-mb: {UI.timeline.label.marginBottom}px;

    --tl-slider-height: {UI.timeline.slider.height}px;
    --tl-track-height: {UI.timeline.slider.trackHeight}px;
    --tl-track-radius: {UI.timeline.slider.trackRadius}px;
    --tl-track-color: {UI.timeline.slider.trackColor};

    --tl-thumb-size: {UI.timeline.slider.thumbSize}px;
    --tl-thumb-color: {UI.timeline.slider.thumbColor};
    --tl-thumb-border: {UI.timeline.slider.thumbBorder};
  "
>
  <div class="timeline-label">
    <span>{localStart}</span>
    <span>—</span>
    <span>{localEnd}</span>
  </div>

  <div class="slider-wrapper">
    <input
      type="range"
      min={min}
      max={max}
      value={localStart}
      on:input={updateStart}
      class="slider slider-start"
    />

    <input
      type="range"
      min={min}
      max={max}
      value={localEnd}
      on:input={updateEnd}
      class="slider slider-end"
    />
  </div>
</div>

<style>
  .timeline-container {
    position: absolute;
    bottom: var(--tl-bottom);
    left: 50%;
    transform: translateX(-50%);
    width: var(--tl-width);
    background: var(--tl-bg);
    padding: var(--tl-padding);
    border-radius: var(--tl-radius);
    backdrop-filter: blur(var(--tl-blur));
    box-shadow: var(--tl-shadow);
    z-index: var(--tl-z);
  }

  .timeline-label {
    display: flex;
    justify-content: center;
    gap: var(--tl-label-gap);
    font-size: var(--tl-label-size);
    font-weight: var(--tl-label-weight);
    margin-bottom: var(--tl-label-mb);
  }

  .slider-wrapper {
    position: relative;
    height: var(--tl-slider-height);
  }

  .slider {
    position: absolute;
    width: 100%;
    pointer-events: none;
    -webkit-appearance: none;
    background: transparent;
  }

  .slider::-webkit-slider-thumb {
    pointer-events: all;
    -webkit-appearance: none;
    width: var(--tl-thumb-size);
    height: var(--tl-thumb-size);
    border-radius: 50%;
    background: var(--tl-thumb-color);
    border: var(--tl-thumb-border);
    cursor: pointer;
  }

  .slider::-webkit-slider-runnable-track {
    height: var(--tl-track-height);
    border-radius: var(--tl-track-radius);
    background: var(--tl-track-color);
  }
</style>