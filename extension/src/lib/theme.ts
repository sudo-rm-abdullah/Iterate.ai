import type { ThemePreference } from "./types";
import { getSettings, saveSettings } from "./storage";

export type ResolvedTheme = "light" | "dark";

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export async function initTheme(): Promise<ResolvedTheme> {
  const settings = await getSettings();
  const resolved = resolveTheme(settings.theme);
  applyTheme(resolved);
  return resolved;
}

export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

export async function toggleTheme(): Promise<ThemePreference> {
  const settings = await getSettings();
  const current = resolveTheme(settings.theme);
  const next: ThemePreference = current === "dark" ? "light" : "dark";
  await saveSettings({ theme: next });
  applyTheme(next);
  return next;
}

export async function cycleTheme(): Promise<void> {
  const settings = await getSettings();
  const order: ThemePreference[] = ["system", "light", "dark"];
  const idx = order.indexOf(settings.theme);
  const next = order[(idx + 1) % order.length];
  await saveSettings({ theme: next });
  applyTheme(resolveTheme(next));
}

export function watchSystemTheme(onChange: (theme: ResolvedTheme) => void): void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    getSettings().then((s) => {
      if (s.theme === "system") {
        const resolved = resolveTheme("system");
        applyTheme(resolved);
        onChange(resolved);
      }
    });
  });
}
