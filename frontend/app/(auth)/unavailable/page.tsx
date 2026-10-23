export default function UnavailablePage() {
  return <main className="grid min-h-screen place-items-center p-6"><div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8"><h1 className="text-xl font-semibold">Backend unavailable</h1><p className="mt-3 text-sm leading-6 text-slate-500">Watch Tower cannot reach its FastAPI service. Start the backend, check the frontend BACKEND_URL setting, then reload this page.</p><a className="primary-button mt-5" href="/">Try again</a></div></main>;
}
