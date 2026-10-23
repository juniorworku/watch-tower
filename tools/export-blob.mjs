// Read-only legacy export. Never creates, changes, or deletes remote Blob objects.
import { get, list } from '@vercel/blob';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const target = process.argv[2];
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!target || !token) throw new Error('Usage: node [--env-file=...] tools/export-blob.mjs exports/state.json (BLOB_READ_WRITE_TOKEN required)');
async function read(name) {
  const blob = await get(name, { access: 'private', token, useCache: false });
  if (!blob) return null;
  if (blob.statusCode !== 200) throw new Error('Unexpected Blob response');
  const data = await new Response(blob.stream).json();
  if (data.version !== 1 || !Array.isArray(data.tasks) || !Array.isArray(data.agents)) throw new Error('Invalid Watch Tower state; export aborted');
  return data;
}
let value = await read('watchtower/state.json');
if (!value) {
  const blobs = []; let cursor;
  do {
    const page = await list({ prefix: 'watchtower/data/', token, ...(cursor ? { cursor } : {}) });
    blobs.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt) || b.pathname.localeCompare(a.pathname));
  value = await read(blobs[0]?.pathname || 'watchtower/store.json');
}
if (!value) throw new Error('No legacy state was found; no export was written');
await mkdir(path.dirname(path.resolve(target)), { recursive: true, mode: 0o700 });
await writeFile(target, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
console.log(`Exported ${value.tasks.length} tasks and ${value.agents.length} agents to ${target}. Remote data was not changed.`);
