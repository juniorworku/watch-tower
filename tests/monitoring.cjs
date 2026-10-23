const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compile, lifecycle } = require('./helpers.cjs');
const { monitoring } = compile('lib/data/monitoring.ts', { './lifecycle': lifecycle });
test('monitoring uses EAT date boundaries, approved history and legacy fallback without double counting', () => {
  const now = Date.parse('2026-10-24T22:00:00Z');
  const store = { agents: [], tasks: [{ id: 't', status: 'done', updatedAt: '2026-10-24T21:30:00Z' }, { id: 'legacy', status: 'done', updatedAt: '2026-10-24T21:30:00Z' }], activities: [{ id: 'act', taskId: 't', kind: 'approved', at: '2026-10-24T21:30:00Z' }] };
  const metrics = monitoring(store, now);
  assert.deepEqual(metrics.trend.at(-1), { day: '2026-10-25', count: 2 });
  assert.equal(metrics.heatmap.at(-1).hours[0], 1);
  assert.equal(metrics.currentWeek, 2);
});
