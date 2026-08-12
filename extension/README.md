# ProjectPulse Chrome Extension

Automatically tracks your ML/data-science project progress across **Google Colab** and **GitHub** with zero manual logging. Uses a Groq LLM agent (Llama models) for progress summaries and next-step suggestions.

## Current status: Phase 1 & 2

- Extension scaffold (Manifest V3, service worker, popup, options)
- Colab content script: notebook detection, cell edit diffing, output capture
- Flat event list in popup
- Local storage via `chrome.storage.local` + IndexedDB for blobs

## File structure

```
extension/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── icons/                  # Extension icons (16, 48, 128)
└── src/
    ├── manifest.json           # Manifest V3 entry point
    ├── background/
    │   └── service-worker.ts   # Event ingestion, blob storage
    ├── content/
    │   └── colab.ts            # Colab DOM observer
    ├── lib/
    │   ├── types.ts            # Shared data model
    │   ├── storage.ts          # chrome.storage + IndexedDB
    │   └── uuid.ts
    ├── popup/
    │   ├── index.html
    │   ├── main.ts             # Flat event list UI
    │   └── popup.css
    └── options/
        ├── index.html
        ├── main.ts             # API key + privacy notice
        └── options.css
```

## Load in Chrome (unpacked)

1. `cd extension && npm install && npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `extension/dist` folder
5. Open a Colab notebook, edit a cell, run it — events appear in the popup

## Permissions

| Permission | Why |
|---|---|
| `storage` | Local event timeline |
| `activeTab` | Current tab context |
| `colab.research.google.com` | Notebook activity capture |
| `github.com` | Commit/PR capture (Phase 4) |
| `api.groq.com` | LLM analysis (Phase 6) |

## Roadmap

- [x] Phase 1: Scaffold
- [x] Phase 2: Colab raw capture + flat list
- [ ] Phase 3: Regex param/metric extraction
- [ ] Phase 4: GitHub content script
- [ ] Phase 5: Timeline UI with filters
- [ ] Phase 6: Groq agent integration
- [ ] Phase 7: Export Markdown/JSON
- [ ] Phase 8: Manual notes, project renaming/merging
