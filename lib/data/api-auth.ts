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

// Each runtime can use its own credential; the existing master key remains an admin credential.
export async function requireAgentAuth(req: NextRequest, agentId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (requireApiKey(req).ok) return { ok: true };
  const { loadStore } = await import("./store");
  const { createHash } = await import("node:crypto");
  const supplied = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "")?.[1]?.trim();
  if (!supplied) return { ok: false, status: 401, error: "Missing Bearer token" };
  const agent = (await loadStore()).agents.find(a => a.id === agentId);
  const digest = createHash("sha256").update(supplied).digest("hex");
  const expected = agent?.credentialHash;
  if (!expected || expected.length !== digest.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(digest))) return { ok: false, status: 401, error: "Invalid agent credential" };
  return { ok: true };
}
