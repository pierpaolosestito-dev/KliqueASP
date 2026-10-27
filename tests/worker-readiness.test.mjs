import assert from "node:assert/strict";
import test from "node:test";
import {
  ClingoWorkerClient,
  getClingoWasmProgramSizeError,
  MAX_CLINGO_WASM_PROGRAM_BYTES
} from "../src/lib/kliqueasp/clingoWorkerClient.ts";
import { WorkerReadinessGate } from "../src/lib/kliqueasp/workerReadiness.ts";

test("the clingo worker size guard counts UTF-8 bytes and accepts the tested limit", () => {
  assert.equal(getClingoWasmProgramSizeError("x".repeat(MAX_CLINGO_WASM_PROGRAM_BYTES)), null);
  assert.match(getClingoWasmProgramSizeError("x".repeat(MAX_CLINGO_WASM_PROGRAM_BYTES + 1)), /supera il limite prudenziale/);
  assert.match(getClingoWasmProgramSizeError("è".repeat(MAX_CLINGO_WASM_PROGRAM_BYTES / 2 + 1)), /byte/);
});

class FakeWorker {
  messages = [];
  listeners = new Map();
  terminated = false;

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  dispatch(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

test("a solver request can wait for the Worker's initialization acknowledgement", async () => {
  const readiness = new WorkerReadinessGate();
  readiness.beginInitialization();

  let continued = false;
  const waiting = readiness.waitUntilSettled().then(() => {
    continued = readiness.isReady();
  });

  await Promise.resolve();
  assert.equal(continued, false);
  readiness.markReady();
  await waiting;
  assert.equal(continued, true);
});

test("a failed or replaced Worker releases waiters without reporting readiness", async () => {
  const readiness = new WorkerReadinessGate();
  readiness.beginInitialization();
  const previousInitialization = readiness.waitUntilSettled();

  readiness.beginInitialization();
  readiness.markFailed();

  await previousInitialization;
  await readiness.waitUntilSettled();
  assert.equal(readiness.isReady(), false);
});

test("the shared clingo worker survives GraphApp remounts and is disposed after the last lease", async () => {
  const workers = [];
  const client = new ClingoWorkerClient((url, options) => {
    const worker = new FakeWorker();
    worker.url = url;
    worker.options = options;
    workers.push(worker);
    return worker;
  }, 0);
  const statuses = [];
  const firstLease = client.acquire("/clingo/worker.js", "/clingo/clingo.wasm", (status) => statuses.push(status));
  const firstWorker = firstLease.worker;
  assert.deepEqual(firstWorker.messages, [{ type: "init", wasmUrl: "/clingo/clingo.wasm" }]);
  firstWorker.dispatch("message", { data: null });
  assert.equal(firstLease.readiness.isReady(), true);
  firstLease.release();

  const remountedLease = client.acquire("/clingo/worker.js", "/clingo/clingo.wasm", (status) => statuses.push(status));
  assert.equal(remountedLease.worker, firstWorker);
  assert.equal(workers.length, 1, "remount must reuse the initialized WASM Worker");
  assert.equal(remountedLease.readiness.isReady(), true);
  assert.equal(firstWorker.terminated, false);

  remountedLease.release();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(firstWorker.terminated, true);
  assert.deepEqual(statuses, ["initializing", "ready", "ready"]);
});

test("restarting a shared clingo worker begins a new readiness handshake", () => {
  const workers = [];
  const client = new ClingoWorkerClient((url, options) => {
    const worker = new FakeWorker();
    worker.url = url;
    worker.options = options;
    workers.push(worker);
    return worker;
  }, 1000);
  const lease = client.acquire("/clingo/worker.js", "/clingo/clingo.wasm", () => {});
  const firstWorker = lease.worker;
  firstWorker.dispatch("message", { data: null });
  assert.equal(lease.readiness.isReady(), true);

  lease.restart();

  assert.equal(firstWorker.terminated, true);
  assert.equal(workers.length, 2);
  assert.equal(lease.worker, workers[1]);
  assert.equal(lease.readiness.isReady(), false);
  workers[1].dispatch("message", { data: null });
  assert.equal(lease.readiness.isReady(), true);
  lease.release();
});

test("a Worker that never acknowledges initialization fails visibly instead of leaving waiters pending", async () => {
  const workers = [];
  const statuses = [];
  const client = new ClingoWorkerClient((url, options) => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  }, 0, 10);
  const lease = client.acquire("/clingo/worker.js", "/clingo/clingo.wasm", (status) => statuses.push(status));
  const pending = lease.readiness.waitUntilSettled();

  await new Promise((resolve) => setTimeout(resolve, 20));
  await pending;

  assert.equal(lease.readiness.isReady(), false);
  assert.equal(lease.worker, null);
  assert.equal(workers[0].terminated, true);
  assert.deepEqual(statuses, ["initializing", "error"]);
  lease.release();
});
