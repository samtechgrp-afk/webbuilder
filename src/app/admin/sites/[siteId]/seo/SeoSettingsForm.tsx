"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MediaField, type LibraryAsset } from "@/components/cms/MediaField";
import { Button, Card, Field, Notice, Toggle, inputClass } from "@/components/cms/ui";
import { applyTemplate } from "@/lib/seo/meta";
import { saveSiteSeoAction } from "@/server/cms-actions";

type Values = {
  titleTemplate: string;
  homeTitle: string;
  defaultDescription: string;
  defaultOgImageId: string | null;
  twitterHandle: string;
  googleVerification: string;
  bingVerification: string;
  discourageIndexing: boolean;
  excludedPostTypeIds: string[];
};

export function SeoSettingsForm({
  siteId,
  siteName,
  initial,
  postTypes,
  assets: initialAssets,
  canUpload,
}: {
  siteId: string;
  siteName: string;
  initial: Values;
  postTypes: { id: string; label: string }[];
  assets: LibraryAsset[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [assets, setAssets] = useState(initialAssets);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card title="Site defaults">
      <form
        className="grid gap-5 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await saveSiteSeoAction({ siteId, ...v });
            setNotice(res.ok ? { tone: "success", text: "Saved. Live pages, the sitemap and robots.txt use the new defaults." } : { tone: "error", text: res.error });
            if (res.ok) router.refresh();
          });
        }}
      >
        {notice && (
          <div className="md:col-span-2">
            <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
              {notice.text}
            </Notice>
          </div>
        )}
        <Field label="Title template" hint={`%s is the page title. Example: ${applyTemplate(v.titleTemplate || undefined, "Our studio", siteName)}`}>
          {(a) => <input {...a} className={inputClass} value={v.titleTemplate} maxLength={80} placeholder="%s · {site}" onChange={(e) => setV({ ...v, titleTemplate: e.target.value })} />}
        </Field>
        <Field label="Home page title" hint="Defaults to the site name.">
          {(a) => <input {...a} className={inputClass} value={v.homeTitle} maxLength={70} placeholder={siteName} onChange={(e) => setV({ ...v, homeTitle: e.target.value })} />}
        </Field>
        <div className="md:col-span-2">
          <Field label="Default description" hint={`Used when a page has no description or excerpt. ${v.defaultDescription.length}/170`}>
            {(a) => <textarea {...a} rows={2} className={inputClass} value={v.defaultDescription} maxLength={170} onChange={(e) => setV({ ...v, defaultDescription: e.target.value })} />}
          </Field>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-zinc-800">Default share image</p>
          <p className="text-xs text-zinc-500">Shown on social media for pages without their own. 1200×630 works everywhere.</p>
          <MediaField
            siteId={siteId}
            label="Default share image"
            kind="image"
            value={v.defaultOgImageId ? [v.defaultOgImageId] : []}
            onChange={(ids) => setV({ ...v, defaultOgImageId: ids[0] ?? null })}
            assets={assets}
            canUpload={canUpload}
            onUploaded={(a) => setAssets((list) => [a, ...list])}
          />
        </div>
        <div className="space-y-4">
          <Field label="X (Twitter) handle">
            {(a) => <input {...a} className={inputClass} value={v.twitterHandle} maxLength={16} placeholder="@aurelia" onChange={(e) => setV({ ...v, twitterHandle: e.target.value })} />}
          </Field>
          <Field label="Google verification code" hint="The content of Search Console's google-site-verification tag.">
            {(a) => <input {...a} className={inputClass} value={v.googleVerification} maxLength={120} onChange={(e) => setV({ ...v, googleVerification: e.target.value })} />}
          </Field>
          <Field label="Bing verification code">
            {(a) => <input {...a} className={inputClass} value={v.bingVerification} maxLength={120} onChange={(e) => setV({ ...v, bingVerification: e.target.value })} />}
          </Field>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-800">In the sitemap</legend>
          <p className="text-xs text-zinc-500">Unticked post types are left out of the sitemap and marked noindex.</p>
          {postTypes.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={!v.excludedPostTypeIds.includes(p.id)}
                onChange={(e) => setV({ ...v, excludedPostTypeIds: e.target.checked ? v.excludedPostTypeIds.filter((x) => x !== p.id) : [...v.excludedPostTypeIds, p.id] })}
              />
              {p.label}
            </label>
          ))}
        </fieldset>
        <div className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-3">
          <div>
            <p id="discourage-label" className="text-sm font-medium text-zinc-800">Discourage search engines</p>
            <p className="text-xs text-zinc-500">For staging or pre-launch: robots.txt disallows everything, every page gets noindex and the sitemap is empty.</p>
          </div>
          <Toggle checked={v.discourageIndexing} onChange={(x) => setV({ ...v, discourageIndexing: x })} label="Discourage search engines" />
        </div>
        <div className="md:col-span-2">
          <Button tone="primary" type="submit" disabled={pending} data-save-seo="">
            {pending ? "Saving…" : "Save SEO defaults"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
