/** Regex extraction for hyperparameters and metrics. */

export interface ParamPattern {
  key: string;
  regex: RegExp;
}

export interface MetricPattern {
  key: string;
  regex: RegExp;
}

const PARAM_PATTERNS: ParamPattern[] = [
  { key: "epochs", regex: /\bepochs\s*=\s*(\d+)/gi },
  { key: "batch_size", regex: /\bbatch_size\s*=\s*(\d+)/gi },
  { key: "batch", regex: /\bbatch\s*=\s*(\d+)/gi },
  { key: "lr", regex: /\b(?:lr|learning_rate)\s*=\s*([\d.eE+-]+)/gi },
  { key: "img_size", regex: /\b(?:img_size|imgsz|image_size)\s*=\s*(\d+)/gi },
  { key: "optimizer", regex: /\boptimizer\s*=\s*['"]?(\w+)['"]?/gi },
  { key: "model", regex: /\b(?:model|model_name)\s*=\s*['"]?([\w./-]+)['"]?/gi },
  { key: "yolo", regex: /\b(yolov\d+|yolo\d+|yolo11\w*)\b/gi },
  { key: "weight_decay", regex: /\bweight_decay\s*=\s*([\d.eE+-]+)/gi },
  { key: "momentum", regex: /\bmomentum\s*=\s*([\d.eE+-]+)/gi },
  { key: "dropout", regex: /\bdropout\s*=\s*([\d.eE+-]+)/gi },
  { key: "num_workers", regex: /\bnum_workers\s*=\s*(\d+)/gi },
  { key: "patience", regex: /\bpatience\s*=\s*(\d+)/gi },
];

const METRIC_PATTERNS: MetricPattern[] = [
  { key: "mAP", regex: /\bmAP(?:50)?(?:-95)?[:\s=]*([\d.]+)/gi },
  { key: "map", regex: /\bmap[:\s=]*([\d.]+)/gi },
  { key: "accuracy", regex: /\baccuracy[:\s=]*([\d.]+)/gi },
  { key: "acc", regex: /\bacc(?:uracy)?[:\s=]*([\d.]+)/gi },
  { key: "loss", regex: /\bloss[:\s=]*([\d.eE+-]+)/gi },
  { key: "precision", regex: /\bprecision[:\s=]*([\d.]+)/gi },
  { key: "recall", regex: /\brecall[:\s=]*([\d.]+)/gi },
  { key: "f1", regex: /\bf1(?:[_-]?score)?[:\s=]*([\d.]+)/gi },
  { key: "r2", regex: /\bR2|r_squared|rsquared[:\s=]*([\d.eE+-]+)/gi },
  { key: "rmse", regex: /\bRMSE[:\s=]*([\d.eE+-]+)/gi },
  { key: "mae", regex: /\bMAE[:\s=]*([\d.eE+-]+)/gi },
  { key: "val_loss", regex: /\bval(?:idation)?[_\s]?loss[:\s=]*([\d.eE+-]+)/gi },
];

function extractWithPatterns(
  text: string,
  patterns: { key: string; regex: RegExp }[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key, regex } of patterns) {
    regex.lastIndex = 0;
    const match = regex.exec(text);
    if (match?.[1] !== undefined) {
      result[key] = match[1];
    }
  }
  return result;
}

export function extractParams(text: string): Record<string, string> {
  return extractWithPatterns(text, PARAM_PATTERNS);
}

export function extractMetrics(text: string): Record<string, string> {
  return extractWithPatterns(text, METRIC_PATTERNS);
}

export function diffParams(
  before: Record<string, string>,
  after: Record<string, string>
): {
  changed: Record<string, { before: string; after: string }>;
  paramsBefore: Record<string, string>;
  paramsAfter: Record<string, string>;
} {
  const changed: Record<string, { before: string; after: string }> = {};
  const paramsBefore: Record<string, string> = {};
  const paramsAfter: Record<string, string> = {};
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const b = before[key];
    const a = after[key];
    if (b !== undefined && a !== undefined && b !== a) {
      changed[key] = { before: b, after: a };
      paramsBefore[key] = b;
      paramsAfter[key] = a;
    } else if (b === undefined && a !== undefined) {
      changed[key] = { before: "—", after: a };
      paramsAfter[key] = a;
    } else if (b !== undefined && a === undefined) {
      changed[key] = { before: b, after: "—" };
      paramsBefore[key] = b;
    }
  }

  return { changed, paramsBefore, paramsAfter };
}

export function hasParamChanges(changed: Record<string, unknown>): boolean {
  return Object.keys(changed).length > 0;
}

export function isErrorOutput(text: string): boolean {
  return /\b(?:error|exception|traceback|errno|failed|runtimeerror|valueerror|typeerror)\b/i.test(
    text
  );
}

export function hasMeaningfulMetrics(metrics: Record<string, string>): boolean {
  return Object.keys(metrics).length > 0;
}

export function summarizeParamChange(
  changed: Record<string, { before: string; after: string }>
): string {
  const parts = Object.entries(changed).map(
    ([k, v]) => `${k} ${v.before} → ${v.after}`
  );
  return parts.join(", ");
}

export function summarizeMetrics(metrics: Record<string, string>): string {
  return Object.entries(metrics)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

export function compareMetrics(
  before: Record<string, string>,
  after: Record<string, string>
): string {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const parts: string[] = [];
  for (const key of keys) {
    const b = before[key];
    const a = after[key];
    if (b && a && b !== a) {
      const bNum = parseFloat(b);
      const aNum = parseFloat(a);
      let trend = "";
      if (!Number.isNaN(bNum) && !Number.isNaN(aNum)) {
        if (key.toLowerCase().includes("loss") || key.toLowerCase() === "rmse" || key.toLowerCase() === "mae") {
          trend = aNum < bNum ? " (better)" : aNum > bNum ? " (worse)" : "";
        } else {
          trend = aNum > bNum ? " (better)" : aNum < bNum ? " (worse)" : "";
        }
      }
      parts.push(`${key} ${b} → ${a}${trend}`);
    } else if (a) {
      parts.push(`${key}=${a}`);
    }
  }
  return parts.join(", ");
}
