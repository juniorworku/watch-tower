import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE = 7 * 24 * 3600;

/** Matches FastAPI's v2 session format. Server imports only; never a client secret. */
export function validSessionToken(token: string, secret: string, now = Date.now() / 1000): boolean {
  const parts = token.split(".");
  if (!secret || parts.length !== 4) return false;
  const [version, expiry, nonce, signature] = parts;
  if (version !== "v2" || !/^\d+$/.test(expiry) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expires = Number(expiry);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + MAX_AGE + 60) return false;
  const expected = createHmac("sha256", secret).update(`${version}.${expiry}.${nonce}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function sessionSecret(env: Record<string, string | undefined>): string {
  const hash = env.DASHBOARD_PASSWORD_HASH?.trim();
  if (hash) return hash;
  const password = env.DASHBOARD_PASSWORD?.trim() || "";
  return password.length >= 2 && ['"', "'"].includes(password[0]) && password.at(-1) === password[0] ? password.slice(1, -1) : password;
}
