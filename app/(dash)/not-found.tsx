import Link from "next/link";
export default function NotFound() {
  return <div className="p-8 text-slate-500">That note isn&apos;t in the vault. <Link className="text-indigo-600" href="/">Back to Overview</Link></div>;
}
