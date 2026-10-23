import Link from "next/link";
import type { HealthStatus } from "@/lib/integrations/types";

export function Card({ title, children, className = "", action }: { title?: React.ReactNode; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-900/50 p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const tones = {
  red: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  green: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  sky: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  slate: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
  violet: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "slate", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export const statusTone = (s: string): Tone => (s === "blocked" ? "red" : s === "doing" ? "sky" : s === "done" ? "green" : s === "todo" ? "amber" : "slate");

export function HealthBadge({ status }: { status: HealthStatus }) {
  const map: Record<HealthStatus, [Tone, string]> = {
    connected: ["green", "Connected"],
    not_configured: ["slate", "Not connected"],
    error: ["red", "Error"],
    snapshot: ["violet", "Snapshot"],
  };
  const [tone, label] = map[status];
  return <Badge tone={tone}>● {label}</Badge>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

export function Markdown({ html, className = "" }: { html: string; className?: string }) {
  return <div className={`prose prose-invert prose-slate max-w-none prose-headings:text-slate-100 prose-a:text-sky-300 ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function NoteLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  return <Link href={href} className={`text-sky-300 hover:text-sky-200 ${className}`}>{children}</Link>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">{children}</p>;
}
