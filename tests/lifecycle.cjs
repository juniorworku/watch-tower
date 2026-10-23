const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const mod = { exports: {} };
new Function('exports', 'require', 'module', ts.transpileModule(fs.readFileSync('lib/data/lifecycle.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod.exports, require, mod);
const { assignTask, setTaskStatus, agentHealth, submitDeliverable, reviewDeliverable } = mod.exports;
const now = '2026-10-23T12:00:00.000Z';
test('assignment validates agents, records reassignment and resets work for new owner', () => {
  const store = { agents: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], activities: [] };
  const task = { id: 't', status: 'todo' };
  assert.throws(() => assignTask(store, task, 'missing', now), /assignee not found/);
  assert.equal(task.assigneeId, undefined);
  assignTask(store, task, 'a', now);
  assignTask(store, task, 'a', now);
  assert.equal(task.assignmentHistory.length, 1);
  setTaskStatus(task, 'doing', now);
  task.currentRunId = 'old-run';
  assignTask(store, task, 'b', now);
  assert.equal(task.status, 'assigned');
  assert.equal(task.currentRunId, null);
  assert.deepEqual(task.assignmentHistory[1], { fromId: 'a', toId: 'b', at: now, reason: 'Dashboard assignment' });
  assignTask(store, task, null, now, 'Declined');
  assert.equal(task.assigneeId, null);
  assert.equal(store.activities[0].taskId, 't');
});
test('health uses newest signal, distinguishes blocked workload and expires online state', () => {
  const agent = { id: 'a', lastHeartbeat: '2026-10-23T11:00:00Z', lastActivity: now };
  const tasks = [{ assigneeId: 'a', status: 'blocked' }, { assigneeId: 'b', status: 'doing' }];
  assert.equal(agentHealth(agent, tasks, Date.parse(now)).state, 'blocked');
  assert.equal(agentHealth(agent, tasks, Date.parse(now) + 1800001).state, 'offline');
  assert.equal(agentHealth({ id: 'a' }, [], Date.parse(now)).lastSeenAt, null);
});
test('status timestamps change only when status changes', () => {
  const task = { status: 'todo', lastStatusChangeAt: 'original' };
  setTaskStatus(task, 'todo', now);
  assert.equal(task.lastStatusChangeAt, 'original');
  setTaskStatus(task, 'doing', now);
  assert.equal(task.lastStatusChangeAt, now);
  assert.equal(task.updatedAt, now);
});

test('heartbeat interval tolerates two missed intervals', () => {
  const agent = { id: 'a', lastHeartbeat: now, heartbeatIntervalMinutes: 5 };
  assert.equal(agentHealth(agent, [], Date.parse(now) + 600000).online, true);
  assert.equal(agentHealth(agent, [], Date.parse(now) + 600001).online, false);
});
test('deliverables require ownership and safe URLs, revisions require feedback before approval', () => {
  const task = { assigneeId: 'a', status: 'doing' };
  assert.throws(() => submitDeliverable(task, 'b', { title: 'Report', content: 'Work' }, now), /not assigned/);
  assert.throws(() => submitDeliverable(task, 'a', { title: 'Report', content: 'Work', url: 'javascript:alert(1)' }, now), /http/);
  submitDeliverable(task, 'a', { title: 'Report', content: 'First version' }, now);
  assert.equal(task.status, 'review');
  assert.throws(() => submitDeliverable(task, 'a', { title: 'Again', content: 'Work' }, now), /awaiting review/);
  assert.throws(() => reviewDeliverable(task, 'request_changes', '', now), /feedback required/);
  reviewDeliverable(task, 'request_changes', 'Include evidence', now);
  assert.equal(task.status, 'doing');
  assert.equal(task.deliverables[0].review, 'changes_requested');
  submitDeliverable(task, 'a', { title: 'Report v2', content: 'Work with evidence' }, now);
  reviewDeliverable(task, 'approve', 'Looks good', now);
  assert.equal(task.status, 'done');
  assert.equal(task.deliverables[0].feedback, 'Include evidence');
  assert.equal(task.deliverables[1].review, 'approved');
  assert.throws(() => reviewDeliverable(task, 'approve', '', now), /no pending/);
});
