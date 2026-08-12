# ProjectPulse Chrome Extension

Automatically tracks ML/data-science project progress across **Google Colab** and **GitHub** with zero manual logging.

## v0.2 — Onboarding + Dashboard

- **Onboarding wizard** — project name, type, tab selection, auto-track toggle
- **Full dashboard** — per-project timeline, idle-aware tracked hours, filters, export
- **Design system** — dark/light themes, retro terminal badges, JetBrains Mono for data
- **Smart capture** — only hyperparameter changes and metric/error outputs (no keystroke noise)

## Load in Chrome

```bash
cd extension
npm install
npm run build
```

1. Open `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist`
2. Click the extension icon → **Start Tracking** to run the onboarding wizard
3. Open **Dashboard** for the full project view

## File structure

```
extension/src/
├── manifest.json
├── background/service-worker.ts
├── content/colab.ts
├── lib/
│   ├── types.ts, storage.ts, extract.ts, time.ts, theme.ts
│   └── event-render.ts, dom.ts, uuid.ts
├── styles/tokens.css          # Design system
├── popup/                     # Wizard + quick view
├── dashboard/                 # Full tab dashboard
└── options/                   # Privacy notice + dashboard link
```

## Roadmap

- [x] Phase 1–2: Scaffold + Colab capture
- [x] Onboarding wizard + dashboard redesign
- [x] Param/metric-only tracking
- [ ] Phase 4: GitHub content script
- [ ] Phase 6: Groq agent integration
- [ ] Phase 8: Manual notes, project renaming/merging
