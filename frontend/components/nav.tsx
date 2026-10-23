"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/", "Mission control", "◎"],
  ["/tasks", "Tasks", "▦"],
  ["/automation", "Automation", "↻"],
  ["/messages", "Messages", "✉"],
  ["/monitoring", "Monitoring", "▥"],
  ["/projects", "Projects", "◆"],
  ["/memory", "Memory", "✎"],
  ["/docs", "Docs", "❏"],
  ["/bots", "Agents", "◉"],
  ["/integrations", "Integrations", "⇄"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map(([href, label, icon]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link key={href} href={href}
            className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${active ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
            <span className="w-4 text-center opacity-80">{icon}</span>{label}
          </Link>
        );
      })}
    </nav>
  );
}
