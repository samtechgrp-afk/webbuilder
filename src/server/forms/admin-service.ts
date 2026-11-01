import "server-only";
import type { Prisma, SubmissionStatus } from "@prisma/client";
import type { SubmittedField } from "@/lib/forms/submission";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import { privateStorage } from "../media-processing";

/**
 * Forms inbox and newsletter subscribers for /admin/sites/<id>/forms.
 * Everything goes through the tenant-scoped client, so one site can never
 * read another's messages.
 */

export const SUBMISSION_TABS = [
  { key: "inbox", label: "Inbox", where: { status: { in: ["NEW", "READ"] } } },
  { key: "unread", label: "Unread", where: { status: "NEW" } },
  { key: "spam", label: "Spam", where: { status: "SPAM" } },
] as const satisfies readonly { key: string; label: string; where: Prisma.FormSubmissionWhereInput }[];

const PAGE = 25;

const preview = (fields: SubmittedField[]) => fields.filter((f) => f.type !== "file" && f.value).map((f) => f.value).join(" · ").slice(0, 140);

export async function listSubmissions(t: TenantContext, filter: { tab?: string; form?: string; q?: string; page?: number }) {
  t.assert("forms.manage");
  const tab = SUBMISSION_TABS.find((x) => x.key === filter.tab) ?? SUBMISSION_TABS[0];
  const q = filter.q?.trim() ?? "";
  const base: Prisma.FormSubmissionWhereInput = {
    ...(filter.form ? { formName: filter.form } : {}),
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { formName: { contains: q, mode: "insensitive" } }, { pagePath: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const page = Math.max(1, filter.page ?? 1);
  const where = { ...base, ...tab.where };
  const [rows, total, counts, forms] = await Promise.all([
    t.db.formSubmission.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { _count: { select: { files: true } } } }),
    t.db.formSubmission.count({ where }),
    Promise.all(SUBMISSION_TABS.map((x) => t.db.formSubmission.count({ where: { ...base, ...x.where } }))),
    t.db.formSubmission.groupBy({ by: ["formName"], _count: { _all: true }, orderBy: { formName: "asc" } }),
  ]);
  return {
    tab: tab.key,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE)),
    counts: Object.fromEntries(SUBMISSION_TABS.map((x, i) => [x.key, counts[i]])) as Record<string, number>,
    forms: forms.map((f) => ({ name: f.formName, count: f._count._all })),
    rows: rows.map((r) => ({
      id: r.id,
      formName: r.formName,
      email: r.email,
      pagePath: r.pagePath,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      preview: preview(r.fields as unknown as SubmittedField[]),
      files: r._count.files,
    })),
  };
}

/** Opening a message marks it read. */
export async function getSubmission(t: TenantContext, id: string) {
  t.assert("forms.manage");
  const row = await t.db.formSubmission.findFirst({ where: { id }, include: { files: { orderBy: { createdAt: "asc" } } } });
  if (!row) return null;
  if (row.status === "NEW") await t.db.formSubmission.update({ where: { id }, data: { status: "READ" } });
  return { ...row, status: row.status === "NEW" ? ("READ" as const) : row.status, fields: row.fields as unknown as SubmittedField[] };
}

export async function setSubmissionStatus(t: TenantContext, id: string, status: SubmissionStatus) {
  t.assert("forms.manage");
  if (!["NEW", "READ", "SPAM"].includes(status)) throw new EditError("Unknown status", "invalid");
  const res = await t.db.formSubmission.updateMany({ where: { id }, data: { status } });
  if (!res.count) throw new EditError("That message no longer exists.", "not_found");
}

export async function deleteSubmission(t: TenantContext, id: string) {
  t.assert("forms.manage");
  const row = await t.db.formSubmission.findFirst({ where: { id }, include: { files: true } });
  if (!row) return;
  await t.db.formSubmission.delete({ where: { id } });
  await Promise.all(row.files.map((f) => privateStorage().remove(f.storageKey).catch((err) => console.error("form file delete failed", err))));
}

export async function readSubmissionFile(t: TenantContext, fileId: string) {
  t.assert("forms.manage");
  const file = await t.db.formFile.findFirst({ where: { id: fileId } });
  if (!file) return null;
  const object = await privateStorage().get?.(file.storageKey);
  return object ? { file, body: object.body } : null;
}

export async function listSubscribers(t: TenantContext, filter: { status?: string; q?: string; page?: number }) {
  t.assert("forms.manage");
  const status = filter.status === "unsubscribed" ? "UNSUBSCRIBED" : "SUBSCRIBED";
  const q = filter.q?.trim() ?? "";
  const where: Prisma.SubscriberWhereInput = { status, ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}) };
  const page = Math.max(1, filter.page ?? 1);
  const [rows, total, subscribed, unsubscribed] = await Promise.all([
    t.db.subscriber.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    t.db.subscriber.count({ where }),
    t.db.subscriber.count({ where: { status: "SUBSCRIBED" } }),
    t.db.subscriber.count({ where: { status: "UNSUBSCRIBED" } }),
  ]);
  return { status, page, pages: Math.max(1, Math.ceil(total / PAGE)), counts: { subscribed, unsubscribed }, rows };
}

export async function setSubscriberStatus(t: TenantContext, id: string, subscribed: boolean) {
  t.assert("forms.manage");
  const res = await t.db.subscriber.updateMany({ where: { id }, data: subscribed ? { status: "SUBSCRIBED", unsubscribedAt: null } : { status: "UNSUBSCRIBED", unsubscribedAt: new Date() } });
  if (!res.count) throw new EditError("That subscriber no longer exists.", "not_found");
}

export async function deleteSubscriber(t: TenantContext, id: string) {
  t.assert("forms.manage");
  await t.db.subscriber.deleteMany({ where: { id } });
}

/** RFC 4180 CSV, with spreadsheet formula injection neutralised. */
export function toCsv(rows: (string | null | undefined)[][]) {
  const cell = (v: string | null | undefined) => {
    let s = v ?? "";
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export async function subscribersCsv(t: TenantContext) {
  t.assert("forms.manage");
  const rows = await t.db.subscriber.findMany({ orderBy: { createdAt: "asc" }, take: 50_000 });
  return toCsv([["Email", "Name", "Status", "Source", "Subscribed at"], ...rows.map((r) => [r.email, r.name, r.status.toLowerCase(), r.source, r.createdAt.toISOString()])]);
}

export async function submissionsCsv(t: TenantContext, formName: string | undefined) {
  t.assert("forms.manage");
  const rows = await t.db.formSubmission.findMany({ where: { status: { not: "SPAM" }, ...(formName ? { formName } : {}) }, orderBy: { createdAt: "asc" }, take: 20_000 });
  const labels = [...new Set(rows.flatMap((r) => (r.fields as unknown as SubmittedField[]).map((f) => f.label)))];
  return toCsv([
    ["Received", "Form", "Page", ...labels],
    ...rows.map((r) => {
      const byLabel = new Map((r.fields as unknown as SubmittedField[]).map((f) => [f.label, f.value]));
      return [r.createdAt.toISOString(), r.formName, r.pagePath, ...labels.map((l) => byLabel.get(l) ?? "")];
    }),
  ]);
}
