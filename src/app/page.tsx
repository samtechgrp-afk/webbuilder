import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-zinc-950 p-8 text-center text-zinc-100">
      <p className="text-xs font-semibold uppercase tracking-[.3em] text-zinc-500">Website Builder</p>
      <h1 className="max-w-2xl text-4xl font-semibold leading-tight sm:text-5xl">
        Premium websites your clients can edit without breaking.
      </h1>
      <p className="max-w-xl text-zinc-400">
        Designers build with full control. Clients sign in to their own portal and change words, images and prices
        directly on the page, inside guardrails the designer sets.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200">
          Sign in
        </Link>
        <Link href="/sites/aurelia" className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-semibold hover:bg-zinc-900">
          See a client site
        </Link>
      </div>
    </main>
  );
}
