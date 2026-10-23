import type { StoreData, TaskItem } from "./types";

/** Display-only lookup; membership, claiming, and review rules live in FastAPI. */
export function projectFor(store: StoreData, task: Pick<TaskItem, "projectId" | "project">) {
  return task.projectId ? store.projects.find(p => p.id === task.projectId) : store.projects.find(p => p.name.toLowerCase() === task.project.toLowerCase());
}
