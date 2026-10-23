import { safeNext } from "@/lib/auth";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form method="post" action="/api/login" className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/15 text-sky-300 text-xl">▲</span>
          <div>
            <h1 className="text-lg font-semibold text-white">Watch Tower</h1>
            <p className="text-xs text-slate-400">Junior&apos;s bot shop · private</p>
          </div>
        </div>
        <input type="hidden" name="next" value={safeNext(sp.next)} />
        <label className="block text-sm text-slate-300 mb-1" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoFocus required autoComplete="current-password"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-500" />
        {sp.error && <p className="mt-2 text-sm text-rose-400">Incorrect password.</p>}
        <button className="mt-5 w-full rounded-lg bg-sky-500 px-3 py-2 font-medium text-slate-950 hover:bg-sky-400">Sign in</button>
      </form>
    </main>
  );
}
