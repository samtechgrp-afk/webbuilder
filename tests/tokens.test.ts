import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aureliaTokens } from "../prisma/sample-site";
import { buildCss, contrastRatio } from "../src/lib/builder/styles";
import { PRESETS, PRESET_KEYS } from "../src/lib/design/presets";
import { parseDesignTokens } from "../src/lib/design/schema";
import { applyPreset, fluidClamp, fluidTypeScale, isTokenRef, spaceScale, tokenOptions, tokensToCss, tokenVariables } from "../src/lib/design/tokens";

const scale = { minBase: 1, maxBase: 1.125, minRatio: 1.2, maxRatio: 1.333, minWidth: 360, maxWidth: 1280 };

describe("fluid type", () => {
  it("interpolates linearly between the two widths", () => {
    // 2.5rem at 360px → 4.5rem at 1280px: slope 2rem / 57.5rem = 3.4783cqi, intercept 2.5 - 0.034783 * 22.5.
    assert.equal(fluidClamp(2.5, 4.5, 360, 1280), "clamp(2.5rem, 1.7174rem + 3.4783cqi, 4.5rem)");
  });

  it("writes a negative intercept as subtraction, with spaces calc() needs", () => {
    const v = fluidClamp(1, 6, 600, 1200);
    assert.match(v, /^clamp\(1rem, [\d.]+cqi - [\d.]+rem, 6rem\)$/);
    assert.doesNotMatch(v, /\S[+-]\S*rem/);
  });

  it("collapses to a fixed size when both ends match", () => {
    assert.equal(fluidClamp(1, 1, 360, 1280), "1rem");
  });

  it("keeps clamp bounds ordered for a shrinking step", () => {
    assert.match(fluidClamp(1.2, 1, 360, 1280), /^clamp\(1rem, .*, 1\.2rem\)$/);
  });

  it("builds a modular scale from small to display", () => {
    const s = fluidTypeScale(scale);
    assert.deepEqual(Object.keys(s), ["small", "body", "lead", "h4", "h3", "h2", "h1", "display"]);
    assert.match(s.body, /^clamp\(1rem, .*, 1\.125rem\)$/);
    assert.match(s.h1, /^clamp\(2\.4883rem, .*, 4\.7\d+rem\)$/);
  });
});

describe("token compiler", () => {
  it("emits the 8pt spacing scale --space-1 … --space-32", () => {
    const s = spaceScale(8);
    assert.equal(Object.keys(s).length, 32);
    assert.equal(s["1"], "0.5rem");
    assert.equal(s["32"], "16rem");
    assert.match(tokensToCss({ spaceUnit: 8 }), /--space-4:2rem/);
  });

  it("compiles every group with its prefix", () => {
    const css = tokensToCss(PRESETS["linear-dark"].tokens);
    for (const v of ["--color-surface-mid", "--text-h1:clamp(", "--leading-body", "--tracking-tight", "--radius-md", "--shadow-xl", "--blur-md", "--glow-primary", "--ambient-primary"]) {
      assert.ok(css.includes(v), `missing ${v}`);
    }
  });

  it("lets a named size override the generated step of the same name", () => {
    const vars = tokenVariables({ typeScale: scale, fontSizes: { h1: "5rem" } });
    const h1 = vars.filter(([k]) => k === "--text-h1");
    assert.equal(h1.at(-1)?.[1], "5rem");
  });

  it("compiles pre-phase-4 tokens exactly as before", () => {
    const css = tokensToCss(aureliaTokens);
    assert.ok(css.startsWith(".site-root{--color-background:#FBF8F3;"));
    assert.ok(css.includes("--text-display:clamp(2.6rem, 1.4rem + 4.4cqi, 5.25rem)"));
    assert.ok(css.includes("--space-xl:"));
    assert.ok(!css.includes("--space-1:"));
  });

  it("drops values that could escape the style element", () => {
    const css = tokensToCss({ colors: { evil: "red;}</style><script>", ok: "#fff" } });
    assert.ok(!css.includes("script"));
    assert.ok(css.includes("--color-ok:#fff"));
  });

  it("feeds token defaults into the page CSS", () => {
    const css = buildCss({ version: 1, rootId: "r", nodes: { r: { id: "r", type: "section", props: {}, style: {}, children: [] } } }, PRESETS["stripe-clean"].tokens);
    assert.ok(css.includes(":where(.site-root) h1{font-size:var(--text-h1,2em)}"));
    assert.ok(css.includes("--color-primary:#635BFF"));
  });

  it("lists token options per kind of style field", () => {
    const t = PRESETS["linear-dark"].tokens;
    assert.ok(tokenOptions(t, "background").some((o) => o.value === "var(--ambient-primary)"));
    assert.ok(tokenOptions(t, "shadow").some((o) => o.value === "var(--glow-primary)"));
    assert.deepEqual(tokenOptions(t, "blur")[0], { label: "sm", value: "blur(var(--blur-sm))", preview: "8px" });
    assert.equal(tokenOptions(t, "space").filter((o) => /^\d+$/.test(o.label)).length, 32);
    assert.ok(isTokenRef("var(--space-4)") && isTokenRef("blur(var(--blur-md))") && !isTokenRef("var(--a) 2px"));
  });
});

describe("presets", () => {
  for (const key of PRESET_KEYS) {
    it(`${PRESETS[key].label} validates and meets WCAG AA for text`, () => {
      const t = PRESETS[key].tokens;
      assert.equal(parseDesignTokens(t).ok, true);
      const c = t.colors!;
      for (const [fg, bg] of [["text", "background"], ["heading", "background"], ["muted", "background"], ["on-primary", "primary"], ["text", "surface-low"]]) {
        const ratio = contrastRatio(c[fg], c[bg]);
        assert.ok(ratio && ratio >= 4.5, `${fg} on ${bg}: ${ratio?.toFixed(2)}`);
      }
    });
  }

  it("keeps a site's own tokens when a preset is applied", () => {
    const next = applyPreset(aureliaTokens, PRESETS["linear-dark"].tokens);
    assert.equal(next.colors?.background, "#000000");
    assert.equal(next.colors?.gold, "#C9A66B");
    assert.equal(next.spacing?.xl, aureliaTokens.spacing?.xl);
    assert.equal(next.preset, "linear-dark");
  });
});

describe("token validation", () => {
  it("accepts the sample site's tokens", () => {
    assert.equal(parseDesignTokens(aureliaTokens).ok, true);
  });

  it("rejects CSS injection", () => {
    const r = parseDesignTokens({ shadows: { x: "0 0 1px red;} body{display:none" } });
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /shadows\.x/);
    assert.equal(parseDesignTokens({ ambient: { x: "url(https://evil.test/a.png)" } }).ok, false);
  });

  it("rejects things that aren't colours", () => {
    assert.equal(parseDesignTokens({ colors: { primary: "12px" } }).ok, false);
    assert.equal(parseDesignTokens({ colors: { primary: "oklch(0.6 0.2 270)", alias: "var(--color-primary)" } }).ok, true);
  });

  it("rejects unsafe names and impossible scales", () => {
    assert.equal(parseDesignTokens({ colors: { "Bad Name": "#fff" } }).ok, false);
    assert.equal(parseDesignTokens({ typeScale: { ...scale, minWidth: 1400, maxWidth: 1280 } }).ok, false);
    assert.equal(parseDesignTokens({ spaceUnit: 100 }).ok, false);
  });

  it("strips unknown keys", () => {
    const r = parseDesignTokens({ colors: { a: "#fff" }, script: "x" });
    assert.ok(r.ok && !("script" in r.tokens));
  });
});
