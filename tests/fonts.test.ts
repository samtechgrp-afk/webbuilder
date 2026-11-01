import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanFamily, cleanFontUrl, cleanWeight, familiesFromCssUrl, fontFacesCss, fontFamilyOptions, fontStack, withFontFaces, type SiteFontFace } from "../src/lib/design/fonts";
import { parseDesignTokens } from "../src/lib/design/schema";
import { buildCss } from "../src/lib/builder/styles";
import { guessFromFilename, readFontInfo, sniffFontFormat } from "../src/server/design/font-file";

/** A minimal sfnt with `name` (family + subfamily, Windows UTF-16BE), `OS/2` and optionally `fvar`. */
function sfnt({ magic = [0, 1, 0, 0], family, sub, weight, italic = false, wght }: { magic?: number[]; family: string; sub: string; weight: number; italic?: boolean; wght?: [number, number] }) {
  const utf16 = (s: string) => {
    const b = new Uint8Array(s.length * 2);
    const v = new DataView(b.buffer);
    [...s].forEach((c, i) => v.setUint16(i * 2, c.charCodeAt(0)));
    return b;
  };
  const strings = [utf16(family), utf16(sub)];
  const name = new Uint8Array(6 + 12 * 2 + strings[0].length + strings[1].length);
  const nv = new DataView(name.buffer);
  nv.setUint16(2, 2);
  nv.setUint16(4, 6 + 24);
  let off = 0;
  [1, 2].forEach((id, i) => {
    const r = 6 + i * 12;
    nv.setUint16(r, 3);
    nv.setUint16(r + 2, 1);
    nv.setUint16(r + 4, 0x409);
    nv.setUint16(r + 6, id);
    nv.setUint16(r + 8, strings[i].length);
    nv.setUint16(r + 10, off);
    name.set(strings[i], 30 + off);
    off += strings[i].length;
  });
  const os2 = new Uint8Array(78);
  const ov = new DataView(os2.buffer);
  ov.setUint16(4, weight);
  ov.setUint16(62, italic ? 1 : 0x40);
  const tables: [string, Uint8Array][] = [["OS/2", os2], ["name", name]];
  if (wght) {
    const fvar = new Uint8Array(16 + 20);
    const fv = new DataView(fvar.buffer);
    fv.setUint16(4, 16);
    fv.setUint16(8, 1);
    fv.setUint16(10, 20);
    fvar.set([..."wght"].map((c) => c.charCodeAt(0)), 16);
    fv.setInt32(20, wght[0] * 65536);
    fv.setInt32(24, 400 * 65536);
    fv.setInt32(28, wght[1] * 65536);
    tables.push(["fvar", fvar]);
  }
  const header = 12 + tables.length * 16;
  const total = header + tables.reduce((n, [, b]) => n + b.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  out.set(magic, 0);
  dv.setUint16(4, tables.length);
  let at = header;
  tables.forEach(([tag, body], i) => {
    const r = 12 + i * 16;
    out.set([...tag].map((c) => c.charCodeAt(0)), r);
    dv.setUint32(r + 8, at);
    dv.setUint32(r + 12, body.length);
    out.set(body, at);
    at += body.length;
  });
  return out;
}

const face = (f: Partial<SiteFontFace> & Pick<SiteFontFace, "family" | "url">): SiteFontFace => ({ id: f.family, source: "UPLOAD", format: "truetype", weight: "400", style: "normal", fallback: "sans-serif", ...f });

describe("font files", () => {
  it("sniffs the format from magic bytes, not the name", () => {
    assert.equal(sniffFontFormat(sfnt({ family: "A", sub: "Regular", weight: 400 })), "truetype");
    assert.equal(sniffFontFormat(sfnt({ magic: [0x4f, 0x54, 0x54, 0x4f], family: "A", sub: "Regular", weight: 400 })), "opentype");
    assert.equal(sniffFontFormat(new TextEncoder().encode("wOF2 and some more bytes")), "woff2");
    assert.equal(sniffFontFormat(new TextEncoder().encode("<html><script>alert(1)</script>")), null);
    assert.equal(readFontInfo(new TextEncoder().encode("GIF89a........")), null);
  });

  it("reads family, weight and italic from the font's tables", () => {
    assert.deepEqual(readFontInfo(sfnt({ family: "Brand Sans", sub: "Bold Italic", weight: 700, italic: true })), { format: "truetype", family: "Brand Sans", weight: "700", style: "italic" });
    assert.deepEqual(readFontInfo(sfnt({ magic: [0x4f, 0x54, 0x54, 0x4f], family: "Display", sub: "Regular", weight: 400 })), { format: "opentype", family: "Display", weight: "400", style: "normal" });
  });

  it("reads a variable font's weight range", () => {
    assert.equal(readFontInfo(sfnt({ family: "Flex", sub: "Regular", weight: 400, wght: [100, 900] }))?.weight, "100 900");
  });

  it("guesses family, weight and style from a file name", () => {
    assert.deepEqual(guessFromFilename("Brand-SemiBoldItalic.woff2"), { family: "Brand", weight: "600", style: "italic" });
    assert.deepEqual(guessFromFilename("acme_display-regular.otf"), { family: "acme display", weight: null, style: null });
  });
});

describe("font links", () => {
  it("accepts only https URLs that are safe inside url(\"…\")", () => {
    assert.ok(cleanFontUrl("https://fonts.googleapis.com/css2?family=Lobster&display=swap"));
    assert.equal(cleanFontUrl("http://fonts.googleapis.com/css2?family=Lobster"), null);
    assert.equal(cleanFontUrl('https://x.test/a.css");body{color:red'), null);
    assert.equal(cleanFontUrl("https://x.test/a.css) ;"), null);
    assert.equal(cleanFontUrl("javascript:alert(1)"), null);
    assert.equal(cleanFontUrl("https://user:pw@x.test/a.css"), null);
  });

  it("reads the families a Google, Bunny or Fontshare URL names", () => {
    const g = new URL("https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,700&family=Inter:wght@400..700&display=swap");
    assert.deepEqual(familiesFromCssUrl(g), ["Playfair Display", "Inter"]);
    assert.deepEqual(familiesFromCssUrl(new URL("https://fonts.googleapis.com/css?family=Roboto:400,700|Open+Sans")), ["Roboto", "Open Sans"]);
    assert.deepEqual(familiesFromCssUrl(new URL("https://fonts.bunny.net/css?family=abel:400")), ["abel"]);
    assert.deepEqual(familiesFromCssUrl(new URL("https://api.fontshare.com/v2/css?f[]=general-sans@400,700&display=swap")), ["General Sans"]);
    assert.deepEqual(familiesFromCssUrl(new URL("https://use.typekit.net/abc.css")), []);
  });

  it("validates family names and weights", () => {
    assert.equal(cleanFamily("  Brand   Sans "), "Brand Sans");
    assert.equal(cleanFamily('Evil"}body{'), null);
    assert.equal(cleanWeight("700"), "700");
    assert.equal(cleanWeight("100 900"), "100 900");
    assert.equal(cleanWeight("900 100"), null);
    assert.equal(cleanWeight("bold"), null);
  });
});

describe("font CSS", () => {
  it("puts @import first, dedupes links and writes one @font-face per file", () => {
    const css = fontFacesCss([
      face({ family: "Brand", url: "/uploads/s1/fonts/a.ttf" }),
      face({ family: "Brand", url: "/uploads/s1/fonts/b.otf", format: "opentype", weight: "700", style: "italic" }),
      face({ family: "Lobster", source: "LINK", format: null, url: "https://fonts.googleapis.com/css2?family=Lobster" }),
      face({ family: "Inter", source: "LINK", format: null, url: "https://fonts.googleapis.com/css2?family=Lobster" }),
    ]);
    const lines = css.split("\n");
    assert.equal(lines.length, 3);
    assert.equal(lines[0], '@import url("https://fonts.googleapis.com/css2?family=Lobster");');
    assert.equal(lines[1], '@font-face{font-family:"Brand";src:url("/uploads/s1/fonts/a.ttf") format("truetype");font-weight:400;font-style:normal;font-display:swap}');
    assert.match(lines[2], /format\("opentype"\);font-weight:700;font-style:italic/);
  });

  it("skips rows that would be unsafe in a stylesheet", () => {
    const css = fontFacesCss([
      face({ family: 'X";}', url: "/uploads/a.ttf" }),
      face({ family: "Y", url: "/uploads/../../etc/passwd.ttf" }),
      face({ family: "Z", url: "https://evil.test/a.woff2", source: "UPLOAD" }),
      face({ family: "W", source: "LINK", format: null, url: "https://x.test/a.css\");" }),
    ]);
    assert.equal(css, "");
  });

  it("lists one picker option per family with its fallback stack", () => {
    const opts = fontFamilyOptions([face({ family: "Brand", url: "/uploads/a.ttf" }), face({ family: "Brand", url: "/uploads/b.ttf", weight: "700" }), face({ family: "Mono", url: "/uploads/c.ttf", fallback: "monospace" })]);
    assert.deepEqual(
      opts.map((o) => [o.family, o.value, o.faces]),
      [
        ["Brand", '"Brand", system-ui, sans-serif', ["400", "700"]],
        ["Mono", '"Mono", ui-monospace, monospace', ["400"]],
      ],
    );
    assert.equal(fontStack("Serifa", "nonsense"), '"Serifa", system-ui, sans-serif');
  });

  it("renders fonts at the top of the page CSS, and leaves pages without fonts unchanged", () => {
    const doc = { version: 1 as const, rootId: "r", nodes: {} };
    const tokens = { colors: { primary: "#123456" } };
    assert.equal(buildCss(doc, withFontFaces(tokens, [])), buildCss(doc, tokens));
    const css = buildCss(doc, withFontFaces(tokens, [{ id: "1", family: "Lobster", source: "LINK", url: "https://fonts.googleapis.com/css2?family=Lobster", format: null, weight: "400", style: "normal", fallback: "display" }]));
    assert.ok(css.startsWith('@import url("https://fonts.googleapis.com/css2?family=Lobster");'));
  });

  it("never stores font faces with the design tokens", () => {
    const res = parseDesignTokens({ colors: { primary: "#000000" }, fontFaces: [face({ family: "A", url: "/uploads/a.ttf" })] });
    assert.ok(res.ok);
    assert.equal("fontFaces" in res.tokens, false);
  });
});
