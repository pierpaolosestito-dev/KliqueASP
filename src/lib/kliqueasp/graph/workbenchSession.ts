import { normalizeKliqueAspProjectName, validateGraphDataset } from "./projectFile.ts";

export type WorkbenchSessionSnapshot = {
  version: 3;
  draftConfigText: string;
  draftDatasetText: string;
  appliedConfigText?: string;
  appliedDatasetText?: string;
  projectName?: string;
  projectDirty: boolean;
  nodeLabelsVisible: boolean;
  history: WorkbenchHistoryEntry[];
  analysis?: WorkbenchAnalysisSessionSnapshot;
  analysisArchive?: WorkbenchAnalysisArchiveSnapshot;
  savedAt: string;
};

export type WorkbenchAnalysisSessionSnapshot = {
  version: 1;
  graphKey: string;
  state: Record<string, unknown>;
};

export type WorkbenchAnalysisArchiveEntry = {
  id: string;
  label: string;
  savedAt: string;
  state: Record<string, unknown>;
};

export type WorkbenchAnalysisArchiveSnapshot = {
  version: 1;
  graphKey: string;
  entries: WorkbenchAnalysisArchiveEntry[];
};

export type WorkbenchHistoryEntry = { id: string; label: string };
export const MAX_WORKBENCH_HISTORY_ENTRIES = 100;

export function filterWorkbenchHistoryForNodeIds(
  history: readonly WorkbenchHistoryEntry[],
  nodeIds: ReadonlySet<string>
): WorkbenchHistoryEntry[] {
  return history
    .filter((entry) => nodeIds.has(entry.id))
    .slice(-MAX_WORKBENCH_HISTORY_ENTRIES);
}

/** Reports whether a saved analysis state contains a result, outcome, or error worth keeping. */
export function analysisStateHasResult(state: Record<string, unknown>): boolean {
  const panel = state.resultPanel ?? state.panel;
  if (panel === "clique") {
    const clique = isRecord(state.clique) ? state.clique : {};
    const stats = isRecord(clique.stats) ? clique.stats : {};
    return (Array.isArray(clique.maximumCliques) && clique.maximumCliques.length > 0) ||
      Number.isFinite(stats.timeMs) || Boolean(clique.error);
  }
  if (panel === "structural") {
    const structural = isRecord(state.structural) ? state.structural : {};
    return (Array.isArray(structural.results) && structural.results.length > 0) ||
      Boolean(structural.stats) || Boolean(structural.error);
  }
  if (panel === "integrity") {
    const integrity = isRecord(state.integrity) ? state.integrity : {};
    return integrity.hasRun === true || Boolean(integrity.error) || Boolean(integrity.repairProposal) ||
      Boolean(integrity.repairError) || Boolean(integrity.repairOutcomeMessage);
  }
  if (panel === "motif") {
    const motif = isRecord(state.motif) ? state.motif : {};
    return [
      motif.hasRun, motif.countHasRun, motif.nearMatchHasRun, motif.counterfactualHasRun,
      motif.signedTriadHasRun, motif.contextualCliqueHasRun
    ].some(Boolean) || Boolean(
      motif.error || motif.countError || motif.nearMatchError || motif.counterfactualError ||
      motif.signedTriadError || motif.contextualCliqueError
    );
  }
  if (panel === "provenance") {
    const provenance = isRecord(state.provenance) ? state.provenance : {};
    return Object.entries(provenance).some(([key, value]) =>
      /(comparison|error|counterfactual|whynot)/i.test(key) && value !== null && value !== undefined &&
      value !== "" && (!Array.isArray(value) || value.length > 0)
    );
  }
  return false;
}

const DATABASE_NAME = "kliqueasp-workbench";
const DATABASE_VERSION = 3;
const SNAPSHOT_STORE = "snapshots";
const ACTIVE_SNAPSHOT_KEY = "current";
const MAX_ANALYSIS_SESSION_CHARS = 8_000_000;
export const MAX_WORKBENCH_ANALYSIS_ARCHIVE_ENTRIES = 12;
export const MAX_WORKBENCH_ANALYSIS_ARCHIVE_CHARS = 8_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown, depth = 0, budget = { remaining: 250_000 }): boolean {
  budget.remaining -= 1;
  if (budget.remaining < 0 || depth > 80) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isJsonValue(entry, depth + 1, budget));
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([key, entry]) =>
    key !== "__proto__" && isJsonValue(entry, depth + 1, budget)
  );
}

function parseAnalysisSession(input: unknown): WorkbenchAnalysisSessionSnapshot | undefined {
  if (!isRecord(input) || input.version !== 1 ||
    typeof input.graphKey !== "string" || input.graphKey.length < 1 || input.graphKey.length > 512 ||
    !isRecord(input.state) || !isJsonValue(input.state)) return undefined;
  try {
    const serialized = JSON.stringify(input.state);
    if (serialized.length > MAX_ANALYSIS_SESSION_CHARS) return undefined;
    return {
      version: 1,
      graphKey: input.graphKey,
      state: JSON.parse(serialized) as Record<string, unknown>
    };
  } catch {
    return undefined;
  }
}

function parseAnalysisArchive(
  input: unknown,
  expectedGraphKey: string
): WorkbenchAnalysisArchiveSnapshot | undefined {
  if (!isRecord(input) || input.version !== 1 || input.graphKey !== expectedGraphKey || !Array.isArray(input.entries)) {
    return undefined;
  }
  const entries: WorkbenchAnalysisArchiveEntry[] = [];
  const ids = new Set<string>();
  let usedChars = 0;
  for (const candidate of input.entries.slice(0, MAX_WORKBENCH_ANALYSIS_ARCHIVE_ENTRIES)) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || candidate.id.length < 1 || candidate.id.length > 256 ||
      ids.has(candidate.id) || typeof candidate.label !== "string" || candidate.label.length < 1 || candidate.label.length > 200 ||
      typeof candidate.savedAt !== "string" || !Number.isFinite(Date.parse(candidate.savedAt))) continue;
    const parsedState = parseAnalysisSession({ version: 1, graphKey: expectedGraphKey, state: candidate.state });
    if (!parsedState) continue;
    const entry = {
      id: candidate.id,
      label: candidate.label,
      savedAt: candidate.savedAt,
      state: parsedState.state
    };
    const entryChars = JSON.stringify(entry).length;
    if (usedChars + entryChars > MAX_WORKBENCH_ANALYSIS_ARCHIVE_CHARS) break;
    ids.add(entry.id);
    entries.push(entry);
    usedChars += entryChars;
  }
  return entries.length > 0
    ? { version: 1, graphKey: expectedGraphKey, entries }
    : undefined;
}

/** Stable, browser-safe identity for the exact applied config/data pair. */
export function createWorkbenchGraphKey(configText: string, datasetText: string): string {
  const hash = (text: string, seed: number) => {
    let value = seed >>> 0;
    for (let index = 0; index < text.length; index += 1) {
      value = Math.imul(value ^ text.charCodeAt(index), 0x01000193) >>> 0;
    }
    return value.toString(16).padStart(8, "0");
  };
  return `${configText.length}:${datasetText.length}:${hash(configText, 0x811c9dc5)}${hash(datasetText, 0x9e3779b9)}`;
}

function validateJsonPair(configText: string, datasetText: string, label: string): void {
  let config: unknown;
  let dataset: unknown;
  try {
    config = JSON.parse(configText);
  } catch (error) {
    throw new TypeError(`${label}: configurazione JSON non valida (${error instanceof Error ? error.message : "sintassi non valida"}).`);
  }
  if (!isRecord(config)) throw new TypeError(`${label}: la configurazione deve essere un oggetto JSON.`);
  try {
    dataset = JSON.parse(datasetText);
  } catch (error) {
    throw new TypeError(`${label}: dataset JSON non valido (${error instanceof Error ? error.message : "sintassi non valida"}).`);
  }
  try {
    validateGraphDataset(dataset);
  } catch (error) {
    throw new TypeError(`${label}: ${error instanceof Error ? error.message : "struttura del dataset non valida"}`);
  }
}

/** Validates the stored snapshot before it can replace the visible workspace. */
export function parseWorkbenchSession(input: unknown): WorkbenchSessionSnapshot {
  if (!isRecord(input) || (input.version !== 1 && input.version !== 2 && input.version !== 3)) {
    throw new TypeError("La sessione salvata non usa una versione supportata.");
  }
  const draftConfigText = input.draftConfigText;
  const draftDatasetText = input.draftDatasetText;
  if (typeof draftConfigText !== "string" || typeof draftDatasetText !== "string") {
    throw new TypeError("La sessione salvata non contiene i JSON del draft.");
  }

  const appliedConfigText = typeof input.appliedConfigText === "string"
    ? input.appliedConfigText
    : draftConfigText;
  const appliedDatasetText = typeof input.appliedDatasetText === "string"
    ? input.appliedDatasetText
    : draftDatasetText;
  validateJsonPair(appliedConfigText, appliedDatasetText, "Grafo applicato salvato");

  if (typeof input.savedAt !== "string" || !Number.isFinite(Date.parse(input.savedAt))) {
    throw new TypeError("La sessione salvata non contiene una data valida.");
  }
  const history = Array.isArray(input.history)
    ? input.history.filter((entry): entry is WorkbenchHistoryEntry =>
        isRecord(entry) &&
        typeof entry.id === "string" && entry.id.length > 0 && entry.id.length <= 4096 &&
        typeof entry.label === "string" && entry.label.length <= 2048
      ).slice(-MAX_WORKBENCH_HISTORY_ENTRIES)
    : [];
  const expectedGraphKey = createWorkbenchGraphKey(appliedConfigText, appliedDatasetText);
  const analysis = input.version >= 2 ? parseAnalysisSession(input.analysis) : undefined;
  const analysisArchive = input.version >= 3
    ? parseAnalysisArchive(input.analysisArchive, expectedGraphKey)
    : undefined;
  return {
    version: 3,
    draftConfigText,
    draftDatasetText,
    ...(appliedConfigText !== draftConfigText ? { appliedConfigText } : {}),
    ...(appliedDatasetText !== draftDatasetText ? { appliedDatasetText } : {}),
    ...(typeof input.projectName === "string" ? { projectName: normalizeKliqueAspProjectName(input.projectName) } : {}),
    projectDirty: input.projectDirty === true,
    nodeLabelsVisible: input.nodeLabelsVisible !== false,
    history,
    ...(analysis ? { analysis } : {}),
    ...(analysisArchive ? { analysisArchive } : {}),
    savedAt: input.savedAt
  };
}

function openSessionDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Il browser non supporta il salvataggio locale delle sessioni."));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;
    let blockedTimer: ReturnType<typeof setTimeout> | null = null;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      if (blockedTimer) clearTimeout(blockedTimer);
      resolve(database);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      if (blockedTimer) clearTimeout(blockedTimer);
      reject(request.error ?? new Error("Impossibile aprire il salvataggio locale."));
    };
    request.onblocked = () => {
      if (blockedTimer || settled) return;
      blockedTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("Il salvataggio è in attesa: chiudi le altre schede di KliqueASP e ricarica la pagina."));
      }, 3000);
    };
  });
}

function withSnapshotTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openSessionDatabase().then((database) => new Promise<T>((resolve, reject) => {
    let transaction: IDBTransaction;
    let request: IDBRequest<T>;
    try {
      transaction = database.transaction(SNAPSHOT_STORE, mode);
      request = operation(transaction.objectStore(SNAPSHOT_STORE));
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    let value: T;
    request.onsuccess = () => { value = request.result; };
    request.onerror = () => reject(request.error ?? new Error("Lettura o scrittura della sessione non riuscita."));
    transaction.oncomplete = () => {
      database.close();
      resolve(value!);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error("Transazione della sessione non riuscita."));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error("Transazione della sessione interrotta."));
    };
  }));
}

export async function loadWorkbenchSession(): Promise<WorkbenchSessionSnapshot | null> {
  const stored = await withSnapshotTransaction<unknown>("readonly", (store) => store.get(ACTIVE_SNAPSHOT_KEY));
  return stored === undefined ? null : parseWorkbenchSession(stored);
}

export async function saveWorkbenchSession(snapshot: WorkbenchSessionSnapshot): Promise<void> {
  const validated = parseWorkbenchSession(snapshot);
  await withSnapshotTransaction<IDBValidKey>("readwrite", (store) => store.put(validated, ACTIVE_SNAPSHOT_KEY));
}

export async function clearWorkbenchSession(): Promise<void> {
  await withSnapshotTransaction<undefined>("readwrite", (store) => store.delete(ACTIVE_SNAPSHOT_KEY) as IDBRequest<undefined>);
}
