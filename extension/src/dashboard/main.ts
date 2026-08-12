import type { Project, PulseEvent } from "../lib/types";
import {
  endProject,
  getEvents,
  getProjectRecords,
  getSettings,
  saveSettings,
} from "../lib/storage";
import { renderEventList } from "../lib/event-render";
import { initTheme, applyTheme, resolveTheme } from "../lib/theme";
import type { ThemePreference } from "../lib/types";
import { escapeHtml } from "../lib/dom";
import {
  computeTrackedMs,
  formatTrackedTime,
  formatDate,
} from "../lib/time";

let selectedProjectId: string | null = null;
let allProjects: Project[] = [];
let allEvents: PulseEvent[] = [];

function getQueryProjectId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("project");
}

async function loadData(): Promise<void> {
  [allProjects, allEvents] = await Promise.all([
    getProjectRecords(),
    getEvents(),
  ]);
}

function renderSidebar(): void {
  const nav = document.getElementById("project-nav")!;
  const empty = document.getElementById("empty-dashboard")!;
  const projectView = document.getElementById("project-view")!;

  if (allProjects.length === 0) {
    nav.innerHTML = "";
    empty.classList.remove("hidden");
    projectView.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");

  if (!selectedProjectId || !allProjects.find((p) => p.id === selectedProjectId)) {
    selectedProjectId = allProjects[0].id;
  }

  nav.innerHTML = allProjects
    .map(
      (p) => `
      <button type="button" class="nav-item ${p.id === selectedProjectId ? "active" : ""}" data-id="${p.id}">
        <div class="nav-item-name">${escapeHtml(p.name)}</div>
        <div class="nav-item-meta">
          <span class="pill ${p.status}">${p.status}</span>
          ${p.type ? `<span class="nav-item-type">${escapeHtml(p.type)}</span>` : ""}
        </div>
      </button>
    `
    )
    .join("");

  nav.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedProjectId = btn.getAttribute("data-id");
      renderSidebar();
      renderProjectView();
    });
  });

  renderProjectView();
}

function getFilteredEvents(projectId: string): PulseEvent[] {
  const typeFilter = (document.getElementById("filter-type") as HTMLSelectElement).value;
  const fromVal = (document.getElementById("filter-from") as HTMLInputElement).value;
  const toVal = (document.getElementById("filter-to") as HTMLInputElement).value;

  let events = allEvents.filter((e) => e.projectId === projectId);

  if (typeFilter) {
    events = events.filter((e) => e.eventType === typeFilter);
  }
  if (fromVal) {
    const from = new Date(fromVal).getTime();
    events = events.filter((e) => e.timestamp >= from);
  }
  if (toVal) {
    const to = new Date(toVal).getTime() + 86_400_000;
    events = events.filter((e) => e.timestamp < to);
  }

  return events;
}

function renderProjectView(): void {
  const projectView = document.getElementById("project-view")!;
  const project = allProjects.find((p) => p.id === selectedProjectId);
  if (!project) {
    projectView.classList.add("hidden");
    return;
  }

  projectView.classList.remove("hidden");

  document.getElementById("project-title")!.textContent = project.name;
  document.getElementById("project-meta")!.textContent = project.type ?? "No type set";

  const statusEl = document.getElementById("stat-status")!;
  statusEl.innerHTML = `<span class="pill ${project.status}">${project.status}</span>`;

  document.getElementById("stat-start")!.textContent = formatDate(project.startDate);
  document.getElementById("stat-end")!.textContent =
    project.status === "active" ? "Ongoing" : formatDate(project.endDate);

  const tracked = computeTrackedMs(allEvents, project);
  document.getElementById("stat-hours")!.textContent = formatTrackedTime(tracked);

  const events = getFilteredEvents(project.id);
  document.getElementById("timeline")!.innerHTML = renderEventList(events);

  const endBtn = document.getElementById("end-project-btn") as HTMLButtonElement;
  endBtn.disabled = project.status === "ended";
  endBtn.textContent = project.status === "ended" ? "Archived" : "End Project";
}

function exportProject(format: "json" | "markdown"): void {
  const project = allProjects.find((p) => p.id === selectedProjectId);
  if (!project) return;

  const events = allEvents.filter((e) => e.projectId === project.id);
  const tracked = formatTrackedTime(computeTrackedMs(allEvents, project));

  let content: string;
  let filename: string;
  let mime: string;

  if (format === "json") {
    content = JSON.stringify({ project, events, trackedTime: tracked }, null, 2);
    filename = `${project.name.replace(/\s+/g, "_")}_timeline.json`;
    mime = "application/json";
  } else {
    const lines = [
      `# ${project.name}`,
      ``,
      `**Type:** ${project.type ?? "—"}`,
      `**Status:** ${project.status}`,
      `**Started:** ${formatDate(project.startDate)}`,
      `**Ended:** ${project.status === "active" ? "Ongoing" : formatDate(project.endDate)}`,
      `**Time tracked:** ${tracked}`,
      ``,
      `## Timeline`,
      ``,
      ...events.map(
        (e) =>
          `- **${new Date(e.timestamp).toLocaleString()}** [${e.source}/${e.eventType}] ${e.summary}`
      ),
    ];
    content = lines.join("\n");
    filename = `${project.name.replace(/\s+/g, "_")}_timeline.md`;
    mime = "text/markdown";
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadSettings(): Promise<void> {
  const settings = await getSettings();
  (document.getElementById("groq-key") as HTMLInputElement).value = settings.groqApiKey;
  (document.getElementById("theme-select") as HTMLSelectElement).value = settings.theme;
}

async function init(): Promise<void> {
  await initTheme();
  await loadData();
  await loadSettings();

  const queryId = getQueryProjectId();
  if (queryId) selectedProjectId = queryId;

  renderSidebar();

  document.getElementById("theme-toggle")!.addEventListener("click", async () => {
    const settings = await getSettings();
    const current = resolveTheme(settings.theme);
    const next: ThemePreference = current === "dark" ? "light" : "dark";
    await saveSettings({ theme: next });
    applyTheme(next);
    (document.getElementById("theme-select") as HTMLSelectElement).value = next;
  });

  document.getElementById("theme-select")!.addEventListener("change", async (e) => {
    const theme = (e.target as HTMLSelectElement).value as ThemePreference;
    await saveSettings({ theme });
    applyTheme(resolveTheme(theme));
  });

  document.getElementById("end-project-btn")!.addEventListener("click", async () => {
    if (!selectedProjectId) return;
    if (!confirm("End this project? It will become read-only.")) return;
    await endProject(selectedProjectId);
    await loadData();
    renderSidebar();
  });

  document.getElementById("export-json-btn")!.addEventListener("click", () => exportProject("json"));
  document.getElementById("export-md-btn")!.addEventListener("click", () => exportProject("markdown"));

  document.getElementById("new-project-sidebar")!.addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/popup/index.html#wizard") });
  });

  ["filter-type", "filter-from", "filter-to"].forEach((id) => {
    document.getElementById(id)!.addEventListener("change", () => renderProjectView());
  });

  document.getElementById("save-settings")!.addEventListener("click", async () => {
    const key = (document.getElementById("groq-key") as HTMLInputElement).value.trim();
    await saveSettings({ groqApiKey: key });
    showSettingsStatus("Settings saved.", "ok");
  });

  document.getElementById("test-groq")!.addEventListener("click", async () => {
    const key = (document.getElementById("groq-key") as HTMLInputElement).value.trim();
    if (!key) {
      showSettingsStatus("Enter an API key first.", "err");
      return;
    }
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: "Reply with exactly: OK" }],
          max_tokens: 5,
        }),
      });
      if (res.ok) showSettingsStatus("Connection successful.", "ok");
      else if (res.status === 401) showSettingsStatus("Invalid API key.", "err");
      else showSettingsStatus(`API error: ${res.status}`, "err");
    } catch (err) {
      showSettingsStatus(`Network error: ${String(err)}`, "err");
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.projectpulse_data) {
      loadData().then(() => {
        renderSidebar();
      });
    }
  });
}

function showSettingsStatus(msg: string, type: "ok" | "err"): void {
  const el = document.getElementById("settings-status")!;
  el.textContent = msg;
  el.className = `settings-status ${type}`;
}

init();
