import "server-only";
import { put, get, list, BlobPreconditionFailedError } from "@vercel/blob";
import { cache } from "react";
import { buildSeedStore } from "./seed";
import type { StoreData } from "./types";

const STATE = "watchtower/state.json";
const PREFIX = "watchtower/data/";
function token() {
  const value = process.env.BLOB_READ_WRITE_TOKEN;
  if (!value) throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  return value;
}
async function read(path: string) {
  const result = await get(path, { access: "private", token: token(), useCache: false });
  if (!result) return null;
  if (result.statusCode !== 200) throw new Error("Unexpected storage response");
  const data = await new Response(result.stream).json() as StoreData;
  if (data?.version !== 1 || !Array.isArray(data.tasks) || !Array.isArray(data.agents)) throw new Error("Invalid stored data; refusing to replace it");
  return { data, etag: result.blob.etag };
}
async function write(data: StoreData, etag?: string) {
  data.updatedAt = new Date().toISOString();
  return put(STATE, JSON.stringify(data), {
    access: "private", token: token(), addRandomSuffix: false,
    contentType: "application/json", cacheControlMaxAge: 60,
    // A missing ETag means create only; never overwrite an unknown revision.
    ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
  });
}
async function revision() {
  const current = await read(STATE);
  if (current) return current;
  const snapshots = await list({ prefix: PREFIX, token: token() });
  if (snapshots.hasMore) {
    let cursor = snapshots.cursor;
    while (cursor) {
      const page = await list({ prefix: PREFIX, token: token(), cursor });
      snapshots.blobs.push(...page.blobs);
      cursor = page.hasMore ? page.cursor : undefined;
    }
  }
  snapshots.blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt) || b.pathname.localeCompare(a.pathname));
  const legacy = snapshots.blobs.length ? await read(snapshots.blobs[0].pathname) : await read("watchtower/store.json");
  const data = legacy?.data || buildSeedStore();
  // Preserve explicit legacy assignments when initializing project teams.
  for (const p of data.projects) {
    if (!p.memberIds) p.memberIds = [...new Set(data.tasks.filter(t => (t.projectId === p.id || (!t.projectId && t.project.toLowerCase() === p.name.toLowerCase())) && t.assigneeId).map(t => t.assigneeId!))];
  }
  for (const t of data.tasks) if (!t.projectId) t.projectId = data.projects.find(p => p.name.toLowerCase() === t.project.toLowerCase())?.id || null;
  try {
    const result = await write(data);
    return { data, etag: result.etag };
  } catch (error) {
    // Another instance may have initialized the canonical state first.
    const winner = await read(STATE);
    if (winner) return winner;
    throw error;
  }
}
export async function loadStore(): Promise<StoreData> { return (await revision()).data; }
export const getStore = cache(loadStore);

// Callbacks must be retry-safe: only change the supplied draft, no external I/O.
export async function mutateStore(fn: (data: StoreData) => void | Promise<void>): Promise<StoreData> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await revision();
    const draft = structuredClone(current.data);
    await fn(draft);
    try { await write(draft, current.etag); return draft; }
    catch (error) { if (!(error instanceof BlobPreconditionFailedError)) throw error; }
  }
  throw new Error("Store is busy; retry this request");
}
export function newId(prefix: string) { return `${prefix}-${crypto.randomUUID()}`; }
