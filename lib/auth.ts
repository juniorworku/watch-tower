// Edge- and Node-compatible helpers (Web Crypto only).
// Password verification with scrypt lives in lib/verify-password.ts (Node-only).
export const SESSION_COOKIE = "wt_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** Trim and strip one pair of surrounding single/double quotes (MCP/env paste artifacts). */
export function normalizePlainPassword(raw: string | undefined | null): string {
  if (!raw) return "";
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1);
  }
  return s;
}

export function passwordHashConfigured(): boolean {
  const h = (process.env.DASHBOARD_PASSWORD_HASH || "").trim();
  return h.startsWith("scrypt$") && h.split("$").length === 3;
}

export function passwordConfigured(): boolean {
  if (passwordHashConfigured()) return true;
  return normalizePlainPassword(process.env.DASHBOARD_PASSWORD).length > 0;
}

async function hmacHex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Session material: prefer DASHBOARD_PASSWORD_HASH so sessions invalidate when the hash
 * rotates; else the normalized plain password.
 */
function sessionSecret(): string {
  if (passwordHashConfigured()) return (process.env.DASHBOARD_PASSWORD_HASH || "").trim();
  return normalizePlainPassword(process.env.DASHBOARD_PASSWORD);
}

/** Session token derived from configured secret; rotating the secret signs everyone out. */
export async function expectedSessionToken(): Promise<string> {
  return hmacHex(sessionSecret(), "watchtower-session-v1");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
