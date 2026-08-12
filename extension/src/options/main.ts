import { getSettings, saveSettings } from "../lib/storage";

const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const autoAnalyzeInput = document.getElementById("auto-analyze") as HTMLInputElement;
const intervalInput = document.getElementById("interval") as HTMLInputElement;
const saveBtn = document.getElementById("save-btn")!;
const testBtn = document.getElementById("test-btn")!;
const saveStatus = document.getElementById("save-status")!;

function showStatus(message: string, type: "success" | "error"): void {
  saveStatus.textContent = message;
  saveStatus.className = `status ${type}`;
}

async function loadSettings(): Promise<void> {
  const settings = await getSettings();
  apiKeyInput.value = settings.groqApiKey;
  autoAnalyzeInput.checked = settings.autoAnalyze;
  intervalInput.value = String(settings.analysisIntervalEvents);
}

saveBtn.addEventListener("click", async () => {
  await saveSettings({
    groqApiKey: apiKeyInput.value.trim(),
    autoAnalyze: autoAnalyzeInput.checked,
    analysisIntervalEvents: Math.max(1, parseInt(intervalInput.value, 10) || 10),
  });
  showStatus("Settings saved.", "success");
});

testBtn.addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus("Enter an API key first.", "error");
    return;
  }

  testBtn.textContent = "Testing…";
  testBtn.setAttribute("disabled", "true");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 5,
      }),
    });

    if (res.ok) {
      showStatus("Connection successful.", "success");
    } else if (res.status === 401) {
      showStatus("Invalid API key.", "error");
    } else if (res.status === 429) {
      showStatus("Rate limited — key is valid but try again later.", "error");
    } else {
      showStatus(`API error: ${res.status} ${res.statusText}`, "error");
    }
  } catch (err) {
    showStatus(`Network error: ${err}`, "error");
  } finally {
    testBtn.textContent = "Test Connection";
    testBtn.removeAttribute("disabled");
  }
});

loadSettings();
