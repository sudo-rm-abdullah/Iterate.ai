import type { PulseEvent } from "./types";
import { escapeHtml, formatEventTime } from "./dom";

export function renderEventCard(event: PulseEvent): string {
  const typeClass = event.eventType.replace("_", "-");
  return `
    <article class="event-card type-${event.eventType}" data-id="${event.id}">
      <div class="event-meta">
        <span class="tag ${event.source}">${event.source}</span>
        <span class="tag ${typeClass}">${event.eventType.replace("_", " ")}</span>
        <span class="event-time">${formatEventTime(event.timestamp)}</span>
      </div>
      <div class="event-summary mono-data">${escapeHtml(event.summary)}</div>
    </article>
  `;
}

export function renderEventList(events: PulseEvent[]): string {
  if (events.length === 0) {
    return `<p class="empty-msg">No tracked events yet.</p>`;
  }
  return events.map(renderEventCard).join("");
}
