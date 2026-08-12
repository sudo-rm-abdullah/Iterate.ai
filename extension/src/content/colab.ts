/**
 * ProjectPulse — Colab content script (Phase 2)
 *
 * Detects notebook identity, watches code cells for edits and execution output,
 * and sends raw capture events to the background service worker.
 */

const LOG_PREFIX = "[ProjectPulse:Colab]";

interface CellState {
  id: string;
  lastText: string;
  lastOutputHash: string;
  observer: MutationObserver | null;
}

const cellStates = new Map<string, CellState>();
let notebookTitle = "Untitled Notebook";
let titleObserver: MutationObserver | null = null;
let bodyObserver: MutationObserver | null = null;

// ---------------------------------------------------------------------------
// Notebook identity
// ---------------------------------------------------------------------------

function detectNotebookTitle(): string {
  const filenameInput = document.querySelector<HTMLInputElement>(
    "input#filename-input, input.filename-input, colab-toolbar-button[aria-label*='Rename'] + input"
  );
  if (filenameInput?.value?.trim()) {
    return filenameInput.value.trim();
  }

  const titleEl = document.querySelector<HTMLElement>(
    ".notebook-name, #notebook-name, [data-testid='notebook-title']"
  );
  if (titleEl?.textContent?.trim()) {
    return titleEl.textContent.trim();
  }

  const docTitle = document.title
    .replace(/\s*-\s*Colab.*$/i, "")
    .replace(/\.ipynb$/i, "")
    .trim();
  if (docTitle && docTitle !== "Google Colaboratory") {
    return docTitle;
  }

  return "Untitled Notebook";
}

function refreshNotebookTitle(): void {
  const next = detectNotebookTitle();
  if (next !== notebookTitle) {
    console.log(LOG_PREFIX, "Notebook title:", next);
    notebookTitle = next;
  }
}

function watchNotebookTitle(): void {
  refreshNotebookTitle();

  titleObserver?.disconnect();
  titleObserver = new MutationObserver(() => refreshNotebookTitle());
  titleObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["value", "aria-label"],
  });

  const filenameInput = document.querySelector("input#filename-input");
  if (filenameInput) {
    filenameInput.addEventListener("change", refreshNotebookTitle);
    filenameInput.addEventListener("input", refreshNotebookTitle);
  }
}

// ---------------------------------------------------------------------------
// Cell text extraction (Colab uses Monaco editor)
// ---------------------------------------------------------------------------

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

  const textOutputs = cell.querySelectorAll(
    ".output_text, .output_stderr, .output_error, pre"
  );
  textOutputs.forEach((el) => {
    const text = el.textContent?.trim();
    if (text) parts.push(text);
  });

  const imgAlts = cell.querySelectorAll(".output_area img");
  imgAlts.forEach((img) => {
    parts.push(`[image: ${img.getAttribute("src")?.slice(0, 80) ?? "plot"}]`);
  });

  return parts.join("\n").slice(0, 4000);
}

function isErrorOutput(output: string): boolean {
  return /error|exception|traceback|errno/i.test(output);
}

// ---------------------------------------------------------------------------
// Diff helpers
// ---------------------------------------------------------------------------

function computeLineDiff(before: string, after: string): string {
  if (before === after) return "";
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");

  const removed = beforeLines.filter((l) => !afterLines.includes(l));
  const added = afterLines.filter((l) => !beforeLines.includes(l));

  const chunks: string[] = [];
  if (removed.length) chunks.push(`- ${removed.join("\n- ")}`);
  if (added.length) chunks.push(`+ ${added.join("\n+ ")}`);
  return chunks.join("\n").slice(0, 8000);
}

function summarizeEdit(before: string, after: string): string {
  const diff = computeLineDiff(before, after);
  const preview = diff.split("\n").slice(0, 3).join(" | ");
  return preview || "Code cell edited";
}

// ---------------------------------------------------------------------------
// Event dispatch
// ---------------------------------------------------------------------------

async function sendCapture(payload: {
  eventType: "raw" | "output_change" | "error";
  summary: string;
  rawDiff?: string;
}): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "PULSE_CAPTURE",
      payload: {
        source: "colab",
        project: notebookTitle,
        eventType: payload.eventType,
        summary: payload.summary,
        paramsBefore: null,
        paramsAfter: null,
        metricsBefore: null,
        metricsAfter: null,
        rawDiff: payload.rawDiff ?? null,
      },
    });
    if (!response?.ok) {
      console.warn(LOG_PREFIX, "Capture failed:", response?.error);
    }
  } catch (err) {
    console.warn(LOG_PREFIX, "sendMessage error:", err);
  }
}

// ---------------------------------------------------------------------------
// Per-cell observation
// ---------------------------------------------------------------------------

function handleCellTextChange(cellId: string, newText: string): void {
  const state = cellStates.get(cellId);
  if (!state) return;

  const before = state.lastText;
  if (before === newText) return;

  const diff = computeLineDiff(before, newText);
  state.lastText = newText;

  if (!before && !newText.trim()) return;

  console.log(LOG_PREFIX, "Cell edit:", cellId);
  sendCapture({
    eventType: "raw",
    summary: `Cell edited: ${summarizeEdit(before, newText)}`,
    rawDiff: diff || undefined,
  });
}

function handleCellOutputChange(cellId: string, cell: Element): void {
  const state = cellStates.get(cellId);
  if (!state) return;

  const output = extractCellOutput(cell);
  const hash = hashText(output);
  if (hash === state.lastOutputHash) return;

  const hadOutput = state.lastOutputHash !== "";
  state.lastOutputHash = hash;

  if (!output.trim()) return;

  const isError = isErrorOutput(output);
  const preview = output.replace(/\s+/g, " ").slice(0, 120);

  console.log(LOG_PREFIX, isError ? "Cell error:" : "Cell output:", cellId);
  sendCapture({
    eventType: isError ? "error" : "output_change",
    summary: isError
      ? `Execution error in ${cellId}: ${preview}`
      : `Cell output in ${cellId}: ${preview}`,
    rawDiff: output.slice(0, 8000),
  });

  void hadOutput; // future: compare metrics before/after in Phase 3
}

function observeCell(cell: Element): void {
  const cellId = getCellId(cell);
  if (cellStates.has(cellId)) return;

  const state: CellState = {
    id: cellId,
    lastText: extractCellText(cell),
    lastOutputHash: hashText(extractCellOutput(cell)),
    observer: null,
  };
  cellStates.set(cellId, state);

  const observer = new MutationObserver(() => {
    const newText = extractCellText(cell);
    handleCellTextChange(cellId, newText);
    handleCellOutputChange(cellId, cell);
  });

  state.observer = observer;
  observer.observe(cell, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });

  console.log(LOG_PREFIX, "Watching cell:", cellId);
}

function findCodeCells(): Element[] {
  const selectors = [
    ".codecell",
    ".cell.code",
    "colab-cell[cell-type='code']",
    "[data-cell-type='code']",
  ];
  for (const sel of selectors) {
    const cells = Array.from(document.querySelectorAll(sel));
    if (cells.length > 0) return cells;
  }
  return [];
}

function scanForCells(): void {
  const cells = findCodeCells();
  cells.forEach(observeCell);
}

function watchForNewCells(): void {
  bodyObserver?.disconnect();
  bodyObserver = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) scanForCells();
  });

  bodyObserver.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function init(): void {
  if (window.location.hostname !== "colab.research.google.com") return;

  console.log(LOG_PREFIX, "Initializing on", window.location.href);
  watchNotebookTitle();
  scanForCells();
  watchForNewCells();

  // Re-scan periodically — Colab lazy-loads cells
  setInterval(scanForCells, 5000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
