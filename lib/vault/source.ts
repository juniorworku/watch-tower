import "server-only";
import { cache } from "react";
import snapshot from "@/content/vault-snapshot.json";
import { googleConfigured } from "../integrations/google-auth";
import { fetchVaultFromDrive } from "../integrations/google-drive";
import { errorMessage } from "../integrations/types";
import { parseNote } from "./parse";
import type { RawFile, Vault } from "./types";

const TTL_MS = 60_000;
let driveCache: { at: number; files: RawFile[] } | null = null;
let driveFailure: { at: number; message: string } | null = null; // avoid hammering Drive (and slow pages) after a failure

function snapshotVault(warning?: string): Vault {
  return {
    notes: (snapshot.files as RawFile[]).map(parseNote),
    source: { kind: "snapshot", label: "Bundled snapshot", asOf: snapshot.takenAt, warning },
  };
}

async function load(): Promise<Vault> {
  if (!googleConfigured()) return snapshotVault();
  if (driveFailure && Date.now() - driveFailure.at < TTL_MS) return snapshotVault(driveFailure.message);
  try {
    if (!driveCache || Date.now() - driveCache.at > TTL_MS) {
      const files = await fetchVaultFromDrive();
      if (files.length === 0) throw new Error("Drive folder returned no Markdown files");
      driveCache = { at: Date.now(), files };
      driveFailure = null;
    }
    return { notes: driveCache.files.map(parseNote), source: { kind: "drive", label: "Live from Google Drive", asOf: new Date(driveCache.at).toISOString() } };
  } catch (e) {
    driveFailure = { at: Date.now(), message: `Google Drive is configured but the live read failed (${errorMessage(e)}), so this is the bundled snapshot.` };
    return snapshotVault(driveFailure.message);
  }
}

/** Per-request cached vault load. */
export const getVault = cache(load);
