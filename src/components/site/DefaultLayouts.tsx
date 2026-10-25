import type { DynamicPost } from "@/lib/cms/binding";
import { formatPostDate } from "@/lib/cms/binding";
import { buildCss, type DesignTokens } from "@/lib/builder/styles";

/**
 * Layouts for entries whose post type has no single template yet, and for
 * archives. Plain, accessible markup on the site's own design tokens, so a
 * new post type looks at home before a designer touches it.
 */
const EMPTY = { version: 1 as const, rootId: "_", nodes: {} };

const LAYOUT_CSS = `
.dl{max-width:72rem;margin:0 auto;padding:clamp(3rem,6cqi,6rem) 1.25rem}
.dl-narrow{max-width:46rem}
.dl-kicker{font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:var(--color-muted,#666)}
.dl h1{font-family:var(--font-display,inherit);font-size:var(--text-h1,clamp(2.25rem,1.5rem + 3cqi,3.75rem));line-height:1.05;margin:.5rem 0 1.5rem}
.dl-hero{margin:0 0 2rem;border-radius:var(--radius-md,12px);overflow:hidden}
.dl-hero img{display:block;width:100%;height:auto}
.dl-body{line-height:1.7}.dl-body>*+*{margin-top:1em}
.dl-body h2,.dl-body h3{font-family:var(--font-display,inherit);line-height:1.2;margin-top:1.6em}
.dl-body a{color:inherit;text-underline-offset:.2em}
.dl-fields{display:grid;grid-template-columns:max-content 1fr;gap:.5rem 1.5rem;margin:2.5rem 0 0;padding:1.5rem 0 0;border-top:1px solid color-mix(in srgb,currentColor 15%,transparent)}
.dl-fields dt{color:var(--color-muted,#666)}.dl-fields dd{margin:0}
.dl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:2rem;margin-top:2rem;padding:0;list-style:none}
.dl-card a{color:inherit;text-decoration:none;display:flex;flex-direction:column;gap:.75rem}
.dl-card img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius-md,12px)}
.dl-card h2{font-family:var(--font-display,inherit);font-size:1.4rem;line-height:1.2}
.dl-card p{color:var(--color-muted,#666);line-height:1.5}
`;

function Shell({ tokens, children }: { tokens: DesignTokens; children: React.ReactNode }) {
  return (
    <div className="site-root">
      <style dangerouslySetInnerHTML={{ __html: buildCss(EMPTY, tokens) + LAYOUT_CSS }} />
      {children}
    </div>
  );
}

const withBase = (href: string, base: string) => (base && href.startsWith("/") ? `${base}${href}` : href);

export function DefaultEntry({ entry, label, tokens }: { entry: DynamicPost; label: string; tokens: DesignTokens }) {
  const fields = Object.entries(entry.fields).filter(([, f]) => f.text && f.type !== "RICH_TEXT");
  return (
    <Shell tokens={tokens}>
      <main className="dl dl-narrow">
        <article>
          <p className="dl-kicker">
            {label}
            {entry.date ? ` · ${formatPostDate(entry.date)}` : ""}
          </p>
          <h1>{entry.title}</h1>
          {entry.featuredImage?.src && (
            <figure className="dl-hero">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={entry.featuredImage.src} srcSet={entry.featuredImage.srcSet} sizes="(max-width: 767px) 100vw, 46rem" alt={entry.featuredImage.alt} width={entry.featuredImage.width} height={entry.featuredImage.height} fetchPriority="high" />
            </figure>
          )}
          {/* Sanitised on write (src/server/sanitize.ts). */}
          {entry.content && <div className="dl-body" dangerouslySetInnerHTML={{ __html: entry.content }} />}
          {fields.length > 0 && (
            <dl className="dl-fields">
              {fields.map(([key, f]) => (
                <div key={key} style={{ display: "contents" }}>
                  <dt>{f.label}</dt>
                  <dd>{f.text}</dd>
                </div>
              ))}
            </dl>
          )}
        </article>
      </main>
    </Shell>
  );
}

export function DefaultArchive({ title, entries, tokens, linkBase }: { title: string; entries: DynamicPost[]; tokens: DesignTokens; linkBase: string }) {
  return (
    <Shell tokens={tokens}>
      <main className="dl">
        <h1>{title}</h1>
        {entries.length ? (
          <ul className="dl-grid">
            {entries.map((e) => (
              <li key={e.id} className="dl-card">
                <a href={withBase(e.url, linkBase)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {e.featuredImage?.src && <img src={e.featuredImage.src} srcSet={e.featuredImage.srcSet} sizes="(max-width: 767px) 100vw, 33vw" alt="" loading="lazy" width={e.featuredImage.width} height={e.featuredImage.height} />}
                  <h2>{e.title}</h2>
                  {e.excerpt && <p>{e.excerpt}</p>}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nothing published yet.</p>
        )}
      </main>
    </Shell>
  );
}

/** The fallback "page not found" for sites without a designed 404 page. */
export function DefaultNotFound({ siteName, tokens, linkBase }: { siteName: string; tokens: DesignTokens; linkBase: string }) {
  return (
    <Shell tokens={tokens}>
      <main className="dl dl-narrow" style={{ minHeight: "70vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <p className="dl-kicker">404 · {siteName}</p>
        <h1>We couldn&apos;t find that page.</h1>
        <p className="dl-body">It may have moved, or the address may be mistyped.</p>
        <p style={{ marginTop: "2rem" }}>
          <a href={withBase("/", linkBase)} style={{ display: "inline-block", padding: ".8rem 1.4rem", borderRadius: "999px", background: "var(--color-text,#111)", color: "var(--color-background,#fff)", textDecoration: "none" }}>
            Back to the home page
          </a>
        </p>
      </main>
    </Shell>
  );
}
