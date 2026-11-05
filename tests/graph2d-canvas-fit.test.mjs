import assert from "node:assert/strict";
import test from "node:test";
import davisDataset from "../src/lib/kliqueasp/data/examples/davis-southern-women.json" with { type: "json" };
import { buildGraph2DScene, buildGraph2DSvg, countGraph2DNodeLabelOverlaps } from "../src/lib/kliqueasp/graph/graph2dExport.ts";

test("il fit 2D ruota solo i layout verticali quando aumenta l'area utile senza deformarli", () => {
  const options = { seed: 7, nodeTypeStyles: { woman: { color: "#718096" }, event: { color: "#2f8f83" } } };
  const scene = buildGraph2DScene(davisDataset.nodes, davisDataset.edges, options);
  const portraitScene = buildGraph2DScene(davisDataset.nodes, davisDataset.edges, { ...options, width: 820, height: 1280 });
  const positions = scene.nodes.map(({ id, x, y }) => ({ id, x, y }));
  const secondScene = buildGraph2DScene(davisDataset.nodes, davisDataset.edges, options);
  const svg = buildGraph2DSvg(scene, { showLegend: true });
  const minX = Math.min(...scene.nodes.map((node) => node.x));
  const maxX = Math.max(...scene.nodes.map((node) => node.x));
  const minY = Math.min(...scene.nodes.map((node) => node.y));
  const maxY = Math.max(...scene.nodes.map((node) => node.y));
  const portraitWidth = Math.max(...portraitScene.nodes.map((node) => node.x)) - Math.min(...portraitScene.nodes.map((node) => node.x));
  const portraitHeight = Math.max(...portraitScene.nodes.map((node) => node.y)) - Math.min(...portraitScene.nodes.map((node) => node.y));
  const distance = (graph, leftId, rightId) => {
    const left = graph.nodes.find((node) => node.id === leftId);
    const right = graph.nodes.find((node) => node.id === rightId);
    return Math.hypot(left.x - right.x, left.y - right.y);
  };

  assert.equal(scene.nodes.length, 32);
  assert.equal(scene.links.length, 89);
  assert.ok(maxX - minX > scene.width * 0.65, "la rete deve usare almeno il 65% della larghezza del foglio");
  assert.ok(maxX - minX > maxY - minY, "il layout verticale va ruotato per il canvas orizzontale");
  assert.ok(portraitHeight > portraitWidth, "il canvas verticale deve mantenere l'orientamento del layout");
  assert.ok(scene.nodes.every((node) => node.x > 0 && node.x < scene.width && node.y > 0 && node.y < scene.height));
  assert.equal(countGraph2DNodeLabelOverlaps(scene, { showLabels: true }), 0);
  assert.match(svg, /<svg[^>]*width="1280" height="820"/);
  assert.match(svg, />NODI<\/text>/);
  assert.match(svg, />RELAZIONI<\/text>/);
  const landscapeDistanceRatio = distance(scene, davisDataset.nodes[0].id, davisDataset.nodes[1].id) /
    distance(scene, davisDataset.nodes[0].id, davisDataset.nodes[2].id);
  const portraitDistanceRatio = distance(portraitScene, davisDataset.nodes[0].id, davisDataset.nodes[1].id) /
    distance(portraitScene, davisDataset.nodes[0].id, davisDataset.nodes[2].id);
  assert.ok(Math.abs(landscapeDistanceRatio - portraitDistanceRatio) < 1e-9, "la rotazione non deve distorcere le distanze relative");
  const nodeById = new Map(scene.nodes.map((node) => [node.id, node]));
  const legendBounds = { left: scene.width - 224, right: scene.width - 22, top: scene.height - 149, bottom: scene.height - 20 };
  const edgeCrossesLegend = scene.links.filter((link) => {
    const source = nodeById.get(link.source);
    const target = nodeById.get(link.target);
    return Array.from({ length: 101 }, (_, index) => index / 100).some((ratio) => {
      const x = source.x + (target.x - source.x) * ratio;
      const y = source.y + (target.y - source.y) * ratio;
      return x >= legendBounds.left && x <= legendBounds.right && y >= legendBounds.top && y <= legendBounds.bottom;
    });
  });
  assert.equal(edgeCrossesLegend.length, 0, "il fit non deve nascondere gli archi sotto la legenda compatta Davis");
  assert.deepEqual(positions, secondScene.nodes.map(({ id, x, y }) => ({ id, x, y })));
});
