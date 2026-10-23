import { NextResponse, type NextRequest } from "next/server";
import { mutateStore, loadStore, newId } from "@/lib/data/store";
import { instantiate, parseBlueprint, templateFromTask, tickSchedules, validateBlueprint } from "@/lib/data/workflows";
import { LifecycleError } from "@/lib/data/lifecycle";
import type { TaskBlueprint } from "@/lib/data/types";
export async function GET() {
  const s = await loadStore(); return NextResponse.json({ templates: s.templates || [], schedules: s.schedules || [] });
}
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  let result: unknown;
  try {
    await mutateStore(s => {
      s.templates ||= []; s.schedules ||= [];
      const now = new Date().toISOString();
      if (b.action === "tick") { result = tickSchedules(s, now); return; }
      if (b.action === "save_template") {
        if (!String(b.name || "").trim()) throw new LifecycleError("template name required");
        const template = b.taskId ? templateFromTask(s, String(b.taskId), String(b.name)) : {
          id: newId("template"), name: String(b.name).trim(), blueprint: parseBlueprint(b.blueprint), createdAt: now, updatedAt: now,
        };
        if (!template.blueprint || !["low", "normal", "high", "urgent"].includes(template.blueprint.priority)) throw new LifecycleError("valid template blueprint and priority required");
        validateBlueprint(s, template.blueprint);
        if (b.id) {
          const index = s.templates.findIndex(t => t.id === b.id);
          if (index < 0) throw new LifecycleError("template not found", 404);
          template.id = s.templates[index].id; template.createdAt = s.templates[index].createdAt;
          s.templates[index] = template;
        } else s.templates.push(template);
        result = template; return;
      }
      if (b.action === "instantiate") {
        const template = s.templates.find(t => t.id === b.templateId);
        if (!template) throw new LifecycleError("template not found", 404);
        result = instantiate(s, { ...template.blueprint, ...(b.title ? { title: String(b.title) } : {}) }, now, `Template: ${template.name}`); return;
      }
      if (b.action === "delete_template") {
        if (s.schedules.some(r => r.templateId === b.id)) throw new LifecycleError("remove this template's schedules first", 409);
        s.templates = s.templates.filter(t => t.id !== b.id); result = { ok: true }; return;
      }
      if (b.action === "save_schedule") {
        if (!s.templates.some(t => t.id === b.templateId)) throw new LifecycleError("template not found");
        if (!["daily", "weekly", "monthly"].includes(b.cadence) || !Number.isFinite(Date.parse(b.nextRunAt)) || !String(b.name || "").trim()) throw new LifecycleError("name, cadence and valid next run required");
        const existing = s.schedules.find(r => r.id === b.id);
        if (b.id && !existing) throw new LifecycleError("schedule not found", 404);
        const schedule = { id: existing?.id || newId("schedule"), name: String(b.name).trim(), templateId: String(b.templateId), cadence: b.cadence, nextRunAt: new Date(b.nextRunAt).toISOString(), anchorDay: new Date(Date.parse(b.nextRunAt) + 3 * 3600000).getUTCDate(), enabled: b.enabled !== false, createdAt: existing?.createdAt || now };
        if (existing) Object.assign(existing, schedule); else s.schedules.push(schedule);
        result = schedule; return;
      }
      if (b.action === "toggle_schedule") {
        const schedule = s.schedules.find(r => r.id === b.id);
        if (!schedule) throw new LifecycleError("schedule not found", 404);
        schedule.enabled = !schedule.enabled; result = schedule; return;
      }
      if (b.action === "delete_schedule") { s.schedules = s.schedules.filter(r => r.id !== b.id); result = { ok: true }; return; }
      throw new LifecycleError("invalid automation action");
    });
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof LifecycleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
