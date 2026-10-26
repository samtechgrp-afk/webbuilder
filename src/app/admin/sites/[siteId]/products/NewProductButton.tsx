"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Dialog, Field, inputClass } from "@/components/cms/ui";
import { createProductAction } from "@/server/commerce-actions";

export function NewProductButton({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const res = await createProductAction({ siteId, title });
      if (!res.ok) return setError(res.error);
      router.push(`/admin/sites/${siteId}/products/${res.id}`);
    });
  return (
    <>
      <Button tone="primary" onClick={() => setOpen(true)} data-new-product="">
        New product
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New product"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button tone="primary" form="new-product" type="submit" disabled={pending || !title.trim()}>
              {pending ? "Creating…" : "Create and edit"}
            </Button>
          </>
        }
      >
        <form
          id="new-product"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Product name" error={error} required>
            {(p) => <input {...p} className={inputClass} value={title} maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} placeholder="Linen cushion cover" />}
          </Field>
          <p className="mt-3 text-xs text-zinc-500">It starts as a draft. Add photos, a price and stock, then set it Active to show it in the shop.</p>
        </form>
      </Dialog>
    </>
  );
}
