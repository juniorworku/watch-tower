export const metadata = { title: "Locked" };

export default function LockedPage() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="max-w-lg rounded-2xl border border-amber-500/30 bg-white/60 p-8">
        <div className="text-3xl mb-3">🔒</div>
        <h1 className="text-xl font-semibold text-slate-900">Watch Tower is locked</h1>
        <p className="mt-2 text-slate-700">
          Set{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-amber-700">DASHBOARD_PASSWORD_HASH</code>
          {" "}(preferred) or{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-amber-700">DASHBOARD_PASSWORD</code>
          {" "}to unlock the dashboard.
        </p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-500">
          <li>Vercel → project <b>watch-tower-dashboard</b> → Settings → Environment Variables.</li>
          <li>
            Add <code>DASHBOARD_PASSWORD_HASH</code> as <code>scrypt$&lt;saltHex&gt;$&lt;hashHex&gt;</code>{" "}
            for Preview (generate with <code>node scripts/hash-password.mjs</code>).
          </li>
          <li>Redeploy. You&apos;ll then get a sign-in screen.</li>
        </ol>
        <p className="mt-4 text-xs text-slate-500">
          Locally: put the hash in <code>.env.local</code> and restart <code>npm run dev</code>.
        </p>
      </div>
    </main>
  );
}
