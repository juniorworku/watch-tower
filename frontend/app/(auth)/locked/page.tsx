export const metadata = { title: "Locked" };
export default function LockedPage() {
  return <main className="grid min-h-screen place-items-center p-6"><div className="max-w-lg rounded-2xl border border-amber-200 bg-white p-8"><h1 className="text-xl font-semibold">Watch Tower is locked</h1><p className="mt-3 text-sm leading-6 text-slate-500">Configure DASHBOARD_PASSWORD_HASH or DASHBOARD_PASSWORD in the FastAPI backend environment, then restart the backend. Passwords and integration credentials belong to the backend.</p></div></main>;
}
