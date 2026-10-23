import Link from "next/link";
export default function NotFound() {
  return <div className="p-8 text-slate-400">That note isn&apos;t in the vault. <Link className="text-sky-300" href="/">Back to Overview</Link></div>;
}
