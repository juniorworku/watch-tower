const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const now = '2026-10-24T08:00:00.000Z';
const fixture = { version: 1, agents: [{ id: 'a', name: 'Analyst', role: 'Research', tags: ['research'], status: 'active', platform: 'custom', type: 'agent', lastHeartbeat: now, lastActivity: now }], projects: [{ id: 'p', name: 'Launch', memberIds: ['a'], leadAgentId: 'a', body: 'Use these shared guidelines', createdAt: now, updatedAt: now }], tasks: [{ id: 't', title: 'Research brief', body: 'Prepare findings', owners: [], due: '', projectId: 'p', project: 'Launch', assigneeId: 'a', status: 'review', createdAt: now, updatedAt: now, deliverables: [{ id: 'd', agentId: 'a', title: 'Findings', content: 'Evidence and conclusions', review: 'pending', submittedAt: now }] }], activities: [{ id: 'act', agentId: 'a', kind: 'heartbeat', message: 'Online', at: now }], messages: [{ id: 'm', agentId: 'a', text: 'Standup please', createdAt: now, reply: 'Working on research', repliedAt: now }], templates: [{ id: 'template', name: 'Daily research', blueprint: { title: 'Research', body: '', priority: 'normal', projectId: 'p', subtasks: [] } }], schedules: [{ id: 'schedule', name: 'Daily briefing', templateId: 'template', cadence: 'daily', nextRunAt: now, enabled: true }] };
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
