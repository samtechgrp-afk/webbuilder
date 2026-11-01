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

function Shell({ tokens, lang, children }: { tokens: DesignTokens; lang?: string; children: React.ReactNode }) {
  return (
    <div className="site-root" lang={lang || undefined}>
      <style dangerouslySetInnerHTML={{ __html: buildCss(EMPTY, tokens) + LAYOUT_CSS }} />
      {children}
    </div>
  );
}

const withBase = (href: string, base: string) => (base && href.startsWith("/") ? `${base}${href}` : href);

export function DefaultEntry({ entry, label, tokens, lang }: { entry: DynamicPost; label: string; tokens: DesignTokens; lang?: string }) {
  const fields = Object.entries(entry.fields).filter(([, f]) => f.text && f.type !== "RICH_TEXT");
  return (
    <Shell tokens={tokens} lang={lang}>
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

export function DefaultArchive({ title, entries, tokens, linkBase, lang }: { title: string; entries: DynamicPost[]; tokens: DesignTokens; linkBase: string; lang?: string }) {
  return (
    <Shell tokens={tokens} lang={lang}>
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
export function DefaultNotFound({ siteName, tokens, linkBase, lang }: { siteName: string; tokens: DesignTokens; linkBase: string; lang?: string }) {
  return (
    <Shell tokens={tokens} lang={lang}>
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

const SEARCH_CSS = `
.dl-search{display:flex;gap:.5rem;margin:0 0 2rem}
.dl-search input{flex:1;min-width:0;font:inherit;padding:.75rem 1rem;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:var(--radius-md,12px);background:transparent;color:inherit}
.dl-search button{font:inherit;padding:.75rem 1.25rem;border:0;border-radius:var(--radius-md,12px);background:var(--color-text,#111);color:var(--color-background,#fff);cursor:pointer}
.dl-results{list-style:none;padding:0;margin:0;display:grid;gap:1.5rem}
.dl-results a{color:inherit;text-decoration:none}.dl-results a:hover h2{text-decoration:underline}
.dl-results h2{font-family:var(--font-display,inherit);font-size:1.3rem;line-height:1.25;margin:.15rem 0 .35rem}
.dl-results p{color:var(--color-muted,#666);line-height:1.5;margin:0}
`;

export interface SearchResult {
  id: string;
  title: string;
  excerpt: string | null;
  url: string;
  kind: string;
}

/** The site search page: works without JavaScript (a plain GET form). */
export function DefaultSearch({ query, results, tokens, linkBase, lang }: { query: string; results: SearchResult[]; tokens: DesignTokens; linkBase: string; lang?: string }) {
  const q = query.trim();
  return (
    <Shell tokens={tokens} lang={lang}>
      <style dangerouslySetInnerHTML={{ __html: SEARCH_CSS }} />
      <main className="dl dl-narrow">
        <h1>{q ? `Results for “${q}”` : "Search"}</h1>
        <form className="dl-search" role="search" action={withBase("/search", linkBase)} method="get">
          <label htmlFor="dl-q" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            Search this site
          </label>
          <input id="dl-q" type="search" name="q" defaultValue={q} placeholder="Search this site" maxLength={200} />
          <button type="submit">Search</button>
        </form>
        {q ? (
          results.length ? (
            <ul className="dl-results" data-results={results.length}>
              {results.map((r) => (
                <li key={r.id}>
                  <a href={withBase(r.url, linkBase)}>
                    <span className="dl-kicker">{r.kind}</span>
                    <h2>{r.title}</h2>
                    {r.excerpt && <p>{r.excerpt}</p>}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dl-body">Nothing matched. Try fewer or different words.</p>
          )
        ) : null}
      </main>
    </Shell>
  );
}
