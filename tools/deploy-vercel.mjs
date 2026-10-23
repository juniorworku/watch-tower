#!/usr/bin/env node
/** Deploy the two HTTP containers as one Vercel Services project. */
import { cp, copyFile, lstat, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const ignored = new Set(['.git', '.vercel', '.next', '.venv', 'node_modules', '__pycache__', '.pytest_cache', 'data', 'exports', '.secrets']);

export function includeSource(path) {
  const name = basename(path);
  return !ignored.has(name) && !name.startsWith('.env') && !/\.(sqlite3(?:-.*)?|tsbuildinfo|pyc)$/.test(name);
}

export function validateProduction(values) {
  // Vercel returns this marker for configured, non-exportable production Secrets.
  // Check their presence without requiring operators to reveal the value locally.
  if (values.DATABASE_URL !== '[SENSITIVE]') {
    let database;
    try { database = new URL(values.DATABASE_URL); } catch { throw new Error('Set DATABASE_URL to a managed PostgreSQL connection URL in Vercel Production environment variables.'); }
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || ['db', 'localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(database.hostname)) {
      throw new Error('DATABASE_URL must point to hosted PostgreSQL, not your local Docker database.');
    }
  }
  if (!values.DASHBOARD_PASSWORD_HASH?.trim() && !values.DASHBOARD_PASSWORD?.trim()) {
    throw new Error('Set DASHBOARD_PASSWORD_HASH (preferred) or DASHBOARD_PASSWORD in Vercel Production environment variables.');
  }
  if (values.DASHBOARD_PASSWORD_HASH?.trim() && values.DASHBOARD_PASSWORD_HASH !== '[SENSITIVE]' && !/^scrypt\$[a-fA-F0-9]{32}\$[a-fA-F0-9]{128}$/.test(values.DASHBOARD_PASSWORD_HASH.trim())) {
    throw new Error('DASHBOARD_PASSWORD_HASH must use the app\'s scrypt format; generate it with the backend hash-password command.');
  }
  let publicUrl;
  try { publicUrl = new URL(values.PUBLIC_APP_URL); } catch { throw new Error('Set PUBLIC_APP_URL to your production HTTPS domain in Vercel.'); }
  if (publicUrl.protocol !== 'https:' || ['localhost', '127.0.0.1'].includes(publicUrl.hostname)) {
    throw new Error('PUBLIC_APP_URL must be your production HTTPS domain.');
  }
  for (const [key, expected] of [['COOKIE_SECURE', '1'], ['WATCHTOWER_ENV_FILES', '0'], ['WATCHTOWER_SEED_FROM_SNAPSHOT', '0']]) {
    if (values[key] !== undefined && values[key] !== expected) throw new Error(`Set ${key}=${expected} in Vercel or remove it to use the container default.`);
  }
  if (values.BACKEND_URL) throw new Error('Remove BACKEND_URL from Vercel project variables; the frontend service binding supplies it automatically.');
}

export async function stageSource(destination) {
  await mkdir(destination, { recursive: true });
  for (const name of ['package.json', 'package-lock.json', 'vercel.json', '.dockerignore', '.vercelignore', 'frontend', 'backend']) {
    await cp(join(root, name), join(destination, name), {
      recursive: true,
      filter: async source => includeSource(source) && !(await lstat(source)).isSymbolicLink(),
    });
  }
  // The workspace installer needs only this manifest, not local operational tools.
  await mkdir(join(destination, 'tools'));
  await copyFile(join(root, 'tools/package.json'), join(destination, 'tools/package.json'));
}

function cli(args, cwd) {
  const result = spawnSync(process.env.WATCHTOWER_VERCEL_BIN || 'vercel', args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error?.code === 'ENOENT') throw new Error('Install the current Vercel CLI (npm install -g vercel), then run vercel login.');
  if (result.error) throw new Error('Unable to start the Vercel CLI.');
  if (result.status !== 0) throw new Error('Vercel command failed. Check the CLI output above; no local database was changed.');
}

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm run deploy:vercel [-- --check]\nDeploys both HTTP containers using Vercel Services (beta). Requires a managed PostgreSQL database and Production variables configured in Vercel. --check validates the upload locally without contacting Vercel.');
    return;
  }
  if (args.some(arg => arg !== '--check')) throw new Error('Unknown option; use --help.');
  const temporary = await mkdtemp(join(tmpdir(), 'watchtower-vercel-'));
  const staging = join(temporary, 'watchtower');
  try {
    await stageSource(staging);
    if (args.includes('--check')) {
      console.log('Upload prepared: both Docker services, frontend binding, no dotenv files, local databases, or exports. No deployment made.');
      return;
    }
    const linkFile = join(root, '.vercel/watchtower/project.json');
    const stagedLink = join(staging, '.vercel/project.json');
    if (await exists(linkFile)) {
      await mkdir(dirname(stagedLink), { recursive: true });
      await copyFile(linkFile, stagedLink);
    } else {
      const linkArgs = ['link', '--yes', '--project', process.env.WATCHTOWER_VERCEL_PROJECT || 'watchtower'];
      if (process.env.WATCHTOWER_VERCEL_SCOPE) linkArgs.push('--scope', process.env.WATCHTOWER_VERCEL_SCOPE);
      cli(linkArgs, staging);
      await mkdir(dirname(linkFile), { recursive: true });
      await copyFile(stagedLink, linkFile);
    }
    // Read production settings privately. Never pass secret values as CLI arguments.
    const envPath = join(staging, '.vercel/production.env');
    cli(['env', 'pull', envPath, '--environment=production', '--yes'], staging);
    try { validateProduction(parseEnv(await readFile(envPath, 'utf8'))); }
    finally { await rm(envPath, { force: true }); }
    console.log('Required production variables present; readable values validated. Deploying both containers…');
    cli(['deploy', '--prod', '--yes'], staging);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error(`Deploy: ${error.message}`); process.exitCode = 1; });
}
