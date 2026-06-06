/**
 * @file background.js
 * @description VendorBridge Companion Extension — Service Worker
 *
 * Responsibilities:
 *  1. Maintain a resilient Socket.io connection to the VendorBridge
 *     NestJS EventsGateway, surviving MV3 service-worker suspension via
 *     a periodic keepalive alarm and a reconnect-on-wake strategy.
 *  2. Handle real-time events (rfq:invited, quotation:received,
 *     approval:updated) and dispatch native chrome.notifications alerts
 *     with click-to-navigate behaviour.
 *  3. Register and handle the "Send to VendorBridge as Draft" context menu
 *     item that POSTs highlighted text to POST /quotations/extract.
 *
 * Architecture notes:
 *  - Socket.io-client is bundled by Webpack (see webpack.config.js).
 *  - All user-configurable state lives in chrome.storage.local so it
 *    persists across service-worker restarts.
 *  - Sensitive tokens are NEVER logged or exposed to the renderer layer.
 */

import { io } from "socket.io-client";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Alarm name used to keep the service worker alive and re-check the socket */
const KEEPALIVE_ALARM = "vendorbridge_keepalive";

/**
 * How often (minutes) Chrome fires the keepalive alarm.
 * MV3 SWs can be terminated after ~30 s of inactivity; we ping every 20 s
 * using a sub-minute periodInMinutes fractional value.
 */
const KEEPALIVE_INTERVAL_MINUTES = 0.4; // ~24 s

/** Context-menu item ID */
const CTX_MENU_ID = "vb_send_as_draft";

/**
 * Maps a socket event name to a human-readable label and a dashboard path
 * fragment so the notification click can navigate to the correct screen.
 *
 * @type {Record<string, { title: string; body: (data: object) => string; path: string }>}
 */
const EVENT_CONFIG = {
  "rfq:invited": {
    title: "New RFQ Invitation",
    body: (d) =>
      `You have been invited to quote on: ${d?.rfqTitle ?? "an RFQ"}`,
    path: "/rfqs",
  },
  "quotation:received": {
    title: "Quotation Received",
    body: (d) =>
      `${d?.vendorName ?? "A vendor"} submitted a quotation for ${d?.rfqTitle ?? "an RFQ"}`,
    path: "/rfqs",
  },
  "approval:updated": {
    title: "Approval Status Updated",
    body: (d) =>
      `Approval for ${d?.subjectType ?? "item"} is now ${d?.status ?? "updated"}`,
    path: "/approvals",
  },
};

// ---------------------------------------------------------------------------
// State (module-level — survives within a single SW lifetime)
// ---------------------------------------------------------------------------

/** @type {import("socket.io-client").Socket | null} */
let socket = null;

/** Tracks whether we are intentionally disconnected (e.g. no token yet) */
let intentionalDisconnect = false;

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/**
 * Reads a value from chrome.storage.local.
 * @template T
 * @param {string} key
 * @param {T} [fallback]
 * @returns {Promise<T>}
 */
async function storageGet(key, fallback = null) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] ?? fallback);
    });
  });
}

/**
 * Writes key-value pairs to chrome.storage.local.
 * @param {Record<string, unknown>} data
 * @returns {Promise<void>}
 */
async function storageSet(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

// ---------------------------------------------------------------------------
// Socket connection management
// ---------------------------------------------------------------------------

/**
 * Retrieves the active JWT and base API URL from storage, then opens (or
 * re-uses) a Socket.io connection to the VendorBridge EventsGateway.
 *
 * The socket is authenticated on the handshake by passing the JWT in the
 * `auth` object, which NestJS reads as `socket.handshake.auth.token`.
 *
 * @returns {Promise<void>}
 */
async function connectSocket() {
  const [token, apiBase] = await Promise.all([
    storageGet("vb_active_token", null),
    storageGet("vb_api_base", "http://localhost:3000"),
  ]);

  if (!token) {
    console.info("[VB-SW] No active token found — socket connection deferred.");
    intentionalDisconnect = true;
    return;
  }

  // If already connected with the same token, nothing to do.
  if (socket?.connected) {
    console.info("[VB-SW] Socket already connected — skipping reconnect.");
    return;
  }

  // Tear down any stale socket before creating a new one.
  teardownSocket();

  intentionalDisconnect = false;

  // Extract just the origin from apiBase for the socket server URL.
  // e.g. "http://localhost:3000/api/v1" → "http://localhost:3000"
  let serverOrigin;
  try {
    serverOrigin = new URL(apiBase).origin;
  } catch {
    serverOrigin = apiBase;
  }

  console.info(`[VB-SW] Connecting socket to ${serverOrigin}`);

  socket = io(serverOrigin, {
    /**
     * Pass JWT on the initial handshake so the NestJS WsJwtGuard / gateway
     * can authenticate the connection before emitting events.
     */
    auth: { token },

    /**
     * Transports: prefer WebSocket with polling as fallback.
     * This matches the NestJS Socket.io gateway default.
     */
    transports: ["websocket", "polling"],

    /**
     * Reconnection config — socket.io-client handles exponential back-off
     * internally; we layer our own alarm-based check on top for SW wake-ups.
     */
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,

    /**
     * Timeout for the initial connection attempt (ms).
     */
    timeout: 20_000,
  });

  registerSocketHandlers(socket);
}

/**
 * Tears down the current socket connection cleanly.
 */
function teardownSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    console.info("[VB-SW] Existing socket torn down.");
  }
}

/**
 * Attaches all event listeners to the given socket instance.
 * Separating this from construction keeps connectSocket() readable and
 * makes unit-testing the handler logic straightforward.
 *
 * @param {import("socket.io-client").Socket} s
 */
function registerSocketHandlers(s) {
  // --- Lifecycle ---

  s.on("connect", () => {
    console.info(`[VB-SW] Socket connected (id=${s.id})`);
    storageSet({ vb_socket_status: "connected" });
  });

  s.on("disconnect", (reason) => {
    console.warn(`[VB-SW] Socket disconnected (reason=${reason})`);
    storageSet({ vb_socket_status: "disconnected" });

    /**
     * If the server forcefully disconnected us (e.g. token expired), do not
     * let socket.io-client retry indefinitely — clear the stored token so the
     * user is prompted to re-authenticate via the popup.
     */
    if (reason === "io server disconnect") {
      console.warn(
        "[VB-SW] Server-initiated disconnect — clearing stale token."
      );
      storageSet({ vb_active_token: null, vb_socket_status: "unauthorized" });
      intentionalDisconnect = true;
    }
  });

  s.on("connect_error", (err) => {
    console.error(`[VB-SW] Connection error: ${err.message}`);
    storageSet({ vb_socket_status: "error" });
  });

  // --- Business events ---

  for (const [eventName, config] of Object.entries(EVENT_CONFIG)) {
    s.on(eventName, (data) => handleBusinessEvent(eventName, data, config));
  }
}

/**
 * Handles an incoming business event by firing a chrome.notifications alert.
 *
 * @param {string} eventName   - e.g. "rfq:invited"
 * @param {object} data        - Event payload from the server
 * @param {{ title: string; body: (d: object) => string; path: string }} config
 */
function handleBusinessEvent(eventName, data, config) {
  console.info(`[VB-SW] Received event: ${eventName}`, data);

  /**
   * Notification IDs are prefixed with the event name and a timestamp so
   * multiple back-to-back events don't overwrite each other.
   */
  const notifId = `${eventName}_${Date.now()}`;

  chrome.notifications.create(notifId, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: config.title,
    message: config.body(data),
    priority: 2,
    requireInteraction: false,
  });

  /**
   * Store a lightweight map of notifId → dashboard path so the click handler
   * can navigate without re-parsing the event name.
   */
  storageGet("vb_notif_map", {}).then((map) => {
    map[notifId] = config.path;
    storageSet({ vb_notif_map: map });
  });
}

// ---------------------------------------------------------------------------
// Notification click handler — open / focus the dashboard tab
// ---------------------------------------------------------------------------

/**
 * When a VendorBridge notification is clicked, resolve the stored dashboard
 * path and open (or focus) the correct tab.
 */
chrome.notifications.onClicked.addListener(async (notifId) => {
  // Only handle notifications this extension created.
  const isOurs = Object.keys(EVENT_CONFIG).some((ev) =>
    notifId.startsWith(ev)
  );
  if (!isOurs) return;

  chrome.notifications.clear(notifId);

  const [notifMap, apiBase] = await Promise.all([
    storageGet("vb_notif_map", {}),
    storageGet("vb_api_base", "http://localhost:3000"),
  ]);

  const path = notifMap[notifId] ?? "/dashboard";
  const appBase = await storageGet("vb_app_base", null);

  // Derive the web-app origin. Users can configure vb_app_base separately
  // from the API base (e.g. app.vendorbridge.io vs api.vendorbridge.io).
  // Fall back to the API origin if not set.
  let targetOrigin;
  try {
    targetOrigin = appBase ?? new URL(apiBase).origin;
  } catch {
    targetOrigin = apiBase;
  }

  const targetUrl = `${targetOrigin}${path}`;

  // Try to focus an existing tab first; otherwise open a new one.
  const tabs = await chrome.tabs.query({ url: `${targetOrigin}/*` });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true, url: targetUrl });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: targetUrl });
  }

  // Clean up the notif map entry.
  delete notifMap[notifId];
  storageSet({ vb_notif_map: notifMap });
});

// ---------------------------------------------------------------------------
// Context menu — "Send to VendorBridge as Draft"
// ---------------------------------------------------------------------------

/**
 * Register the context menu item on service-worker startup.
 * MV3 requires re-registration on each SW boot because the SW can be
 * terminated; chrome.contextMenus.create is idempotent when the item already
 * exists only in Manifest V3 Chrome 120+ — so we explicitly remove before
 * creating to stay backward-compatible.
 */
function registerContextMenu() {
  chrome.contextMenus.remove(CTX_MENU_ID, () => {
    // Ignore the "does not exist" error on first install.
    void chrome.runtime.lastError;

    chrome.contextMenus.create({
      id: CTX_MENU_ID,
      title: "Send to VendorBridge as Draft",
      contexts: ["selection"],
    });
  });
}

/**
 * Handles the context-menu click:
 *  1. Reads the selected text from the event info.
 *  2. POSTs it to POST /api/v1/quotations/extract with the active JWT.
 *  3. Stores the extraction draft in chrome.storage.local so the popup can
 *     surface it for human review — we NEVER auto-commit (spec requirement).
 *
 * @param {chrome.contextMenus.OnClickData} info
 * @param {chrome.tabs.Tab | undefined} _tab
 */
async function handleContextMenuClick(info, _tab) {
  if (info.menuItemId !== CTX_MENU_ID) return;

  const selectedText = (info.selectionText ?? "").trim();
  if (!selectedText) {
    console.warn("[VB-SW] Context menu triggered with empty selection.");
    return;
  }

  const [token, apiBase] = await Promise.all([
    storageGet("vb_active_token", null),
    storageGet("vb_api_base", "http://localhost:3000"),
  ]);

  if (!token) {
    console.warn("[VB-SW] Cannot extract — no active token.");
    // Notify the user they need to authenticate via the popup.
    chrome.notifications.create(`vb_auth_required_${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "VendorBridge — Authentication Required",
      message: "Please set your API token in the VendorBridge extension popup.",
      priority: 2,
    });
    return;
  }

  const endpoint = `${apiBase}/quotations/extract`;

  try {
    console.info(`[VB-SW] POSTing selected text to ${endpoint}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rawText: selectedText }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorBody}`);
    }

    /** @type {{ items?: object[]; [key: string]: unknown }} */
    const draft = await response.json();

    /**
     * Store the extraction result for the popup to display.
     * The popup will present it to the user for confirmation — never saved
     * automatically (backend also enforces this, but we respect it here too).
     */
    await storageSet({
      vb_extraction_draft: {
        draft,
        sourceText: selectedText.slice(0, 500), // truncate for storage
        extractedAt: new Date().toISOString(),
      },
    });

    chrome.notifications.create(`vb_extracted_${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "VendorBridge — Draft Ready",
      message: `Extracted ${draft?.items?.length ?? 0} line item(s). Open the extension to review.`,
      priority: 2,
    });

    console.info("[VB-SW] Extraction draft stored successfully.", draft);
  } catch (err) {
    console.error("[VB-SW] Extraction request failed:", err);
    chrome.notifications.create(`vb_extract_error_${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "VendorBridge — Extraction Failed",
      message: `Could not extract data: ${err.message}`,
      priority: 2,
    });
  }
}

// ---------------------------------------------------------------------------
// Keepalive alarm — MV3 service-worker survival strategy
// ---------------------------------------------------------------------------

/**
 * Creates (or resets) the periodic alarm that keeps the service worker alive
 * and acts as a reconnect heartbeat.
 *
 * Strategy:
 *  - Chrome fires chrome.alarms.onAlarm every ~24 s.
 *  - The handler checks socket.connected; if false it calls connectSocket().
 *  - This covers the "SW woke up cold" scenario where the in-memory socket
 *    reference is null after termination.
 *
 * Why alarms instead of setInterval?
 *  setInterval is cleared when the SW suspends. chrome.alarms persist across
 *  SW termination and are the officially recommended keepalive mechanism for
 *  MV3 extensions that need continuous background work.
 */
function scheduleKeepaliveAlarm() {
  chrome.alarms.get(KEEPALIVE_ALARM, (existing) => {
    if (!existing) {
      chrome.alarms.create(KEEPALIVE_ALARM, {
        delayInMinutes: KEEPALIVE_INTERVAL_MINUTES,
        periodInMinutes: KEEPALIVE_INTERVAL_MINUTES,
      });
      console.info(
        `[VB-SW] Keepalive alarm scheduled (every ${KEEPALIVE_INTERVAL_MINUTES * 60}s)`
      );
    }
  });
}

/**
 * Alarm tick handler.
 * On every tick: verify socket health; reconnect if needed.
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;

  if (intentionalDisconnect) {
    // No token or explicit disconnect — nothing to do.
    return;
  }

  if (!socket?.connected) {
    console.info("[VB-SW] Keepalive tick — socket not connected. Reconnecting…");
    await connectSocket();
  } else {
    /**
     * Socket is alive. Emit a lightweight ping to the server if it exposes a
     * heartbeat event; gracefully no-ops if the server ignores it.
     * This also resets the SW idle timer so Chrome doesn't suspend us.
     */
    socket.emit("ping_keepalive");
  }
});

// ---------------------------------------------------------------------------
// Chrome storage change listener — react to token/config updates from popup
// ---------------------------------------------------------------------------

/**
 * When the popup changes the active token (role switch or manual override),
 * we must tear down the current socket and open a new authenticated one.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if ("vb_active_token" in changes) {
    const newToken = changes.vb_active_token.newValue;
    console.info(
      `[VB-SW] Active token changed — ${newToken ? "reconnecting" : "disconnecting"} socket.`
    );
    if (newToken) {
      intentionalDisconnect = false;
      connectSocket();
    } else {
      intentionalDisconnect = true;
      teardownSocket();
      storageSet({ vb_socket_status: "disconnected" });
    }
  }

  if ("vb_api_base" in changes) {
    console.info("[VB-SW] API base URL changed — reconnecting socket.");
    teardownSocket();
    connectSocket();
  }
});

// ---------------------------------------------------------------------------
// Service Worker lifecycle — install & activate
// ---------------------------------------------------------------------------

self.addEventListener("install", (event) => {
  console.info("[VB-SW] Service Worker installed.");
  /**
   * skipWaiting ensures the new SW takes over immediately on update without
   * waiting for existing tabs to close.
   */
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.info("[VB-SW] Service Worker activated.");
  /**
   * Claim all existing clients (tabs) so this SW controls them immediately
   * without a page reload — important for the initial install flow.
   */
  event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// Boot sequence — runs every time the SW starts (cold start or wake-up)
// ---------------------------------------------------------------------------

(async function boot() {
  console.info("[VB-SW] Boot sequence starting…");

  // 1. Register context menu (idempotent wrapper handles duplicates).
  registerContextMenu();

  // 2. Attach context menu click handler.
  //    Use removeListener pattern to prevent duplicate listeners on re-boot.
  chrome.contextMenus.onClicked.removeListener(handleContextMenuClick);
  chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

  // 3. Schedule the keepalive alarm.
  scheduleKeepaliveAlarm();

  // 4. Attempt socket connection (no-ops if no token is stored yet).
  await connectSocket();

  console.info("[VB-SW] Boot sequence complete.");
})();
