import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const layout = await readFile(new URL("../src/routes/+layout.svelte", import.meta.url), "utf8");

test("the scrollable 3D edge legend can be reached and scrolled from the keyboard", () => {
  const start = graphApp.indexOf('<ul class="graph-edge-type-legend"');
  const end = graphApp.indexOf("</ul>", start);
  assert.ok(start >= 0 && end > start, "legenda dei tipi d'arco non trovata");
  const legend = graphApp.slice(start, end);
  assert.match(legend, /aria-label="Legenda dei tipi di arco"/);
  assert.match(legend, /tabindex="0"/);
  assert.match(graphApp.slice(Math.max(0, start - 180), start), /svelte-ignore a11y_no_noninteractive_tabindex/);

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
