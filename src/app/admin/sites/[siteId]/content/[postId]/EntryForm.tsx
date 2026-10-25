"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FieldInput, type FieldContext } from "@/components/cms/FieldInput";
import { MediaField, type LibraryAsset } from "@/components/cms/MediaField";
import { RichTextEditor } from "@/components/cms/RichTextEditor";
import { Button, Card, Field, Notice, StatusBadge, Toggle, inputClass } from "@/components/cms/ui";
import { emptyValue, type FieldDef } from "@/lib/cms/fields";
import { matchesLocation } from "@/lib/cms/location";
import { slugify } from "@/lib/cms/slug";
import { saveEntryAction } from "@/server/cms-actions";
import { RevisionDrawer } from "../RevisionDrawer";

interface Props {
  siteId: string;
  version: number;
  post: {
    id: string;
    title: string;
    slug: string;
    status: string;
    excerpt: string | null;
    content: string;
    featuredImageId: string | null;
    template: string | null;
    parentId: string | null;
    menuOrder: number;
    termIds: string[];
    fields: Record<string, unknown>;
    seo: { seoTitle: string | null; seoDescription: string | null; noIndex: boolean };
    scheduledAt: string | null;
    publishedAt: string | null;
    isLive: boolean;
    authorName: string;
    liveUrl: string;
  };
  postType: {
    id: string;
    key: string;
    label: string;
    plural: string;
    usesBuilder: boolean;
    hierarchical: boolean;
    routePrefix: string | null;
    templates: { key: string; label: string }[];
    taxonomies: { id: string; label: string; hierarchical: boolean }[];
  };
  groups: { id: string; label: string; description: string | null; location: unknown; fields: FieldDef[] }[];
  ctxData: Omit<FieldContext, "siteId" | "onUploaded" | "canUpload">;
  parents: { id: string; title: string }[];
  perms: { publish: boolean; submit: boolean; designer: boolean; upload: boolean; visual: boolean; restore: boolean; canPreview: boolean };
  lockedBy: string | null;
}

type Intent = "draft" | "submit" | "publish" | "schedule";

const toLocalInput = (iso: string | null) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * The entry editor. Clients get a calm form: title, body, featured image,
 * their custom fields and SEO, with no layout or schema controls anywhere.
 * Field groups appear and disappear live as location rules start or stop
 * matching (pick a category, a template or a parent page).
 */
type FormNotice = { tone: "success" | "error"; text: string; list?: { key: string; message: string }[] };

const carried = new Map<string, FormNotice>();
const carryNotice = (postId: string, n: FormNotice) => carried.set(postId, n);
function takeCarriedNotice(postId: string) {
  const n = carried.get(postId) ?? null;
  // Deferred so a Strict Mode double render still sees it.
  if (n) setTimeout(() => carried.delete(postId), 0);
  return n;
}

export function EntryForm({ siteId, version, post, postType, groups, ctxData, parents, perms, lockedBy }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(post.title);
  const [slug, setSlug] = useState(post.slug);
  const [slugTouched, setSlugTouched] = useState(post.status !== "DRAFT" || post.isLive);
  const [excerpt, setExcerpt] = useState(post.excerpt ?? "");
  const [content, setContent] = useState(post.content);
  const [featured, setFeatured] = useState<string | null>(post.featuredImageId);
  const [template, setTemplate] = useState(post.template ?? "default");
  const [parentId, setParentId] = useState(post.parentId ?? "");
  const [termIds, setTermIds] = useState<string[]>(post.termIds);
  const [values, setValues] = useState<Record<string, unknown>>(post.fields);
  const [seo, setSeo] = useState(post.seo);
  const [scheduleAt, setScheduleAt] = useState(toLocalInput(post.scheduledAt));
  const [assets, setAssets] = useState<LibraryAsset[]>(ctxData.assets);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // A save bumps the version, which remounts the form with fresh data; the notice rides across.
  const [notice, setNotice] = useState<FormNotice | null>(() => takeCarriedNotice(post.id));
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [history, setHistory] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);

  const readOnly = !!lockedBy;
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  const ctx: FieldContext = {
    ...ctxData,
    assets,
    siteId,
    canUpload: perms.upload,
    onUploaded: (a) => setAssets((list) => [a, ...list]),
  };

  const subject = { postTypeId: postType.id, template: template === "default" ? null : template, termIds, parentId: parentId || null };
  const visibleGroups = groups.filter((g) => matchesLocation(g.location, subject));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const terms = (taxonomyId: string) => ctxData.terms.filter((x) => x.taxonomyId === taxonomyId);

  const save = (intent: Intent) => {
    start(async () => {
      setErrors({});
      const res = await saveEntryAction({
        siteId,
        postId: post.id,
        baseVersion: version,
        intent,
        scheduledAt: intent === "schedule" ? new Date(scheduleAt).toISOString() : null,
        title,
        slug,
        excerpt,
        content: postType.usesBuilder ? null : content,
        featuredImageId: featured,
        template,
        parentId: parentId || null,
        menuOrder: post.menuOrder,
        termIds,
        fields: Object.fromEntries(visibleGroups.flatMap((g) => g.fields).map((f) => [f.key, values[f.key] ?? emptyValue(f)])),
        seo,
      });
      if (!res.ok) {
        const list = (res.violations ?? []).map((v) => ({ key: v.nodeId, message: v.message }));
        setErrors(Object.fromEntries(list.map((v) => [v.key, v.message])));
        setNotice({ tone: "error", text: res.error, list });
        requestAnimationFrame(() => noticeRef.current?.focus());
        return;
      }
      setDirty(false);
      const verb = { draft: "Draft saved", submit: "Submitted for review", publish: "Published", schedule: "Scheduled" }[intent];
      carryNotice(post.id, { tone: "success", text: `${verb}. Version ${res.version}.` });
      router.refresh();
    });
  };

  const fieldsByKey = new Map(groups.flatMap((g) => g.fields).map((f) => [f.key, f]));

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/admin/sites/${siteId}/content?type=${postType.key}`} className="text-sm text-zinc-500 hover:text-zinc-900">
            ← {postType.plural}
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="truncate text-xl font-semibold text-zinc-900">{post.title}</h1>
            <StatusBadge status={post.status} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button tone="ghost" onClick={() => setHistory(true)} data-open-history="">History</Button>
          {perms.canPreview && (
            <a href={`${post.liveUrl}?preview=1`} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100" data-preview-link="">
              Preview<span className="sr-only"> saved draft (opens in a new tab)</span> ↗
            </a>
          )}
          {post.isLive && (
            <a href={post.liveUrl} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
              View live<span className="sr-only"> (opens in a new tab)</span> ↗
            </a>
          )}
        </div>
      </div>

      <div ref={noticeRef} tabIndex={-1} className="mb-4 space-y-2 outline-none">
        {lockedBy && <Notice tone="info">{lockedBy} has this page open in the visual editor. You can read it, and edit again once they close it.</Notice>}
        {notice && (
          <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
            <p className="font-medium">{notice.text}</p>
            {!!notice.list?.length && (
              <ul className="mt-1 list-disc pl-5">
                {notice.list.map((v, i) => (
                  <li key={i}>
                    <a href={`#field-${v.key}`} className="underline underline-offset-2">{v.message}</a>
                  </li>
                ))}
              </ul>
            )}
          </Notice>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <div className="space-y-4">
              <Field label="Title" required error={errors.title}>
                {(a) => (
                  <input
                    {...a}
                    name="title"
                    disabled={readOnly}
                    value={title}
                    maxLength={200}
                    onChange={(e) => {
                      change(setTitle)(e.target.value);
                      if (!slugTouched) setSlug(slugify(e.target.value) || slug);
                    }}
                    className={`${inputClass} text-lg font-medium`}
                  />
                )}
              </Field>
              <Field
                label="Address"
                error={errors.slug}
                hint={post.isLive && !perms.publish ? "Only publishers can change the address of a live entry." : undefined}
              >
                {(a) => (
                  <div className="flex items-center rounded-lg border border-zinc-300 bg-zinc-50 focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20">
                    <span className="pl-3 text-sm text-zinc-500">/{postType.key === "page" ? "" : `${postType.routePrefix ?? postType.key}/`}</span>
                    <input
                      {...a}
                      name="slug"
                      disabled={readOnly || (post.isLive && !perms.publish) || (postType.key === "page" && post.slug === "home")}
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        change(setSlug)(e.target.value.toLowerCase().replace(/[^a-z0-9/-]/g, "-"));
                      }}
                      className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-zinc-900 outline-none"
                    />
                  </div>
                )}
              </Field>
            </div>
          </Card>

          {postType.usesBuilder ? (
            <Card title="Page layout">
              <p className="text-sm text-zinc-600">This {postType.label.toLowerCase()} is designed on the visual canvas. Publishing here also publishes the latest canvas changes.</p>
              {perms.visual && (
                <Link href={`/admin/sites/${siteId}/pages/${post.id}/edit`} className="mt-3 inline-flex rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white hover:opacity-90">
                  Open visual editor
                </Link>
              )}
            </Card>
          ) : (
            <Card title="Content">
              <RichTextEditor label="Content" value={content} onChange={change(setContent)} disabled={readOnly} minHeight={260} />
            </Card>
          )}

          {visibleGroups.map((g) => (
            <Card key={g.id} title={g.label}>
              <div className="space-y-5" data-group={g.label}>
                {g.description && <p className="-mt-1 text-sm text-zinc-500">{g.description}</p>}
                {g.fields.map((f) => {
                  const locked = !f.clientEditable && !perms.designer;
                  return (
                    <div key={f.key} id={`field-${f.key}`}>
                      <FieldInput
                        def={f}
                        value={values[f.key] ?? emptyValue(f)}
                        onChange={(v) => change(setValues)({ ...values, [f.key]: v })}
                        ctx={ctx}
                        disabled={readOnly || locked}
                        lockedNote={locked ? "Your designer manages this value." : undefined}
                        error={errors[f.key]}
                      />
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
          {!visibleGroups.length && groups.length > 0 && <p className="text-sm text-zinc-500">No custom fields apply to this {postType.label.toLowerCase()} yet.</p>}
        </div>

        <aside className="space-y-6">
          <Card title="Publish">
            <div className="space-y-3 text-sm">
              <p className="text-zinc-600">
                By {post.authorName}
                {post.publishedAt && <> · first published {new Date(post.publishedAt).toLocaleDateString()}</>}
              </p>
              {post.status === "SCHEDULED" && post.scheduledAt && (
                <p className="rounded-lg bg-sky-50 px-3 py-2 text-sky-900">Goes live {new Date(post.scheduledAt).toLocaleString()}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button disabled={pending || readOnly} onClick={() => save("draft")} data-save="draft">
                  Save draft
                </Button>
                {perms.publish ? (
                  <Button tone="primary" disabled={pending || readOnly} onClick={() => save("publish")} data-save="publish">
                    {post.isLive ? "Update live" : "Publish"}
                  </Button>
                ) : (
                  perms.submit && (
                    <Button tone="primary" disabled={pending || readOnly} onClick={() => save("submit")} data-save="submit">
                      Submit for review
                    </Button>
                  )
                )}
              </div>
              {perms.publish && (
                <details className="rounded-lg border border-zinc-200 px-3 py-2" open={post.status === "SCHEDULED"}>
                  <summary className="cursor-pointer text-sm font-medium text-zinc-800">Schedule</summary>
                  <div className="mt-2 space-y-2">
                    <label htmlFor="schedule-at" className="block text-xs text-zinc-600">Publish on</label>
                    <input id="schedule-at" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className={inputClass} aria-describedby={errors.scheduledAt ? "schedule-err" : undefined} />
                    {errors.scheduledAt && <p id="schedule-err" className="text-xs text-red-700">{errors.scheduledAt}</p>}
                    <Button size="sm" disabled={pending || readOnly} onClick={() => save("schedule")} data-save="schedule">
                      Schedule
                    </Button>
                  </div>
                </details>
              )}
              {pending && <p role="status" className="text-xs text-zinc-500">Saving…</p>}
              {dirty && !pending && <p className="text-xs text-amber-700">Unsaved changes</p>}
            </div>
          </Card>

          <Card title="Featured image">
            <MediaField
              siteId={siteId}
              label="Featured image"
              value={featured ? [featured] : []}
              onChange={(ids) => change(setFeatured)(ids[0] ?? null)}
              assets={assets}
              kind="image"
              disabled={readOnly}
              canUpload={perms.upload}
              onUploaded={(a) => setAssets((l) => [a, ...l])}
            />
            {errors.featuredImage && <p className="mt-2 text-xs text-red-700">{errors.featuredImage}</p>}
          </Card>

          {postType.taxonomies.map((tax) => (
            <Card key={tax.id} title={tax.label}>
              <fieldset data-taxonomy={tax.label}>
                <legend className="sr-only">{tax.label}</legend>
                {terms(tax.id).length ? (
                  <div className="max-h-56 space-y-1.5 overflow-y-auto">
                    {terms(tax.id).map((term) => (
                      <label key={term.id} className="flex items-center gap-2 text-sm text-zinc-800" style={{ paddingLeft: term.depth * 16 }}>
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={termIds.includes(term.id)}
                          onChange={() => change(setTermIds)(termIds.includes(term.id) ? termIds.filter((x) => x !== term.id) : [...termIds, term.id])}
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        {term.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">No {tax.label.toLowerCase()} yet.</p>
                )}
              </fieldset>
              {errors.terms && <p className="mt-2 text-xs text-red-700">{errors.terms}</p>}
            </Card>
          ))}

          {(postType.templates.length > 0 || postType.hierarchical) && (
            <Card title="Attributes">
              <div className="space-y-4">
                {postType.templates.length > 0 && (
                  <Field label="Template" error={errors.template}>
                    {(a) => (
                      <select {...a} disabled={readOnly} value={template} onChange={(e) => change(setTemplate)(e.target.value)} className={inputClass}>
                        <option value="default">Default</option>
                        {postType.templates.map((x) => (
                          <option key={x.key} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                )}
                {postType.hierarchical && (
                  <Field label="Parent" error={errors.parent}>
                    {(a) => (
                      <select {...a} disabled={readOnly} value={parentId} onChange={(e) => change(setParentId)(e.target.value)} className={inputClass}>
                        <option value="">No parent</option>
                        {parents.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                )}
              </div>
            </Card>
          )}

          <Card title="Excerpt">
            <Field label="Short summary" hint="Shown in lists, loop grids and search results.">
              {(a) => <textarea {...a} disabled={readOnly} rows={3} maxLength={500} value={excerpt} onChange={(e) => change(setExcerpt)(e.target.value)} className={inputClass} />}
            </Field>
          </Card>

          <Card title="Search engines">
            <div className="space-y-4">
              <Field label="SEO title" hint={`${(seo.seoTitle ?? "").length}/70`}>
                {(a) => <input {...a} disabled={readOnly} maxLength={70} value={seo.seoTitle ?? ""} onChange={(e) => change(setSeo)({ ...seo, seoTitle: e.target.value })} className={inputClass} placeholder={title} />}
              </Field>
              <Field label="Meta description" hint={`${(seo.seoDescription ?? "").length}/170`}>
                {(a) => <textarea {...a} disabled={readOnly} rows={3} maxLength={170} value={seo.seoDescription ?? ""} onChange={(e) => change(setSeo)({ ...seo, seoDescription: e.target.value })} className={inputClass} />}
              </Field>
              <div className="flex items-center justify-between gap-3">
                <span id="noindex-label" className="text-sm text-zinc-800">Hide from search engines</span>
                <Toggle checked={seo.noIndex} onChange={(v) => change(setSeo)({ ...seo, noIndex: v })} label="Hide from search engines" disabled={readOnly} />
              </div>
            </div>
          </Card>
        </aside>
      </div>

      <RevisionDrawer
        siteId={siteId}
        entry={history ? { id: post.id, title: post.title } : null}
        canRestore={perms.restore && !readOnly}
        onClose={() => setHistory(false)}
        onRestored={(msg) => {
          setHistory(false);
          carryNotice(post.id, { tone: "success", text: msg });
          router.refresh();
        }}
      />
      {/* Keeps unknown-field errors visible even when their group is hidden. */}
      {Object.keys(errors).some((k) => fieldsByKey.has(k) && !visibleGroups.some((g) => g.fields.some((f) => f.key === k))) && (
        <p className="sr-only">Some errors are on fields that are hidden by the current settings.</p>
      )}
    </main>
  );
}
