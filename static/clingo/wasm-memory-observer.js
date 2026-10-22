/** Instruments the clingo worker's WebAssembly instance without changing solver inputs. */
export function installWasmMemoryObserver(scope) {
  const wasm = scope.WebAssembly;
  let memory;
  let peakBytes = 0;
  let peakReliable = false;

  function updatePeak() {
    if (!memory) return;
    peakBytes = Math.max(peakBytes, memory.buffer.byteLength);
  }

  function observeInstantiation(result) {
    const instance = result instanceof wasm.Instance ? result : result?.instance;
    const exportedMemory = Object.values(instance?.exports ?? {}).find((value) => value instanceof wasm.Memory);
    if (!exportedMemory) return;

    memory = exportedMemory;
    updatePeak();
    try {
      const originalGrow = memory.grow.bind(memory);
      memory.grow = (pages) => {
        const previousPages = originalGrow(pages);
        updatePeak();
        return previousPages;
      };
      peakReliable = true;
    } catch {
      // Keep the solver operational if this browser does not allow observing memory.grow.
      peakReliable = false;
    }
  }

  for (const methodName of ["instantiate", "instantiateStreaming"]) {
    const original = wasm[methodName];
    if (typeof original !== "function") continue;
    try {
      wasm[methodName] = async (...args) => {
        const result = await original.apply(wasm, args);
        observeInstantiation(result);
        return result;
      };
    } catch {
      // Instrumentation is best-effort and must never prevent clingo from initializing.
    }
  }

  function getStats() {
    if (!memory) return null;
    updatePeak();
    return {
      currentBytes: memory.buffer.byteLength,
      peakBytes,
      peakReliable
    };
  }

  try {
    const originalPostMessage = scope.postMessage.bind(scope);
    scope.postMessage = (message, ...args) => {
      if (message && typeof message === "object" && typeof message.Result === "string") {
        return originalPostMessage({
          ...message,
          KliqueDiagnostics: {
            wasmLinearMemory: getStats()
          }
        }, ...args);
      }
      return originalPostMessage(message, ...args);
    };
  } catch {
    // Leave the original worker API untouched if the host does not allow wrapping postMessage.
  }

  return { getStats };
}
