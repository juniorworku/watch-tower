const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
function compile(path, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', 'module', code)(mod.exports, id => Object.hasOwn(imports, id) ? imports[id] : require(id), mod);
  return mod.exports;
}
const types = compile('lib/data/types.ts');
const lifecycle = compile('lib/data/lifecycle.ts');
const workflows = compile('lib/data/workflows.ts', { './lifecycle': lifecycle });
function setup() {
  let store = { agents: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }], tasks: [], activities: [], projects: [] };
  const imports = {
    '@/lib/data/types': types,
    '@/lib/data/workflows': workflows,
    '@/lib/data/lifecycle': lifecycle,
    '@/lib/data/api-auth': { requireAgentAuth: async req => req.headers.get('authorization') === 'Bearer test-key' ? { ok: true } : { ok: false, status: 401, error: 'Unauthorized' } },
    '@/lib/data/store': { newId: prefix => `${prefix}-${crypto.randomUUID()}`, loadStore: async () => structuredClone(store), mutateStore: async fn => { const draft = structuredClone(store); await fn(draft); store = draft; return store; } },
  };
  return { tasks: compile('app/api/tasks/route.ts', imports), activity: compile('app/api/agents/[id]/activity/route.ts', imports), poll: compile('app/api/agents/[id]/tasks/route.ts', imports), get: () => store };
}
const req = (body, key = 'test-key') => ({ json: async () => body, headers: new Headers({ authorization: `Bearer ${key}` }) });
const ctx = id => ({ params: Promise.resolve({ id }) });
test('API: assign, poll, progress, submit, request revision, resubmit and approve', async () => {
  const api = setup();
  const created = await api.tasks.POST(req({ title: 'Research', assigneeId: 'a', priority: 'high' }));
  assert.equal(created.status, 201);
  const { task } = await created.json();
  assert.equal(task.status, 'assigned');
  assert.equal((await api.poll.GET(req({}), ctx('a'))).status, 200);
  assert.equal((await api.poll.GET(req({}, 'wrong'), ctx('a'))).status, 401);
  assert.equal((await api.activity.POST(req({ taskId: task.id, kind: 'started', message: 'Go' }), ctx('b'))).status, 409);
  assert.equal((await api.activity.POST(req({ taskId: task.id, kind: 'started', message: 'Go' }), ctx('a'))).status, 201);
  const submitted = { taskId: task.id, kind: 'submitted', message: 'Ready', deliverable: { title: 'Findings', content: 'Evidence here' } };
  assert.equal((await api.activity.POST(req(submitted), ctx('a'))).status, 201);
  assert.equal(api.get().tasks[0].status, 'review');
  assert.equal((await api.tasks.PATCH(req({ id: task.id, status: 'DONE' }))).status, 409);
  assert.equal((await api.tasks.PATCH(req({ id: task.id, assigneeId: 'b' }))).status, 409);
  assert.equal((await api.tasks.PATCH(req({ id: task.id, action: 'request_changes' }))).status, 400);
  assert.equal((await api.tasks.PATCH(req({ id: task.id, action: 'request_changes', message: 'Add citations' }))).status, 200);
  assert.equal(api.get().tasks[0].status, 'doing');
  assert.equal((await api.activity.POST(req(submitted), ctx('a'))).status, 201);
  assert.equal((await api.tasks.PATCH(req({ id: task.id, action: 'approve', message: 'Approved' }))).status, 200);
  assert.equal(api.get().tasks[0].status, 'done');
  assert.equal(api.get().tasks[0].deliverables.length, 2);
  assert.equal((await api.activity.POST(req(submitted), ctx('a'))).status, 409);
});
test('API: invalid operations do not persist changes and comments remain attached to tasks', async () => {
  const api = setup();
  assert.equal((await api.tasks.POST(req({ title: 'Bad agent', assigneeId: 'missing' }))).status, 400);
  assert.equal(api.get().tasks.length, 0);
  const { task } = await (await api.tasks.POST(req({ title: 'Task' }))).json();
  assert.equal((await api.tasks.PATCH(req({ id: task.id, status: 'assigned' }))).status, 409);
  assert.equal(api.get().tasks[0].status, 'todo');
  assert.equal((await api.tasks.PATCH(req({ id: task.id, action: 'comment', message: 'Requirements clarified' }))).status, 200);
  assert.equal(api.get().activities[0].taskId, task.id);
  assert.equal(api.get().activities[0].actor, 'operator');
  assert.equal((await api.activity.POST(req({ kind: 'submitted', message: 'Work' }), ctx('a'))).status, 400);
});
