import "server-only";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./db";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from "./session-token";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
};

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

/** Checks credentials and opens a session. Same error for unknown email and wrong password. */
export async function signIn(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Compare against a dummy hash when the user doesn't exist so timing doesn't reveal accounts.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return null;

  const h = await headers();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
      userAgent: h.get("user-agent")?.slice(0, 300),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim(),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  (await cookies()).set(SESSION_COOKIE, await signSessionToken(session.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return { id: user.id, email: user.email, name: user.name, isPlatformAdmin: user.isPlatformAdmin };
}

export async function signOut() {
  const jar = await cookies();
  const sid = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (sid) await prisma.session.deleteMany({ where: { id: sid } });
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const sid = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!sid) return null;
  const session = await prisma.session.findUnique({
    where: { id: sid },
    include: { user: { select: { id: true, email: true, name: true, isPlatformAdmin: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
