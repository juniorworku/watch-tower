const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile, lifecycle, workflows } = require('./helpers.cjs');
function setup() {
  let store = { version: 1, agents: [{ id: 'a', name: 'Alpha', tags: [], status: 'active' }, { id: 'b', name: 'Beta', tags: [], status: 'active' }], projects: [], tasks: [], activities: [] };
  const imports = { '@/lib/data/lifecycle': lifecycle, '@/lib/data/workflows': workflows,
    '@/lib/data/api-auth': { requireAgentAuth: async (req, id) => req.headers.get('authorization') === `Bearer ${id}` ? { ok: true } : { ok: false, error: 'Unauthorized', status: 401 } },
    '@/lib/data/store': { newId: p => `${p}-${crypto.randomUUID()}`, loadStore: async () => structuredClone(store), mutateStore: async fn => { const draft = structuredClone(store); await fn(draft); store = draft; return store; } } };
  return { get: () => store, projects: compile('app/api/projects/route.ts', imports), automation: compile('app/api/automation/route.ts', imports), messages: compile('app/api/messages/route.ts', imports), inbox: compile('app/api/agents/[id]/messages/route.ts', imports), poll: compile('app/api/agents/[id]/tasks/route.ts', imports), delegate: compile('app/api/agents/[id]/delegate/route.ts', imports), setup: compile('app/api/registry/[id]/setup/route.ts', imports), cron: compile('app/api/cron/route.ts', imports) };
}
const req = (body, id = 'a') => ({ json: async () => body, headers: new Headers({ authorization: `Bearer ${id}` }) });
const ctx = id => ({ params: Promise.resolve({ id }) });
test('messages stay queued until acknowledged, enforce agent ownership and preserve replies', async () => {
  const api = setup();
  const created = await api.messages.POST(req({ agentId: 'a', text: 'Give me a standup' }));
  assert.equal(created.status, 201); const { message } = await created.json();
  assert.equal(api.get().messages[0].deliveredAt, undefined);
  assert.equal((await api.inbox.GET(req({}, 'b'), ctx('a'))).status, 401);
  assert.equal((await api.inbox.POST(req({ messageId: message.id }, 'b'), ctx('b'))).status, 404);
  assert.equal((await api.inbox.POST(req({ messageId: message.id }), ctx('a'))).status, 200);
  assert.ok(api.get().messages[0].deliveredAt);
  assert.equal((await api.inbox.POST(req({ messageId: message.id, reply: 'Working on the report' }), ctx('a'))).status, 200);
  assert.equal(api.get().messages[0].reply, 'Working on the report');
  const remaining = await (await api.inbox.GET(req({}), ctx('a'))).json(); assert.equal(remaining.messages.length, 0);
  assert.equal((await api.inbox.POST(req({ messageId: message.id, reply: 'Duplicate' }), ctx('a'))).status, 409);
});
test('project membership scopes shared context and a lead can delegate cross-agent subtasks', async () => {
  const api = setup();
  const response = await api.projects.POST(req({ name: 'Delivery', memberIds: ['a'], leadAgentId: 'a', body: 'Project guidelines' }));
  const { project } = await response.json(); assert.equal(project.body, 'Project guidelines');
  assert.equal((await api.automation.POST(req({ action: 'save_template', name: 'Build', blueprint: { title: 'Feature', body: '', priority: 'normal', projectId: project.id } }))).status, 200);
  const template = api.get().templates[0];
  const result = await (await api.automation.POST(req({ action: 'instantiate', templateId: template.id }))).json();
  const parentId = result.result.id;
  assert.equal((await api.delegate.POST(req({ parentTaskId: parentId, title: 'Write', assigneeId: 'b' }), ctx('a'))).status, 400);
  assert.equal(api.get().tasks.length, 1);
  await api.projects.PATCH(req({ id: project.id, memberIds: ['a', 'b'] }));
  assert.equal((await api.delegate.POST(req({ parentTaskId: parentId, title: 'Write', assigneeId: 'b' }), ctx('a'))).status, 201);
  assert.equal((await api.delegate.POST(req({ parentTaskId: parentId, title: 'Unauthorized' }, 'b'), ctx('b'))).status, 403);
  const context = await (await api.poll.GET(req({}, 'b'), ctx('b'))).json();
  assert.equal(context.projects[0].body, 'Project guidelines'); assert.equal(context.projectTasks.length, 2);
  assert.equal((await api.projects.PATCH(req({ id: project.id, memberIds: ['a'] }))).status, 409);
});
test('template schedules are editable, pausable, idempotent and protect referenced templates', async () => {
  const api = setup();
  const saved = await api.automation.POST(req({ action: 'save_template', name: 'Daily', blueprint: { title: 'Report', body: 'Describe findings', priority: 'high' } }));
  assert.equal(saved.status, 200); const templateId = api.get().templates[0].id;
  assert.equal((await api.automation.POST(req({ action: 'save_schedule', templateId, name: 'Report', cadence: 'daily', nextRunAt: new Date().toISOString() }))).status, 200);
  assert.equal((await api.automation.POST(req({ action: 'delete_template', id: templateId }))).status, 409);
  let response = await (await api.automation.POST(req({ action: 'tick' }))).json(); assert.equal(response.result.created, 1);
  response = await (await api.automation.POST(req({ action: 'tick' }))).json(); assert.equal(response.result.created, 0);
  assert.equal((await api.automation.POST(req({ action: 'toggle_schedule', id: api.get().schedules[0].id }))).status, 200);
  assert.equal(api.get().schedules[0].enabled, false);
});

test('setup generates scoped runtime files, stores only the credential hash and supports revocation', async () => {
  const api = setup();
  const request = { ...req({}), nextUrl: { origin: 'https://watchtower.example' } };
  const response = await api.setup.POST(request, ctx('a'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { files } = await response.json();
  const config = JSON.parse(files['watchtower-agent.json']);
  assert.equal(config.agentId, 'a'); assert.match(config.apiKey, /^wt_/);
  assert.ok(files['HEARTBEAT.md'].includes(config.apiKey));
  assert.ok(files['PLAYBOOK.md'].includes('Never approve your own deliverable'));
  assert.ok(files['agent-runner.mjs'].includes('WATCHTOWER_TASK_COMMAND'));
  const hash = api.get().agents[0].credentialHash;
  assert.equal(hash, require('node:crypto').createHash('sha256').update(config.apiKey).digest('hex'));
  assert.ok(!JSON.stringify(api.get()).includes(config.apiKey));
  const rotated = await api.setup.POST(request, ctx('a')); assert.equal(rotated.status, 200);
  assert.notEqual(api.get().agents[0].credentialHash, hash);
  assert.equal((await api.setup.POST(req({ action: 'revoke' }), ctx('a'))).status, 200);
  assert.equal(api.get().agents[0].credentialHash, undefined);
});
test('cron is authenticated separately from dashboard sessions', async () => {
  process.env.CRON_SECRET = 'cron-test';
  const api = setup();
  assert.equal((await api.cron.GET(req({}))).status, 401);
  const response = await api.cron.GET(req({}, 'cron-test'));
  assert.equal(response.status, 200); assert.equal((await response.json()).created, 0);
  delete process.env.CRON_SECRET;
  assert.equal((await api.cron.GET(req({}, 'cron-test'))).status, 503);
});
