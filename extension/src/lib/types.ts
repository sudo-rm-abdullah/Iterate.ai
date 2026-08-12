/** Shared event shape stored in chrome.storage.local (metadata) + IndexedDB (blobs). */
export type EventSource = "colab" | "github";

export type EventType =
  | "param_change"
  | "output_change"
  | "commit"
  | "error"
  | "note"
  | "raw"; // Phase 2: unparsed capture before regex extraction

export interface PulseEvent {
  id: string;
  timestamp: number;
  source: EventSource;
  project: string;
  eventType: EventType;
  summary: string;
  paramsBefore: Record<string, unknown> | null;
  paramsAfter: Record<string, unknown> | null;
  metricsBefore: Record<string, unknown> | null;
  metricsAfter: Record<string, unknown> | null;
  rawDiffRef: string | null;
  /** Optional agent summary attached later (Phase 6). */
  agentSummary?: {
    text: string;
    timestamp: number;
  };
}

export interface ProjectMapping {
  /** Colab notebook title → custom project name */
  colabNotebooks: Record<string, string>;
  /** GitHub repo full name → custom project name */
  githubRepos: Record<string, string>;
  /** Explicit links: notebook title → repo full name */
  linkedProjects: Record<string, string>;
}

export interface StorageSchema {
  events: PulseEvent[];
  projects: string[];
  projectMappings: ProjectMapping;
  settings: {
    groqApiKey: string;
    analysisIntervalEvents: number;
    autoAnalyze: boolean;
  };
}

export const DEFAULT_SETTINGS: StorageSchema["settings"] = {
  groqApiKey: "",
  analysisIntervalEvents: 10,
  autoAnalyze: false,
};

export const DEFAULT_PROJECT_MAPPINGS: ProjectMapping = {
  colabNotebooks: {},
  githubRepos: {},
  linkedProjects: {},
};
