import { IDLE_GAP_MS } from "./types";
import type { PulseEvent, Project } from "./types";

/** Idle-aware tracked time: gaps > 15 min between events are not counted. */
export function computeTrackedMs(
  events: PulseEvent[],
  project: Project
): number {
  const projectEvents = events
    .filter((e) => e.projectId === project.id)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (projectEvents.length === 0) return 0;

  const endBound = project.endDate ?? Date.now();
  let total = 0;

  for (let i = 0; i < projectEvents.length - 1; i++) {
    const gap = projectEvents[i + 1].timestamp - projectEvents[i].timestamp;
    if (gap > 0 && gap <= IDLE_GAP_MS) {
      total += gap;
    }
  }

  // Count activity window after last event (capped at idle gap)
  const lastTs = projectEvents[projectEvents.length - 1].timestamp;
  const tail = Math.min(endBound - lastTs, IDLE_GAP_MS);
  if (tail > 0) total += tail;

  return total;
}

export function formatTrackedTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min tracked`;
  return `${hours} hrs ${minutes} min tracked`;
}

export function formatDate(ts: number | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
