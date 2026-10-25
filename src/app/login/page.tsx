import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };
export const instant = false;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(typeof next === "string" ? next : "/admin");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(ellipse_at_top,#f4f4f5,#e4e4e7)] p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-[0_20px_60px_-25px_rgba(0,0,0,.35)]">
        <p className="text-xs font-semibold uppercase tracking-[.2em] text-zinc-400">Client portal</p>
        <h1 className="mb-6 mt-1 text-2xl font-semibold text-zinc-900">Sign in to your website</h1>
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
