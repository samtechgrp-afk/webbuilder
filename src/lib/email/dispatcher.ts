import "server-only";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv, platformDomain } from "@/lib/env.mjs";
import type { RenderedEmail } from "./layout";

/**
 * The only way the app sends mail.
 *
 * Every email is first recorded in EmailLog under an idempotency key (unique),
 * so a replayed Stripe webhook or a double submit can't send it twice. With
 * RESEND_API_KEY set it is POSTed to Resend's REST API (RESEND_API_BASE points
 * it at a mock in e2e, the way STRIPE_API_BASE does for Stripe); without one it
 * is written to the server log. The row then settles as SENT, LOGGED or FAILED.
 * Sending never throws: an email is never a reason for an order or a site to fail.
 */

export interface EmailMessage extends RenderedEmail {
  to: string | string[];
  /** Short machine name, e.g. "order.receipt". Sent to Resend as a tag. */
  tag: string;
  /** Same key → sent at most once. */
  idempotencyKey: string;
  siteId?: string | null;
  replyTo?: string | null;
}

export type SendOutcome = { status: "SENT" | "LOGGED" | "FAILED" | "DUPLICATE"; id?: string; error?: string };

const TIMEOUT_MS = 10_000;

export const emailFrom = () => getEnv().EMAIL_FROM ?? `Website Builder <noreply@${platformDomain().replace(/:\d+$/, "")}>`;

export async function sendEmail(msg: EmailMessage): Promise<SendOutcome> {
  const to = (Array.isArray(msg.to) ? msg.to : [msg.to]).map((t) => t.trim()).filter(Boolean);
  if (!to.length) return { status: "FAILED", error: "No recipient" };

  let log;
  try {
    log = await prisma.emailLog.create({ data: { siteId: msg.siteId ?? null, tag: msg.tag, to: to.join(", "), subject: msg.subject, idempotencyKey: msg.idempotencyKey } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
      console.error(`email ${msg.tag}: could not record`, err);
      return { status: "FAILED", error: "Could not record email" };
    }
    // Already sent (or logged, or in flight): never twice. A failed attempt may be retried, e.g. by Stripe redelivering the webhook.
    const retry = await prisma.emailLog.updateMany({ where: { idempotencyKey: msg.idempotencyKey, status: "FAILED" }, data: { status: "QUEUED", error: null } });
    if (!retry.count) return { status: "DUPLICATE" };
    log = await prisma.emailLog.findUniqueOrThrow({ where: { idempotencyKey: msg.idempotencyKey } });
  }

  const { RESEND_API_KEY, RESEND_API_BASE } = getEnv();
  if (!RESEND_API_KEY) {
    console.info(`[email:${msg.tag}] to ${to.join(", ")}: ${msg.subject}\n${msg.text}`);
    await prisma.emailLog.update({ where: { id: log.id }, data: { status: "LOGGED", sentAt: new Date() } });
    return { status: "LOGGED", id: log.id };
  }

  const body = JSON.stringify({
    from: emailFrom(),
    to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
    tags: [{ name: "category", value: msg.tag.replace(/[^a-zA-Z0-9_-]/g, "_") }],
  });
  const base = (RESEND_API_BASE ?? "https://api.resend.com").replace(/\/$/, "");

  let error = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${base}/emails`, {
        method: "POST",
        headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json", "idempotency-key": msg.idempotencyKey },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (res.ok) {
        await prisma.emailLog.update({ where: { id: log.id }, data: { status: "SENT", providerId: data.id ?? null, sentAt: new Date(), error: null } });
        return { status: "SENT", id: data.id };
      }
      error = `Resend ${res.status}: ${data.message ?? data.name ?? res.statusText}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  console.error(`email ${msg.tag} to ${to.join(", ")} failed: ${error}`);
  await prisma.emailLog.update({ where: { id: log.id }, data: { status: "FAILED", error: error.slice(0, 500) } });
  return { status: "FAILED", error };
}

/**
 * Sends after the response has gone out (Next's `after`), so callers never wait
 * on Resend. Outside a request (scripts, tests) it just starts the send.
 */
export function dispatchLater(work: () => Promise<unknown>) {
  const run = () => work().catch((err) => console.error("email dispatch failed", err));
  try {
    after(run);
  } catch {
    void run();
  }
}
