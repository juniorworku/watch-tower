import "server-only";
import { scrypt, timingSafeEqual, randomBytes } from "node:crypto";
import {
  normalizePlainPassword,
  passwordConfigured,
  passwordHashConfigured,
  safeEqual,
} from "./auth";

/** Fixed scrypt params (must match scripts/hash-password.mjs). */
export const SCRYPT_KEYLEN = 64;
export const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, SCRYPT_OPTS, (err, derived) => {
      if (err) reject(err);
      else resolve(derived as Buffer);
    });
  });
}

export type ScryptHashParts = { salt: Buffer; hash: Buffer };

export function parseScryptHash(encoded: string): ScryptHashParts | null {
  const parts = encoded.trim().split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return null;
  const [, saltHex, hashHex] = parts;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return null;
  if (saltHex.length !== 32) return null; // 16 bytes
  if (hashHex.length !== SCRYPT_KEYLEN * 2) return null;
  return { salt: Buffer.from(saltHex, "hex"), hash: Buffer.from(hashHex, "hex") };
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(plain, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

async function verifyScrypt(plain: string, encoded: string): Promise<boolean> {
  const parsed = parseScryptHash(encoded);
  if (!parsed) return false;
  const derived = await scryptAsync(plain, parsed.salt, SCRYPT_KEYLEN);
  if (derived.length !== parsed.hash.length) return false;
  return timingSafeEqual(derived, parsed.hash);
}

/** Plain fallback: compare HMACs of equal length after trim/unquote. */
async function verifyPlainFallback(candidate: string): Promise<boolean> {
  const expected = normalizePlainPassword(process.env.DASHBOARD_PASSWORD);
  if (!expected) return false;
  const enc = new TextEncoder();
  const salt = "watchtower-pw-check";
  async function hmacHex(msg: string): Promise<string> {
    const k = await crypto.subtle.importKey(
      "raw",
      enc.encode(salt),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  const [a, b] = await Promise.all([hmacHex(candidate), hmacHex(expected)]);
  return safeEqual(a, b);
}

/** Prefer DASHBOARD_PASSWORD_HASH (scrypt); fall back to trimmed/unquoted DASHBOARD_PASSWORD. */
export async function checkPassword(candidate: string): Promise<boolean> {
  if (!passwordConfigured()) return false;
  if (passwordHashConfigured()) {
    return verifyScrypt(candidate, (process.env.DASHBOARD_PASSWORD_HASH || "").trim());
  }
  return verifyPlainFallback(candidate);
}
