export const WORKBENCH_ANNOUNCEMENT_EVENT = "kliqueasp:workbench-announcement";

/** Publish a short status that remains visible after a workbench panel closes. */
export function announceWorkbenchStatus(message: string): void {
  const text = message.trim();
  if (!text || typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(WORKBENCH_ANNOUNCEMENT_EVENT, {
    detail: { message: text }
  }));
}
