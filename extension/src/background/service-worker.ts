/**
 * Phase 2: raw event ingestion from content scripts.
 * Background service worker persists events and notifies popup listeners.
 */

import { addEvent, resolveProjectName, getProjectMappings } from "../lib/storage";
import type { PulseEvent } from "../lib/types";
import { generateId } from "../lib/uuid";

interface IncomingEventPayload {
  source: "colab" | "github";
  project: string;
  eventType: PulseEvent["eventType"];
  summary: string;
  paramsBefore?: Record<string, unknown> | null;
  paramsAfter?: Record<string, unknown> | null;
  metricsBefore?: Record<string, unknown> | null;
  metricsAfter?: Record<string, unknown> | null;
  rawDiff?: string | null;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("[ProjectPulse] Extension installed");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PULSE_CAPTURE") {
    handleCapture(message.payload as IncomingEventPayload)
      .then((event) => sendResponse({ ok: true, event }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type === "PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  return false;
});

async function handleCapture(payload: IncomingEventPayload): Promise<PulseEvent> {
  const mappings = await getProjectMappings();
  const project = resolveProjectName(payload.source, payload.project, mappings);

  let rawDiffRef: string | null = null;
  if (payload.rawDiff && payload.rawDiff.length > 0) {
    rawDiffRef = generateId();
    const { saveBlob } = await import("../lib/storage");
    await saveBlob(rawDiffRef, payload.rawDiff);
  }

  const event: PulseEvent = {
    id: generateId(),
    timestamp: Date.now(),
    source: payload.source,
    project,
    eventType: payload.eventType,
    summary: payload.summary,
    paramsBefore: payload.paramsBefore ?? null,
    paramsAfter: payload.paramsAfter ?? null,
    metricsBefore: payload.metricsBefore ?? null,
    metricsAfter: payload.metricsAfter ?? null,
    rawDiffRef,
  };

  await addEvent(event);

  chrome.runtime.sendMessage({ type: "EVENT_ADDED", event }).catch(() => {
    // Popup may not be open — ignore
  });

  return event;
}
