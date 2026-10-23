import type { StoreData } from "./types";
import { agentHealth } from "./lifecycle";
function eatDate(time: number) { return new Date(time + 3 * 3600000).toISOString().slice(0, 10); }
export function monitoring(store: StoreData, now = Date.now()) {
  const days = Array.from({ length: 14 }, (_, i) => eatDate(now - (13 - i) * 86400000));
  const approved = store.activities.filter(a => a.kind === "approved");
  const approvals = approved.map(a => ({ at: a.at, taskId: a.taskId }));
  for (const task of store.tasks) if (task.status === "done" && !approved.some(a => a.taskId === task.id)) approvals.push({ at: task.lastStatusChangeAt || task.updatedAt, taskId: task.id });
  const trend = days.map(day => ({ day, count: approvals.filter(a => eatDate(Date.parse(a.at)) === day).length }));
  const heatmap = Array.from({ length: 7 }, (_, d) => ({ day: days[d + 7], hours: Array.from({ length: 24 }, (_, hour) => store.activities.filter(a => eatDate(Date.parse(a.at)) === days[d + 7] && new Date(Date.parse(a.at) + 3 * 3600000).getUTCHours() === hour).length) }));
  return { trend, heatmap, currentWeek: trend.slice(7).reduce((n, d) => n + d.count, 0), previousWeek: trend.slice(0, 7).reduce((n, d) => n + d.count, 0),
    workload: store.agents.map(a => ({ agent: a, ...agentHealth(a, store.tasks, now) })) };
}
