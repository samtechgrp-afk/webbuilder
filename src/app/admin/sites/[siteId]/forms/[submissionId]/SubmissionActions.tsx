"use client";

import type { SubmissionStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/cms/ui";
import { deleteSubmissionAction, setSubmissionStatusAction } from "@/server/form-actions";

export function SubmissionActions({ siteId, id, status, email }: { siteId: string; id: string; status: SubmissionStatus; email: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else after?.();
      router.refresh();
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
      {email && (
        <a href={`mailto:${email}`} className="inline-flex items-center rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white hover:opacity-90">
          Reply by email
        </a>
      )}
      <Button disabled={pending} data-submission-action="unread" onClick={() => act(() => setSubmissionStatusAction({ siteId, id, status: "NEW" }), () => router.push(`/admin/sites/${siteId}/forms`))}>
        Mark unread
      </Button>
      <Button disabled={pending} data-submission-action="spam" onClick={() => act(() => setSubmissionStatusAction({ siteId, id, status: status === "SPAM" ? "READ" : "SPAM" }))}>
        {status === "SPAM" ? "Not spam" : "Mark as spam"}
      </Button>
      <Button
        tone="danger"
        disabled={pending}
        data-submission-action="delete"
        onClick={() => {
          if (!window.confirm("Delete this message and its attachments? This can't be undone.")) return;
          act(() => deleteSubmissionAction({ siteId, id }), () => router.push(`/admin/sites/${siteId}/forms`));
        }}
      >
        Delete
      </Button>
    </div>
  );
}
