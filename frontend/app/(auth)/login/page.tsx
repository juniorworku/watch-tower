import { safeNext } from "@/lib/auth";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form method="post" action="/api/login" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/60 p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg?v=2" alt="" width={40} height={40} className="h-10 w-10 shrink-0" />
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Watch Tower</h1>
            <p className="text-xs text-slate-500">Junior&apos;s bot shop · private</p>
          </div>
        </div>
        <input type="hidden" name="next" value={safeNext(sp.next)} />
        <label className="block text-sm text-slate-700 mb-1" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoFocus required autoComplete="current-password"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-indigo-300" />
        {sp.error && <p className="mt-2 text-sm text-rose-400">Incorrect password.</p>}
        <button className="mt-5 w-full rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-sky-400">Sign in</button>
      </form>
    </main>
  );
}
