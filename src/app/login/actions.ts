"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth";

const schema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

export type LoginState = { error?: string; email?: string };

/** Only same-origin admin paths are allowed as a post-login destination. */
function safeNext(next?: string) {
  return next && /^\/admin(\/|$)/.test(next) && !next.startsWith("//") ? next : "/admin";
}

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your email and password.", email: String(form.get("email") ?? "") };
  const user = await signIn(parsed.data.email, parsed.data.password);
  if (!user) return { error: "That email and password don't match.", email: parsed.data.email };
  redirect(safeNext(parsed.data.next));
}

export async function logout() {
  await signOut();
  redirect("/login");
}
