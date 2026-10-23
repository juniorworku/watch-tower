// Optional scheduler worker: WATCHTOWER_URL=https://your-host CRON_SECRET=... node scripts/run-automation.mjs
const base = process.env.WATCHTOWER_URL;
const secret = process.env.CRON_SECRET;
if (!base || !secret) throw new Error('WATCHTOWER_URL and CRON_SECRET are required');
while (true) {
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/api/cron`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) console.error(`Schedule tick: HTTP ${response.status}`);
  } catch (e) { console.error(`Schedule tick: ${e.message}`); }
  await new Promise(resolve => setTimeout(resolve, 60000));
}
