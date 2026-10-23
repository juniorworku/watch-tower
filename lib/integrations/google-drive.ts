import "server-only";
import { GOOGLE_BASE_ENV, GOOGLE_SETUP_STEPS, googleAccessToken, googleConfigured, googleGet } from "./google-auth";
import { errorMessage, nowIso, notConfigured, type FetchResult, type Health, type IntegrationAdapter } from "./types";
import type { RawFile } from "../vault/types";

export const DEFAULT_VAULT_FOLDER_ID = "1CHIRqiewFlQF4JvzPgxXJDRSV2L-lXdl";
const folderId = () => process.env.GOOGLE_DRIVE_VAULT_FOLDER_ID || DEFAULT_VAULT_FOLDER_ID;

type DriveFile = { id: string; name: string; mimeType: string };

async function listChildren(id: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken = "";
  do {
    const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const j = await googleGet<{ files: DriveFile[]; nextPageToken?: string }>(url);
    out.push(...(j.files || []));
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}

async function downloadText(id: string): Promise<string> {
  const token = await googleAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading Drive file`);
  return res.text();
}

/** Walk the vault folder in Drive and return every Markdown file (read-only). */
export async function fetchVaultFromDrive(): Promise<RawFile[]> {
  const files: RawFile[] = [];
  const queue: { id: string; prefix: string; depth: number }[] = [{ id: folderId(), prefix: "", depth: 0 }];
  while (queue.length) {
    const { id, prefix, depth } = queue.shift()!;
    const children = await listChildren(id);
    const mdJobs: Promise<void>[] = [];
    for (const c of children) {
      if (c.name.startsWith(".")) continue;
      if (c.mimeType === "application/vnd.google-apps.folder") {
        if (depth < 6) queue.push({ id: c.id, prefix: prefix + c.name + "/", depth: depth + 1 });
      } else if (c.name.toLowerCase().endsWith(".md")) {
        mdJobs.push(downloadText(c.id).then((content) => void files.push({ path: prefix + c.name, content })));
      }
    }
    await Promise.all(mdJobs);
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export const googleDrive: IntegrationAdapter<{ fileCount: number }> = {
  id: "google-drive",
  name: "Google Drive (vault sync)",
  purpose: "Reads the live Watch Tower vault (Markdown) from the Drive folder instead of the bundled snapshot.",
  envVars: [
    ...GOOGLE_BASE_ENV,
    { name: "GOOGLE_DRIVE_VAULT_FOLDER_ID", required: false, description: `Drive folder id of the vault. Defaults to ${DEFAULT_VAULT_FOLDER_ID}.` },
  ],
  setupSteps: [...GOOGLE_SETUP_STEPS, "Optional: set GOOGLE_DRIVE_VAULT_FOLDER_ID if the vault folder moves."],
  isConfigured: googleConfigured,
  async health(): Promise<Health> {
    if (!googleConfigured()) return { status: "not_configured", detail: "Not connected. Using the bundled vault snapshot.", checkedAt: nowIso() };
    try {
      const f = await googleGet<{ name: string }>(`https://www.googleapis.com/drive/v3/files/${folderId()}?fields=id,name&supportsAllDrives=true`);
      return { status: "connected", detail: `Vault folder "${f.name}" reachable (read-only).`, checkedAt: nowIso() };
    } catch (e) {
      return { status: "error", detail: errorMessage(e), checkedAt: nowIso() };
    }
  },
  async fetch(): Promise<FetchResult<{ fileCount: number }>> {
    if (!googleConfigured()) return notConfigured(this.name);
    try {
      const files = await fetchVaultFromDrive();
      return { ok: true, data: { fileCount: files.length }, fetchedAt: nowIso() };
    } catch (e) {
      return { ok: false, reason: "error", message: errorMessage(e) };
    }
  },
};
