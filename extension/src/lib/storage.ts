import type { PulseEvent, Project, ProjectMapping, StorageSchema } from "./types";
import {
  DEFAULT_PROJECT_MAPPINGS,
  DEFAULT_SETTINGS,
} from "./types";
import { generateId } from "./uuid";

const STORAGE_KEY = "projectpulse_data";
const DB_NAME = "projectpulse";
const DB_VERSION = 1;
const BLOB_STORE = "blobs";

type StoredData = Pick<
  StorageSchema,
  "events" | "projectRecords" | "projectMappings" | "settings"
>;

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

function migrateData(raw: Partial<StoredData> | undefined): StoredData {
  const events = (raw?.events ?? []).map((e) => {
    const ev = e as PulseEvent & { projectId?: string };
    return {
      ...ev,
      projectId: ev.projectId ?? ev.project ?? "legacy",
    };
  });

  return {
    events,
    projectRecords: raw?.projectRecords ?? [],
    projectMappings: raw?.projectMappings ?? { ...DEFAULT_PROJECT_MAPPINGS },
    settings: { ...DEFAULT_SETTINGS, ...raw?.settings },
  };
}

async function readData(): Promise<StoredData> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return migrateData(result[STORAGE_KEY] as Partial<StoredData> | undefined);
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
  if (data.events.length > 5000) {
    data.events = data.events.slice(0, 5000);
  }
  await writeData(data);
}

export async function getEvents(): Promise<PulseEvent[]> {
  const data = await readData();
  return data.events;
}

export async function getEventsForProject(projectId: string): Promise<PulseEvent[]> {
  const events = await getEvents();
  return events.filter((e) => e.projectId === projectId);
}

export async function getProjectRecords(): Promise<Project[]> {
  const data = await readData();
  return data.projectRecords;
}

export async function getActiveProjects(): Promise<Project[]> {
  const records = await getProjectRecords();
  return records.filter((p) => p.status === "active");
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  const records = await getProjectRecords();
  return records.find((p) => p.id === id);
}

export async function createProject(input: {
  name: string;
  type?: string;
  trackedTabIds: number[];
  autoTrackColabGithub: boolean;
}): Promise<Project> {
  const data = await readData();
  const project: Project = {
    id: generateId(),
    name: input.name.trim(),
    type: input.type?.trim() || undefined,
    status: "active",
    startDate: Date.now(),
    trackedTabIds: [...input.trackedTabIds],
    autoTrackColabGithub: input.autoTrackColabGithub,
  };
  data.projectRecords.unshift(project);
  await writeData(data);
  return project;
}

export async function endProject(projectId: string): Promise<Project | null> {
  const data = await readData();
  const idx = data.projectRecords.findIndex((p) => p.id === projectId);
  if (idx === -1) return null;
  data.projectRecords[idx] = {
    ...data.projectRecords[idx],
    status: "ended",
    endDate: Date.now(),
  };
  await writeData(data);
  return data.projectRecords[idx];
}

export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, "trackedTabIds" | "autoTrackColabGithub" | "type" | "name">>
): Promise<Project | null> {
  const data = await readData();
  const idx = data.projectRecords.findIndex((p) => p.id === projectId);
  if (idx === -1) return null;
  data.projectRecords[idx] = { ...data.projectRecords[idx], ...updates };
  await writeData(data);
  return data.projectRecords[idx];
}

export function isTrackableUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "colab.research.google.com" || host === "github.com";
  } catch {
    return false;
  }
}

export function resolveProjectForTab(
  projects: Project[],
  tabId: number,
  url: string
): Project | null {
  const active = projects.filter((p) => p.status === "active");
  const byTab = active.find((p) => p.trackedTabIds.includes(tabId));
  if (byTab) return byTab;

  if (!isTrackableUrl(url)) return null;

  const autoProjects = active
    .filter((p) => p.autoTrackColabGithub)
    .sort((a, b) => b.startDate - a.startDate);
  return autoProjects[0] ?? null;
}

export async function clearEvents(): Promise<void> {
  const data = await readData();
  data.events = [];
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

export async function getAllData(): Promise<StoredData> {
  return readData();
}
