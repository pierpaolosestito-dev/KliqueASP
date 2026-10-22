import { installWasmMemoryObserver } from "./wasm-memory-observer.js";
import "./clingo.web.worker.js";

installWasmMemoryObserver(globalThis);
