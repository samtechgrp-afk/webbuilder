import type { SubmittedField } from "@/lib/forms/submission";
import { button, esc, h1, layout, p, type Brand, type RenderedEmail } from "../layout";

export interface SubmissionEmailData {
  brand: Brand;
  formName: string;
  pagePath: string | null;
  fields: SubmittedField[];
  attachments: string[];
  receivedAt: Date;
}

/** Sent to the site's team for each Contact form message. Visitor input is escaped everywhere. */
export function formSubmissionEmail(d: SubmissionEmailData, adminUrl: string): RenderedEmail {
  const rows = d.fields
    .filter((f) => f.type !== "file")
    .map(
      (f) =>
        `<tr><td style="padding:8px 14px 8px 0;vertical-align:top;color:#71717a;white-space:nowrap">${esc(f.label)}</td><td style="padding:8px 0;color:#18181b;white-space:pre-wrap">${f.value ? esc(f.value) : '<span style="color:#a1a1aa">(empty)</span>'}</td></tr>`,
    )
    .join("");
  const files = d.attachments.length ? p(`Attached: ${d.attachments.map(esc).join(", ")}. Download from the submission page.`) : "";
  const where = d.pagePath ? ` on ${esc(d.pagePath)}` : "";
  const body = [
    h1(`New message: ${d.formName}`),
    p(`Sent${where} at ${esc(d.receivedAt.toUTCString())}.`),
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;font-size:14px;border-top:1px solid #f4f4f5">${rows}</table>`,
    files,
    button("Open in Forms", adminUrl, d.brand),
    p(`<span style="color:#71717a;font-size:13px">Reply to this email to answer the sender, when they gave an email address.</span>`),
  ].join("");
  const first = d.fields.find((f) => f.type !== "file" && f.value)?.value ?? "";
  return {
    subject: `${d.formName}: ${first.slice(0, 60) || "new message"}`.replace(/[\r\n]+/g, " "),
    html: layout({ brand: d.brand, preheader: first.slice(0, 120), body, footer: `Sent to the people who read form messages for ${esc(d.brand.name)}.` }),
    text: [`New message: ${d.formName}`, d.pagePath ? `Page: ${d.pagePath}` : "", "", ...d.fields.filter((f) => f.type !== "file").map((f) => `${f.label}: ${f.value || "(empty)"}`), ...(d.attachments.length ? ["", `Attached: ${d.attachments.join(", ")}`] : []), "", `Open in Forms: ${adminUrl}`].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"),
  };
}

/** Optional heads-up for each new newsletter subscriber. */
export function newSubscriberEmail(d: { brand: Brand; listName: string; email: string; name: string | null }, adminUrl: string): RenderedEmail {
  const who = d.name ? `${d.name} <${d.email}>` : d.email;
  return {
    subject: `New subscriber: ${d.email}`,
    html: layout({ brand: d.brand, preheader: `${who} joined ${d.listName}`, body: [h1("New subscriber"), p(`<strong>${esc(who)}</strong> joined <strong>${esc(d.listName)}</strong>.`), button("See subscribers", adminUrl, d.brand)].join(""), footer: `Sent to the people who manage subscribers for ${esc(d.brand.name)}.` }),
    text: [`New subscriber: ${who}`, `List: ${d.listName}`, "", `See subscribers: ${adminUrl}`].join("\n"),
  };
}
