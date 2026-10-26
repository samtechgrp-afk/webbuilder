"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { Button, Card, Field, Notice, Toggle, inputClass } from "@/components/cms/ui";
import { createApiKeyAction, revokeApiKeyAction, setGraphqlAccessAction } from "@/server/developer-actions";

// GraphiQL (Monaco) is browser-only and heavy; it loads when the page does, not with the admin bundle.
const Playground = dynamic(() => import("./Playground"), { ssr: false, loading: () => <div className="h-[640px] animate-pulse rounded-xl bg-zinc-100" /> });

const noop = () => () => {};

interface Key {
  id: string;
  name: string;
  scope: "READ" | "READ_WRITE";
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  by: string | null;
}

const SAMPLE_QUERY = `# Live entries with fields, terms and images.
# Run with ▶ or Ctrl/Cmd + Enter; see Docs for types.
query Products {
  site { name url }
  posts(type: "product", first: 10) {
    totalCount
    nodes {
      title
      uri
      featuredImage { url altText srcSet }
      terms { name slug }
      customFields { _raw }
    }
  }
}
`;

const SCOPES = {
  READ: { label: "Read only", hint: "Published content only. Safe to use in a public website or app." },
  READ_WRITE: { label: "Read & write", hint: "Also drafts and previews, and creating or updating drafts. Keep it on a server; never ship it to browsers." },
} as const;

export function DeveloperPanel({ siteId, subdomain, enabled, isPublic, keys }: { siteId: string; subdomain: string; enabled: boolean; isPublic: boolean; keys: Key[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Key["scope"]>("READ");
  const [created, setCreated] = useState<{ key: string; name: string } | null>(null);
  const [playgroundHeaders, setPlaygroundHeaders] = useState("{}");
  // The page's own origin, known only in the browser (the server render shows the path).
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");

  const path = `/api/v1/sites/${subdomain}/graphql`;
  const endpoint = `${origin}${path}`;
  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  const setAccess = (next: { enabled: boolean; public: boolean }) =>
    start(async () => {
      const res = await setGraphqlAccessAction({ siteId, ...next });
      setNotice(res.ok ? { tone: "success", text: next.enabled ? "GraphQL API settings saved." : "GraphQL API turned off. Keys and public requests now get 404." } : { tone: "error", text: res.error });
      router.refresh();
    });

  return (
    <div className="space-y-6">
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <Card title="GraphQL API">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Toggle id="graphql-enabled" label="GraphQL API on" checked={enabled} disabled={pending} onChange={(v) => setAccess({ enabled: v, public: isPublic })} />
              <label htmlFor="graphql-enabled" className="text-sm">
                <span className="block font-medium text-zinc-900">GraphQL API</span>
                <span className="block text-xs text-zinc-500">When off, keys and public requests get 404. You can still try queries here.</span>
              </label>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`} data-api-status={enabled ? "on" : "off"}>
              {enabled ? "Live" : "Off"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Toggle id="graphql-public" label="Allow requests without a key" checked={isPublic} disabled={pending || !enabled} onChange={(v) => setAccess({ enabled, public: v })} />
            <label htmlFor="graphql-public" className="text-sm">
              <span className="block font-medium text-zinc-900">Allow requests without a key</span>
              <span className="block text-xs text-zinc-500">Anyone can read published content, like the public website. Turn off to require a read key.</span>
            </label>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500">Endpoint</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800" data-endpoint="">
                POST {endpoint || path}
              </code>
              <Button size="sm" type="button" onClick={() => navigator.clipboard?.writeText(endpoint)}>
                Copy
              </Button>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Send <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>. Queries can nest 5 levels deep and ask for up to 100 items per list.
            </p>
          </div>
        </div>
      </Card>

      <Card title="API keys">
        <div className="space-y-5">
          {created && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4" data-new-key="">
              <p className="text-sm font-medium text-amber-900">Copy the key for “{created.name}” now. It won&rsquo;t be shown again.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-white px-3 py-2 font-mono text-xs text-zinc-900" data-new-key-value="">
                  {created.key}
                </code>
                <Button size="sm" type="button" onClick={() => navigator.clipboard?.writeText(created.key)}>
                  Copy
                </Button>
                <Button size="sm" type="button" onClick={() => setPlaygroundHeaders(JSON.stringify({ Authorization: `Bearer ${created.key}` }, null, 2))} data-use-key="">
                  Use in playground
                </Button>
                <Button size="sm" type="button" onClick={() => setCreated(null)}>
                  Done
                </Button>
              </div>
            </div>
          )}

          <form
            className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await createApiKeyAction({ siteId, name, scope });
                if (res.ok) {
                  setCreated({ key: res.key, name });
                  setName("");
                  setNotice(null);
                } else setNotice({ tone: "error", text: res.error });
                router.refresh();
              });
            }}
          >
            <div className="space-y-3">
              <Field label="Key name" hint="Where it's used, such as “Next.js storefront” or “iOS app”.">
                {(a) => <input {...a} required maxLength={80} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Next.js storefront" />}
              </Field>
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="mb-1 text-sm font-medium text-zinc-800">Access</legend>
                {(Object.keys(SCOPES) as Key["scope"][]).map((s) => (
                  <label key={s} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${scope === s ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"}`}>
                    <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} className="mt-0.5" />
                    <span>
                      <span className="block font-medium text-zinc-900">{SCOPES[s].label}</span>
                      <span className="block text-xs text-zinc-500">{SCOPES[s].hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
            <Button tone="primary" type="submit" disabled={pending} data-create-key="">
              {pending ? "Creating…" : "Create key"}
            </Button>
          </form>

          {active.length === 0 ? (
            <p className="text-sm text-zinc-500">No active keys.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {active.map((k) => (
                <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-api-key={k.scope === "READ" ? "read" : "read-write"}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">
                      {k.name} <span className="ml-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-normal text-zinc-600">{SCOPES[k.scope].label}</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      <code className="font-mono">{k.prefix}…</code> · created {new Date(k.createdAt).toLocaleDateString()} by {k.by ?? "unknown"} · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : "never used"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    type="button"
                    tone="danger"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Revoke “${k.name}”? Apps using it stop working immediately.`)) return;
                      start(async () => {
                        const res = await revokeApiKeyAction({ siteId, id: k.id });
                        setNotice(res.ok ? { tone: "success", text: `Revoked “${k.name}”.` } : { tone: "error", text: res.error });
                        router.refresh();
                      });
                    }}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {revoked.length > 0 && (
            <details className="text-sm text-zinc-500">
              <summary className="cursor-pointer">{revoked.length} revoked</summary>
              <ul className="mt-2 space-y-1">
                {revoked.map((k) => (
                  <li key={k.id} data-revoked-key="">
                    {k.name} · <code className="font-mono">{k.prefix}…</code> · revoked {new Date(k.revokedAt!).toLocaleString()}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Card>

      <Card title="Playground">
        <p className="mb-3 text-sm text-zinc-500">
          Runs as you, so <code className="font-mono">preview: true</code> shows drafts. To see exactly what a key sees, put it in Headers: <code className="font-mono">{`{"Authorization": "Bearer wbk_…"}`}</code>.
        </p>
        {origin && <Playground key={playgroundHeaders} endpoint={endpoint} initialQuery={SAMPLE_QUERY} initialHeaders={playgroundHeaders} />}
      </Card>
    </div>
  );
}
