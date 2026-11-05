import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/routes/+layout.svelte", import.meta.url), "utf8");

test("the scrollable 3D edge legend can be reached and scrolled from the keyboard", () => {
  for (const [className, label] of [
    ["graph-edge-type-legend", "Legenda dei tipi di arco"]
  ]) {
    const start = graphApp.indexOf(`<ul class="${className}"`);
    const end = graphApp.indexOf("</ul>", start);
    assert.ok(start >= 0 && end > start, `${label} non trovata`);
    const legend = graphApp.slice(start, end);
    assert.ok(legend.includes(`aria-label="${label}"`));
    assert.match(legend, /tabindex="0"/);
    assert.match(graphApp.slice(Math.max(0, start - 180), start), /svelte-ignore a11y_no_noninteractive_tabindex/);
  }

  const styleStart = graphApp.indexOf(".graph-edge-type-legend {");
  const styleEnd = graphApp.indexOf("}", styleStart);
  assert.ok(styleStart >= 0 && styleEnd > styleStart);
  const styles = graphApp.slice(styleStart, styleEnd);
  assert.match(styles, /max-height:\s*96px/);
  assert.match(styles, /overflow-y:\s*auto/);
  assert.match(layout, /\[tabindex\]:focus-visible/);
});

test("the 3D edge legend progressively mounts types and resets when its data changes", () => {
  assert.match(graphApp, /GRAPH_EDGE_TYPE_LEGEND_PAGE_SIZE = 16/);
  assert.match(graphApp, /graphEdgeTypeLegend !== previousGraphEdgeTypeLegend[\s\S]*?visibleGraphEdgeTypeLimit = GRAPH_EDGE_TYPE_LEGEND_PAGE_SIZE/);
  assert.match(graphApp, /visibleGraphEdgeTypeEntries = graphEdgeTypeLegend\.slice\(0, visibleGraphEdgeTypeLimit\)/);
  assert.match(graphApp, /#each visibleGraphEdgeTypeEntries as entry/);
  assert.match(graphApp, /total=\{graphEdgeTypeLegend\.length\}[\s\S]*?visible=\{visibleGraphEdgeTypeEntries\.length\}[\s\S]*?label="tipi di arco"/);
  assert.doesNotMatch(graphApp, /#each graphEdgeTypeLegend as entry/);
});

test("node types appear as compact toolbar chips without a separate 3D legend panel", () => {
  assert.match(graphApp, /\$: graphNodeTypeSummary = getGraphNodeTypeSummary\(data\?\.nodes \?\? \[\]\)/);
  assert.match(graphApp, /class="node-type-summary" aria-label=\{`Tipi di nodo:/);
  assert.match(graphApp, /graphNodeTypeSummary\.slice\(0, 3\)/);
  assert.match(graphApp, /graphNodeTypeLegend\.find\(\(legend\) => legend\.type === entry\.type\)\?\.color/);
  assert.doesNotMatch(graphApp, /graph-node-type-legend|graph-node-type-swatch|GRAPH_NODE_TYPE_LEGEND_PAGE_SIZE|visibleGraphNodeTypeEntries/);
});

test("the edge legend uses a compact grouped layout on narrow screens", () => {
  const mobile = graphApp.slice(graphApp.indexOf("@media (max-width: 600px) {", graphApp.indexOf(".graph-visualization-note {")));
  assert.match(mobile, /\.graph-visualization-note\s*\{[\s\S]*?width:\s*min\(220px, calc\(58vw - 32px\)\)/);
  assert.match(mobile, /\.graph-legend-section\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*max-content minmax\(0, 1fr\)/);
  assert.match(mobile, /\.graph-edge-type-legend\s*\{[\s\S]*?overflow:\s*visible/);
});
