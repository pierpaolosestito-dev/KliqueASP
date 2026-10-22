import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workerPath = path.join(projectRoot, "static/clingo/clingo.web.worker.js");
const wasmPath = path.join(projectRoot, "static/clingo/clingo.wasm");

/** Runs the shipped browser worker in a small Worker-like VM for automated solver tests. */
export async function createClingoWasmRunner({ captureWasmMemory = false, includeExceptionDetails = false } = {}) {
  const listeners = new Map();
  const outputs = [];
  const workerUrl = pathToFileURL(workerPath).href;
  let wasmMemory = null;
  let peakWasmLinearMemoryBytes = 0;
  const webAssemblyApi = captureWasmMemory ? Object.create(WebAssembly) : WebAssembly;
  if (captureWasmMemory) {
    // Use the async instantiate path so memory growth can be observed before
    // clingo initializes and starts solving. This measures linear WASM memory,
    // not the worker's JavaScript heap or total process memory.
    webAssemblyApi.instantiateStreaming = undefined;
    webAssemblyApi.instantiate = async (...args) => {
      const result = await WebAssembly.instantiate(...args);
      const instance = result instanceof WebAssembly.Instance ? result : result.instance;
      wasmMemory = Object.values(instance?.exports ?? {}).find((value) => value instanceof WebAssembly.Memory) ?? null;
      if (wasmMemory) {
        peakWasmLinearMemoryBytes = Math.max(peakWasmLinearMemoryBytes, wasmMemory.buffer.byteLength);
        const originalGrow = wasmMemory.grow.bind(wasmMemory);
        wasmMemory.grow = (pages) => {
          const previousPages = originalGrow(pages);
          peakWasmLinearMemoryBytes = Math.max(peakWasmLinearMemoryBytes, wasmMemory.buffer.byteLength);
          return previousPages;
        };
      }
      return result;
    };
  }
  const sandbox = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    addEventListener: (name, callback) => listeners.set(name, callback),
    postMessage: (value) => outputs.push(value),
    importScripts() {},
    location: { origin: "http://kliqueasp.test" },
    self: { location: { href: workerUrl } },
    fetch: async () => new Response(await fs.readFile(wasmPath), {
      status: 200,
      headers: { "Content-Type": "application/wasm" }
    }),
    WebAssembly: webAssemblyApi,
    URL,
    Response,
    Headers,
    AbortController,
    Uint8Array,
    Uint8ClampedArray,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    TextDecoder,
    TextEncoder,
    DataView,
    ArrayBuffer,
    SharedArrayBuffer,
    Math,
    Date,
    JSON,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    BigInt,
    Number,
    String,
    Boolean,
    Object,
    Array,
    RegExp,
    Error,
    TypeError,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    performance,
    crypto: globalThis.crypto
  };
  sandbox.globalThis = sandbox;

  try {
    let workerSource = await fs.readFile(workerPath, "utf8");
    if (includeExceptionDetails) {
      const originalErrorHandler = 'catch(e){return{Result:"ERROR",Error:this.errors.join("\\n")}}';
      const diagnosticErrorHandler = 'catch(e){return{Result:"ERROR",Error:[...this.errors,e&&e.stack||String(e)].filter(Boolean).join("\\n")}}';
      if (!workerSource.includes(originalErrorHandler)) {
        throw new Error("could not instrument the worker error handler for diagnostics");
      }
      workerSource = workerSource.replace(originalErrorHandler, diagnosticErrorHandler);
    }
    vm.runInNewContext(workerSource, sandbox, { filename: "clingo-web-worker.js" });
    const onMessage = listeners.get("message");
    if (!onMessage) throw new Error("clingo worker did not register its message handler");

    await onMessage({ data: { type: "init", wasmUrl: "http://kliqueasp.test/clingo.wasm" } });
    if (outputs[0] !== null) throw new Error("clingo worker initialization did not complete");

    return {
      async run(program, options = [], modelLimit = 0) {
        const previousOutputCount = outputs.length;
        try {
          await onMessage({ data: { type: "run", args: [program, modelLimit, options] } });
          const result = outputs[previousOutputCount];
          if (!result || typeof result !== "object") {
            throw new Error("clingo worker returned no solver result");
          }
          return result;
        } finally {
          outputs.length = previousOutputCount;
        }
      },
      getWasmLinearMemoryStats() {
        if (!wasmMemory) return { currentBytes: null, peakBytes: null };
        const currentBytes = wasmMemory.buffer.byteLength;
        peakWasmLinearMemoryBytes = Math.max(peakWasmLinearMemoryBytes, currentBytes);
        return { currentBytes, peakBytes: peakWasmLinearMemoryBytes };
      },
      growWasmLinearMemoryForTesting(pages = 1) {
        if (!wasmMemory) throw new Error("WASM linear memory capture is not enabled");
        if (!Number.isSafeInteger(pages) || pages < 1) {
          throw new RangeError("pages must be a positive safe integer");
        }
        wasmMemory.grow(pages);
        peakWasmLinearMemoryBytes = Math.max(peakWasmLinearMemoryBytes, wasmMemory.buffer.byteLength);
        return { currentBytes: wasmMemory.buffer.byteLength, peakBytes: peakWasmLinearMemoryBytes };
      }
    };
  } catch (error) {
    throw new Error(`clingo WASM test harness failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
