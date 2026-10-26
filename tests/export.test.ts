import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assetSource, compileCss, compileHtml, IncompleteRender, outputPath } from "../src/lib/export/compile";

const ctx = { origin: "http://127.0.0.1:3000", siteKey: "aurelia", baseUrl: "https://www.aurelia.test" };

describe("output paths", () => {
  it("maps site paths to directory index files", () => {
    assert.equal(outputPath("/"), "index.html");
    assert.equal(outputPath("/shop"), "shop/index.html");
    assert.equal(outputPath("/shop/alabaster-lamp/"), "shop/alabaster-lamp/index.html");
  });

  it("refuses paths that could escape the bundle", () => {
    assert.throws(() => outputPath("/../etc"));
    assert.throws(() => outputPath("/a/./b"));
  });

  it("maps bundle assets back to the app", () => {
    assert.equal(assetSource("/assets/css/app.css"), "/_next/static/css/app.css");
    assert.equal(assetSource("/uploads/a.webp"), "/uploads/a.webp");
  });
});

describe("compiling HTML", () => {
  const page = `<html><head>
<link rel="stylesheet" href="/_next/static/css/app.css"/>
<link rel="preload" as="script" href="/_next/static/chunks/main.js"/>
<link rel="canonical" href="http://127.0.0.1:3000/sites/aurelia/shop"/>
<meta property="og:image" content="http://127.0.0.1:3000/uploads/lamp.webp"/>
<link rel="icon" href="/favicon.ico?v=3"/>
<script type="application/ld+json">{"@type":"WebPage"}</script>
<script src="/_next/static/chunks/main.js" async=""></script>
</head><body><a href="/sites/aurelia">Home</a> <a href="/sites/aurelia/shop/lamp">Lamp</a>
<img src="/uploads/lamp.webp" srcset="/uploads/lamp-640.webp 640w, /uploads/lamp.webp 1280w"/>
<script>self.__next_f.push([1,"x"])</script></body></html>`;

  it("drops runtime scripts but keeps structured data", () => {
    const { html } = compileHtml(page, ctx);
    assert.ok(!html.includes("__next_f"));
    assert.ok(!html.includes("chunks/main.js"));
    assert.ok(html.includes('<script type="application/ld+json">{"@type":"WebPage"}</script>'));
  });

  it("makes platform paths root-relative and absolute URLs point at the hosting address", () => {
    const { html } = compileHtml(page, ctx);
    assert.ok(html.includes('<a href="/">Home</a>'));
    assert.ok(html.includes('<a href="/shop/lamp">Lamp</a>'));
    assert.ok(html.includes('href="https://www.aurelia.test/shop"'));
    assert.ok(html.includes('content="https://www.aurelia.test/uploads/lamp.webp"'));
    assert.ok(html.includes('href="/assets/css/app.css"'));
    assert.ok(html.includes('href="/favicon.ico"'));
    assert.ok(!html.includes("/sites/aurelia") && !html.includes("127.0.0.1") && !html.includes("/_next/"));
  });

  it("collects every stylesheet, image and icon it references", () => {
    const { assets } = compileHtml(page, ctx);
    assert.deepEqual([...assets].sort(), ["/assets/css/app.css", "/favicon.ico", "/uploads/lamp-640.webp", "/uploads/lamp.webp"]);
  });

  it("refuses a page that was still streaming", () => {
    assert.throws(() => compileHtml('<div hidden id="S:0"><p>late</p></div>', ctx), IncompleteRender);
  });
});

describe("compiling CSS", () => {
  it("resolves relative font URLs against the stylesheet", () => {
    const css = `@font-face{src:url(../media/fraunces.woff2) format("woff2")}.a{background:url("/_next/static/media/bg.webp")}.b{background:url(data:image/png;base64,AA)}`;
    const out = compileCss(css, "/assets/css/app.css");
    assert.ok(out.css.includes('url("/assets/media/bg.webp")'));
    assert.deepEqual([...out.assets].sort(), ["/assets/media/bg.webp", "/assets/media/fraunces.woff2"]);
  });
});
