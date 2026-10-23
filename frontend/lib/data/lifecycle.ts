import type { AgentItem, TaskItem } from "./types";

/** Select the health computed by FastAPI; no lifecycle policy is executed in Next.js. */
export function agentHealth(agent: AgentItem, _tasks: TaskItem[]) {
  if (!agent.health) throw new Error("Backend response is missing agent health");
  return agent.health;
}
