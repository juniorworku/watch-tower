export type EnvVarSpec = { name: string; required: boolean; description: string; secret?: boolean; configured?: boolean };

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

/** Public provider metadata returned by FastAPI. No credentials or execution methods. */
export interface IntegrationInfo {
  id: string;
  name: string;
  purpose: string;
  envVars: EnvVarSpec[];
  setupSteps: string[];
}

