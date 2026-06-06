# VendorBridge Sidekick — Developer Guide

Chrome Extension (MV3) companion for the VendorBridge Procurement ERP.  
This guide is for the extension sub-team. Backend setup is in `vendorbridge/README.md`.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | `node -v` to confirm |
| npm | ≥ 9 | bundled with Node |
| Google Chrome | ≥ 116 | MV3 + ES module service workers |
| VendorBridge API | running locally | Phase 0 must be complete |

---

## 1. Install dependencies

```bash
npm install
```

---

## 2. Build the extension

### Production build (one-shot)

```bash
npm run build
```

Runs Webpack (JS bundles) then Tailwind CLI (CSS). Output lands in **`/dist`** — this folder is the installable extension.

### Development build (watch mode)

```bash
npm run build:js    # run once first — builds JS synchronously
npm run dev:css     # in a second terminal — watches popup.css for changes
npm run dev:js      # in a third terminal — watches src/**/*.js for changes
```

> **Why three terminals?**  
> The CSS and JS watchers are independent processes. Keeping them separate means a popup style change doesn't trigger a full JS re-bundle and vice versa. After each save, reload the extension in Chrome (see §3).

---

## 3. Load the extension in Chrome

1. Open **`chrome://extensions`** in a new tab.
2. Enable **Developer mode** (toggle, top-right corner).
3. Click **"Load unpacked"**.
4. Navigate to and select the **`dist/`** folder inside this project — _not_ the project root.
5. The "VendorBridge Sidekick" card appears. Note its **ID** (you'll use it to force-reload).

### Reloading after a rebuild

Every time `npm run build` finishes, click the **↺ refresh icon** on the extension card in `chrome://extensions`.  
Alternatively, pin the keyboard shortcut: open the extension card → click "Details" → scroll to "Keyboard shortcut".

> The service worker (`background.js`) only re-executes on extension reload, **not** on page refresh. Always reload the extension after a background.js change.

---

## 4. Configure API and App URLs (Settings panel)

The extension ships with `http://localhost:3000` as the default API origin. For most local setups this works without any changes. If your backend or frontend runs on a different port:

1. Click the extension icon in the Chrome toolbar to open the popup.
2. Scroll to the **Settings** section at the bottom and click to expand it.
3. Fill in the two fields:

   | Field | What to enter | Example |
   |---|---|---|
   | **API Base URL** | Full URL to NestJS API including `/api/v1` | `http://localhost:3000/api/v1` |
   | **App Origin** | Origin of the Next.js frontend (for notification click navigation) | `http://localhost:3001` |

4. Click **Save Settings**. The service worker picks up the new values on the next keepalive tick (~24 s) or immediately if you reload the extension.

> **Token injection** (role switcher) will only fire on tabs whose origin matches the App Origin. If you change the App Origin after setting roles, reload any open VendorBridge tabs.

---

## 5. Connect tokens from the backend seed script

After the backend team runs `npx prisma db seed`:

1. Open `seed_tokens.json` — the backend teammate should have populated the four `"token"` fields (see `_backendSeedSnippet` inside the file for the exact NestJS snippet).
2. Copy the four token strings into `src/popup.js` → `ROLE_TOKENS` constant:

```js
// src/popup.js — Section A
const ROLE_TOKENS = {
  PROCUREMENT_OFFICER: "eyJhbGci...paste here...",
  VENDOR:              "eyJhbGci...paste here...",
  APPROVER:            "eyJhbGci...paste here...",
  ADMIN:               "eyJhbGci...paste here...",
};
```

3. Rebuild and reload:

```bash
npm run build
# then reload in chrome://extensions
```

---

## 6. Full testing loop

Work through this end-to-end flow to validate all three extension features in order.

### 6.1 Real-time notification test

**Goal:** Confirm the service worker connects to Socket.io and fires desktop alerts.

1. Open the popup. The **socket status dot** (top-right of header) should turn **green / "Live"** once a valid token is active. If it shows "Off", check that the API is running and a token is set (§5).
2. On the backend, trigger a test event — either via the NestJS Swagger UI at `http://localhost:3000/api/docs` or by running the relevant seed action:
   - `rfq:invited` — invite a vendor to an RFQ.
   - `quotation:received` — submit a quotation as a Vendor.
   - `approval:updated` — approve/reject a quotation as an Approver.
3. A native Chrome notification should appear within 1–2 seconds.
4. Click the notification. Chrome should focus (or open) a tab at the VendorBridge app URL for the relevant screen (`/rfqs` or `/approvals`).

**Debugging:** Open the service worker DevTools via `chrome://extensions` → "Inspect views: service worker". All socket events log to that console under the `[VB-SW]` prefix.

---

### 6.2 Context-menu scraper test

**Goal:** Confirm text selected on any webpage is POSTed to `/quotations/extract` and the result surfaces in the popup draft banner.

1. Make sure an **OFFICER** or **ADMIN** token is active (the API requires it).
2. Open any webpage containing invoice-like text — a plain `about:blank` page with pasted text works fine.
3. Select a block of text that looks like a vendor quotation (item names, quantities, prices).
4. Right-click → **"Send to VendorBridge as Draft"**.
5. A Chrome notification appears: _"VendorBridge — Draft Ready — X line item(s). Open the extension to review."_
6. Click the extension icon. The **amber AI Draft banner** appears at the top of the popup.
7. Click **"View"** — the extracted JSON is displayed in the scrollable viewer.
8. Click **"Dismiss"** to clear it from storage, or keep it to hand off to the backend.

**If step 5 shows "Extraction Failed":** Check the service worker console. The most likely cause is the API is not running or the `/quotations/extract` endpoint is not yet implemented (Phase 1 work). The extension queues the error notification gracefully and does not crash.

---

### 6.3 Role-switcher test

**Goal:** Confirm switching roles injects the correct token into the VendorBridge app's localStorage and reloads the session.

1. Open a tab pointing to the VendorBridge Next.js app (e.g. `http://localhost:3001`).
2. Open the popup. Under **Role Switcher**, click **"Procurement Officer"**.
   - The button gains a coloured border and a pip dot.
   - The active role badge (top-right of the Role Switcher heading) updates.
   - A status message appears: _"Switched to Procurement Officer — reloading app…"_
   - The VendorBridge tab reloads automatically.
3. In the reloaded tab, open DevTools → Console → run:
   ```js
   localStorage.getItem("vb_token");   // should return the Officer JWT
   localStorage.getItem("vb_role");    // should return "PROCUREMENT_OFFICER"
   ```
4. Repeat for each of the other three roles. Confirm the UI responds to each (e.g. Vendor sees only their own RFQs, Admin sees the user management screen).

**If the app tab does not reload:** Confirm the App Origin in Settings (§4) exactly matches the tab's origin. The content script refuses injection on origin mismatch by design.

---

## 7. Storage key reference

All persistent state lives in `chrome.storage.local`. Use the Chrome DevTools Storage panel (`chrome://extensions` → "Inspect views: service worker" → Application tab → Storage → Local) to inspect or clear values during debugging.

| Key | Type | Written by | Read by | Description |
|---|---|---|---|---|
| `vb_active_token` | `string \| null` | popup.js, background.js | background.js, popup.js | JWT for the active role |
| `vb_active_role` | `string` | popup.js | popup.js | Role enum value |
| `vb_api_base` | `string` | popup.js (Settings) | background.js, popup.js, content.js | NestJS API base URL |
| `vb_app_base` | `string \| null` | popup.js (Settings) | background.js, popup.js, content.js | Next.js app origin |
| `vb_socket_status` | `string` | background.js | popup.js | `connected \| disconnected \| error \| unauthorized` |
| `vb_notif_map` | `object` | background.js | background.js | `{ [notifId]: dashboardPath }` |
| `vb_extraction_draft` | `object \| null` | background.js | popup.js | Pending AI extraction result |
| `vb_stats_cache` | `object \| null` | popup.js | popup.js | Cached dashboard summary + timestamp |

---

## 8. Project structure (quick reference)

```
KSV_Extension/
├── src/
│   ├── background.js   # Service Worker: Socket.io + context menu + alarms
│   ├── popup.html      # Popup shell (Tailwind utility classes)
│   ├── popup.js        # Popup controller: stats, draft banner, role switcher
│   ├── popup.css       # Tailwind v4 source → compiled to dist/popup.css
│   └── content.js      # Token injector (origin-guarded localStorage write)
├── icons/              # Extension icons (16/32/48/128 px)
├── dist/               # ← compiled output; load THIS in chrome://extensions
├── manifest.json       # MV3 manifest (source of truth; copied to dist/ by Webpack)
├── webpack.config.js   # Bundles JS; copies manifest + HTML + icons
├── mock_tokens.js      # Dev token constants with update instructions
├── seed_tokens.json    # Hand-off template for backend → extension tokens
├── package.json
└── README.dev.md       # ← you are here
```

---

## 9. Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Socket dot stays grey | No token set | Select a role in the Role Switcher |
| Socket dot shows "Error" | API not running or wrong port | Start the NestJS server; check API Base URL in Settings |
| Socket dot shows "Auth" | Token expired or invalid | Re-run `npx prisma db seed` and update tokens (§5) |
| Role switch doesn't reload tab | App Origin mismatch | Set App Origin in Settings to match the open tab's origin |
| Draft banner never appears | `/quotations/extract` not implemented yet | Normal until Phase 1 is complete; test with a mock response |
| Notification fires but click does nothing | App Origin not set | Set App Origin in Settings (§4) |
| "Load unpacked" shows errors | Built with wrong mode | Run `npm run build` then reload; don't load the `src/` folder |
| Stats show "—" permanently | API unreachable or no token | Check API, then select a role |

---

## 10. Git hygiene reminders

- **Never commit** `seed_tokens.json` with real token values. Add to `.gitignore` before pushing:
  ```
  # .gitignore
  seed_tokens.json
  dist/
  ```
- Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`.
- The `dist/` folder is build artefact — it should not be committed to the repo. Each team member builds locally.
- Open a PR for every feature branch; one reviewer minimum before merge.
