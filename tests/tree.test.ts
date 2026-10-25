import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAureliaHome, type SampleImages } from "../prisma/sample-site";
import { authorizeChanges, diffDocuments } from "../src/lib/builder/policy";
import { cascadedStyle, createWidget, duplicateNode, findParent, insertNode, moveNode, removeNode, structuralProblem, subtreeIds } from "../src/lib/builder/tree";
import { SYSTEM_ROLES } from "../src/lib/rbac";

const img = { assetId: "a1", src: "/x.webp", alt: "x" };
const images: SampleImages = { hero: img, living: img, kitchen: img, bedroom: img, portrait: img };
const base = () => buildAureliaHome(images);

describe("designer tree operations", () => {
  it("the seeded page is structurally sound", () => {
    assert.equal(structuralProblem(base()), null);
  });

  it("inserts a new widget with defaults at an index", () => {
    const doc = base();
    const node = createWidget(doc, "heading");
    const next = insertNode(doc, node, "hero-text", 1)!;
    assert.equal(next.nodes["hero-text"].children![1], node.id);
    assert.equal(next.nodes[node.id].props.text, "A considered headline");
    assert.equal(structuralProblem(next), null);
    assert.equal(doc.nodes["hero-text"].children!.length + 1, next.nodes["hero-text"].children!.length, "original untouched");
  });

  it("refuses to insert into a leaf", () => {
    const doc = base();
    assert.equal(insertNode(doc, createWidget(doc, "text"), "hero-title", 0), null);
  });

  it("moves across parents and within a parent, counting the index before the move", () => {
    const doc = base();
    const across = moveNode(doc, "hero-cta-2", "hero-text", 0)!;
    assert.equal(findParent(across, "hero-cta-2"), "hero-text");
    assert.deepEqual(across.nodes["hero-actions"].children, ["hero-cta"]);

    const within = moveNode(doc, "q-1", "quotes-grid", 3)!;
    assert.deepEqual(within.nodes["quotes-grid"].children, ["q-2", "q-3", "q-1"]);
    assert.equal(structuralProblem(within), null);
  });

  it("refuses to move a node into its own subtree or move the root", () => {
    const doc = base();
    assert.equal(moveNode(doc, "hero", "hero-grid", 0), null);
    assert.equal(moveNode(doc, "root", "main", 0), null);
  });

  it("removes a whole subtree", () => {
    const doc = base();
    const gone = subtreeIds(doc, "services");
    const next = removeNode(doc, "services")!;
    for (const id of gone) assert.equal(next.nodes[id], undefined);
    assert.equal(structuralProblem(next), null);
  });

  it("duplicates a subtree with fresh ids right after the original", () => {
    const doc = base();
    const { doc: next, id } = duplicateNode(doc, "svc-1")!;
    const kids = next.nodes["svc-grid"].children!;
    assert.equal(kids[kids.indexOf("svc-1") + 1], id);
    assert.equal(subtreeIds(next, id).length, subtreeIds(doc, "svc-1").length);
    assert.ok(subtreeIds(next, id).every((n) => !doc.nodes[n]));
    assert.equal(structuralProblem(next), null);
  });

  it("catches broken structure", () => {
    const doc = base();
    doc.nodes["hero-text"].children!.push("hero-title");
    assert.match(structuralProblem(doc)!, /two places/);
    const orphan = base();
    orphan.nodes["x"] = { id: "x", type: "text", props: {}, style: {} };
    assert.match(structuralProblem(orphan)!, /detached/);
    const badTag = base();
    badTag.nodes["hero-title"].tag = "div";
    assert.match(structuralProblem(badTag)!, /isn't allowed/);
    const badStyle = base();
    (badStyle.nodes["hero"].style.desktop as Record<string, string>).position = "fixed";
    assert.match(structuralProblem(badStyle)!, /Unknown style/);
  });

  it("resolves the desktop-first cascade", () => {
    const doc = base();
    assert.deepEqual(cascadedStyle(doc.nodes["hero-grid"], "mobile", "gridTemplateColumns"), { value: "1fr", from: "tablet" });
    assert.deepEqual(cascadedStyle(doc.nodes["hero-grid"], "laptop", "gridTemplateColumns"), { value: "1.05fr .95fr", from: "desktop" });
  });

  it("lets designers make structural edits and still blocks clients", () => {
    const prev = base();
    const next = moveNode(prev, "hero-cta-2", "hero-text", 0)!;
    const changes = diffDocuments(prev, next);
    assert.deepEqual(authorizeChanges(prev, changes, { permissions: SYSTEM_ROLES.designer.permissions }), []);
    assert.ok(authorizeChanges(prev, changes, { permissions: SYSTEM_ROLES.client_admin.permissions }).length > 0);
  });
});
