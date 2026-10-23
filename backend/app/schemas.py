"""Wire schemas keep the existing camelCase API contract for Next.js and bots."""
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

Priority = Literal["low", "normal", "high", "urgent"]

class Payload(BaseModel):
    model_config = ConfigDict(extra="allow")

class TaskCreate(Payload):
    title: str = Field(min_length=1, max_length=1000)
    body: str = ""
    priority: Priority = "normal"
    assigneeId: str | None = None
    projectId: str | None = None
    parentTaskId: str | None = None
    dependsOn: list[str] = Field(default_factory=list)
    requiredTags: list[str] | str = Field(default_factory=list)

class TaskPatch(Payload):
    id: str = Field(min_length=1)
    title: str = Field(default="", min_length=1)
    body: str = ""
    priority: Priority = "normal"
    status: str = "todo"
    assigneeId: str | None = None
    projectId: str | None = None
    parentTaskId: str | None = None
    dependsOn: list[str] = Field(default_factory=list)
    requiredTags: list[str] | str = Field(default_factory=list)

class AgentPayload(Payload):
    name: str = ""
    heartbeatIntervalMinutes: int = Field(default=15, ge=1, le=1440, strict=True)
    tags: list[str] | str = Field(default_factory=list)

class DeliverableInput(BaseModel):
    title: str
    content: str
    url: str | None = None

class ActivityInput(Payload):
    status: str | None = None
    currentRunId: str | None = None
    kind: str = "activity"
    taskId: str | None = None
    message: str = ""
    text: str = ""
    meta: dict[str, Any] | None = None
    deliverable: DeliverableInput | None = None
    pickup: bool = False

class MessageInput(BaseModel):
    agentId: str
    text: str = Field(min_length=1, max_length=20000)

class Blueprint(Payload):
    title: str = Field(min_length=1)
    body: str = ""
    priority: Priority = "normal"
    projectId: str | None = None
    assigneeId: str | None = None
    requiredTags: list[str] = Field(default_factory=list)
    subtasks: list[TaskCreate] = Field(default_factory=list, max_length=50)

class ProjectInput(Payload):
    name: str = ""
    body: str = ""
    memberIds: list[str] = Field(default_factory=list)
    leadAgentId: str | None = None
    archived: bool = False
    owner: str = ""
    status: str = "active"
    started: str = ""
