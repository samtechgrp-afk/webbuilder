import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAureliaHome, type SampleImages } from "../prisma/sample-site";
import { isSafeHref } from "../src/lib/builder/content";
import { authorizeChanges, diffDocuments, nodeCapabilities } from "../src/lib/builder/policy";
import { safeCssValue } from "../src/lib/builder/styles";
import type { BuilderDocument } from "../src/lib/builder/types";
import { SYSTEM_ROLES } from "../src/lib/rbac";

const img = { assetId: "a1", src: "/x.webp", alt: "x" };
const images: SampleImages = { hero: img, living: img, kitchen: img, bedroom: img, portrait: img };
const base = () => buildAureliaHome(images);

const client = { permissions: SYSTEM_ROLES.client_admin.permissions };
const author = { permissions: SYSTEM_ROLES.author.permissions };
const designer = { permissions: SYSTEM_ROLES.designer.permissions };

function check(edit: (d: BuilderDocument) => void, ctx = client) {
  const prev = base();
  const next = structuredClone(prev);
  edit(next);
  return authorizeChanges(prev, diffDocuments(prev, next), ctx);
}

describe("Client Mode guardrails", () => {
  it("lets a client change hero text inside a layout-locked section", () => {
    assert.deepEqual(check((d) => (d.nodes["hero-title"].props.text = "A new headline")), []);
  });

  it("lets a client swap the hero image", () => {
    assert.deepEqual(check((d) => (d.nodes["hero-image"].props.image = { assetId: "a2", src: "/y.webp", alt: "y" })), []);
  });

  it("blocks spacing changes in a layout-locked section", () => {
    const v = check((d) => (d.nodes["hero-grid"].style.desktop!.gap = "0"));
    assert.equal(v.length, 1);
    assert.match(v[0].message, /layout is locked/);
  });

  it("blocks colour changes when the style is locked by an ancestor", () => {
    const v = check((d) => (d.nodes["hero-title"].style.desktop!.color = "red"));
    assert.match(v[0].message, /style is locked/);
  });

  it("allows palette colours on a style-unlocked section, but not fonts", () => {
    assert.deepEqual(check((d) => (d.nodes["announcement"].style.desktop!.background = "var(--color-accent)")), []);
    assert.equal(check((d) => (d.nodes["announcement"].style.desktop!.fontFamily = "Comic Sans MS")).length, 1);
  });

  it("allows reordering testimonials (layout open) but not service cards (layout locked)", () => {
    assert.deepEqual(check((d) => d.nodes["quotes-grid"].children!.reverse()), []);
    assert.equal(check((d) => d.nodes["svc-grid"].children!.reverse()).length, 1);
  });

  it("keeps the page's section order locked", () => {
    assert.equal(check((d) => d.nodes["main"].children!.reverse()).length, 1);
  });

  it("blocks edits to fully locked footer content", () => {
    assert.match(check((d) => (d.nodes["footer-legal"].props.text = "©"))[0].message, /content is locked/);
  });

  it("never lets a client unlock, add or remove elements", () => {
    assert.equal(check((d) => (d.nodes["hero"].locks = {})).length, 1);
    assert.equal(check((d) => {
      d.nodes["extra"] = { id: "extra", type: "text", props: { text: "hi" }, style: {} };
      d.nodes["hero-text"].children!.push("extra");
    }).length, 2);
    assert.ok(check((d) => {
      delete d.nodes["hero-cta-2"];
      d.nodes["hero-actions"].children = ["hero-cta"];
    }).length >= 1);
  });

  it("checks locks on the stored document, so unlock-and-edit in one save fails", () => {
    const v = check((d) => {
      d.nodes["hero"].locks = {};
      d.nodes["hero-grid"].style.desktop!.gap = "0";
    });
    assert.equal(v.length, 2);
  });

  it("gives authors no inline editing and designers everything", () => {
    assert.equal(check((d) => (d.nodes["hero-title"].props.text = "x"), author).length, 1);
    assert.deepEqual(check((d) => {
      d.nodes["hero"].locks = {};
      d.nodes["hero-grid"].style.desktop!.gap = "0";
      d.nodes["footer-legal"].props.text = "©";
    }, designer), []);
  });

  it("reports capabilities the editor UI uses", () => {
    const doc = base();
    const hero = nodeCapabilities(doc, "hero-title", client);
    assert.equal(hero.canEditContent, true);
    assert.deepEqual(hero.editableStyleKeys, []);
    assert.equal(nodeCapabilities(doc, "footer-legal", client).canEditContent, false);
    assert.equal(nodeCapabilities(doc, "quotes-grid", client).canReorderChildren, true);
  });
});

describe("Value safety", () => {
  it("rejects script links", () => {
    assert.equal(isSafeHref("javascript:alert(1)"), false);
    assert.equal(isSafeHref("//evil.com"), false);
    assert.equal(isSafeHref("/contact"), true);
    assert.equal(isSafeHref("https://example.com"), true);
    assert.equal(isSafeHref("mailto:hi@example.com"), true);
  });

  it("rejects CSS that could escape a declaration", () => {
    assert.equal(safeCssValue("red;}</style><script>"), null);
    assert.equal(safeCssValue("url(https://x)"), null);
    assert.equal(safeCssValue("var(--color-accent)"), "var(--color-accent)");
  });
});
