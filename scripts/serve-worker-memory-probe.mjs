import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_PATH, createStaticBasePathServer } from "./serve-static-base-path.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const buildDirectory = path.join(projectDirectory, "build");
const probeSource = path.join(scriptDirectory, "worker-memory-probe.html");
const portValue = Number.parseInt(process.env.KLIQUEASP_MEMORY_PROBE_PORT ?? process.argv[2] ?? "4179", 10);
if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
  throw new RangeError("La porta deve essere un intero tra 1 e 65535.");
}

await Promise.all([
  access(path.join(buildDirectory, "clingo", "clingo-memory.worker.js")),
  access(path.join(buildDirectory, "clingo", "clingo.wasm")),
  access(probeSource)
]);

const probeFileName = "worker-memory-probe.html";
const server = createStaticBasePathServer({
  buildDirectory,
  crossOriginIsolated: true,
  additionalFiles: { [`${BASE_PATH}/${probeFileName}`]: probeSource }
});
server.once("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
server.listen(portValue, "127.0.0.1", () => {
  process.stdout.write(`Worker memory probe: http://127.0.0.1:${portValue}${BASE_PATH}/${probeFileName}\n`);
  process.stdout.write("Headers COOP same-origin e COEP require-corp sono attivi solo su questo server di prova. Ctrl+C per fermarlo.\n");
});
