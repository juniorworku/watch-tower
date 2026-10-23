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
  reviewedBy?: string;
  feedback?: string;
  reviewedAt?: string;
};

export type TaskItem = {
  id: string;
  title: string;
  status: TaskStatus;
  projectId?: string | null;
  parentTaskId?: string | null;
  dependsOn?: string[];
  requiredTags?: string[];
  scheduleId?: string;
  scheduledFor?: string;
  claimedAt?: string | null;
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
  memberIds?: string[];
  leadAgentId?: string | null;
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
  personality?: string;
  credentialHash?: string;
  credentialCreatedAt?: string;
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
  kind: "heartbeat" | "activity" | "status" | "assigned" | "accepted" | "rejected" | "started" | "progress" | "blocked" | "completed" | "failed" | "re-assigned" | "submitted" | "approved" | "changes_requested" | "comment" | "claimed" | "message";
  message: string;
  meta?: Record<string, unknown>;
  at: string;
};

export type TaskBlueprint = {
  title: string;
  body: string;
  priority: NonNullable<TaskItem["priority"]>;
  projectId?: string | null;
  assigneeId?: string | null;
  requiredTags?: string[];
  subtasks?: { title: string; body: string; assigneeId?: string | null; requiredTags?: string[] }[];
};
export type TaskTemplate = { id: string; name: string; blueprint: TaskBlueprint; createdAt: string; updatedAt: string };
export type RecurringSchedule = {
  id: string; name: string; templateId: string; cadence: "daily" | "weekly" | "monthly";
  nextRunAt: string; anchorDay: number; enabled: boolean; lastError?: string; lastRunAt?: string; createdAt: string;
};
export type AgentMessage = {
  id: string; agentId: string; text: string; createdAt: string;
  deliveredAt?: string; reply?: string; repliedAt?: string;
};
export type StoreData = {
  templates?: TaskTemplate[];
  schedules?: RecurringSchedule[];
  messages?: AgentMessage[];
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
