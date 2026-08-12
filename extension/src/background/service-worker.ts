/**
 * Background service worker — event ingestion, project routing, tab tracking.
 */

import {
  addEvent,
  getProjectRecords,
  resolveProjectForTab,
  getProjectById,
} from "../lib/storage";
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PULSE_CAPTURE") {
    handleCapture(message.payload as IncomingEventPayload, sender.tab?.id, sender.tab?.url)
      .then((event) => sendResponse({ ok: true, event }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type === "CHECK_TRACKING") {
    resolveTracking(sender.tab?.id, sender.tab?.url ?? message.url)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ shouldTrack: false, error: String(err) }));
    return true;
  }

  if (message?.type === "GET_TABS") {
    chrome.tabs
      .query({ currentWindow: true })
      .then((tabs) => sendResponse({ ok: true, tabs }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type === "OPEN_DASHBOARD") {
    const projectId = message.projectId as string | undefined;
    openDashboard(projectId).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "PING") {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return false;
  }

  return false;
});

async function resolveTracking(
  tabId?: number,
  url?: string
): Promise<{
  shouldTrack: boolean;
  projectId?: string;
  projectName?: string;
  readOnly?: boolean;
}> {
  if (!tabId || !url) return { shouldTrack: false };

  const projects = await getProjectRecords();
  const project = resolveProjectForTab(projects, tabId, url);

  if (!project) return { shouldTrack: false };

  return {
    shouldTrack: project.status === "active",
    projectId: project.id,
    projectName: project.name,
    readOnly: project.status === "ended",
  };
}

async function handleCapture(
  payload: IncomingEventPayload,
  tabId?: number,
  url?: string
): Promise<PulseEvent | null> {
  const tracking = await resolveTracking(tabId, url);
  if (!tracking.shouldTrack || !tracking.projectId) {
    return null;
  }

  const project = await getProjectById(tracking.projectId);
  if (!project || project.status !== "active") return null;

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
    projectId: project.id,
    project: project.name,
    eventType: payload.eventType,
    summary: payload.summary,
    paramsBefore: payload.paramsBefore ?? null,
    paramsAfter: payload.paramsAfter ?? null,
    metricsBefore: payload.metricsBefore ?? null,
    metricsAfter: payload.metricsAfter ?? null,
    rawDiffRef,
  };

  await addEvent(event);

  chrome.runtime.sendMessage({ type: "EVENT_ADDED", event }).catch(() => {});

  return event;
}

async function openDashboard(projectId?: string): Promise<void> {
  const base = chrome.runtime.getURL("src/dashboard/index.html");
  const url = projectId ? `${base}?project=${projectId}` : base;
  await chrome.tabs.create({ url });
}
