export type TaskStatus = "todo" | "assigned" | "doing" | "blocked" | "review" | "done";
export const TASK_STATUSES: TaskStatus[] = ["todo", "assigned", "doing", "blocked", "review", "done"];

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

export const TASK_LABELS: Record<TaskStatus, string> = { todo: "Inbox", assigned: "Assigned", doing: "In progress", blocked: "Blocked", review: "Review", done: "Done" };
export type Deliverable = {
  id: string;
  agentId: string;
  title: string;
  content: string;
  url?: string;
  submittedAt: string;
  review: "pending" | "approved" | "changes_requested";
  feedback?: string;
  reviewedAt?: string;
};

export type TaskItem = {
  id: string;
  title: string;
  status: TaskStatus;
  deliverables?: Deliverable[];
  assigneeId?: string | null;
  assigneeName?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  source?: string;
  currentRunId?: string | null;
  lastStatusChangeAt?: string;
  assignmentHistory?: { fromId: string | null; toId: string | null; at: string; reason: string }[];
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
  instructions?: string;
  heartbeatIntervalMinutes?: number;
  lastHeartbeat: string | null;
  lastActivity: string | null;
  lastActivityText: string | null;
};

export type ActivityItem = {
  id: string;
  agentId: string;
  taskId?: string;
  actor?: "agent" | "operator";
  kind: "heartbeat" | "activity" | "status" | "assigned" | "accepted" | "rejected" | "started" | "progress" | "blocked" | "completed" | "failed" | "re-assigned" | "submitted" | "approved" | "changes_requested" | "comment";
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
