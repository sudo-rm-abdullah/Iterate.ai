import { getEvents, clearEvents } from "../lib/storage";
import type { PulseEvent } from "../lib/types";

const eventList = document.getElementById("event-list")!;
const emptyState = document.getElementById("empty-state")!;
const eventCount = document.getElementById("event-count")!;
const refreshBtn = document.getElementById("refresh-btn")!;
const clearBtn = document.getElementById("clear-btn")!;
const optionsLink = document.getElementById("options-link")!;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function renderEvent(event: PulseEvent): HTMLLIElement {
  const li = document.createElement("li");
  li.className = `event-card type-${event.eventType}`;
  li.dataset.id = event.id;

  li.innerHTML = `
    <div class="event-meta">
      <span class="source-tag ${event.source}">${event.source}</span>
      <span class="event-type">${event.eventType.replace("_", " ")}</span>
      <span class="event-time">${formatTime(event.timestamp)}</span>
    </div>
    <div class="event-project">${escapeHtml(event.project)}</div>
    <div class="event-summary">${escapeHtml(event.summary)}</div>
  `;

  return li;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function loadEvents(): Promise<void> {
  const events = await getEvents();
  eventCount.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;
  eventList.innerHTML = "";

  if (events.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  for (const event of events) {
    eventList.appendChild(renderEvent(event));
  }
}

refreshBtn.addEventListener("click", () => loadEvents());

clearBtn.addEventListener("click", async () => {
  if (!confirm("Clear all captured events? This cannot be undone.")) return;
  await clearEvents();
  await loadEvents();
});

optionsLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "EVENT_ADDED") {
    loadEvents();
  }
});

loadEvents();
