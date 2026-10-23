const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workflows: w, lifecycle: l } = require('./helpers.cjs');
const now = '2026-10-24T08:00:00.000Z';
function fixture() {
  return { version: 1, agents: [{ id: 'a', name: 'Researcher', tags: ['research'], status: 'active' }, { id: 'b', name: 'Writer', tags: ['write'], status: 'active' }, { id: 'lead', name: 'Lead', tags: [], status: 'active' }], projects: [{ id: 'p', name: 'Project', memberIds: ['a', 'b', 'lead'], leadAgentId: 'lead', archived: false }], tasks: [], activities: [], templates: [], schedules: [] };
}
function task(id, props = {}) { return { id, title: id, body: '', status: 'todo', projectId: 'p', project: 'Project', createdAt: now, updatedAt: now, ...props }; }
test('pickup prefers assigned work, respects capabilities, dependencies and one active task', () => {
  const s = fixture();
  s.tasks.push(task('urgent', { priority: 'urgent', requiredTags: ['research'] }), task('assigned', { status: 'assigned', assigneeId: 'a', priority: 'low' }));
  assert.equal(w.claimNext(s, 'a', now).id, 'assigned');
  assert.equal(w.claimNext(s, 'a', now).id, 'assigned');
  assert.equal(w.claimNext(s, 'b', now), null);
  s.tasks[1].status = 'done';
  assert.equal(w.claimNext(s, 'a', now).id, 'urgent');
  s.tasks[0].status = 'done';
  s.tasks.push(task('wait', { dependsOn: ['unfinished'] }), task('unfinished', { assigneeId: 'b', status: 'assigned' }));
  assert.equal(w.claimNext(s, 'a', now), null);
  s.tasks.at(-1).status = 'done';
  assert.equal(w.claimNext(s, 'a', now).id, 'wait');
});
test('project isolation, paused agents and lead review permissions', () => {
  const s = fixture(); s.projects[0].memberIds = ['b', 'lead'];
  s.tasks.push(task('work'));
  assert.equal(w.claimNext(s, 'a', now), null);
  s.agents[1].status = 'paused'; assert.equal(w.claimNext(s, 'b', now), null);
  s.tasks[0].assigneeId = 'b'; s.tasks[0].status = 'doing';
  l.submitDeliverable(s.tasks[0], 'b', { title: 'Draft', content: 'Work' }, now);
  assert.throws(() => w.leadReview(s, 'a', 'work', 'approve', '', now), /lead/);
  w.leadReview(s, 'lead', 'work', 'request_changes', 'Add evidence', now);
  assert.equal(s.tasks[0].status, 'doing');
  l.submitDeliverable(s.tasks[0], 'b', { title: 'Revised', content: 'Work plus evidence' }, now);
  w.leadReview(s, 'lead', 'work', 'approve', 'Approved', now);
  assert.equal(s.tasks[0].status, 'done'); assert.equal(s.tasks[0].deliverables.at(-1).reviewedBy, 'lead');
  const self = task('self', { assigneeId: 'lead', status: 'doing' }); s.tasks.push(self);
  l.submitDeliverable(self, 'lead', { title: 'Self', content: 'Work' }, now);
  assert.throws(() => w.leadReview(s, 'lead', 'self', 'approve', '', now), /lead/);
});
test('cross-agent subtasks gate parent completion and reject cycles', () => {
  const s = fixture();
  const parent = w.instantiate(s, { title: 'Feature', body: 'Build', projectId: 'p', priority: 'high', subtasks: [{ title: 'Research', body: '', assigneeId: 'a' }, { title: 'Write', body: '', assigneeId: 'b' }] }, now, 'Test');
  assert.throws(() => w.ensureChildrenDone(s, parent), /subtasks/);
  const sub = s.tasks.find(t => t.parentTaskId === parent.id);
  assert.throws(() => w.validateLinks(s, { ...parent, parentTaskId: sub.id }), /cycles/);
  assert.throws(() => w.validateLinks(s, { ...sub, dependsOn: [parent.id] }), /parent/);
  for (const t of s.tasks) if (t.parentTaskId) t.status = 'done';
  w.ensureChildrenDone(s, parent);
});
test('recurrence catches up without duplicates and handles month-end anchors', () => {
  const s = fixture();
  s.templates.push({ id: 'template', name: 'Report', blueprint: { title: 'Report', body: '', priority: 'normal', projectId: 'p', subtasks: [{ title: 'Collect', body: '', assigneeId: 'a' }] } });
  s.schedules.push({ id: 'r', name: 'Daily report', templateId: 'template', cadence: 'daily', nextRunAt: '2026-10-22T08:00:00.000Z', anchorDay: 22, enabled: true });
  assert.equal(w.tickSchedules(s, now).created, 3);
  assert.equal(s.tasks.length, 6);
  assert.equal(w.tickSchedules(s, now).created, 0);
  assert.equal(new Set(s.tasks.map(t => t.id)).size, 6);
  assert.equal(w.nextOccurrence('2027-01-31T08:00:00.000Z', 'monthly', 31), '2027-02-28T08:00:00.000Z');
  assert.equal(w.nextOccurrence('2027-02-28T08:00:00.000Z', 'monthly', 31), '2027-03-31T08:00:00.000Z');
  assert.equal(w.nextOccurrence('2027-01-30T21:30:00.000Z', 'monthly', 31), '2027-02-27T21:30:00.000Z');
  s.schedules[0].enabled = false;
  assert.equal(w.tickSchedules(s, '2026-10-30T08:00:00.000Z').created, 0);
});
test('invalid recurring blueprints do not create partial parents or advance schedule', () => {
  const s = fixture();
  s.templates.push({ id: 't', blueprint: { title: 'Parent', body: '', priority: 'normal', subtasks: [{ title: '', body: '' }] } });
  s.schedules.push({ id: 'r', name: 'Invalid', templateId: 't', cadence: 'daily', nextRunAt: now, anchorDay: 24, enabled: true });
  assert.equal(w.tickSchedules(s, now).errors.length, 1);
  assert.equal(s.tasks.length, 0); assert.equal(s.schedules[0].nextRunAt, now);
});
