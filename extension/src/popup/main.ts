import { PROJECT_TYPE_SUGGESTIONS } from "../lib/types";
import {
  createProject,
  getActiveProjects,
  getEvents,
  getProjectRecords,
  isTrackableUrl,
} from "../lib/storage";
import { renderEventList } from "../lib/event-render";
import { initTheme, toggleTheme } from "../lib/theme";
import { escapeHtml } from "../lib/dom";
import { formatTrackedTime, computeTrackedMs } from "../lib/time";

type View = "landing" | "wizard" | "quick";

let currentStep = 1;
let selectedTabIds: Set<number> = new Set();

const views = {
  landing: document.getElementById("view-landing")!,
  wizard: document.getElementById("view-wizard")!,
  quick: document.getElementById("view-quick")!,
};

function showView(view: View): void {
  Object.values(views).forEach((el) => el.classList.add("hidden"));
  views[view].classList.remove("hidden");
}

function setupThemeToggles(): void {
  document.querySelectorAll(".theme-toggle").forEach((btn) => {
    btn.addEventListener("click", () => toggleTheme());
  });
}

function renderTypeChips(): void {
  const container = document.getElementById("type-chips")!;
  const input = document.getElementById("project-type") as HTMLInputElement;
  container.innerHTML = PROJECT_TYPE_SUGGESTIONS.map(
    (t) => `<button type="button" class="chip" data-type="${escapeHtml(t)}">${escapeHtml(t)}</button>`
  ).join("");

  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const type = chip.getAttribute("data-type")!;
      input.value = type;
      container.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
    });
  });
}

async function loadTabsForWizard(): Promise<void> {
  const list = document.getElementById("tab-list")!;
  list.innerHTML = `<p class="empty-msg">Loading tabs…</p>`;

  const [tabsRes, activeTab] = await Promise.all([
    chrome.runtime.sendMessage({ type: "GET_TABS" }),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);

  const tabs: chrome.tabs.Tab[] = tabsRes?.tabs ?? [];
  const activeId = activeTab[0]?.id;
  selectedTabIds = new Set();

  if (tabs.length === 0) {
    list.innerHTML = `<p class="empty-msg">No tabs found in this window.</p>`;
    return;
  }

  list.innerHTML = tabs
    .filter((t) => t.id !== undefined)
    .map((tab) => {
      const trackable = isTrackableUrl(tab.url ?? "");
      const checked =
        trackable &&
        (tab.id === activeId || selectedTabIds.has(tab.id!));
      if (checked && tab.id) selectedTabIds.add(tab.id);

      return `
        <label class="tab-item">
          <input type="checkbox" data-tab-id="${tab.id}" ${checked ? "checked" : ""} ${!trackable ? "disabled" : ""} />
          <div class="tab-item-info">
            <div class="tab-title">${escapeHtml(tab.title ?? "Untitled")}</div>
            <div class="tab-url">${escapeHtml(tab.url ?? "")}</div>
          </div>
        </label>
      `;
    })
    .join("");

  list.querySelectorAll("input[data-tab-id]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const id = parseInt((e.target as HTMLInputElement).dataset.tabId!, 10);
      if ((e.target as HTMLInputElement).checked) {
        selectedTabIds.add(id);
      } else {
        selectedTabIds.delete(id);
      }
    });
  });
}

function updateWizardStep(): void {
  for (let i = 1; i <= 3; i++) {
    document.getElementById(`wizard-step-${i}`)?.classList.toggle("hidden", i !== currentStep);
    document.querySelector(`.step-dot[data-step="${i}"]`)?.classList.toggle("active", i === currentStep);
  }

  const backBtn = document.getElementById("wizard-back")!;
  const nextBtn = document.getElementById("wizard-next")!;

  backBtn.classList.toggle("hidden", currentStep === 1);
  nextBtn.textContent = currentStep === 3 ? "Start Tracking" : "Next";
}

async function finishWizard(): Promise<void> {
  const name = (document.getElementById("project-name") as HTMLInputElement).value.trim();
  if (!name) {
    alert("Project name is required.");
    currentStep = 1;
    updateWizardStep();
    return;
  }

  const type = (document.getElementById("project-type") as HTMLInputElement).value.trim();
  const autoTrack = (document.getElementById("auto-track") as HTMLInputElement).checked;

  const tabIds = Array.from(selectedTabIds);
  await createProject({
    name,
    type: type || undefined,
    trackedTabIds: tabIds,
    autoTrackColabGithub: autoTrack,
  });

  currentStep = 1;
  (document.getElementById("project-name") as HTMLInputElement).value = "";
  (document.getElementById("project-type") as HTMLInputElement).value = "";

  await renderQuickView();
  showView("quick");
}

async function renderQuickView(): Promise<void> {
  const [projects, events] = await Promise.all([
    getActiveProjects(),
    getEvents(),
  ]);

  const container = document.getElementById("active-projects")!;
  if (projects.length === 0) {
    showView("landing");
    return;
  }

  container.innerHTML = projects
    .map((p) => {
      const tracked = computeTrackedMs(events, p);
      return `
        <div class="project-chip">
          <div>
            <div class="project-chip-name">${escapeHtml(p.name)}</div>
            ${p.type ? `<div class="project-chip-type">${escapeHtml(p.type)}</div>` : ""}
          </div>
          <span class="pill active">Active</span>
        </div>
        <div class="mono" style="font-size:10px;color:var(--text-muted);padding:0 2px 8px;font-family:var(--font-mono)">
          ${formatTrackedTime(tracked)}
        </div>
      `;
    })
    .join("");

  const recent = events.slice(0, 8);
  document.getElementById("recent-events")!.innerHTML = renderEventList(recent);
}

async function init(): Promise<void> {
  await initTheme();
  setupThemeToggles();
  renderTypeChips();

  const allProjects = await getProjectRecords();
  const hasAny = allProjects.length > 0;
  const hasActive = (await getActiveProjects()).length > 0;

  if (!hasAny) {
    showView("landing");
  } else if (hasActive) {
    await renderQuickView();
    showView("quick");
  } else {
    showView("landing");
  }

  if (window.location.hash === "#wizard") {
    currentStep = 1;
    updateWizardStep();
    loadTabsForWizard();
    showView("wizard");
  }

  document.getElementById("start-tracking-btn")!.addEventListener("click", () => {
    currentStep = 1;
    updateWizardStep();
    showView("wizard");
  });

  document.getElementById("new-project-btn")?.addEventListener("click", () => {
    currentStep = 1;
    updateWizardStep();
    loadTabsForWizard();
    showView("wizard");
  });

  document.getElementById("dashboard-btn")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
  });

  document.getElementById("wizard-back")!.addEventListener("click", () => {
    if (currentStep > 1) {
      currentStep--;
      updateWizardStep();
    }
  });

  document.getElementById("wizard-next")!.addEventListener("click", async () => {
    if (currentStep === 1) {
      const name = (document.getElementById("project-name") as HTMLInputElement).value.trim();
      if (!name) {
        alert("Project name is required.");
        return;
      }
      currentStep = 2;
      updateWizardStep();
    } else if (currentStep === 2) {
      currentStep = 3;
      await loadTabsForWizard();
      updateWizardStep();
    } else {
      await finishWizard();
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "EVENT_ADDED") {
      renderQuickView();
    }
  });
}

init();
