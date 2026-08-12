/**
 * ProjectPulse — Colab content script
 * Tracks only hyperparameter changes and metric/error outputs.
 */

import {
  extractParams,
  extractMetrics,
  diffParams,
  hasParamChanges,
  hasMeaningfulMetrics,
  isErrorOutput,
  summarizeParamChange,
  summarizeMetrics,
  compareMetrics,
} from "../lib/extract";

const LOG_PREFIX = "[ProjectPulse:Colab]";

interface CellState {
  id: string;
  lastText: string;
  lastParams: Record<string, string>;
  lastOutputHash: string;
  lastMetrics: Record<string, string>;
  observer: MutationObserver | null;
}

const cellStates = new Map<string, CellState>();
let trackingEnabled = false;
let projectName = "";
let bodyObserver: MutationObserver | null = null;

async function checkTracking(): Promise<void> {
  try {
    const res = await chrome.runtime.sendMessage({ type: "CHECK_TRACKING" });
    trackingEnabled = !!res?.shouldTrack;
    projectName = res?.projectName ?? "";
    if (trackingEnabled) {
      console.log(LOG_PREFIX, "Tracking active for project:", projectName);
    }
  } catch {
    trackingEnabled = false;
  }
}

function getCellId(cell: Element): string {
  const id = cell.getAttribute("id") ?? cell.getAttribute("data-cell-id");
  if (id) return id;
  const idx = Array.from(document.querySelectorAll(".codecell, .cell.code")).indexOf(cell);
  return `cell-${idx}`;
}

function extractCellText(cell: Element): string {
  const monacoLines = cell.querySelectorAll(".view-line");
  if (monacoLines.length > 0) {
    return Array.from(monacoLines)
      .map((line) => line.textContent ?? "")
      .join("\n");
  }
  const textarea = cell.querySelector("textarea");
  if (textarea) return textarea.value;
  const codeEl = cell.querySelector(".input_area pre, .code_input, .CodeMirror-code");
  if (codeEl) return codeEl.textContent ?? "";
  return "";
}

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function extractCellOutput(cell: Element): string {
  const parts: string[] = [];
  cell.querySelectorAll(".output_text, .output_stderr, .output_error, pre").forEach((el) => {
    const text = el.textContent?.trim();
    if (text) parts.push(text);
  });
  return parts.join("\n").slice(0, 4000);
}

async function sendCapture(payload: {
  eventType: "param_change" | "output_change" | "error";
  summary: string;
  paramsBefore?: Record<string, unknown> | null;
  paramsAfter?: Record<string, unknown> | null;
  metricsBefore?: Record<string, unknown> | null;
  metricsAfter?: Record<string, unknown> | null;
  rawDiff?: string;
}): Promise<void> {
  if (!trackingEnabled) return;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "PULSE_CAPTURE",
      payload: {
        source: "colab",
        project: projectName,
        ...payload,
        rawDiff: payload.rawDiff ?? null,
      },
    });
    if (!response?.ok && response?.event === undefined) {
      // null event = not tracking — silent
      if (response?.error) console.warn(LOG_PREFIX, response.error);
    }
  } catch (err) {
    console.warn(LOG_PREFIX, "sendMessage error:", err);
  }
}

function handleCellTextChange(cellId: string, newText: string): void {
  const state = cellStates.get(cellId);
  if (!state || !trackingEnabled) return;

  const before = state.lastText;
  if (before === newText) return;

  const paramsBefore = extractParams(before);
  const paramsAfter = extractParams(newText);
  const { changed, paramsBefore: pb, paramsAfter: pa } = diffParams(
    paramsBefore,
    paramsAfter
  );

  state.lastText = newText;
  state.lastParams = paramsAfter;

  if (!hasParamChanges(changed)) return;

  const summary = summarizeParamChange(changed);
  console.log(LOG_PREFIX, "Param change:", summary);

  sendCapture({
    eventType: "param_change",
    summary,
    paramsBefore: pb,
    paramsAfter: pa,
    rawDiff: summary,
  });
}

function handleCellOutputChange(cellId: string, cell: Element): void {
  const state = cellStates.get(cellId);
  if (!state || !trackingEnabled) return;

  const output = extractCellOutput(cell);
  const hash = hashText(output);
  if (hash === state.lastOutputHash || !output.trim()) return;

  state.lastOutputHash = hash;

  if (isErrorOutput(output)) {
    const preview = output.replace(/\s+/g, " ").slice(0, 120);
    sendCapture({
      eventType: "error",
      summary: `Error: ${preview}`,
      rawDiff: output.slice(0, 4000),
    });
    return;
  }

  const metrics = extractMetrics(output);
  if (!hasMeaningfulMetrics(metrics)) return;

  const prevMetrics = { ...state.lastMetrics };
  const comparison = compareMetrics(prevMetrics, metrics);
  state.lastMetrics = metrics;

  sendCapture({
    eventType: "output_change",
    summary: comparison || summarizeMetrics(metrics),
    metricsBefore: Object.keys(prevMetrics).length ? prevMetrics : null,
    metricsAfter: metrics,
    rawDiff: output.slice(0, 4000),
  });
}

function observeCell(cell: Element): void {
  const cellId = getCellId(cell);
  if (cellStates.has(cellId)) return;

  const text = extractCellText(cell);
  const state: CellState = {
    id: cellId,
    lastText: text,
    lastParams: extractParams(text),
    lastOutputHash: hashText(extractCellOutput(cell)),
    lastMetrics: extractMetrics(extractCellOutput(cell)),
    observer: null,
  };
  cellStates.set(cellId, state);

  const observer = new MutationObserver(() => {
    if (!trackingEnabled) return;
    handleCellTextChange(cellId, extractCellText(cell));
    handleCellOutputChange(cellId, cell);
  });

  state.observer = observer;
  observer.observe(cell, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
}

function findCodeCells(): Element[] {
  for (const sel of [".codecell", ".cell.code", "colab-cell[cell-type='code']", "[data-cell-type='code']"]) {
    const cells = Array.from(document.querySelectorAll(sel));
    if (cells.length > 0) return cells;
  }
  return [];
}

function scanForCells(): void {
  findCodeCells().forEach(observeCell);
}

function watchForNewCells(): void {
  bodyObserver?.disconnect();
  bodyObserver = new MutationObserver((mutations) => {
    if (mutations.some((m) => m.addedNodes.length > 0)) scanForCells();
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

async function init(): Promise<void> {
  if (window.location.hostname !== "colab.research.google.com") return;

  await checkTracking();
  setInterval(checkTracking, 10_000);

  if (trackingEnabled) {
    scanForCells();
    watchForNewCells();
    setInterval(scanForCells, 5000);
  } else {
    // Re-init when tracking becomes active
    const poll = setInterval(async () => {
      await checkTracking();
      if (trackingEnabled) {
        clearInterval(poll);
        scanForCells();
        watchForNewCells();
        setInterval(scanForCells, 5000);
      }
    }, 3000);
  }

  console.log(LOG_PREFIX, "Initialized, tracking:", trackingEnabled);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => init());
} else {
  init();
}
