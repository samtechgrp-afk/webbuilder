"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { openSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env.mjs";

const schema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(80),
  email: z.email("Enter a valid email address").transform((e) => e.trim().toLowerCase()),
  password: z.string().min(10, "Use at least 10 characters for your password").max(200),
});

export type SignupState = { error?: string; name?: string; email?: string };

/** Creates an account, signs it in and starts the welcome wizard. */
export async function signup(_: SignupState, form: FormData): Promise<SignupState> {
  if (getEnv().SIGNUPS === "closed") return { error: "Sign-ups are closed on this platform. Ask an administrator for an invite." };
  const raw = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form", name: raw.name, email: raw.email };
  let userId: string;
  try {
    const user = await prisma.user.create({ data: { name: parsed.data.name, email: parsed.data.email, passwordHash: await bcrypt.hash(parsed.data.password, 10) } });
    userId = user.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { error: "There's already an account with that email. Sign in instead.", name: raw.name, email: raw.email };
    throw err;
  }
  await openSession(userId);
  redirect("/admin/onboarding");
}
