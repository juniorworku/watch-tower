export type TaskStatus = "todo" | "doing" | "blocked" | "done";
export const TASK_STATUSES: TaskStatus[] = ["todo", "doing", "blocked", "done"];

export type AgentType = "bot" | "agent" | "sub-agent";
export type AgentPlatform =
  | "Grok Bot"
  | "OpenAI/ChatGPT"
  | "Claude"
  | "Cursor"
  | "n8n"
  | "Zapier"
  | "Make"
  | "Slack"
  | "custom";

export type TaskItem = {
  id: string;
  title: string;
  status: TaskStatus;
  owners: string[];
  project: string;
  due: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectItem = {
  id: string;
  name: string;
  status: string;
  archived: boolean;
  owner: string;
  started: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type LogEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentItem = {
  id: string;
  name: string;
  platform: AgentPlatform | string;
  type: AgentType;
  parentId: string | null;
  role: string;
  owner: string;
  status: string;
  url: string;
  webhook: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  lastHeartbeat: string | null;
  lastActivity: string | null;
  lastActivityText: string | null;
};

export type ActivityItem = {
  id: string;
  agentId: string;
  kind: "heartbeat" | "activity" | "status";
  message: string;
  meta?: Record<string, unknown>;
  at: string;
};

export type StoreData = {
  version: 1;
  seededAt: string;
  updatedAt: string;
  tasks: TaskItem[];
  projects: ProjectItem[];
  logs: LogEntry[];
  agents: AgentItem[];
  activities: ActivityItem[];
};

export const BLOB_KEY = "watchtower/store.json";
