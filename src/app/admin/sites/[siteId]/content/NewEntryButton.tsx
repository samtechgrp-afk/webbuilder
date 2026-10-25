"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/cms/ui";
import { createEntryAction } from "@/server/cms-actions";

export function NewEntryButton({ siteId, postTypeId, label }: { siteId: string; postTypeId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <Button
        tone="primary"
        disabled={pending}
        data-new-entry=""
        onClick={() =>
          start(async () => {
            const res = await createEntryAction({ siteId, postTypeId });
            if (!res.ok) return setError(res.error);
            router.push(`/admin/sites/${siteId}/content/${res.id}`);
          })
        }
      >
        {pending ? "Creating…" : `New ${label.toLowerCase()}`}
      </Button>
    </div>
  );
}
