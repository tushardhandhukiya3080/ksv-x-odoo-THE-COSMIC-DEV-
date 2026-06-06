/**
 * @file mock_tokens.js
 * @description Pre-seeded developer JWT tokens for the four VendorBridge RBAC roles.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO UPDATE THESE TOKENS (read before the first integration test run)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * These tokens are PLACEHOLDER values. They have a valid JWT structure so the
 * extension can parse the role/orgId fields from the payload, but they will be
 * rejected by the NestJS API because the signatures are fake.
 *
 * STEP 1 — Run the Phase 0 seed script on the backend:
 *
 *   cd vendorbridge/
 *   npx prisma db seed          # or: npx ts-node infra/prisma/seed.ts
 *
 *   The seed script creates one Organization + one User per role and prints
 *   (or writes to infra/prisma/seed_output.json) a signed JWT for each.
 *
 * STEP 2 — Copy the tokens from seed output into this file:
 *
 *   Replace each "REPLACE_WITH_SEED_OUTPUT_TOKEN" value below with the
 *   corresponding token string. Keep the key names identical.
 *
 * STEP 3 — Rebuild the extension so popup.js picks up the new values:
 *
 *   npm run build          # or: npm run dev  (watch mode)
 *
 * STEP 4 — Reload the unpacked extension in Chrome:
 *
 *   chrome://extensions → VendorBridge Sidekick → click the ↺ refresh icon.
 *
 * SECURITY: Never commit real production tokens to source control.
 *           This file is for local development only.
 *           Add mock_tokens.js to .gitignore before the first commit if your
 *           repo is public or shared beyond the hackathon team.
 *
 * TOKEN ANATOMY (for reference):
 *   A JWT has three base64url-encoded sections: header.payload.signature
 *   You can inspect the payload on https://jwt.io (offline decoder available).
 *   The NestJS JwtStrategy reads: sub (userId), role, orgId, iat, exp.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * @type {Record<string, string>}
 *
 * Keys must match the ROLE_TOKENS keys in src/popup.js exactly.
 * The extension role-switcher imports this object at build time via
 * webpack (or you can paste tokens directly into popup.js ROLE_TOKENS).
 */
export const MOCK_TOKENS = {

  /**
   * PROCUREMENT_OFFICER
   * Permissions: manage vendors, create/edit RFQs, view comparison + AI analysis,
   *              generate PO/invoice, view reports.
   *
   * Decoded placeholder payload:
   *   { "sub": "dev-officer-001", "role": "PROCUREMENT_OFFICER",
   *     "orgId": "demo-org-001",  "iat": 1700000000, "exp": 9999999999 }
   */
  PROCUREMENT_OFFICER:
    "REPLACE_WITH_SEED_OUTPUT_TOKEN",
    // ↑ paste the token from seed_output.json["PROCUREMENT_OFFICER"] here

  /**
   * VENDOR
   * Permissions: submit own quotations, view own RFQ status / POs.
   *
   * Decoded placeholder payload:
   *   { "sub": "dev-vendor-001", "role": "VENDOR",
   *     "orgId": "demo-org-001", "iat": 1700000000, "exp": 9999999999 }
   */
  VENDOR:
    "REPLACE_WITH_SEED_OUTPUT_TOKEN",
    // ↑ paste the token from seed_output.json["VENDOR"] here

  /**
   * APPROVER
   * Permissions: approve/reject quotations and POs, view comparison + AI analysis,
   *              view reports.
   *
   * Decoded placeholder payload:
   *   { "sub": "dev-approver-001", "role": "APPROVER",
   *     "orgId": "demo-org-001",   "iat": 1700000000, "exp": 9999999999 }
   */
  APPROVER:
    "REPLACE_WITH_SEED_OUTPUT_TOKEN",
    // ↑ paste the token from seed_output.json["APPROVER"] here

  /**
   * ADMIN
   * Permissions: all capabilities — user management, vendor management, RFQs,
   *              approvals, PO/invoice generation, reports.
   *
   * Decoded placeholder payload:
   *   { "sub": "dev-admin-001", "role": "ADMIN",
   *     "orgId": "demo-org-001", "iat": 1700000000, "exp": 9999999999 }
   */
  ADMIN:
    "REPLACE_WITH_SEED_OUTPUT_TOKEN",
    // ↑ paste the token from seed_output.json["ADMIN"] here

};

// ─────────────────────────────────────────────────────────────────────────────
// Optional: expected seed_output.json shape (for reference only)
// ─────────────────────────────────────────────────────────────────────────────
//
// The backend seed script should write a file at infra/prisma/seed_output.json
// with this structure so this file and popup.js can be updated in one copy-paste:
//
// {
//   "orgId": "clxxxxxxxxxxxxxx",
//   "PROCUREMENT_OFFICER": "eyJhbGci...<real signed JWT>",
//   "VENDOR":              "eyJhbGci...<real signed JWT>",
//   "APPROVER":            "eyJhbGci...<real signed JWT>",
//   "ADMIN":               "eyJhbGci...<real signed JWT>"
// }
//
// Ask the teammate managing infra/prisma/seed.ts to add this output step.
// ─────────────────────────────────────────────────────────────────────────────
