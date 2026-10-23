import "server-only";
import { put, head, list } from "@vercel/blob";
import { cache } from "react";
import { buildSeedStore } from "./seed";
import type { StoreData } from "./types";

const PREFIX = "watchtower/data/";

function token(): string {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  return t;
}

async function readPath(pathname: string): Promise<StoreData | null> {
  try {
    const meta = await head(pathname, { token: token() });
    const res = await fetch(meta.downloadUrl, {
      headers: { Authorization: `Bearer ${token()}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as StoreData;
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

async function latestPath(): Promise<string | null> {
  const listed = await list({ prefix: PREFIX, token: token() });
  if (!listed.blobs.length) return null;
  listed.blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt) || b.pathname.localeCompare(a.pathname));
  return listed.blobs[0].pathname;
}

export async function saveStore(data: StoreData): Promise<void> {
  data.updatedAt = new Date().toISOString();
  const pathname = `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  await put(pathname, JSON.stringify(data), {
    access: "private",
    token: token(),
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 0,
  });
}

export async function loadStore(): Promise<StoreData> {
  try {
    const path = await latestPath();
    if (path) {
      const data = await readPath(path);
      if (data) return data;
    }
  } catch {
    /* seed */
  }
  const legacy = await readPath("watchtower/store.json");
  if (legacy) {
    await saveStore(legacy);
    return legacy;
  }
  const seeded = buildSeedStore();
  await saveStore(seeded);
  return seeded;
}

export const getStore = cache(loadStore);

let chain: Promise<unknown> = Promise.resolve();

export async function mutateStore(fn: (data: StoreData) => void | Promise<void>): Promise<StoreData> {
  const run = async () => {
    const data = structuredClone(await loadStore());
    await fn(data);
    await saveStore(data);
    return data;
  };
  const p = chain.then(run, run);
  chain = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
