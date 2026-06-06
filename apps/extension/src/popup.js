/**
 * @file popup.js
 * @description VendorBridge Sidekick — Popup UI controller.
 *
 * Sections:
 *  A. Constants & Role Tokens
 *  B. Storage helpers (shared contract with background.js)
 *  C. Socket status indicator
 *  D. Quick-Stats panel
 *  E. AI Draft Extraction banner
 *  F. Role Switcher panel
 *  G. Settings panel
 *  H. Boot — wires everything on DOMContentLoaded
 *
 * Message contract with content.js:
 *  Outbound: { type: "VB_INJECT_TOKEN", token: string, role: string }
 *  content.js writes token → localStorage["vb_token"] + reloads the page.
 */

// ─────────────────────────────────────────────────────────────────────────────
// A. Constants & Role Tokens
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-seeded mock JWT tokens for the four VendorBridge RBAC roles.
 *
 * SECURITY NOTE: These are developer-only demo tokens that exist solely to
 * make role-switching frictionless during local/hackathon development.
 * They are stored in chrome.storage.local (not in source control for production
 * builds). In a production release these would be cleared and the team would
 * authenticate through the normal login flow.
 *
 * Token format: a plain dummy JWT string. In a real setup your backend team
 * would pre-issue test tokens; replace the values below with real test tokens.
 *
 * @type {Record<string, string>}
 */
const ROLE_TOKENS = {
  PROCUREMENT_OFFICER: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXYtb2ZmaWNlciIsInJvbGUiOiJQUk9DVVJFTUVOVF9PRkZJQ0VSIiwib3JnSWQiOiJkZW1vLW9yZyIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ.PROCUREMENT_OFFICER_SIG",
  VENDOR:               "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXYtdmVuZG9yIiwicm9sZSI6IlZFTkRPUiIsIm9yZ0lkIjoiZGVtby1vcmciLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6OTk5OTk5OTk5OX0.VENDOR_SIG",
  APPROVER:             "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXYtYXBwcm92ZXIiLCJyb2xlIjoiQVBQUk9WRVIiLCJvcmdJZCI6ImRlbW8tb3JnIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.APPROVER_SIG",
  ADMIN:                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXYtYWRtaW4iLCJyb2xlIjoiQURNSU4iLCJvcmdJZCI6ImRlbW8tb3JnIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.ADMIN_SIG",
};

/** Human-readable display names mapped to the role key */
const ROLE_LABELS = {
  PROCUREMENT_OFFICER: "Procurement Officer",
  VENDOR:              "Vendor",
  APPROVER:            "Approver",
  ADMIN:               "Admin",
};

// ─────────────────────────────────────────────────────────────────────────────
// B. Storage helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads one key from chrome.storage.local.
 * @template T
 * @param {string} key
 * @param {T} [fallback]
 * @returns {Promise<T>}
 */
function storageGet(key, fallback = null) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result[key] ?? fallback));
  });
}

/**
 * Writes one or more key-value pairs to chrome.storage.local.
 * @param {Record<string, unknown>} data
 * @returns {Promise<void>}
 */
function storageSet(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

/**
 * Removes a key from chrome.storage.local.
 * @param {string} key
 * @returns {Promise<void>}
 */
function storageRemove(key) {
  return new Promise((resolve) => chrome.storage.local.remove(key, resolve));
}

// ─────────────────────────────────────────────────────────────────────────────
// C. Socket status indicator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps the vb_socket_status string stored by background.js to a Tailwind
 * colour class and a short label for the header dot indicator.
 * @type {Record<string, { dot: string; label: string }>}
 */
const STATUS_STYLES = {
  connected:    { dot: "bg-emerald-400", label: "Live" },
  disconnected: { dot: "bg-slate-500",   label: "Off" },
  error:        { dot: "bg-rose-500",    label: "Error" },
  unauthorized: { dot: "bg-amber-400",   label: "Auth" },
};

/**
 * Reads vb_socket_status from storage and updates the header dot + label.
 * @returns {Promise<void>}
 */
async function refreshSocketStatus() {
  const status = await storageGet("vb_socket_status", "disconnected");
  const style  = STATUS_STYLES[status] ?? STATUS_STYLES.disconnected;

  const dot   = document.getElementById("socket-dot");
  const label = document.getElementById("socket-label");

  // Remove all possible colour classes before applying the correct one.
  dot.className = `inline-block w-2 h-2 rounded-full ${style.dot}`;
  label.textContent = style.label;
}

// ─────────────────────────────────────────────────────────────────────────────
// D. Quick-Stats panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mapping from API response fields → DOM element IDs in popup.html.
 * The backend's GET /dashboard/summary returns these field names per spec §6.2.
 * @type {Array<{ apiKey: string; domId: string }>}
 */
const STAT_MAP = [
  { apiKey: "pendingApprovals",    domId: "stat-pending-approvals"    },
  { apiKey: "activeRfqs",          domId: "stat-active-rfqs"          },
  { apiKey: "recentPos",           domId: "stat-recent-pos"           },
  { apiKey: "outstandingInvoices", domId: "stat-outstanding-invoices" },
];

/**
 * Fetches GET /dashboard/summary with the active JWT and populates the
 * four stat cards. Falls back to showing "—" with an explanatory message
 * if the API is unreachable (offline-first principle from the build spec).
 * @returns {Promise<void>}
 */
async function fetchAndRenderStats() {
  const statusEl   = document.getElementById("stats-status");
  const refreshBtn = document.getElementById("btn-refresh-stats");
  const refreshIcon = document.getElementById("refresh-icon");

  // Visual spinning feedback while loading.
  refreshIcon.classList.add("animate-spin");
  statusEl.textContent = "Fetching…";

  const [token, apiBase] = await Promise.all([
    storageGet("vb_active_token", null),
    storageGet("vb_api_base", "http://localhost:3000/api/v1"),
  ]);

  if (!token) {
    statusEl.textContent = "No active token — select a role below.";
    refreshIcon.classList.remove("animate-spin");
    return;
  }

  try {
    const res = await fetch(`${apiBase}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000), // 8 s timeout — fail fast in popup
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    /** @type {Record<string, number>} */
    const data = await res.json();

    // Populate each stat card.
    for (const { apiKey, domId } of STAT_MAP) {
      const el = document.getElementById(domId);
      if (el) el.textContent = data[apiKey] ?? 0;
    }

    // Cache for the next popup open (avoids a flash of dashes).
    await storageSet({ vb_stats_cache: { data, cachedAt: Date.now() } });

    statusEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    // Graceful degradation: show cached data if available.
    const cache = await storageGet("vb_stats_cache", null);
    if (cache?.data) {
      for (const { apiKey, domId } of STAT_MAP) {
        const el = document.getElementById(domId);
        if (el) el.textContent = cache.data[apiKey] ?? 0;
      }
      const age = Math.round((Date.now() - cache.cachedAt) / 60000);
      statusEl.textContent = `Cached data (${age}m ago) — API unreachable`;
    } else {
      statusEl.textContent = `Could not load stats: ${err.message}`;
    }
  } finally {
    refreshIcon.classList.remove("animate-spin");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// E. AI Draft Extraction banner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks storage for a pending vb_extraction_draft and, if found, reveals the
 * amber banner and populates the meta line and JSON viewer.
 * @returns {Promise<void>}
 */
async function renderDraftBanner() {
  const extraction = await storageGet("vb_extraction_draft", null);
  const banner     = document.getElementById("draft-banner");

  if (!extraction) {
    banner.classList.add("hidden");
    return;
  }

  banner.classList.remove("hidden");

  // Populate the meta line: "X item(s) · extracted at HH:MM"
  const itemCount = extraction.draft?.items?.length ?? 0;
  const time      = new Date(extraction.extractedAt).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit",
  });
  document.getElementById("draft-banner-meta").textContent =
    `${itemCount} item${itemCount !== 1 ? "s" : ""} extracted · ${time}`;

  // Pre-populate the JSON viewer (stays hidden until user clicks "View").
  document.getElementById("draft-json-viewer").textContent =
    JSON.stringify(extraction.draft, null, 2);
}

/**
 * Wires the banner's "View" and "Dismiss" buttons.
 */
function wireDraftBannerButtons() {
  // "View" — toggle the JSON pre block.
  document.getElementById("btn-view-draft").addEventListener("click", () => {
    const viewer = document.getElementById("draft-json-viewer");
    const btn    = document.getElementById("btn-view-draft");
    const isHidden = viewer.classList.contains("hidden");
    viewer.classList.toggle("hidden", !isHidden);
    btn.textContent = isHidden ? "Hide" : "View";
  });

  // "Dismiss" — remove the draft from storage and hide the banner.
  document.getElementById("btn-dismiss-draft").addEventListener("click", async () => {
    await storageRemove("vb_extraction_draft");
    document.getElementById("draft-banner").classList.add("hidden");
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// F. Role Switcher panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injects a token into the active VendorBridge tab via the content script.
 *
 * Flow:
 *  1. Save the token + role to chrome.storage.local as vb_active_token /
 *     vb_active_role. The background.js storage.onChanged listener picks this
 *     up and reconnects the socket automatically.
 *  2. Find all tabs that match the configured app origin.
 *  3. Send a VB_INJECT_TOKEN message to each matching tab's content script.
 *     content.js writes the token to localStorage and reloads the page.
 *  4. Update the UI to reflect the active role.
 *
 * @param {string} role    - One of the keys in ROLE_TOKENS
 * @param {string} token   - The JWT string for that role
 * @returns {Promise<void>}
 */
async function switchRole(role, token) {
  const statusEl    = document.getElementById("role-status");
  const badgeEl     = document.getElementById("active-role-badge");

  statusEl.textContent = "Switching…";

  try {
    // 1. Persist to storage — background.js reacts via storage.onChanged.
    await storageSet({
      vb_active_token: token,
      vb_active_role:  role,
    });

    // 2. Determine target origin.
    const appBase = await storageGet("vb_app_base", null);
    const apiBase = await storageGet("vb_api_base", "http://localhost:3000/api/v1");
    let targetOrigin;
    try {
      targetOrigin = appBase ?? new URL(apiBase).origin;
    } catch {
      targetOrigin = "http://localhost:3000";
    }

    // 3. Message every matching tab to inject the token.
    const tabs = await chrome.tabs.query({ url: `${targetOrigin}/*` });

    if (tabs.length === 0) {
      statusEl.textContent =
        `Token stored. Open the app at ${targetOrigin} to apply.`;
    } else {
      const sends = tabs.map((tab) =>
        chrome.tabs.sendMessage(tab.id, {
          type:  "VB_INJECT_TOKEN",
          token: token,
          role:  role,
        }).catch(() => {
          // content.js may not be ready in every tab — silently ignore.
        })
      );
      await Promise.allSettled(sends);
      statusEl.textContent = `Switched to ${ROLE_LABELS[role]} — reloading app…`;
    }

    // 4. Update active role highlight across all buttons.
    updateActiveRoleUI(role);
    badgeEl.textContent = ROLE_LABELS[role];

    // Clear the status message after 3 s.
    setTimeout(() => { statusEl.textContent = ""; }, 3000);

  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
    console.error("[VB-Popup] Role switch failed:", err);
  }
}

/**
 * Reads vb_active_role from storage and highlights the correct button,
 * showing the active pip indicator.
 * @param {string | null} [overrideRole]  - Pass a role to skip the storage read.
 */
async function updateActiveRoleUI(overrideRole = null) {
  const activeRole = overrideRole ?? await storageGet("vb_active_role", null);

  document.querySelectorAll(".role-btn").forEach((btn) => {
    const isActive = btn.dataset.role === activeRole;
    btn.dataset.active = String(isActive);
    btn.querySelector(".role-active-pip")?.classList.toggle("hidden", !isActive);
  });
}

/**
 * Attaches click listeners to every role button.
 */
function wireRoleSwitcher() {
  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const role  = btn.dataset.role;
      const token = ROLE_TOKENS[role];
      if (!role || !token) return;
      switchRole(role, token);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// G. Settings panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Populates the settings inputs from storage and wires the save button +
 * collapse toggle.
 * @returns {Promise<void>}
 */
async function initSettingsPanel() {
  const [apiBase, appBase] = await Promise.all([
    storageGet("vb_api_base", ""),
    storageGet("vb_app_base", ""),
  ]);

  const apiInput = document.getElementById("input-api-base");
  const appInput = document.getElementById("input-app-base");
  apiInput.value = apiBase;
  appInput.value = appBase;

  // Save button — persists both values to storage.
  document.getElementById("btn-save-settings").addEventListener("click", async () => {
    const statusEl = document.getElementById("settings-status");
    const newApiBase = apiInput.value.trim();
    const newAppBase = appInput.value.trim();

    if (newApiBase && !isValidUrl(newApiBase)) {
      statusEl.textContent = "Invalid API URL format.";
      return;
    }
    if (newAppBase && !isValidUrl(newAppBase)) {
      statusEl.textContent = "Invalid App Origin format.";
      return;
    }

    await storageSet({
      ...(newApiBase && { vb_api_base: newApiBase }),
      ...(newAppBase && { vb_app_base: newAppBase }),
    });

    statusEl.textContent = "Saved ✓";
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
  });

  // Collapse toggle.
  const toggleBtn   = document.getElementById("btn-toggle-settings");
  const panel       = document.getElementById("settings-panel");
  const chevron     = document.getElementById("settings-chevron");

  toggleBtn.addEventListener("click", () => {
    const isOpen = !panel.classList.contains("hidden");
    panel.classList.toggle("hidden", isOpen);
    chevron.style.transform = isOpen ? "" : "rotate(180deg)";
    toggleBtn.setAttribute("aria-expanded", String(!isOpen));
  });
}

/**
 * Validates a URL string.
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
  try { new URL(url); return true; }
  catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// H. Boot — wire everything on DOMContentLoaded
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  console.info("[VB-Popup] Booting popup…");

  // Run independent initialisation steps in parallel for a faster paint.
  await Promise.allSettled([
    refreshSocketStatus(),
    fetchAndRenderStats(),
    renderDraftBanner(),
    updateActiveRoleUI(),
    initSettingsPanel(),
  ]);

  // Wire interactive elements.
  wireDraftBannerButtons();
  wireRoleSwitcher();

  // Refresh stats when the user clicks the refresh icon.
  document.getElementById("btn-refresh-stats")
    .addEventListener("click", fetchAndRenderStats);

  // Keep the socket status dot live while the popup is open.
  // chrome.storage.onChanged fires every time background.js updates the status.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("vb_socket_status" in changes) refreshSocketStatus();
    if ("vb_extraction_draft" in changes) renderDraftBanner();
    if ("vb_stats_cache" in changes) {
      // Re-render stats from the updated cache without a new fetch.
      storageGet("vb_stats_cache", null).then((cache) => {
        if (!cache?.data) return;
        for (const { apiKey, domId } of STAT_MAP) {
          const el = document.getElementById(domId);
          if (el) el.textContent = cache.data[apiKey] ?? 0;
        }
      });
    }
  });

  console.info("[VB-Popup] Boot complete.");
});
