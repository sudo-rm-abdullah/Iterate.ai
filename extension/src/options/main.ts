import { initTheme, toggleTheme } from "../lib/theme";

document.getElementById("theme-toggle")!.addEventListener("click", () => toggleTheme());

document.getElementById("open-dashboard")!.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
});

initTheme();
