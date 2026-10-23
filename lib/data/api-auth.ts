import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function requireApiKey(req: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const expected = (process.env.WATCHTOWER_API_KEY || "").trim();
  if (!expected) return { ok: false, status: 503, error: "WATCHTOWER_API_KEY is not configured" };
  const header = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m) return { ok: false, status: 401, error: "Missing Bearer token" };
  const got = m[1].trim();
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Invalid API key" };
  }
  return { ok: true };
}
