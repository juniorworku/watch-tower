const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const now = '2026-10-24T08:00:00.000Z';
const fixture = { version: 1, agents: [{ id: 'a', name: 'Analyst', role: 'Research', tags: ['research'], status: 'active', platform: 'custom', type: 'agent', lastHeartbeat: now, lastActivity: now }], projects: [{ id: 'p', name: 'Launch', memberIds: ['a'], leadAgentId: 'a', body: 'Use these shared guidelines', createdAt: now, updatedAt: now }], tasks: [{ id: 't', title: 'Research brief', body: 'Prepare findings', owners: [], due: '', projectId: 'p', project: 'Launch', assigneeId: 'a', status: 'review', createdAt: now, updatedAt: now, deliverables: [{ id: 'd', agentId: 'a', title: 'Findings', content: 'Evidence and conclusions', review: 'pending', submittedAt: now }] }], activities: [{ id: 'act', agentId: 'a', kind: 'heartbeat', message: 'Online', at: now }], messages: [{ id: 'm', agentId: 'a', text: 'Standup please', createdAt: now, reply: 'Working on research', repliedAt: now }], templates: [{ id: 'template', name: 'Daily research', blueprint: { title: 'Research', body: '', priority: 'normal', projectId: 'p', subtasks: [] } }], schedules: [{ id: 'schedule', name: 'Daily briefing', templateId: 'template', cadence: 'daily', nextRunAt: now, enabled: true }] };
const viewHealth = { lastSeenAt: now, online: true, assigned: fixture.tasks, active: [], blocked: [], state: 'idle' };
fixture.agents[0].health = viewHealth;
fixture.monitoring = { trend: [], heatmap: [], currentWeek: 0, previousWeek: 0, workload: [{ agent: { id: 'a', name: 'Analyst' }, ...viewHealth }] };
const cached = new Map();
const fakeRouter = { refresh() {}, push() {} };
function load(path) {
  if (cached.has(path)) return cached.get(path);
  const mod = { exports: {} }; cached.set(path, mod.exports);
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const customRequire = id => {
    if (id === '@/lib/data/store') return { getStore: async () => structuredClone(fixture) };
    if (id === 'next/navigation') return { useRouter: () => fakeRouter, notFound() { throw new Error('Not found'); } };
    if (id === 'next/link') return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) };
    let local;
    if (id.startsWith('@/')) local = id.slice(2);
    else if (id.startsWith('./')) local = require('node:path').join(require('node:path').dirname(path), id);
    if (local) return load(fs.existsSync(`${local}.tsx`) ? `${local}.tsx` : `${local}.ts`);
    return require(id);
  };
  new Function('exports', 'require', 'module', code)(mod.exports, customRequire, mod);
  cached.set(path, mod.exports); return mod.exports;
}
test('new operational pages render populated fixtures and real form controls without runtime errors', async () => {
  const pages = [
    ['app/(dash)/automation/page.tsx', {}, ['Daily research', 'Daily briefing', 'Create schedule']],
    ['app/(dash)/messages/page.tsx', { searchParams: Promise.resolve({ agent: 'a' }) }, ['Standup please', 'Working on research', 'Answered']],
    ['app/(dash)/monitoring/page.tsx', { searchParams: Promise.resolve({}) }, ['Heartbeat history', 'Activity heatmap', 'Analyst']],
    ['app/(dash)/projects/[id]/page.tsx', { params: Promise.resolve({ id: 'p' }) }, ['Use these shared guidelines', 'Research brief', 'Lead']],
    ['app/(dash)/tasks/[id]/page.tsx', { params: Promise.resolve({ id: 't' }) }, ['Evidence and conclusions', 'Approve deliverable', 'Save template']],
    ['app/(dash)/bots/[id]/page.tsx', { params: Promise.resolve({ id: 'a' }), searchParams: Promise.resolve({ tab: 'connect' }) }, ['Generate agent setup', 'Runtime setup']],
  ];
  for (const [file, props, expected] of pages) {
    const element = await load(file).default(props);
    const html = renderToStaticMarkup(element);
    for (const text of expected) assert.ok(html.includes(text), `${file} missing ${text}`);
    assert.ok(!html.includes('credentialHash'));
  }
});

test('backend origin supports direct Compose calls and Vercel same-origin API routes', () => {
  const code = ts.transpileModule(fs.readFileSync('lib/backend-url.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  function origin(env) {
    const exports = {};
    new Function('exports', 'process', code)(exports, { env });
    return exports.backendUrl();
  }
  assert.equal(origin({}), 'http://127.0.0.1:8000');
  assert.equal(origin({ BACKEND_URL: 'http://backend:8000/' }), 'http://backend:8000');
  assert.equal(origin({ WATCHTOWER_API_SAME_ORIGIN: '1', PUBLIC_APP_URL: 'https://app.example.com/' }), 'https://app.example.com');
  assert.throws(() => origin({ WATCHTOWER_API_SAME_ORIGIN: '1' }), /PUBLIC_APP_URL/);
});

test('navigation gate redirects missing cookies without a backend round trip', () => {
  const code = ts.transpileModule(fs.readFileSync('middleware.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  new Function('exports', 'require', code)(exports, id => {
    assert.equal(id, 'next/server');
    return { NextResponse: { next: () => 'next', redirect: url => url.toString() } };
  });
  function request(path, cookie) {
    const url = new URL(path, 'https://app.example.com');
    return { url: url.href, nextUrl: url, cookies: { get: () => cookie ? { value: cookie } : undefined } };
  }
  assert.equal(exports.middleware(request('/tasks?bot=a')), 'https://app.example.com/login?next=%2Ftasks%3Fbot%3Da');
  // Presence only: signature validation still happens in the server layout/API.
  assert.equal(exports.middleware(request('/tasks', 'invalid')), 'next');
  assert.equal(exports.middleware(request('/api/tasks')), 'next');
  assert.equal(exports.middleware(request('/login')), 'next');
});

test('dashboard layout validates sessions even when a cookie is present', async () => {
  const code = ts.transpileModule(fs.readFileSync('app/(dash)/layout.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const session of [{ configured: true, authenticated: false }, { configured: false, authenticated: false }, { configured: true, authenticated: true }]) {
    const exports = {};
    new Function('exports', 'require', code)(exports, id => {
      if (id === '@/lib/api') return { backendGet: async path => { assert.equal(path, '/api/session'); return session; } };
      if (id === 'next/navigation') return { redirect: path => { throw new Error(`redirect:${path}`); } };
      if (id === 'next/link') return { default: () => null };
      if (id === '@/components/nav') return { Nav: () => null };
      return require(id);
    });
    if (!session.configured) await assert.rejects(exports.default({ children: null }), /redirect:\/locked/);
    else if (!session.authenticated) await assert.rejects(exports.default({ children: null }), /redirect:\/login/);
    else assert.ok(await exports.default({ children: null }));
  }
});
