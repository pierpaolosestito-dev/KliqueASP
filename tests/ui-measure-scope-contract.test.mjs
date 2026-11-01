import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const structural = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
const motifs = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");
const scenarios = await readFile(new URL("../src/lib/kliqueasp/components/ProvenanceScenarioAnalysisPanel.svelte", import.meta.url), "utf8");
const integrity = await readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8");
const workerMemory = await readFile(new URL("../src/lib/kliqueasp/components/WorkerMemoryReadout.svelte", import.meta.url), "utf8");
const solver = await readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8");
const contextual = await readFile(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8");

test("modularity reports its resolution, weighting, and graph population", () => {
  assert.match(structural, /Qγ = \{formatItalianNumber\(modularity, 4\)\}/);
  assert.match(structural, /import \{ formatItalianNumber \} from "\.\.\/graph\/formatItalianNumber\.ts"/);
  assert.match(structural, /comunità sulla proiezione non orientata di \{graphNodesCount \?\? 0\} \{countForm\(graphNodesCount \?\? 0, "nodo", "nodi"\)\} e \{graphLinksCount \?\? 0\} \{countForm\(graphLinksCount \?\? 0, "arco", "archi"\)\}/);
  assert.match(structural, /Massimizzazione esatta della modularità con γ=\{communityResolution\}[\s\S]*?pesata con i valori mappati sugli archi/);
  assert.match(structural, /Qγ = \{partition\.scaledScore\} \/ \(4·\{communityUsesEdgeWeights \? "M_s" : "M"\}²·q\)/);
});

test("triad proportions state which complete classified triangles form each denominator", () => {
  assert.match(motifs, /La quota è calcolata solo sui triangoli completi classificati nella proiezione corrente/);
  assert.match(motifs, /\{scenario\.commonTriads\} triangoli classificati in tutti gli scenari · quota bilanciata sul nucleo comune/);
  assert.match(motifs, /La prima quota usa i triangoli completi classificati nello scenario[\s\S]*?La quota sul nucleo comune usa soltanto gli stessi ID di triade, classificati in tutti gli scenari/);
  assert.match(motifs, /Le triadi assenti dall'unione osservata restano non classificate, non sbilanciate/);
});

test("scenario membership counts show their scenario and optimum denominators", () => {
  assert.match(scenarios, /Presente in \{membership\.scenarioSupportCount\}\/\{comparison\.scenarioCount\} scenari/);
  assert.match(scenarios, /Presente in \{membership\.optimalAnswerSetCount\}\/\{membership\.totalOptimalAnswerSetCount\} clique massime calcolate/);
});

test("displayed duration, memory, and violation quantities include units or explicit count labels", () => {
  assert.match(structural, /\{formatItalianNumber\(timeMs, 1\)\} ms/);
  assert.match(integrity, /\{violations\.length\}<\/strong> violazioni dichiarate trovate/);
  assert.match(workerMemory, /formatItalianNumber\(bytes \/ \(1024 \* 1024\), 2\)\} MiB/);
  assert.match(workerMemory, /formatItalianNumber\(milliseconds, 2\)\} ms/);
  assert.match(solver, /Tempo di calcolo:<\/strong> \{formatItalianNumber\(stats\.timeMs, 2\)\} ms/);
  assert.match(solver, /Nodi analizzati:<\/strong> \{stats\.nodesCount\}/);
  assert.match(solver, /Archi analizzati:<\/strong> \{stats\.linksCount\}/);
  assert.match(contextual, /\{graphNodesCount\} nodi · \{graphEdgesCount\} archi visibili · cardinalità minima/);
  assert.match(contextual, /cardinalità ottima: <strong>\{maximumSize\}<\/strong> nodi focali/);
});
