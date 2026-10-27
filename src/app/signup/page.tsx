import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEnv } from "@/lib/env.mjs";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Create your account" };
export const instant = false;

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/admin");
  const closed = getEnv().SIGNUPS === "closed";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,#f4f4f5,#e4e4e7)] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-[0_20px_60px_-25px_rgba(0,0,0,.35)]">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-zinc-400">Free website builder</p>
        <h1 className="mb-6 mt-1 text-2xl font-semibold text-zinc-900">Create your account</h1>
        {closed ? (
          <p className="text-sm text-zinc-600" data-signups-closed="">Sign-ups are closed on this platform. Ask an administrator for an invite.</p>
        ) : (
          <SignupForm />
        )}
        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account? <Link href="/login" className="font-medium text-zinc-900 underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
