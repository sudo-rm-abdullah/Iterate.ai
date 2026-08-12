import type { PulseEvent, ProjectMapping, StorageSchema } from "./types";
import {
  DEFAULT_PROJECT_MAPPINGS,
  DEFAULT_SETTINGS,
} from "./types";

const STORAGE_KEY = "projectpulse_data";
const DB_NAME = "projectpulse";
const DB_VERSION = 1;
const BLOB_STORE = "blobs";

type StoredData = Pick<StorageSchema, "events" | "projects" | "projectMappings" | "settings">;

async function getDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
  });
}

export async function saveBlob(id: string, data: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.objectStore(BLOB_STORE).put(data, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBlob(id: string): Promise<string | null> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readonly");
    const request = tx.objectStore(BLOB_STORE).get(id);
    request.onsuccess = () => resolve((request.result as string) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function readData(): Promise<StoredData> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const data = result[STORAGE_KEY] as StoredData | undefined;
  return {
    events: data?.events ?? [],
    projects: data?.projects ?? [],
    projectMappings: data?.projectMappings ?? { ...DEFAULT_PROJECT_MAPPINGS },
    settings: { ...DEFAULT_SETTINGS, ...data?.settings },
  };
}

async function writeData(data: StoredData): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

export function resolveProjectName(
  source: "colab" | "github",
  rawName: string,
  mappings: ProjectMapping
): string {
  if (source === "colab") {
    const custom = mappings.colabNotebooks[rawName];
    if (custom) return custom;
    const linkedRepo = mappings.linkedProjects[rawName];
    if (linkedRepo) {
      return mappings.githubRepos[linkedRepo] ?? linkedRepo;
    }
    return rawName;
  }
  return mappings.githubRepos[rawName] ?? rawName;
}

export async function addEvent(event: PulseEvent): Promise<void> {
  const data = await readData();
  data.events.unshift(event);
  if (!data.projects.includes(event.project)) {
    data.projects.push(event.project);
  }
  // Keep last 5000 events to avoid quota issues
  if (data.events.length > 5000) {
    data.events = data.events.slice(0, 5000);
  }
  await writeData(data);
}

export async function getEvents(): Promise<PulseEvent[]> {
  const data = await readData();
  return data.events;
}

export async function getProjects(): Promise<string[]> {
  const data = await readData();
  return data.projects;
}

export async function clearEvents(): Promise<void> {
  const data = await readData();
  data.events = [];
  data.projects = [];
  await writeData(data);
}

export async function getSettings(): Promise<StorageSchema["settings"]> {
  const data = await readData();
  return data.settings;
}

export async function saveSettings(
  settings: Partial<StorageSchema["settings"]>
): Promise<void> {
  const data = await readData();
  data.settings = { ...data.settings, ...settings };
  await writeData(data);
}

export async function getProjectMappings(): Promise<ProjectMapping> {
  const data = await readData();
  return data.projectMappings;
}

export async function saveProjectMappings(
  mappings: Partial<ProjectMapping>
): Promise<void> {
  const data = await readData();
  data.projectMappings = {
    ...data.projectMappings,
    ...mappings,
    colabNotebooks: {
      ...data.projectMappings.colabNotebooks,
      ...mappings.colabNotebooks,
    },
    githubRepos: {
      ...data.projectMappings.githubRepos,
      ...mappings.githubRepos,
    },
    linkedProjects: {
      ...data.projectMappings.linkedProjects,
      ...mappings.linkedProjects,
    },
  };
  await writeData(data);
}
