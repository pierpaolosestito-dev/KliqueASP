import { WorkerReadinessGate } from "./workerReadiness.ts";

export type ClingoWorkerStatus = "initializing" | "ready" | "error";
type StatusListener = (status: ClingoWorkerStatus) => void;
type WorkerFactory = (url: string, options: WorkerOptions) => Worker;

export interface ClingoWorkerLease {
  readonly worker: Worker | null;
  readonly readiness: WorkerReadinessGate;
  restart(): void;
  release(): void;
}

/** Keep the single-string CLI call below the empirically tested 1 MiB WASM input boundary. */
export const MAX_CLINGO_WASM_PROGRAM_BYTES = 1_000_000;

export function getClingoWasmProgramSizeError(program: string): string | null {
  const byteLength = new TextEncoder().encode(program).byteLength;
  if (byteLength <= MAX_CLINGO_WASM_PROGRAM_BYTES) return null;
  return `Il programma ASP occupa ${byteLength.toLocaleString("it-IT")} byte e supera il limite prudenziale di ${MAX_CLINGO_WASM_PROGRAM_BYTES.toLocaleString("it-IT")} byte del solver WASM. Riduci il grafo o applica filtri prima dell'analisi.`;
}

/** Reuses clingo-WASM across GraphApp remounts and serializes calls after its init handshake. */
export class ClingoWorkerClient {
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private wasmUrl: string | null = null;
  private status: ClingoWorkerStatus = "initializing";
  private readonly readiness = new WorkerReadinessGate();
  private readonly listeners = new Set<StatusListener>();
  private referenceCount = 0;
  private disposalTimer: ReturnType<typeof setTimeout> | null = null;
  private initializationTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly workerFactory: WorkerFactory;
  private readonly disposalDelayMs: number;
  private readonly initializationTimeoutMs: number;

  constructor(
    workerFactory: WorkerFactory = (url, options) => new Worker(url, options),
    disposalDelayMs = 5000,
    initializationTimeoutMs = 20000
  ) {
    this.workerFactory = workerFactory;
    this.disposalDelayMs = disposalDelayMs;
    this.initializationTimeoutMs = initializationTimeoutMs;
  }

  acquire(workerUrl: string, wasmUrl: string, onStatus: StatusListener): ClingoWorkerLease {
    const client = this;
    if (this.disposalTimer) {
      clearTimeout(this.disposalTimer);
      this.disposalTimer = null;
    }
    this.referenceCount += 1;
    this.listeners.add(onStatus);

    if (!this.worker || this.workerUrl !== workerUrl || this.wasmUrl !== wasmUrl || this.status === "error") {
      this.start(workerUrl, wasmUrl);
    } else {
      onStatus(this.status);
    }

    let released = false;
    return {
      get worker() {
        return client.worker;
      },
      get readiness() {
        return client.readiness;
      },
      restart: () => this.start(workerUrl, wasmUrl),
      release: () => {
        if (released) return;
        released = true;
        this.listeners.delete(onStatus);
        this.referenceCount = Math.max(0, this.referenceCount - 1);
        if (this.referenceCount === 0) {
          this.disposalTimer = setTimeout(() => {
            this.disposalTimer = null;
            if (this.referenceCount === 0) this.dispose();
          }, this.disposalDelayMs);
        }
      }
    };
  }

  private start(workerUrl: string, wasmUrl: string): void {
    if (this.initializationTimer) {
      clearTimeout(this.initializationTimer);
      this.initializationTimer = null;
    }
    this.readiness.beginInitialization();
    this.setStatus("initializing");
    this.worker?.terminate();
    this.worker = null;
    this.workerUrl = workerUrl;
    this.wasmUrl = wasmUrl;

    let worker: Worker;
    try {
      worker = this.workerFactory(workerUrl, { type: "module" });
    } catch {
      this.setStatus("error");
      this.readiness.markFailed();
      return;
    }
    this.worker = worker;

    worker.addEventListener("message", (event: MessageEvent) => {
      if (this.worker !== worker || event.data !== null) return;
      if (this.initializationTimer) {
        clearTimeout(this.initializationTimer);
        this.initializationTimer = null;
      }
      this.readiness.markReady();
      this.setStatus("ready");
    });
    worker.addEventListener("error", () => {
      if (this.worker !== worker) return;
      if (this.initializationTimer) {
        clearTimeout(this.initializationTimer);
        this.initializationTimer = null;
      }
      this.readiness.markFailed();
      this.setStatus("error");
    });

    try {
      worker.postMessage({ type: "init", wasmUrl });
    } catch {
      if (this.worker === worker) {
        this.readiness.markFailed();
        this.setStatus("error");
      }
      return;
    }
    this.initializationTimer = setTimeout(() => {
      this.initializationTimer = null;
      if (this.worker !== worker || this.status !== "initializing") return;
      worker.terminate();
      this.worker = null;
      this.readiness.markFailed();
      this.setStatus("error");
    }, this.initializationTimeoutMs);
  }

  private setStatus(status: ClingoWorkerStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  private dispose(): void {
    if (this.initializationTimer) {
      clearTimeout(this.initializationTimer);
      this.initializationTimer = null;
    }
    this.worker?.terminate();
    this.worker = null;
    this.workerUrl = null;
    this.wasmUrl = null;
    this.readiness.markFailed();
  }
}

export const clingoWorkerClient = new ClingoWorkerClient();
