"use client";

import "graphiql/setup-workers/webpack";
import "graphiql/style.css";
import { createGraphiQLFetcher } from "@graphiql/toolkit";
import { GraphiQL } from "graphiql";
import { useMemo } from "react";

/** In-memory storage, so one site's tabs and keys never leak into another site's playground. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

/**
 * GraphiQL against this site's endpoint. Without headers it runs as the
 * signed-in user (same-origin cookie), so drafts are visible with
 * preview: true; paste a key into Headers to see exactly what that key sees.
 */
export default function Playground({ endpoint, initialQuery, initialHeaders }: { endpoint: string; initialQuery: string; initialHeaders: string }) {
  const fetcher = useMemo(() => createGraphiQLFetcher({ url: endpoint, fetch: (input, init) => fetch(input, { ...init, credentials: "same-origin" }) }), [endpoint]);
  const storage = useMemo(() => memoryStorage(), []);
  return (
    <div className="graphiql-host h-[640px] overflow-hidden rounded-xl border border-zinc-200" data-playground="">
      <GraphiQL fetcher={fetcher} initialQuery={initialQuery} initialHeaders={initialHeaders} defaultEditorToolsVisibility="headers" storage={storage} forcedTheme="light" />
    </div>
  );
}
