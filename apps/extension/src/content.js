/**
 * @file content.js
 * @description VendorBridge Sidekick — Content Script
 *
 * Runs in the context of every page that matches the extension's
 * content_scripts.matches list ("<all_urls>").
 *
 * Responsibilities:
 *  1. Listen for VB_INJECT_TOKEN messages dispatched by popup.js
 *     (via chrome.tabs.sendMessage).
 *  2. Validate the message and the current page origin against the stored
 *     VendorBridge app origin — we NEVER write tokens to arbitrary third-party
 *     pages.
 *  3. Write the token to the page's localStorage so the VendorBridge Next.js
 *     app (which reads "vb_token" from localStorage) picks it up.
 *  4. Force window.location.reload() so the app's auth context re-initialises
 *     with the new token immediately.
 *
 * Security model:
 *  - Origin check is mandatory: token injection is skipped unless
 *    window.location.origin matches the stored vb_app_base or
 *    vb_api_base origin.
 *  - We write only to localStorage (not cookies) because the Next.js app
 *    reads the token client-side; the NestJS API never trusts client-side
 *    storage for server-side auth — it uses the Authorization header built
 *    from whatever the app reads from localStorage.
 *  - The token is NOT logged to the console.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The localStorage key the VendorBridge Next.js app uses to read the JWT.
 * Must match what the web app sets/reads — coordinate with the frontend team.
 */
const LS_TOKEN_KEY = "vb_token";

/**
 * The localStorage key used to store the active role label for the app's
 * UI to optionally display (e.g. in the header).
 */
const LS_ROLE_KEY = "vb_role";

/**
 * The message type sent by popup.js via chrome.tabs.sendMessage.
 */
const MSG_INJECT_TOKEN = "VB_INJECT_TOKEN";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads a single key from chrome.storage.local.
 * Content scripts have full access to chrome.storage.
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
 * Returns the safe set of origins on which token injection is permitted.
 * Reads vb_app_base and vb_api_base from storage and extracts their origins.
 * @returns {Promise<Set<string>>}
 */
async function getAllowedOrigins() {
  const [appBase, apiBase] = await Promise.all([
    storageGet("vb_app_base", null),
    storageGet("vb_api_base", "http://localhost:3000/api/v1"),
  ]);

  /** @type {Set<string>} */
  const origins = new Set();

  // Always include the API origin as a fallback (dev servers often co-locate).
  const rawSources = [appBase, apiBase].filter(Boolean);
  for (const src of rawSources) {
    try {
      origins.add(new URL(src).origin);
    } catch {
      // Invalid URL — skip.
    }
  }

  // Hardcode localhost:3000 and localhost:3001 as safe development origins
  // so the extension works out-of-the-box without any settings configuration.
  origins.add("http://localhost:3000");
  origins.add("http://localhost:3001");

  return origins;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message listener
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles VB_INJECT_TOKEN messages from popup.js.
 *
 * @param {{ type: string; token: string; role: string }} message
 * @param {chrome.runtime.MessageSender}                 _sender
 * @param {(response?: unknown) => void}                 sendResponse
 */
async function handleMessage(message, _sender, sendResponse) {
  // Ignore messages not addressed to this content script.
  if (message?.type !== MSG_INJECT_TOKEN) return;

  const { token, role } = message;

  // ── Guard 1: validate payload shape ────────────────────────────────────────
  if (typeof token !== "string" || !token.trim()) {
    console.warn("[VB-Content] VB_INJECT_TOKEN received with invalid token.");
    sendResponse({ success: false, reason: "invalid_token" });
    return;
  }

  if (typeof role !== "string" || !role.trim()) {
    console.warn("[VB-Content] VB_INJECT_TOKEN received with invalid role.");
    sendResponse({ success: false, reason: "invalid_role" });
    return;
  }

  // ── Guard 2: origin allowlist ───────────────────────────────────────────────
  const currentOrigin = window.location.origin;
  const allowedOrigins = await getAllowedOrigins();

  if (!allowedOrigins.has(currentOrigin)) {
    console.warn(
      `[VB-Content] Token injection refused — origin "${currentOrigin}" is not in the allowlist.`
    );
    sendResponse({ success: false, reason: "origin_not_allowed" });
    return;
  }

  // ── Inject ──────────────────────────────────────────────────────────────────
  try {
    /**
     * Write the token and role to localStorage.
     * The VendorBridge Next.js app reads these keys on mount to initialise
     * its auth context / TanStack Query client headers.
     */
    localStorage.setItem(LS_TOKEN_KEY, token);
    localStorage.setItem(LS_ROLE_KEY, role);

    console.info(
      `[VB-Content] Token injected for role "${role}" on ${currentOrigin}. Reloading…`
    );

    sendResponse({ success: true });

    /**
     * Small delay before reload so sendResponse has time to reach the popup
     * and the popup can update its UI before the page navigates.
     */
    setTimeout(() => window.location.reload(), 150);

  } catch (err) {
    console.error("[VB-Content] Failed to inject token:", err);
    sendResponse({ success: false, reason: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * chrome.runtime.onMessage requires a synchronous return value of `true`
 * if the response will be sent asynchronously (which ours is, due to the
 * async origin check). We wrap the async handler and return `true` to keep
 * the message channel open.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MSG_INJECT_TOKEN) {
    handleMessage(message, sender, sendResponse);
    // Return true to signal async response.
    return true;
  }
});

console.info("[VB-Content] Content script ready on", window.location.origin);
