import assert from "node:assert/strict";
import test from "node:test";
import davisDataset from "../src/lib/kliqueasp/data/examples/davis-southern-women.json" with { type: "json" };
import gahukuDataset from "../src/lib/kliqueasp/data/examples/gahuku-gama-signed.json" with { type: "json" };
import karateDataset from "../src/lib/kliqueasp/data/examples/karate-club.json" with { type: "json" };
import { buildGraph2DScene } from "../src/lib/kliqueasp/graph/graph2dExport.ts";

const typePalette = ["#64748b", "#2f8f83", "#8b5cf6", "#e59a36"];
const mappedTypeStyles = (nodes) => Object.fromEntries(
  [...new Set(nodes.map((node) => node.type).filter((type) => typeof type === "string" && type.trim()))]
    .map((type, index) => [type, { color: typePalette[index % typePalette.length] }])
);

test("il fit 2D riempie l'asse limitante e conserva i margini su Davis, Karate e Gahuku-Gama", () => {
  const datasets = [
    { name: "Davis Southern Women", value: davisDataset, edges: davisDataset.edges },
    { name: "Karate Club", value: karateDataset, edges: karateDataset.edges },
    { name: "Gahuku-Gama", value: gahukuDataset, edges: gahukuDataset.edges },
  ];

  for (const { name, value, edges } of datasets) {
    const scene = buildGraph2DScene(value.nodes, edges, { seed: 7, nodeTypeStyles: mappedTypeStyles(value.nodes) });
    const minX = Math.min(...scene.nodes.map((node) => node.x));
    const maxX = Math.max(...scene.nodes.map((node) => node.x));
    const minY = Math.min(...scene.nodes.map((node) => node.y));
    const maxY = Math.max(...scene.nodes.map((node) => node.y));
    const marginX = Math.min(72, Math.max(30, Math.round(Math.min(scene.width, scene.height) * 0.055)));
    const marginTop = Math.min(100, marginX + 50);
    const availableWidth = scene.width - marginX * 2;
    const availableHeight = scene.height - marginTop - marginX;
    const axisUtilization = Math.max((maxX - minX) / availableWidth, (maxY - minY) / availableHeight);

    assert.equal(scene.nodes.length, value.nodes.length, `${name}: cardinalità nodi`);
    assert.equal(scene.links.length, edges.length, `${name}: cardinalità archi`);
    assert.ok(axisUtilization > 0.99 && axisUtilization <= 1.000001, `${name}: riempie l'asse limitante senza deformazione`);
    assert.ok(scene.nodes.every((node) => node.x > 0 && node.x < scene.width && node.y > 0 && node.y < scene.height), `${name}: tutti i nodi sono nei margini SVG`);
  }
});
