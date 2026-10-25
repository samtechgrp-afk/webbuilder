"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, Notice } from "@/components/cms/ui";
import { createSingleTemplateAction, deletePostTypeAction } from "@/server/cms-actions";

/** Single template, field groups in use, and the danger zone for one post type. */
export function PostTypeExtras({
  siteId,
  postType,
  template,
  groups,
  canDesign,
}: {
  siteId: string;
  postType: { id: string; key: string; label: string; plural: string; isSystem: boolean; usesBuilder: boolean; entries: number };
  template: { id: string; published: boolean } | null;
  groups: { id: string; label: string }[];
  canDesign: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      {!postType.usesBuilder && (
        <Card title="Single template">
          <p className="text-sm text-zinc-600">
            One visual layout renders every {postType.label.toLowerCase()} on the live site. Bind its widgets to the entry&apos;s title, image and custom fields.
          </p>
          <div className="mt-3 flex items-center gap-3">
            {template ? (
              <>
                <Link href={`/admin/sites/${siteId}/pages/${template.id}/edit`} className="inline-flex rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white hover:opacity-90" data-edit-template="">
                  Design template
                </Link>
                <span className="text-sm text-zinc-500">{template.published ? "Live" : "Not published yet. Entries use the default layout until you publish it."}</span>
              </>
            ) : (
              canDesign && (
                <Button
                  tone="primary"
                  disabled={pending}
                  data-create-template=""
                  onClick={() =>
                    start(async () => {
                      const res = await createSingleTemplateAction({ siteId, postTypeId: postType.id });
                      if (!res.ok) return setError(res.error);
                      router.push(`/admin/sites/${siteId}/pages/${res.id}/edit`);
                    })
                  }
                >
                  Create single template
                </Button>
              )
            )}
          </div>
        </Card>
      )}

      <Card
        title="Field groups"
        actions={
          <Link href={`/admin/sites/${siteId}/fields/new?postType=${postType.id}`} className="text-sm font-medium text-zinc-700 hover:text-zinc-900">
            + New field group
          </Link>
        }
      >
        {groups.length ? (
          <ul className="space-y-1">
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/admin/sites/${siteId}/fields/${g.id}`} className="text-sm text-zinc-800 underline-offset-2 hover:underline">
                  {g.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No field groups target {postType.plural.toLowerCase()} yet.</p>
        )}
      </Card>

      {!postType.isSystem && (
        <Card title="Delete post type">
          <p className="text-sm text-zinc-600">{postType.entries ? `Delete its ${postType.entries} entries first (including the trash).` : "Removes the post type and its single template."}</p>
          <Button
            tone="danger"
            className="mt-3"
            disabled={pending || postType.entries > 0}
            onClick={() => {
              if (!confirm(`Delete ${postType.plural}?`)) return;
              start(async () => {
                const res = await deletePostTypeAction({ siteId, id: postType.id });
                if (!res.ok) return setError(res.error);
                router.push(`/admin/sites/${siteId}/cpts`);
              });
            }}
          >
            Delete {postType.plural}
          </Button>
        </Card>
      )}
    </>
  );
}
