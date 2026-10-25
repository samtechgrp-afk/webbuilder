"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MediaField, type LibraryAsset } from "@/components/cms/MediaField";
import { Button, Card, Field, Notice, inputClass } from "@/components/cms/ui";
import { saveSiteIdentityAction } from "@/server/cms-actions";

type Identity = { name: string; tagline: string; logoAssetId: string | null };

export function SiteIdentityForm({ siteId, initial, assets: initialAssets, canUpload }: { siteId: string; initial: Identity; assets: LibraryAsset[]; canUpload: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [assets, setAssets] = useState(initialAssets);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card title="Identity">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await saveSiteIdentityAction({ siteId, ...v });
            setNotice(res.ok ? { tone: "success", text: "Saved. The live site shows the new identity." } : { tone: "error", text: res.error });
            if (res.ok) router.refresh();
          });
        }}
      >
        {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
        <Field label="Site name" required>
          {(a) => <input {...a} name="name" className={inputClass} value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} />}
        </Field>
        <Field label="Tagline" hint="A short line about the business, for headers and footers.">
          {(a) => <input {...a} name="tagline" className={inputClass} value={v.tagline} maxLength={160} onChange={(e) => setV({ ...v, tagline: e.target.value })} />}
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-zinc-800">Logo</p>
          <MediaField
            siteId={siteId}
            label="Logo"
            kind="image"
            value={v.logoAssetId ? [v.logoAssetId] : []}
            onChange={(ids) => setV({ ...v, logoAssetId: ids[0] ?? null })}
            assets={assets}
            canUpload={canUpload}
            onUploaded={(a) => setAssets((list) => [a, ...list])}
          />
        </div>
        <Button tone="primary" type="submit" disabled={pending} data-save-identity="">
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </Card>
  );
}
