// Run on your agent's machine: node agent-runner.mjs ./watchtower-agent.json
// Optional WATCHTOWER_TASK_COMMAND reads a JSON task/context from stdin and prints
// JSON {title,content,url?}. WATCHTOWER_MESSAGE_COMMAND prints a plain-text reply.
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const config = JSON.parse(await readFile(process.argv[2] || './watchtower-agent.json', 'utf8'));
const prefix = `${config.baseUrl.replace(/\/$/, '')}/api/agents/${encodeURIComponent(config.agentId)}`;
async function api(endpoint, body) {
  const res = await fetch(prefix + endpoint, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
  return result;
}
function command(executable, input) {
  return new Promise((resolve, reject) => {
    // The executable is selected locally by the operator, never by a remote task.
    const child = spawn(executable, [], { shell: false, stdio: ['pipe', 'pipe', 'inherit'] });
    let output = ''; const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Runtime command timed out')); }, 30 * 60 * 1000);
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 2_000_000) child.kill('SIGKILL'); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output.trim()) : reject(new Error(`Runtime command exited ${code}`)); });
    child.stdin.on('error', () => {}); child.stdin.end(JSON.stringify(input));
  });
}
let stopped = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopped = true; });
async function cycle() {
  await api('/activity', { kind: 'heartbeat', message: 'Runtime online' });
  const context = await api('/tasks');
  config.heartbeatIntervalMinutes = context.heartbeatIntervalMinutes;
  if (process.env.WATCHTOWER_REVIEW_COMMAND) {
    const leadProjects = new Set(context.projects.filter(p => p.leadAgentId === config.agentId && !p.archived).map(p => p.id));
    for (const task of context.projectTasks.filter(t => t.status === 'review' && t.assigneeId !== config.agentId && leadProjects.has(t.projectId))) {
      const review = JSON.parse(await command(process.env.WATCHTOWER_REVIEW_COMMAND, { task, context }));
      await api('/review', { taskId: task.id, action: review.action, message: review.message || '' });
    }
  }
  const { messages } = await api('/messages');
  for (const message of messages) {
    await api('/messages', { messageId: message.id });
    if (process.env.WATCHTOWER_MESSAGE_COMMAND) {
      const reply = await command(process.env.WATCHTOWER_MESSAGE_COMMAND, { message, context });
      await api('/messages', { messageId: message.id, reply });
    }
  }
  if (!process.env.WATCHTOWER_TASK_COMMAND) return;
  const { task } = await api('/tasks', {});
  if (!task || task.status === 'blocked') return;
  const timer = setInterval(() => api('/activity', { kind: 'heartbeat', message: `Working on ${task.title}` }).catch(e => console.error(e.message)), Math.max(60000, config.heartbeatIntervalMinutes * 60000));
  try {
    const deliverable = JSON.parse(await command(process.env.WATCHTOWER_TASK_COMMAND, { task, context }));
    await api('/activity', { taskId: task.id, kind: 'submitted', message: 'Ready for review', deliverable });
  } catch (e) { await api('/activity', { taskId: task.id, kind: 'blocked', message: e.message }); }
  finally { clearInterval(timer); }
}
while (!stopped) {
  const started = Date.now();
  try { await cycle(); } catch (e) { console.error(`Watch Tower: ${e.message}`); }
  const interval = Math.max(60000, Number(config.heartbeatIntervalMinutes || 15) * 60000);
  while (!stopped && Date.now() - started < interval) await new Promise(resolve => setTimeout(resolve, 1000));
}
