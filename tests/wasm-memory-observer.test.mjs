import test from "node:test";
import assert from "node:assert/strict";
import { installWasmMemoryObserver } from "../static/clingo/wasm-memory-observer.js";

function createScopeWithInstantiation(methodName) {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 8 });
  const output = [];
  const wasm = {
    Instance: WebAssembly.Instance,
    Memory: WebAssembly.Memory,
    [methodName]: async () => ({ instance: { exports: { memory } } })
  };
  const scope = {
    WebAssembly: wasm,
    postMessage: (message) => output.push(message)
  };
  return { memory, output, scope, wasm };
}

for (const methodName of ["instantiate", "instantiateStreaming"]) {
  test(`the Worker memory observer measures ${methodName} and reports diagnostics`, async () => {
    const { memory, output, scope, wasm } = createScopeWithInstantiation(methodName);
    const observer = installWasmMemoryObserver(scope);

    await wasm[methodName]();
    assert.deepEqual(observer.getStats(), {
      currentBytes: 65_536,
      peakBytes: 65_536,
      peakReliable: true
    });

    memory.grow(2);
    assert.deepEqual(observer.getStats(), {
      currentBytes: 196_608,
      peakBytes: 196_608,
      peakReliable: true
    });

    scope.postMessage({ Result: "SATISFIABLE", Call: [] });
    assert.deepEqual(output[0], {
      Result: "SATISFIABLE",
      Call: [],
      KliqueDiagnostics: {
        wasmLinearMemory: {
          currentBytes: 196_608,
          peakBytes: 196_608,
          peakReliable: true
        }
      }
    });
  });
}

test("the Worker memory observer leaves solver results intact before WASM initialization", () => {
  const output = [];
  const scope = {
    WebAssembly: { Instance: WebAssembly.Instance, Memory: WebAssembly.Memory },
    postMessage: (message) => output.push(message)
  };
  installWasmMemoryObserver(scope);

  scope.postMessage(null);
  scope.postMessage({ Result: "ERROR", Error: "solver failed" });

  assert.equal(output[0], null);
  assert.deepEqual(output[1], {
    Result: "ERROR",
    Error: "solver failed",
    KliqueDiagnostics: { wasmLinearMemory: null }
  });
});
