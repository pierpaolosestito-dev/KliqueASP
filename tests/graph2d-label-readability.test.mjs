import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import karateDataset from "../src/lib/kliqueasp/data/examples/karate-club.json" with { type: "json" };
import {
  buildGraph2DScene,
  countGraph2DNodeLabelOverlaps,
  describeActiveGraph2DLabelOverlaps,
  describeGraph2DLabelOverlaps
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";

const exportPanel = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");

test("stima le sovrapposizioni delle etichette con le stesse dimensioni usate nel grafico 2D", () => {
  const karateScene = buildGraph2DScene(karateDataset.nodes, karateDataset.edges, { seed: 7 });
  assert.equal(countGraph2DNodeLabelOverlaps(karateScene, { showLabels: true }), 0);

  const witnessIds = karateDataset.nodes.slice(0, 5).map((node) => node.id);
  const annotatedKarateScene = buildGraph2DScene(karateDataset.nodes, karateDataset.edges, {
    graphDirection: "undirected",
    highlightedNodeIds: witnessIds,
    nodeAnnotations: Object.fromEntries(witnessIds.map((id) => [id, "nodo selezionato"])),
    seed: 7
  });
  assert.equal(countGraph2DNodeLabelOverlaps(annotatedKarateScene, {
    showLabels: true,
    showAnnotations: true
  }), 1);

  const nodes = Array.from({ length: 120 }, (_, index) => ({
    id: String(index),
    label: `Rete sociale — Persona ${String(index).padStart(3, "0")}`
  }));
  const links = Array.from({ length: 360 }, (_, index) => ({
    source: String(index % nodes.length),
    target: String((index * 17 + 11) % nodes.length),
    sourceId: `edge-${index}`,
    type: "collaboration"
  })).filter((link) => link.source !== link.target);
  const denseScene = buildGraph2DScene(nodes, links, { seed: 7 });

  assert.ok(countGraph2DNodeLabelOverlaps(denseScene, { showLabels: true }) > 0);
  assert.equal(countGraph2DNodeLabelOverlaps(denseScene, { showLabels: false }), 0);
});

test("l'export avvisa prima del download e lascia attivabili nomi e ID", () => {
  assert.match(exportPanel, /countGraph2DNodeLabelOverlaps\(scene/);
  assert.match(exportPanel, /showLabels = estimatedLabelOverlaps === 0/);
  assert.match(exportPanel, /describeGraph2DLabelOverlaps\(estimatedLabelOverlaps\)/);
  assert.match(exportPanel, /describeActiveGraph2DLabelOverlaps\(activeLabelOverlaps\)/);
  assert.match(exportPanel, /Nomi dei nodi/);
  assert.match(exportPanel, /Mostra ID dei nodi/);
});

test("il messaggio sulle collisioni usa numero e verbo corretti", () => {
  assert.equal(describeGraph2DLabelOverlaps(1), "una coppia di etichette si sovrapporrebbe");
  assert.equal(describeGraph2DLabelOverlaps(3), "3 coppie di etichette si sovrapporrebbero");
  assert.equal(describeActiveGraph2DLabelOverlaps(1), "Le etichette attive si sovrappongono in una coppia");
  assert.equal(describeActiveGraph2DLabelOverlaps(3), "Le etichette attive si sovrappongono in 3 coppie");
  assert.equal(describeGraph2DLabelOverlaps(0), "0 coppie di etichette si sovrapporrebbero");
});
