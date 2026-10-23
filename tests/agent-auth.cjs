const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { compile } = require('./helpers.cjs');
const req = token => ({ headers: new Headers({ authorization: `Bearer ${token}` }) });
test('scoped credentials cannot impersonate another agent or access the master registry; rotation and revocation apply', async () => {
  process.env.WATCHTOWER_API_KEY = 'master';
  const agent = { id: 'a', credentialHash: createHash('sha256').update('agent-token').digest('hex') };
  const auth = compile('lib/data/api-auth.ts', { 'server-only': {}, './store': { loadStore: async () => ({ agents: [agent] }) } });
  assert.equal((await auth.requireAgentAuth(req('agent-token'), 'a')).ok, true);
  assert.equal((await auth.requireAgentAuth(req('agent-token'), 'b')).ok, false);
  assert.equal(auth.requireApiKey(req('agent-token')).ok, false);
  assert.equal((await auth.requireAgentAuth(req('master'), 'b')).ok, true);
  agent.credentialHash = createHash('sha256').update('new-token').digest('hex');
  assert.equal((await auth.requireAgentAuth(req('agent-token'), 'a')).ok, false);
  assert.equal((await auth.requireAgentAuth(req('new-token'), 'a')).ok, true);
  delete agent.credentialHash;
  assert.equal((await auth.requireAgentAuth(req('new-token'), 'a')).ok, false);
});
