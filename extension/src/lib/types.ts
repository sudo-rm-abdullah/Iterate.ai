/** Shared event shape stored in chrome.storage.local (metadata) + IndexedDB (blobs). */
export type EventSource = "colab" | "github";

export type EventType =
  | "param_change"
  | "output_change"
  | "commit"
  | "error"
  | "note";

export type ProjectStatus = "active" | "ended";

export type ThemePreference = "system" | "light" | "dark";

export interface Project {
  id: string;
  name: string;
  type?: string;
  status: ProjectStatus;
  startDate: number;
  endDate?: number;
  /** Explicitly assigned tab IDs to track */
  trackedTabIds: number[];
  /** Auto-track any Colab/GitHub tab for this project */
  autoTrackColabGithub: boolean;
}

export interface PulseEvent {
  id: string;
  timestamp: number;
  source: EventSource;
  projectId: string;
  project: string;
  eventType: EventType;
  summary: string;
  paramsBefore: Record<string, unknown> | null;
  paramsAfter: Record<string, unknown> | null;
  metricsBefore: Record<string, unknown> | null;
  metricsAfter: Record<string, unknown> | null;
  rawDiffRef: string | null;
  agentSummary?: {
    text: string;
    timestamp: number;
  };
}

export interface ProjectMapping {
  colabNotebooks: Record<string, string>;
  githubRepos: Record<string, string>;
  linkedProjects: Record<string, string>;
}

export interface StorageSchema {
  events: PulseEvent[];
  projectRecords: Project[];
  projectMappings: ProjectMapping;
  settings: {
    groqApiKey: string;
    analysisIntervalEvents: number;
    autoAnalyze: boolean;
    theme: ThemePreference;
  };
}

export const DEFAULT_SETTINGS: StorageSchema["settings"] = {
  groqApiKey: "",
  analysisIntervalEvents: 10,
  autoAnalyze: false,
  theme: "system",
};

export const DEFAULT_PROJECT_MAPPINGS: ProjectMapping = {
  colabNotebooks: {},
  githubRepos: {},
  linkedProjects: {},
};

export const PROJECT_TYPE_SUGGESTIONS = [
  "Computer Vision",
  "NLP",
  "Data Analysis",
  "Web Dev",
  "Other",
] as const;

export const IDLE_GAP_MS = 15 * 60 * 1000;
