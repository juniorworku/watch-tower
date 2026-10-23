export type EnvVarSpec = { name: string; required: boolean; description: string; secret?: boolean };

export type HealthStatus = "connected" | "not_configured" | "error" | "snapshot";

export type Health = {
  status: HealthStatus;
  /** Short human-readable detail, never contains secrets. */
  detail: string;
  checkedAt: string;
};

export type FetchResult<T> =
  | { ok: true; data: T; fetchedAt: string }
  | { ok: false; reason: "not_configured" | "error"; message: string };

/** Common interface every integration adapter implements. Server-side only, read-only (v1). */
export interface IntegrationAdapter<T = unknown> {
  id: string;
  name: string;
  purpose: string;
  envVars: EnvVarSpec[];
  setupSteps: string[];
  isConfigured(): boolean;
  health(): Promise<Health>;
  fetch(): Promise<FetchResult<T>>;
}

export function nowIso() {
  return new Date().toISOString();
}

export function notConfigured<T>(name: string): FetchResult<T> {
  return { ok: false, reason: "not_configured", message: `${name} is not connected.` };
}

export function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  // Defensive: never leak anything token-shaped into the UI.
  return msg.replace(/(xox[a-z]-[\w-]+|secret_[\w]+|ntn_[\w]+|ya29\.[\w.-]+|1\/\/[\w-]+)/gi, "[redacted]").slice(0, 300);
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 8000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 200);
      try {
        const j = JSON.parse(text);
        detail = j?.error?.message || j?.error_description || j?.message || (typeof j?.error === "string" ? j.error : detail);
      } catch {}
      throw new Error(`HTTP ${res.status}: ${detail}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}
