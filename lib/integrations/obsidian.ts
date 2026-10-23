import "server-only";
import { getVault } from "../vault/source";
import { formatDateTime } from "../time";
import { nowIso, type FetchResult, type Health, type IntegrationAdapter } from "./types";

export const obsidian: IntegrationAdapter<{ noteCount: number; source: string }> = {
  id: "obsidian",
  name: "Obsidian (vault Markdown)",
  purpose: "The vault itself is the source of truth. Read from the live Google Drive folder when Drive is connected, otherwise from the snapshot bundled at build time.",
  envVars: [
    { name: "VAULT_SOURCE_DIR", required: false, description: "Build-time only: local vault folder copied into content/vault (default ../watchtower). Ignored if missing (e.g. on Vercel)." },
  ],
  setupSteps: [
    "Nothing to configure for the bundled snapshot: it is refreshed every time `npm run build` runs on a machine that has the vault at ../watchtower (or VAULT_SOURCE_DIR).",
    "To read the live vault instead, connect Google Drive (see above). The app then reads the Drive folder on each request (cached for 60 seconds).",
    "Open the same folder in Obsidian via Google Drive for desktop to edit it (see the vault README).",
  ],
  isConfigured: () => true,
  async health(): Promise<Health> {
    const v = await getVault();
    if (v.source.kind === "drive") return { status: "connected", detail: `Live from Google Drive: ${v.notes.length} notes (fetched ${formatDateTime(v.source.asOf)}).`, checkedAt: nowIso() };
    return {
      status: "snapshot",
      detail: `Bundled snapshot: ${v.notes.length} notes, taken ${formatDateTime(v.source.asOf)}.${v.source.warning ? " " + v.source.warning : ""}`,
      checkedAt: nowIso(),
    };
  },
  async fetch(): Promise<FetchResult<{ noteCount: number; source: string }>> {
    const v = await getVault();
    return { ok: true, data: { noteCount: v.notes.length, source: v.source.label }, fetchedAt: nowIso() };
  },
};
