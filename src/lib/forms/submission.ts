import type { BuilderNode } from "@/lib/builder/types";
import { settingValues } from "@/lib/builder/settings";
import { WIDGETS } from "@/lib/builder/widgets";

/**
 * Pure checks for what a visitor posts to a Contact form or Newsletter
 * widget. Everything is validated against the form as published (never
 * against what the browser claims the form looks like): field types, required
 * fields, choices (posted as an index, so translated labels map back to the
 * original), lengths and attachments.
 */

export interface PostedFile {
  name: string;
  type: string;
  size: number;
}

/** What a FormData-like object gives us: strings, and files for file inputs. */
export type Posted = (key: string) => string | PostedFile | null;

export interface SubmittedField {
  label: string;
  type: string;
  value: string;
}

export interface AcceptedFile<F extends PostedFile = PostedFile> {
  field: string;
  label: string;
  file: F;
  ext: string;
}

export type FormResult<F extends PostedFile = PostedFile> =
  | { ok: true; kind: "form"; formName: string; fields: SubmittedField[]; email: string | null; files: AcceptedFile<F>[]; settings: Record<string, unknown> }
  | { ok: true; kind: "newsletter"; formName: string; email: string; name: string | null; settings: Record<string, unknown> }
  | { ok: false; errors: Record<string, string>; message: string };

/** Attachments: type → stored extension. Size limit fits a serverless request body. */
export const FORM_FILE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_FILE_BYTES = 4 * 1024 * 1024;

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
export const isEmail = (v: string) => v.length <= 254 && EMAIL_RE.test(v);

const LIMITS: Record<string, number> = { textarea: 5000, text: 500, email: 254, tel: 40, url: 500, number: 40, date: 10 };

const asText = (v: string | PostedFile | null) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "");
const isFile = (v: string | PostedFile | null): v is PostedFile => !!v && typeof v === "object" && typeof v.size === "number";

type FieldDef = { label?: unknown; type?: unknown; options?: unknown; required?: unknown };

export function checkSubmission<F extends PostedFile>(node: Pick<BuilderNode, "type" | "props">, get: Posted): FormResult<F> {
  const settings = settingValues(WIDGETS[node.type]?.settings, node as BuilderNode);
  if (node.type === "newsletter") {
    const email = asText(get("email")).toLowerCase();
    const name = asText(get("name")).slice(0, 120) || null;
    if (!email) return { ok: false, errors: { email: "Enter your email address." }, message: "Please check the form." };
    if (!isEmail(email)) return { ok: false, errors: { email: "That doesn't look like an email address." }, message: "Please check the form." };
    return { ok: true, kind: "newsletter", formName: String(settings.formName || "Newsletter"), email, name: settings.askName ? name : null, settings };
  }

  const defs = (Array.isArray(node.props.fields) ? node.props.fields : []).slice(0, 20) as FieldDef[];
  const errors: Record<string, string> = {};
  const fields: SubmittedField[] = [];
  const files: AcceptedFile<F>[] = [];
  let email: string | null = null;
  let total = 0;

  defs.forEach((def, i) => {
    const key = `f${i}`;
    const type = typeof def.type === "string" ? def.type : "text";
    const label = (typeof def.label === "string" && def.label.trim()) || `Field ${i + 1}`;
    const required = def.required === true;
    const raw = get(key);

    if (type === "file") {
      const file = isFile(raw) && raw.size > 0 ? (raw as F) : null;
      if (!file) {
        if (required) errors[key] = "Please attach a file.";
        fields.push({ label, type, value: "" });
        return;
      }
      const ext = FORM_FILE_TYPES[file.type];
      if (!ext) errors[key] = "That file type isn't accepted. Use PDF, an image, a text or Word file.";
      else if (file.size > MAX_FILE_BYTES || (total += file.size) > MAX_TOTAL_FILE_BYTES) errors[key] = "That file is too large (4 MB at most).";
      else files.push({ field: key, label, file, ext });
      fields.push({ label, type, value: file.name.slice(0, 200) });
      return;
    }

    const value = asText(raw);
    if (!value) {
      if (required) errors[key] = type === "checkbox" ? "Please tick this box." : type === "rating" ? "Please choose a rating." : "This field is required.";
      fields.push({ label, type, value: "" });
      return;
    }
    let stored = value;
    switch (type) {
      case "email":
        if (!isEmail(value)) errors[key] = "That doesn't look like an email address.";
        else email ??= value;
        break;
      case "url":
        if (!/^https?:\/\/[^\s]+\.[^\s]+$/i.test(value)) errors[key] = "Enter a full address, like https://example.com.";
        break;
      case "tel":
        if (!/^[+()\d\s.\-/]{5,40}$/.test(value)) errors[key] = "That doesn't look like a phone number.";
        break;
      case "number":
        if (!Number.isFinite(Number(value))) errors[key] = "Enter a number.";
        break;
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[key] = "Enter a date.";
        break;
      case "select":
      case "radio": {
        const options = Array.isArray(def.options) ? def.options.filter((o): o is string => typeof o === "string" && !!o) : [];
        const idx = /^\d{1,2}$/.test(value) ? Number(value) : -1;
        if (idx < 0 || idx >= options.length) errors[key] = "Please choose one of the options.";
        else stored = options[idx];
        break;
      }
      case "checkbox":
        stored = "Yes";
        break;
      case "rating":
        if (!/^[1-5]$/.test(value)) errors[key] = "Please choose a rating.";
        else stored = `${value} / 5`;
        break;
    }
    if (!errors[key] && stored.length > (LIMITS[type] ?? 500)) errors[key] = "That's too long.";
    fields.push({ label, type, value: stored });
  });

  if (Object.keys(errors).length) return { ok: false, errors, message: "Please check the highlighted fields." };
  if (fields.every((f) => !f.value)) return { ok: false, errors: {}, message: "The form is empty." };
  return { ok: true, kind: "form", formName: String(settings.formName || "Contact form"), fields, email, files, settings };
}

/** Designer-set notification addresses: up to five valid ones. */
export function parseRecipients(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...new Set(value.split(/[,;\s]+/).map((v) => v.trim().toLowerCase()).filter(isEmail))].slice(0, 5);
}
