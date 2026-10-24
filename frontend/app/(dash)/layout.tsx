import Link from "next/link";
import { redirect } from "next/navigation";
import { backendGet } from "@/lib/api";
import { Nav } from "@/components/nav";
export const dynamic = "force-dynamic";
export default async function DashLayout({ children }: { children: React.ReactNode }) {
  // Runs alongside page data, rather than a sequential middleware network request.
  // APIs authenticate independently on every navigation and mutation.
  const session = await backendGet<{ configured: boolean; authenticated: boolean }>("/api/session");
  if (!session.configured) redirect("/locked");
  if (!session.authenticated) redirect("/login");
  return <div className="min-h-screen md:flex">
    <aside className="z-10 flex flex-col border-b border-slate-200 bg-white p-4 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r">
      <Link href="/" className="mb-8 mt-2 flex items-center gap-3 px-2"><img src="/favicon.svg?v=2" alt="" width={36} height={36} className="h-9 w-9 shrink-0" /><span><span className="block text-sm font-bold tracking-tight text-slate-900">Watch Tower</span><span className="block text-[11px] text-slate-400">Agent workspace</span></span></Link>
      <p className="mb-3 hidden px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 md:block">Workspace</p><Nav />
      <div className="mt-auto hidden border-t border-slate-100 px-3 pt-5 md:block"><p className="text-xs font-medium text-slate-600">Your workforce, connected.</p><p className="mt-1 text-[11px] leading-5 text-slate-400">Assign. Monitor. Review.</p><form action="/api/logout" method="post" className="mt-4"><button className="text-xs text-slate-500 hover:text-indigo-600">Sign out ↗</button></form></div>
    </aside>
    <main className="min-w-0 flex-1"><div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white/80 px-5 text-xs text-slate-400 md:px-8"><span>Workspace <span className="mx-2 text-slate-300">/</span> Agent operations</span><Link href="/bots" className="flex items-center gap-2 text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />Your team</Link></div><div className="mx-auto max-w-[1600px] p-4 md:p-8 lg:p-10">{children}</div></main>
  </div>;
}
