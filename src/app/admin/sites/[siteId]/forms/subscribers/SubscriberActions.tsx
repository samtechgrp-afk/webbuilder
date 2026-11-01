"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/cms/ui";
import { deleteSubscriberAction, setSubscriberStatusAction } from "@/server/form-actions";

export function SubscriberActions({ siteId, id, subscribed }: { siteId: string; id: string; subscribed: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      router.refresh();
    });
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      {error && <span role="alert" className="text-xs text-red-700">{error}</span>}
      <Button size="sm" disabled={pending} data-subscriber-action={subscribed ? "unsubscribe" : "resubscribe"} onClick={() => act(() => setSubscriberStatusAction({ siteId, id, subscribed: !subscribed }))}>
        {subscribed ? "Unsubscribe" : "Resubscribe"}
      </Button>
      <Button
        size="sm"
        tone="danger"
        disabled={pending}
        data-subscriber-action="delete"
        onClick={() => {
          if (window.confirm("Delete this subscriber? This can't be undone.")) act(() => deleteSubscriberAction({ siteId, id }));
        }}
      >
        Delete
      </Button>
    </span>
  );
}
