import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { BuilderDocument, BuilderNode } from "@/lib/builder/types";
import { sendEmail } from "@/lib/email/dispatcher";
import { formSubmissionEmail, newSubscriberEmail } from "@/lib/email/templates/forms";
import { checkSubmission, parseRecipients } from "@/lib/forms/submission";
import { hasPermission } from "@/lib/rbac";
import { platformOrigin } from "@/server/email/links";
import { privateStorage } from "@/server/media-processing";
import { resolveSite } from "@/server/public-site";

/**
 * Receives Contact form and Newsletter posts from live sites. The form is
 * looked up in the site's published documents by its node id, so a visitor
 * can only post to a form that is live, and only the fields it has.
 */

export type SubmitOutcome =
  | { ok: true; kind: "form" | "newsletter"; message: string }
  | { ok: false; status: number; message: string; errors?: Record<string, string> };

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
/** Per-instance burst guard (the database check below is the real limit for messages). */
const recent = new Map<string, number[]>();

function burst(key: string) {
  const now = Date.now();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5000) recent.delete(recent.keys().next().value as string);
  return hits.length > MAX_PER_WINDOW * 2;
}

const FORM_TYPES = ["form", "newsletter"] as const;

/** The live form node with this id, from any published page or template of the site. */
export async function findLiveForm(siteId: string, formId: string): Promise<BuilderNode | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(formId)) return null;
  const post = await prisma.post.findFirst({
    where: {
      siteId,
      status: { not: "TRASHED" },
      publishedRevision: { OR: FORM_TYPES.map((type) => ({ document: { path: ["nodes", formId, "type"], equals: type } })) },
    },
    select: { publishedRevision: { select: { document: true } } },
  });
  const node = (post?.publishedRevision?.document as BuilderDocument | undefined)?.nodes?.[formId];
  return node && (FORM_TYPES as readonly string[]).includes(node.type) ? node : null;
}

export interface SubmitMeta {
  ip: string | null;
  userAgent: string | null;
  pagePath: string | null;
}

export async function submitForm(siteKey: string, data: FormData, meta: SubmitMeta): Promise<SubmitOutcome> {
  const site = await resolveSite(siteKey);
  if (!site) return { ok: false, status: 404, message: "This site doesn't exist." };
  const formId = String(data.get("_form") ?? "");
  // Bots fill every field; people never see this one. Pretend it worked.
  if (String(data.get("_hp") ?? "")) return { ok: true, kind: "form", message: "Thanks!" };

  const ipHash = meta.ip ? createHash("sha256").update(`${site.id}:${meta.ip}`).digest("hex").slice(0, 32) : null;
  if (ipHash && burst(`${site.id}:${ipHash}`)) return { ok: false, status: 429, message: "Too many attempts. Please wait a few minutes and try again." };

  const node = await findLiveForm(site.id, formId);
  if (!node) return { ok: false, status: 404, message: "This form isn't available any more. Please reload the page." };

  const result = checkSubmission<File>(node, (key) => {
    const v = data.get(key);
    return v === null ? null : typeof v === "string" ? v : (v as File);
  });
  if (!result.ok) return { ok: false, status: 422, message: result.message, errors: result.errors };

  const branding = (site.branding ?? {}) as { accent?: string; logoText?: string };
  const brand = { name: branding.logoText || site.name, accent: branding.accent ?? null };
  const adminBase = `${platformOrigin()}/admin/sites/${site.id}/forms`;
  const readers = async () => {
    const members = await prisma.membership.findMany({ where: { siteId: site.id }, select: { user: { select: { email: true } }, role: { select: { permissions: true } } } });
    return [...new Set(members.filter((m) => hasPermission(m.role.permissions, "forms.manage")).map((m) => m.user.email))];
  };

  if (result.kind === "newsletter") {
    const existing = await prisma.subscriber.findUnique({ where: { siteId_email: { siteId: site.id, email: result.email } } });
    if (existing?.status === "SUBSCRIBED") return { ok: true, kind: "newsletter", message: "subscribed" };
    const sub = existing
      ? await prisma.subscriber.update({ where: { id: existing.id }, data: { status: "SUBSCRIBED", unsubscribedAt: null, name: result.name ?? existing.name, source: result.formName } })
      : await prisma.subscriber
          .create({ data: { siteId: site.id, email: result.email, name: result.name, source: result.formName } })
          .catch((err) => {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null; // a double submit
            throw err;
          });
    if (sub && result.settings.notify) {
      const to = await readers();
      if (to.length) await sendEmail({ ...newSubscriberEmail({ brand, listName: result.formName, email: result.email, name: result.name }, `${adminBase}/subscribers`), to, tag: "form.subscriber", siteId: site.id, idempotencyKey: `form.subscriber:${sub.id}:${sub.updatedAt.getTime()}` });
    }
    return { ok: true, kind: "newsletter", message: "subscribed" };
  }

  if (ipHash) {
    const count = await prisma.formSubmission.count({ where: { siteId: site.id, ipHash, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } } });
    if (count >= MAX_PER_WINDOW) return { ok: false, status: 429, message: "Too many messages from your connection. Please wait a few minutes and try again." };
  }

  // Attachments first, so a failed upload never leaves a half-saved message.
  const stored: { fieldLabel: string; storageKey: string; originalName: string; mimeType: string; sizeBytes: number }[] = [];
  try {
    for (const f of result.files) {
      const key = `forms/${site.id}/${randomUUID()}.${f.ext}`;
      await privateStorage().put(key, Buffer.from(await f.file.arrayBuffer()), f.file.type);
      stored.push({ fieldLabel: f.label, storageKey: key, originalName: f.file.name.slice(0, 200) || `attachment.${f.ext}`, mimeType: f.file.type, sizeBytes: f.file.size });
    }
  } catch (err) {
    console.error("form attachment upload failed", err);
    await Promise.all(stored.map((s) => privateStorage().remove(s.storageKey).catch(() => {})));
    return { ok: false, status: 500, message: "We couldn't save your file. Please try again." };
  }

  const submission = await prisma.formSubmission.create({
    data: {
      siteId: site.id,
      formId,
      formName: result.formName,
      pagePath: meta.pagePath?.slice(0, 300) ?? null,
      fields: result.fields as unknown as Prisma.InputJsonValue,
      email: result.email,
      ipHash,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      files: { create: stored.map((s) => ({ ...s, siteId: site.id })) },
    },
  });

  if (result.settings.notify !== false) {
    const to = parseRecipients(result.settings.recipients);
    const recipients = to.length ? to : await readers();
    if (recipients.length) {
      const email = formSubmissionEmail(
        { brand, formName: result.formName, pagePath: submission.pagePath, fields: result.fields, attachments: stored.map((s) => s.originalName), receivedAt: submission.createdAt },
        `${adminBase}/${submission.id}`,
      );
      await sendEmail({ ...email, to: recipients, replyTo: result.email, tag: "form.submission", siteId: site.id, idempotencyKey: `form.submission:${submission.id}` });
    }
  }
  return { ok: true, kind: "form", message: "sent" };
}
