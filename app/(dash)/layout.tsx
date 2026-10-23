import Link from "next/link";
import { Nav } from "@/components/nav";
import { SourceBanner } from "@/components/source-banner";
import { getVault } from "@/lib/vault/source";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const vault = await getVault();
  return (
    <div className="md:flex">
      <aside className="border-b border-slate-800 bg-slate-950/80 p-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <Link href="/" className="mb-6 flex items-center gap-3 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/15 text-sky-300">▲</span>
          <span>
            <span className="block font-semibold text-white">Watch Tower</span>
            <span className="block text-xs text-slate-500">Junior&apos;s bot shop</span>
          </span>
        </Link>
        <Nav />
        <form action="/api/logout" method="post" className="mt-6 hidden md:block">
          <button className="px-3 text-xs text-slate-500 hover:text-slate-300">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <div className="mb-6"><SourceBanner source={vault.source} /></div>
        {children}
      </main>
    </div>
  );
}
