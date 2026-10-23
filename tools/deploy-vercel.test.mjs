import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { includeSource, stageSource, validateProduction } from './deploy-vercel.mjs';

test('deployment excludes credentials and persistent local state', async () => {
  for (const path of ['.env', '.env.local', 'backend/.env.docker', 'backend/.env.postgres', 'backend/data', 'node_modules', 'state.sqlite3', 'state.sqlite3-wal', 'exports', '.secrets']) {
    assert.equal(includeSource(path), false, path);
  }
  const temporary = await mkdtemp(join(tmpdir(), 'watchtower-upload-test-'));
  try {
    await stageSource(temporary);
    async function inspect(path) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        assert.equal(includeSource(join(path, entry.name)), true);
        if (entry.isDirectory()) await inspect(join(path, entry.name));
      }
    }
    await inspect(temporary);
    const config = JSON.parse(await readFile(join(temporary, 'vercel.json')));
    assert.equal(config.services.frontend.bindings[0].env, 'BACKEND_URL');
    assert.equal(config.services.backend.runtime, 'container');
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('production validation rejects missing credentials and Docker-only URLs', () => {
  const good = { DATABASE_URL: 'postgresql://user:fake@example.com/watchtower?sslmode=require', DASHBOARD_PASSWORD_HASH: `scrypt$${'11'.repeat(16)}$${'22'.repeat(64)}`, PUBLIC_APP_URL: 'https://watchtower.example.com' };
  assert.doesNotThrow(() => validateProduction(good));
  assert.doesNotThrow(() => validateProduction({ ...good, DATABASE_URL: '[SENSITIVE]', DASHBOARD_PASSWORD_HASH: '[SENSITIVE]' }));
  for (const update of [
    { DATABASE_URL: '' }, { DATABASE_URL: 'postgresql://db/watchtower' },
    { DATABASE_URL: 'postgresql://localhost/watchtower' }, { DATABASE_URL: 'https://example.com' },
    { DASHBOARD_PASSWORD_HASH: '' }, { DASHBOARD_PASSWORD_HASH: 'malformed' }, { PUBLIC_APP_URL: 'http://localhost:3002' },
    { COOKIE_SECURE: '0' }, { WATCHTOWER_ENV_FILES: '1' },
    { WATCHTOWER_SEED_FROM_SNAPSHOT: '1' }, { BACKEND_URL: 'http://backend:8000' },
  ]) assert.throws(() => validateProduction({ ...good, ...update }));
});
