/** Coordinates queries with an asynchronous Worker initialization handshake. */
export class WorkerReadinessGate {
  private ready = false;
  private resolveCurrentWait: (() => void) | null = null;
  private readiness = this.createPendingReadiness();

  private createPendingReadiness(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveCurrentWait = resolve;
    });
  }

  /** Starts a new initialization cycle and releases any waiters from the old Worker. */
  beginInitialization(): void {
    this.resolveCurrentWait?.();
    this.ready = false;
    this.readiness = this.createPendingReadiness();
  }

  /** Marks initialization as successful after the Worker acknowledges it. */
  markReady(): void {
    this.ready = true;
    this.resolveCurrentWait?.();
    this.resolveCurrentWait = null;
  }

  /** Releases waiters after initialization fails; callers must still check isReady(). */
  markFailed(): void {
    this.ready = false;
    this.resolveCurrentWait?.();
    this.resolveCurrentWait = null;
  }

  waitUntilSettled(): Promise<void> {
    return this.readiness;
  }

  isReady(): boolean {
    return this.ready;
  }
}
