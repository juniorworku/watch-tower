const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile, workflows } = require('./helpers.cjs');
process.env.BLOB_READ_WRITE_TOKEN = 'storage-test';
class Conflict extends Error {}
function fakeStore(fixture) {
  let state = structuredClone(fixture), version = 1, writes = 0;
  const sdk = {
    BlobPreconditionFailedError: Conflict,
    get: async path => path === 'watchtower/state.json' ? { statusCode: 200, stream: new Response(JSON.stringify(state)).body, blob: { etag: String(version) } } : null,
    put: async (path, text, options) => { if (options.ifMatch !== String(version)) throw new Conflict(); state = JSON.parse(text); version++; writes++; return { etag: String(version) }; },
    list: async () => ({ blobs: [], hasMore: false }),
  };
  const store = compile('lib/data/store.ts', { 'server-only': {}, '@vercel/blob': sdk, react: { cache: fn => fn }, './seed': { buildSeedStore: () => fixture } });
  return { store, get: () => state, writes: () => writes };
}
test('conditional retries make concurrent agent claims exclusive across instances', async () => {
  const fixture = { version: 1, agents: [{ id: 'a', tags: [] }, { id: 'b', tags: [] }], projects: [], activities: [], tasks: [{ id: 't', title: 'Work', status: 'todo', project: '', createdAt: '2026-10-24T00:00:00Z' }] };
  const fake = fakeStore(fixture);
  const now = '2026-10-24T00:00:00Z';
  let a, b;
  await Promise.all([
    fake.store.mutateStore(s => { a = workflows.claimNext(s, 'a', now); }),
    fake.store.mutateStore(s => { b = workflows.claimNext(s, 'b', now); }),
  ]);
  assert.equal(Number(!!a) + Number(!!b), 1);
  assert.equal(fake.get().tasks[0].assignmentHistory.length, 1);
  assert.equal(fake.get().activities.filter(a => a.kind === 'claimed').length, 1);
});
test('concurrent unrelated updates survive retry and read failures never overwrite with seeds', async () => {
  const fake = fakeStore({ version: 1, tasks: [], agents: [], projects: [], activities: [], logs: [] });
  await Promise.all([fake.store.mutateStore(s => s.logs.push({ id: 'a' })), fake.store.mutateStore(s => s.logs.push({ id: 'b' }))]);
  assert.deepEqual(fake.get().logs.map(l => l.id).sort(), ['a', 'b']);
  let wrote = false;
  const broken = compile('lib/data/store.ts', { 'server-only': {}, '@vercel/blob': { get: async () => { throw new Error('network down'); }, put: async () => { wrote = true; }, BlobPreconditionFailedError: Conflict }, react: { cache: fn => fn }, './seed': { buildSeedStore: () => ({}) } });
  await assert.rejects(broken.loadStore(), /network down/); assert.equal(wrote, false);
});
test('legacy snapshot migration picks the newest snapshot across pages and preserves records', async () => {
  let canonical = null; let requestedCursor = false;
  const older = { version: 1, tasks: [{ id: 'older', project: '' }], agents: [], projects: [] };
  const newest = { version: 1, tasks: [{ id: 'latest', project: '' }], agents: [], projects: [], activities: [] };
  const sdk = {
    BlobPreconditionFailedError: Conflict,
    get: async path => {
      const data = path === 'watchtower/state.json' ? canonical : path.endsWith('new.json') ? newest : older;
      return data ? { statusCode: 200, stream: new Response(JSON.stringify(data)).body, blob: { etag: 'v1' } } : null;
    },
    list: async ({ cursor }) => { requestedCursor ||= !!cursor; return cursor ? { blobs: [{ pathname: 'watchtower/data/new.json', uploadedAt: new Date('2026-10-24') }], hasMore: false } : { blobs: [{ pathname: 'watchtower/data/old.json', uploadedAt: new Date('2026-10-20') }], hasMore: true, cursor: 'page2' }; },
    put: async (path, text, options) => { assert.equal(path, 'watchtower/state.json'); assert.equal(options.allowOverwrite, false); canonical = JSON.parse(text); return { etag: 'v1' }; },
  };
  const store = compile('lib/data/store.ts', { 'server-only': {}, '@vercel/blob': sdk, react: { cache: fn => fn }, './seed': { buildSeedStore: () => { throw new Error('Should not seed'); } } });
  assert.equal((await store.loadStore()).tasks[0].id, 'latest'); assert.equal(requestedCursor, true);
});
