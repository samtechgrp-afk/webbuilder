import type { CSSProperties } from "react";
import { buildCss } from "@/lib/builder/styles";
import { TYPE_STEPS, type DesignTokens, type TypeStep } from "@/lib/design/tokens";

const EMPTY = { version: 1 as const, rootId: "specimen", nodes: {} };

/**
 * A live specimen of the design system: the same `.site-root` variables and
 * base CSS a published page gets, applied to a small kit of SaaS surfaces.
 * Pure markup, so it re-renders instantly as tokens change.
 */
export function TokenSpecimen({ tokens }: { tokens: DesignTokens }) {
  const card = (surface: string, shadow: string): CSSProperties => ({
    background: `var(--color-${surface}, var(--color-background))`,
    boxShadow: `var(--shadow-${shadow}, none)`,
    border: "1px solid var(--color-border, rgba(0,0,0,.1))",
    borderRadius: "var(--radius-lg, 12px)",
    padding: "var(--space-3, 1.5rem)",
  });
  return (
    <div className="site-root" data-specimen style={{ minHeight: 0, borderRadius: 12, overflow: "hidden" }}>
      <style dangerouslySetInnerHTML={{ __html: buildCss(EMPTY, tokens) }} />
      <div>
        <section
          style={{
            backgroundImage: "var(--ambient-primary, none), var(--ambient-accent, none)",
            padding: "var(--space-12, 6rem) var(--space-4, 2rem) var(--space-10, 5rem)",
            textAlign: "center",
          }}
        >
          <p style={{ color: "var(--color-accent)", fontSize: "var(--text-small)", letterSpacing: "var(--tracking-wide, .08em)", textTransform: "uppercase", fontWeight: 600 }}>
            Design system
          </p>
          <h1 data-specimen-h1 style={{ margin: "var(--space-2, 1rem) auto 0", maxWidth: "14em", fontFamily: "var(--font-display, var(--font-heading))", fontWeight: 600 }}>
            Ship a site that feels considered
          </h1>
          <p style={{ margin: "var(--space-3, 1.5rem) auto 0", maxWidth: "34em", color: "var(--color-muted)", fontSize: "var(--text-lead)" }}>
            Every colour, size and surface below comes from the site&apos;s global tokens, exactly as published pages use them.
          </p>
          <div style={{ display: "flex", gap: "var(--space-2, 1rem)", justifyContent: "center", marginTop: "var(--space-5, 2.5rem)", flexWrap: "wrap" }}>
            <a
              data-specimen-primary
              style={{ background: "var(--color-primary)", color: "var(--color-on-primary, #fff)", padding: "var(--space-2, .75rem) var(--space-3, 1.25rem)", borderRadius: "var(--radius-md, 8px)", fontWeight: 500, boxShadow: "var(--glow-primary, none)" }}
            >
              Get started
            </a>
            <a style={{ color: "var(--color-heading, inherit)", padding: "var(--space-2, .75rem) var(--space-3, 1.25rem)", borderRadius: "var(--radius-md, 8px)", border: "1px solid var(--color-border)", fontWeight: 500 }}>
              Read the docs →
            </a>
          </div>
        </section>

        <section style={{ padding: "var(--space-6, 3rem) var(--space-4, 2rem)", background: "var(--color-surface-low, transparent)", borderTop: "1px solid var(--color-border)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-3, 1.5rem)" }}>
            {(
              [
                ["surface-low", "sm", "Surface low · shadow sm"],
                ["surface-mid", "md", "Surface mid · shadow md"],
                ["surface-high", "lg", "Surface high · shadow lg"],
              ] as const
            ).map(([s, sh, label]) => (
              <div key={s} style={card(s, sh)}>
                <h4 style={{ fontSize: "var(--text-h4)" }}>{label}</h4>
                <p style={{ marginTop: "var(--space-1, .5rem)", color: "var(--color-muted)", fontSize: "var(--text-small)" }}>Elevation token on a surface token.</p>
              </div>
            ))}
            <div
              style={{
                ...card("surface-high", "xl"),
                background: "color-mix(in srgb, var(--color-surface-high, #fff) 55%, transparent)",
                backdropFilter: "blur(var(--blur-md, 12px))",
                backgroundImage: "var(--ambient-accent, none)",
              }}
            >
              <h4 style={{ fontSize: "var(--text-h4)" }}>Glass · blur md</h4>
              <p style={{ marginTop: "var(--space-1, .5rem)", color: "var(--color-muted)", fontSize: "var(--text-small)" }}>Backdrop blur over an ambient glow.</p>
            </div>
            <div style={{ ...card("surface-mid", "sm"), boxShadow: "var(--glow-subtle, none)" }}>
              <h4 style={{ fontSize: "var(--text-h4)" }}>Border glow</h4>
              <p style={{ marginTop: "var(--space-1, .5rem)", color: "var(--color-muted)", fontSize: "var(--text-small)" }}>--glow-subtle</p>
            </div>
          </div>
        </section>

        <section style={{ padding: "var(--space-6, 3rem) var(--space-4, 2rem)", borderTop: "1px solid var(--color-border)" }}>
          {(Object.keys(TYPE_STEPS) as TypeStep[]).reverse().map((step) => (
            <div key={step} style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3, 1.5rem)", padding: "var(--space-1, .5rem) 0", borderBottom: "1px solid var(--color-border)" }}>
              <code style={{ width: "7em", flexShrink: 0, fontSize: 11, color: "var(--color-muted)", fontFamily: "var(--font-mono, monospace)" }}>{step}</code>
              <span
                data-specimen-step={step}
                style={{
                  fontSize: `var(--text-${step})`,
                  fontFamily: step === "body" || step === "small" || step === "lead" ? "var(--font-body)" : "var(--font-heading, var(--font-display))",
                  lineHeight: step === "body" || step === "small" || step === "lead" ? "var(--leading-body)" : "var(--leading-tight)",
                  letterSpacing: step.startsWith("h") || step === "display" ? "var(--tracking-tight)" : undefined,
                  color: step.startsWith("h") || step === "display" ? "var(--color-heading)" : undefined,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                The quick brown fox
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
