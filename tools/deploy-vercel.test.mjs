import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
import { includeSource, missingProduction, stageSource, validateProduction, verifyDeployment } from './deploy-vercel.mjs';

test('a ready deployment must also pass runtime checks', async () => {
  const request = async url => new Response(JSON.stringify(url.pathname === '/health' ? { status: 'ok' } : { configured: true }), { status: 200 });
  await verifyDeployment('https://app.example.com', { request, attempts: 1 });
  await assert.rejects(verifyDeployment('https://app.example.com', { request: async () => new Response('', { status: 500 }), attempts: 1 }), /runtime verification failed.*HTTP 500/);
  await assert.rejects(verifyDeployment('https://app.example.com', { request: async () => new Response('', { status: 302 }), attempts: 1 }), /Deployment Protection/);
});

test('guided setup adds only missing settings and preserves configured Secrets', () => {
  assert.deepEqual(missingProduction({}), ['DATABASE_URL', 'DASHBOARD_PASSWORD', 'PUBLIC_APP_URL']);
  assert.deepEqual(missingProduction({ DATABASE_URL: '[SENSITIVE]', DASHBOARD_PASSWORD_HASH: '[SENSITIVE]' }), ['PUBLIC_APP_URL']);
  assert.deepEqual(missingProduction({ DATABASE_URL: '[SENSITIVE]', DASHBOARD_PASSWORD: '[SENSITIVE]', PUBLIC_APP_URL: 'https://app.example.com' }), []);
});

test('deployment excludes credentials and persistent local state', async () => {
  for (const path of ['.env', '.env.local', 'backend/.env.docker', 'backend/.env.postgres', 'data', 'backend/data', 'node_modules', 'state.sqlite3', 'state.sqlite3-wal', 'exports', '.secrets']) {
    assert.equal(includeSource(path), false, path);
  }
  assert.equal(includeSource('frontend/lib/data'), true);
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
    for (const name of ['types', 'store', 'lifecycle', 'monitoring', 'workflows']) {
      assert.ok((await readFile(join(temporary, `frontend/lib/data/${name}.ts`))).length);
    }
    // Vercel ignore patterns use gitignore semantics, including anchoring.
    assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: temporary }).status, 0);
    await copyFile(join(temporary, '.vercelignore'), join(temporary, '.gitignore'));
    assert.equal(spawnSync('git', ['check-ignore', '--no-index', '-q', 'frontend/lib/data/store.ts'], { cwd: temporary }).status, 1);
    assert.equal(spawnSync('git', ['check-ignore', '--no-index', '-q', 'backend/data/state.sqlite3'], { cwd: temporary }).status, 0);
    assert.deepEqual(config.rewrites[0], { source: '/api/(.*)', destination: { service: 'backend' } });
    assert.equal(config.services.backend.runtime, 'container');
    // Vercel gives each Dockerfile only its own service directory as context.
    for (const service of Object.values(config.services)) {
      const context = join(temporary, service.root);
      const dockerfile = await readFile(join(context, service.entrypoint), 'utf8');
      for (const line of dockerfile.split('\n')) {
        if (!line.startsWith('COPY ') || line.includes('--from=')) continue;
        for (const source of line.split(/\s+/).slice(1, -1)) {
          assert.ok(await stat(join(context, source)), `${service.root}: missing COPY source ${source}`);
        }
      }
    }
    const manifest = JSON.parse(await readFile(join(temporary, 'frontend/package.json')));
    const lock = JSON.parse(await readFile(join(temporary, 'frontend/package-lock.json')));
    assert.deepEqual(lock.packages[''].dependencies, manifest.dependencies);
    assert.deepEqual(lock.packages[''].devDependencies, manifest.devDependencies);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});

test('production validation rejects missing credentials and Docker-only URLs', () => {
  assert.throws(() => validateProduction({}), error => ['DATABASE_URL', 'DASHBOARD_PASSWORD_HASH', 'PUBLIC_APP_URL'].every(key => error.message.includes(key)));
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
