/** Base styles for the master catalog widgets (render-catalog.tsx), appended to the site stylesheet. */

const PG_FILTERS = Array.from({ length: 8 }, (_, i) => `.site-root [data-w="projectgrid"]:has([data-pg-filter="${i + 1}"]:checked) [data-pg-item]:not([data-cat="${i + 1}"]){display:none}`).join("\n");

export const CATALOG_CSS = `
.site-root [data-w="frame"],.site-root [data-w="grid"],.site-root [data-w="sidebar"]{position:relative}
.site-root [data-w="frame"][data-clip]{overflow:hidden}
.site-root [data-w="frame"][data-arrange="stack"]{display:grid}
.site-root [data-w="frame"][data-arrange="stack"]>*{grid-area:1/1}
.site-root [data-w="sidebar"][data-sticky]{position:sticky;top:var(--wb-top,24px);align-self:flex-start}
@container site (max-width:767px){.site-root [data-w="sidebar"][data-sticky]{position:relative;top:auto}}
.site-root [data-w="anchor"]{height:0;overflow:visible}
.site-root [data-anchor-badge]{display:inline-block;padding:.1rem .45rem;border-radius:4px;background:var(--color-primary,#6366f1);color:#fff;font:600 11px/1.4 system-ui,sans-serif;transform:translateY(-50%)}
.site-root [data-w="linkinbio"]{display:flex;flex-direction:column;align-items:center;text-align:center;gap:.75rem}
.site-root [data-lib-avatar]{width:96px;height:96px;border-radius:999px;overflow:hidden;background:color-mix(in srgb,currentColor 8%,transparent)}
.site-root [data-lib-avatar] img{display:block;width:100%;height:100%;object-fit:cover}
.site-root [data-lib-name]{font-size:var(--text-h4,1.35rem)}
.site-root [data-lib-bio]{opacity:.75;max-width:36ch}
.site-root [data-w="linkinbio"] ul{display:flex;flex-direction:column;gap:.75rem;width:100%;margin:.5rem 0 0;padding:0;list-style:none}
.site-root [data-w="linkinbio"] a{display:flex;align-items:center;justify-content:center;gap:.6rem;padding:.95rem 1.25rem;border:2px solid var(--wb-accent,var(--color-primary,#111));border-radius:999px;background:var(--wb-accent,var(--color-primary,#111));color:var(--color-inverse,#fff);font-weight:600;text-decoration:none;transition:transform .15s ease,filter .15s ease}
.site-root [data-w="linkinbio"] a:hover{transform:translateY(-2px);filter:brightness(1.06)}
.site-root [data-w="linkinbio"][data-look="outline"] a{background:transparent;color:var(--wb-accent,currentColor)}
.site-root [data-w="linkinbio"][data-look="soft"] a{border-color:transparent;background:color-mix(in srgb,var(--wb-accent,currentColor) 14%,transparent);color:inherit}
.site-root [data-w="linkinbio"] a[data-featured]{box-shadow:0 0 0 4px color-mix(in srgb,var(--wb-accent,currentColor) 25%,transparent)}
.site-root [data-w="linkinbio"][data-shape="rounded"] a{border-radius:var(--radius-md,10px)}
.site-root [data-w="linkinbio"][data-shape="square"] a{border-radius:0}
.site-root [data-w="linkinbio"] a svg{flex:none;width:1.15em;height:1.15em}
.site-root :is([data-w="rectangle"],[data-w="ellipse"],[data-w="polygon"],[data-w="star"]){position:relative}
.site-root :is([data-w="rectangle"],[data-w="ellipse"]){display:grid}
.site-root [data-shape-fill]{display:block;min-height:8px}
.site-root :is([data-w="polygon"],[data-w="star"])>svg{display:block;width:100%;height:100%;overflow:visible}
.site-root [data-w="line"]{display:flex;align-items:center}
.site-root [data-line]{display:flex;align-items:center;width:100%;min-height:var(--wb-cap)}
.site-root [data-line-bar]{flex:1;border-top:var(--wb-t,2px) var(--wb-ls,solid) currentColor}
.site-root [data-line] [data-cap]{flex:none;width:var(--wb-cap);height:var(--wb-cap)}
.site-root [data-line] [data-cap]:first-child{margin-right:calc(var(--wb-cap) * -.25)}
.site-root [data-line] [data-cap]:last-child{margin-left:calc(var(--wb-cap) * -.25)}
.site-root [data-w="textpath"] svg{display:block;width:100%;height:auto;overflow:visible}
.site-root [data-w="textpath"] text{font-family:inherit;letter-spacing:inherit;text-transform:inherit;font-weight:inherit}
.site-root [data-w="textpath"][data-spin] svg{animation:wb-spin 20s linear infinite}
@keyframes wb-spin{to{transform:rotate(360deg)}}
.site-root [data-rm-toggle],.site-root [data-pg-filters] input{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.site-root [data-w="readmore"]{position:relative}
.site-root [data-rm-text]{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:var(--wb-lines,3);overflow:hidden;white-space:pre-line}
.site-root [data-rm-toggle]:checked~[data-rm-text]{display:block;-webkit-line-clamp:unset;overflow:visible}
.site-root :is([data-rm-more],[data-rm-less]){display:inline-block;margin-top:.5rem;color:var(--wb-link,var(--color-primary,currentColor));font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:.2em}
.site-root [data-rm-less],.site-root [data-rm-toggle]:checked~[data-rm-more]{display:none}
.site-root [data-rm-toggle]:checked~[data-rm-less]{display:inline-block}
.site-root [data-rm-toggle]:focus-visible~[data-rm-more],.site-root [data-rm-toggle]:focus-visible~[data-rm-less]{outline:2px solid currentColor;outline-offset:2px;border-radius:2px}
.site-root [data-w="detaillist"] dl{display:flex;flex-direction:column;margin:0}
.site-root [data-dl-row]{display:grid;grid-template-columns:minmax(8rem,1fr) 2fr;gap:1rem;padding:.7rem 0}
.site-root [data-w="detaillist"][data-dividers] [data-dl-row]+[data-dl-row]{border-top:1px solid var(--color-border,rgba(0,0,0,.1))}
.site-root [data-w="detaillist"] dt{display:flex;align-items:center;gap:.5rem;color:var(--wb-label,inherit);opacity:.7;font-weight:500}
.site-root [data-w="detaillist"] dd{margin:0;font-weight:500}
.site-root [data-w="detaillist"][data-layout="stacked"] [data-dl-row]{grid-template-columns:1fr;gap:.2rem}
.site-root [data-w="detaillist"][data-layout="columns"] dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:1rem 2rem}
.site-root [data-w="detaillist"][data-layout="columns"] [data-dl-row]{grid-template-columns:1fr;gap:.2rem;border-top:0!important}
@container site (max-width:767px){.site-root [data-w="detaillist"][data-layout="rows"] [data-dl-row]{grid-template-columns:1fr 1.4fr}}
.site-root [data-w="tags"] ul{display:flex;flex-wrap:wrap;gap:.5rem;margin:0;padding:0;list-style:none}
.site-root [data-tag]{display:inline-flex;align-items:center;gap:.35em;padding:.35em .85em;border:1px solid transparent;border-radius:999px;background:color-mix(in srgb,var(--wb-accent,currentColor) 12%,transparent);color:inherit;font-size:.875rem;font-weight:500;line-height:1.3;text-decoration:none;transition:background .15s}
.site-root a[data-tag]:hover{background:color-mix(in srgb,var(--wb-accent,currentColor) 22%,transparent)}
.site-root [data-w="tags"][data-look="outline"] [data-tag]{background:transparent;border-color:color-mix(in srgb,var(--wb-accent,currentColor) 55%,transparent)}
.site-root [data-w="tags"][data-look="solid"] [data-tag]{background:var(--wb-accent,currentColor);color:var(--color-inverse,#fff)}
.site-root [data-w="tags"][data-shape="rounded"] [data-tag]{border-radius:var(--radius-sm,6px)}
.site-root [data-w="tags"][data-size="sm"] [data-tag]{font-size:.75rem}
.site-root [data-w="tags"][data-size="lg"] [data-tag]{font-size:1rem;padding:.5em 1.1em}
.site-root [data-w="buttongroup"]{display:flex;flex-wrap:wrap;align-items:center}
.site-root [data-w="buttongroup"][data-align="center"]{justify-content:center}
.site-root [data-w="buttongroup"][data-align="end"]{justify-content:flex-end}
.site-root [data-w="buttongroup"][data-align="stretch"]>a{flex:1}
.site-root :is([data-w="buttongroup"],[data-w="herobanner"],[data-w="herocarousel"]) a[data-look]{display:inline-flex;align-items:center;justify-content:center;gap:.5em;padding:.8rem 1.4rem;border:2px solid var(--wb-accent,var(--color-primary,currentColor));border-radius:var(--radius-pill,999px);font-weight:600;text-decoration:none;transition:transform .15s ease,filter .15s ease,background .15s}
.site-root :is([data-w="buttongroup"],[data-w="herobanner"],[data-w="herocarousel"]) a[data-look]:hover{transform:translateY(-1px)}
.site-root :is([data-w="buttongroup"],[data-w="herobanner"],[data-w="herocarousel"]) a[data-look="solid"]{background:var(--wb-accent,var(--color-primary,#111));color:var(--color-inverse,#fff)}
.site-root :is([data-w="buttongroup"],[data-w="herobanner"],[data-w="herocarousel"]) a[data-look="outline"]{background:transparent;color:inherit}
.site-root [data-w="buttongroup"] a[data-look="ghost"]{border-color:transparent;background:color-mix(in srgb,var(--wb-accent,currentColor) 10%,transparent);color:inherit}
.site-root [data-w="buttongroup"] a[data-look="link"]{border-color:transparent;padding-inline:.25rem;color:var(--wb-accent,inherit);text-decoration:underline;text-underline-offset:.25em}
.site-root [data-w="buttongroup"] a[data-look]>svg{flex:none;width:1.1em;height:1.1em}
.site-root [data-w="buttongroup"][data-joined]{gap:0!important}
.site-root [data-w="buttongroup"][data-joined]>a{border-radius:0}
.site-root [data-w="buttongroup"][data-joined]>a:first-child{border-radius:var(--radius-pill,999px) 0 0 var(--radius-pill,999px)}
.site-root [data-w="buttongroup"][data-joined]>a:last-child{border-radius:0 var(--radius-pill,999px) var(--radius-pill,999px) 0}
.site-root [data-w="buttongroup"][data-joined]>a+a{margin-left:-2px}
@container site (max-width:767px){.site-root [data-w="buttongroup"][data-stack]:not([data-joined]){flex-direction:column;align-items:stretch}}
.site-root [data-w="soundcloud"] iframe{display:block;width:100%;border:0}
.site-root [data-w="soundcloud"][data-empty]{min-height:6rem;background:repeating-linear-gradient(135deg,rgba(0,0,0,.03) 0 8px,rgba(0,0,0,.06) 8px 16px)}
.site-root [data-w="herocarousel"]{position:relative;overflow:hidden}
.site-root [data-w="herocarousel"] [data-track]{grid-auto-columns:100%;gap:0}
.site-root [data-w="herocarousel"] [data-slide]{display:grid;min-height:max(var(--wb-h,80vh),22rem);border-radius:0}
.site-root [data-w="herocarousel"] [data-slide]>*,.site-root [data-w="herobanner"]>:is([data-hb-media],[data-hb-content]){grid-area:1/1}
.site-root :is([data-hc-media],[data-hb-media]){position:relative;overflow:hidden}
.site-root :is([data-hc-media],[data-hb-media]) img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover}
.site-root :is([data-hc-media],[data-hb-media])::after{content:"";position:absolute;inset:0;background:var(--wb-overlay,transparent)}
.site-root :is([data-hc-content],[data-hb-content]){position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:1rem;max-width:min(64rem,100%);padding:clamp(1.5rem,6cqi,6rem)}
.site-root [data-hc-content] :is(h1,h2,h3,h4,h5,h6,p),.site-root [data-hb-content] :is(h1,h2,h3,h4,h5,h6,p){margin:0;color:inherit}
.site-root :is([data-hc-content],[data-hb-content])>:is(h1,h2,h3,h4,h5,h6){font-family:var(--font-display,inherit);font-size:clamp(2.2rem,6cqi,4.8rem);line-height:1.05;text-wrap:balance}
.site-root :is([data-hc-text],[data-hb-text]){max-width:56ch;font-size:clamp(1rem,1.6cqi,1.25rem);opacity:.9}
.site-root [data-eyebrow]{font-size:.8rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;opacity:.85}
.site-root [data-actions]{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:.5rem}
.site-root :is([data-w="herobanner"],[data-w="herocarousel"]) a[data-look="outline"]{border-color:currentColor}
.site-root :is([data-w="herobanner"],[data-w="herocarousel"]) a[data-look="solid"]{border-color:#fff;background:#fff;color:#111}
.site-root [data-w="herocarousel"][data-align="center"] [data-hc-content],.site-root [data-w="herobanner"][data-align="center"] [data-hb-content]{align-items:center;margin-inline:auto;text-align:center}
.site-root [data-w="herocarousel"][data-align="center"] [data-hc-content]{justify-self:center}
.site-root [data-w="herobanner"]{position:relative;display:grid;min-height:max(var(--wb-h,70vh),20rem);overflow:hidden}
.site-root [data-w="herobanner"][data-align="center"] [data-hb-content]{justify-self:center}
.site-root [data-w="herobanner"][data-align="right"] [data-hb-content]{justify-self:end;align-items:flex-end;text-align:right}
.site-root [data-w="herobanner"][data-valign="top"] [data-hb-content]{align-self:start}
.site-root [data-w="herobanner"][data-valign="center"] [data-hb-content]{align-self:center}
.site-root [data-w="herobanner"][data-valign="bottom"] [data-hb-content]{align-self:end}
.site-root [data-w="herobanner"]>[data-hb-media]{position:absolute;inset:0}
.site-root [data-w="herocarousel"] :is([data-prev],[data-next]){position:absolute;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:2.75rem;height:2.75rem;border:0;border-radius:999px;background:rgba(255,255,255,.9);color:#111;box-shadow:0 4px 14px rgba(0,0,0,.15);cursor:pointer;font-size:1.25rem;z-index:2}
.site-root [data-w="herocarousel"] [data-prev]{left:1rem}
.site-root [data-w="herocarousel"] [data-next]{right:1rem}
.site-root [data-w="herocarousel"] :is([data-prev],[data-next]):disabled{opacity:.35;cursor:default}
.site-root [data-w="herocarousel"] [data-dots]{position:absolute;left:0;right:0;bottom:1rem;z-index:2;color:#fff}
.site-root [data-w="herocarousel"]:not([data-ready]) :is([data-prev],[data-next],[data-dots]){display:none}
.site-root [data-w="imagebanner"]{position:relative;display:grid;overflow:hidden;isolation:isolate}
.site-root [data-w="imagebanner"]>*{grid-area:1/1}
.site-root [data-ib-media]{aspect-ratio:var(--wb-aspect,3/1);overflow:hidden;background:repeating-linear-gradient(135deg,rgba(0,0,0,.05) 0 12px,rgba(0,0,0,.1) 12px 24px)}
.site-root [data-ib-media]:has(img){background:none}
.site-root [data-ib-media] img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .6s ease}
.site-root [data-w="imagebanner"][data-zoom]:hover [data-ib-media] img{transform:scale(1.04)}
.site-root [data-ib-caption]{position:relative;z-index:1;display:flex;flex-direction:column;gap:.35rem;align-self:end;justify-self:start;padding:clamp(1rem,4cqi,2.5rem);background:linear-gradient(transparent,var(--wb-overlay,rgba(0,0,0,.35)));width:100%}
.site-root [data-ib-caption] h3{margin:0;color:inherit;font-size:clamp(1.25rem,3cqi,2.2rem)}
.site-root [data-ib-caption] p{margin:0;opacity:.9}
.site-root [data-ib-caption] a{align-self:flex-start;margin-top:.4rem;color:inherit;font-weight:600;text-underline-offset:.25em}
.site-root [data-ib-caption] a[data-stretch]::after{content:"";position:absolute;inset:-100vmax;z-index:1}
.site-root [data-w="imagebanner"] [data-ib-caption]:has(a[data-stretch]){position:static}
.site-root [data-w="imagebanner"]:has(a[data-stretch]){cursor:pointer}
.site-root [data-w="imagebanner"][data-position="bottom"] [data-ib-caption]{align-items:center;text-align:center}
.site-root [data-w="imagebanner"][data-position="center"] [data-ib-caption]{align-self:stretch;justify-content:center;align-items:center;text-align:center;background:var(--wb-overlay,rgba(0,0,0,.35))}
.site-root [data-w="imagebanner"][data-position="top-left"] [data-ib-caption]{align-self:start;background:linear-gradient(var(--wb-overlay,rgba(0,0,0,.35)),transparent)}
.site-root [data-pg-filters]{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:var(--space-sm,1rem)}
.site-root [data-pg-filters] label{position:relative;display:inline-flex;padding:.45rem 1rem;border-radius:999px;border:1px solid color-mix(in srgb,currentColor 20%,transparent);font-size:.9rem;font-weight:500;cursor:pointer;transition:background .15s,color .15s}
.site-root [data-pg-filters] label:has(input:checked){background:var(--color-deep,#111);border-color:var(--color-deep,#111);color:var(--color-inverse,#fff)}
.site-root [data-pg-filters] label:has(input:focus-visible){outline:2px solid var(--color-primary,currentColor);outline-offset:2px}
.site-root [data-pg-list]{display:grid;grid-template-columns:repeat(var(--wb-cols,3),minmax(0,1fr));gap:inherit;margin:0;padding:0;list-style:none}
@container site (max-width:1024px){.site-root [data-pg-list]{grid-template-columns:repeat(min(2,var(--wb-cols,3)),minmax(0,1fr))}}
@container site (max-width:767px){.site-root [data-pg-list]{grid-template-columns:minmax(0,1fr)}}
.site-root [data-pg-item]>*{position:relative;display:flex;flex-direction:column;gap:.6rem;color:inherit;text-decoration:none}
.site-root [data-pg-media]{display:block;aspect-ratio:var(--wb-aspect,4/3);overflow:hidden;border-radius:var(--radius-md,8px);background:repeating-linear-gradient(135deg,rgba(0,0,0,.04) 0 12px,rgba(0,0,0,.08) 12px 24px)}
.site-root [data-pg-media]:has(img){background:none}
.site-root [data-pg-media] img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .5s ease}
.site-root [data-pg-item] a:hover [data-pg-media] img{transform:scale(1.04)}
.site-root [data-pg-text]{display:flex;flex-direction:column;gap:.15rem}
.site-root [data-pg-text] small{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;opacity:.6}
.site-root [data-pg-text] strong{font-size:1.1rem;font-weight:600}
.site-root [data-w="projectgrid"][data-caption="hover"] [data-pg-text]{position:absolute;inset:auto 0 0 0;padding:1rem 1.1rem;border-radius:0 0 var(--radius-md,8px) var(--radius-md,8px);background:linear-gradient(transparent,rgba(0,0,0,.65));color:#fff;opacity:0;transform:translateY(8px);transition:opacity .25s ease,transform .25s ease}
.site-root [data-w="projectgrid"][data-caption="hover"] [data-pg-item]>*:is(:hover,:focus-visible) [data-pg-text]{opacity:1;transform:none}
@media (hover:none){.site-root [data-w="projectgrid"][data-caption="hover"] [data-pg-text]{opacity:1;transform:none}}
${PG_FILTERS}
.site-root [data-w="imagebox"]{position:relative;display:flex;flex-direction:column;overflow:hidden;transition:transform .25s ease,box-shadow .25s ease}
.site-root [data-w="imagebox"][data-hover="lift"]:hover{transform:translateY(-4px);box-shadow:0 18px 40px rgba(0,0,0,.08)}
.site-root [data-w="imagebox"][data-hover="grow"]:hover{transform:scale(1.02)}
.site-root [data-w="imagebox"][data-hover="glow"]:hover{box-shadow:0 0 0 1px color-mix(in srgb,var(--color-primary,#6366f1) 40%,transparent),0 12px 40px color-mix(in srgb,var(--color-primary,#6366f1) 25%,transparent)}
.site-root [data-ibx-media]{aspect-ratio:var(--wb-aspect,4/3);overflow:hidden;background:repeating-linear-gradient(135deg,rgba(0,0,0,.04) 0 12px,rgba(0,0,0,.08) 12px 24px)}
.site-root [data-ibx-media]:has(img){background:none}
.site-root [data-ibx-media] img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .5s ease}
.site-root [data-w="imagebox"][data-zoom]:hover [data-ibx-media] img{transform:scale(1.05)}
.site-root [data-ibx-body]{display:flex;flex-direction:column;align-items:flex-start;gap:.5rem;padding:var(--space-sm,1.25rem)}
.site-root [data-ibx-body] p{opacity:.8}
.site-root [data-ibx-link]{display:inline-flex;align-items:center;gap:.4em;margin-top:.25rem;color:var(--color-primary,inherit);font-weight:600;text-decoration:none}
.site-root [data-ibx-link] svg{transition:transform .2s ease}
.site-root [data-ibx-link]:hover svg{transform:translateX(3px)}
.site-root [data-w="imagebox"][data-layout="left"]{flex-direction:row}
.site-root [data-w="imagebox"][data-layout="left"] [data-ibx-media]{flex:0 0 40%;aspect-ratio:auto;min-height:100%}
@container site (max-width:767px){.site-root [data-w="imagebox"][data-layout="left"]{flex-direction:column}.site-root [data-w="imagebox"][data-layout="left"] [data-ibx-media]{aspect-ratio:var(--wb-aspect,4/3)}}
.site-root [data-w="imagebox"][data-layout="overlay"]{display:grid;color:#fff}
.site-root [data-w="imagebox"][data-layout="overlay"]>*{grid-area:1/1}
.site-root [data-w="imagebox"][data-layout="overlay"] [data-ibx-body]{align-self:end;background:linear-gradient(transparent,rgba(0,0,0,.65))}
.site-root [data-w="imagebox"][data-layout="overlay"] :is([data-ibx-link],h1,h2,h3,h4,h5,h6){color:inherit}
.site-root [data-w="iconlist"] ul{display:flex;flex-direction:column;gap:.6rem;margin:0;padding:0;list-style:none}
.site-root [data-w="iconlist"][data-layout="inline"] ul{flex-direction:row;flex-wrap:wrap;gap:.6rem 1.5rem}
.site-root [data-w="iconlist"] li,.site-root [data-w="iconlist"] li>a{display:flex;align-items:center;gap:.65rem}
.site-root [data-w="iconlist"] li>a{color:inherit;text-decoration:none}
.site-root [data-w="iconlist"] li>a:hover span:last-child{text-decoration:underline;text-underline-offset:.2em}
.site-root [data-il-icon]{display:inline-flex;flex:none;font-size:var(--wb-icon,20px);color:var(--wb-icon-color,currentColor)}
.site-root [data-w="iconlist"][data-dividers] li+li{padding-top:.6rem;border-top:1px solid var(--color-border,rgba(0,0,0,.1))}
.site-root [data-w="profilecard"]{display:flex;flex-direction:column;align-items:center;gap:1rem}
.site-root [data-w="profilecard"][data-layout="horizontal"]{flex-direction:row;align-items:flex-start;text-align:left}
@container site (max-width:767px){.site-root [data-w="profilecard"][data-layout="horizontal"]{flex-direction:column;align-items:center;text-align:center}}
.site-root [data-pc-photo]{display:grid;place-items:center;flex:none;width:var(--wb-photo,120px);height:var(--wb-photo,120px);overflow:hidden;border-radius:999px;background:color-mix(in srgb,currentColor 8%,transparent);color:color-mix(in srgb,currentColor 40%,transparent)}
.site-root [data-w="profilecard"][data-photo="rounded"] [data-pc-photo]{border-radius:var(--radius-lg,16px)}
.site-root [data-w="profilecard"][data-photo="square"] [data-pc-photo]{border-radius:0}
.site-root [data-pc-photo] img{display:block;width:100%;height:100%;object-fit:cover}
.site-root [data-pc-body]{display:flex;flex-direction:column;gap:.35rem}
.site-root [data-pc-role]{font-size:.9rem;font-weight:500;color:var(--color-primary,inherit)}
.site-root [data-pc-bio]{opacity:.8;margin-top:.25rem}
.site-root [data-pc-social]{display:flex;gap:.5rem;margin:.6rem 0 0;padding:0;list-style:none}
.site-root [data-w="profilecard"]:not([data-layout="horizontal"]) [data-pc-social]{justify-content:center}
.site-root [data-pc-social] a{display:grid;place-items:center;width:2.2rem;height:2.2rem;border-radius:999px;background:color-mix(in srgb,currentColor 8%,transparent);color:inherit;font-size:1rem;transition:transform .15s}
.site-root [data-pc-social] a:hover{transform:translateY(-2px)}
.site-root [data-w="alert"]{--wb-tone:#2563eb;position:relative;display:flex;align-items:flex-start;gap:.75rem;padding:1rem 1.15rem;border:1px solid color-mix(in srgb,var(--wb-tone) 30%,transparent);border-radius:var(--radius-md,8px);background:color-mix(in srgb,var(--wb-tone) 9%,transparent)}
.site-root [data-w="alert"][data-tone="success"]{--wb-tone:#16a34a}
.site-root [data-w="alert"][data-tone="warning"]{--wb-tone:#d97706}
.site-root [data-w="alert"][data-tone="error"]{--wb-tone:#dc2626}
.site-root [data-w="alert"][data-tone="neutral"]{--wb-tone:#71717a}
.site-root [data-w="alert"][data-look="outline"]{background:transparent}
.site-root [data-w="alert"][data-look="solid"]{border-color:transparent;background:var(--wb-tone);color:#fff}
.site-root [data-w="alert"][data-look="bar"]{border-width:0 0 0 4px;border-color:var(--wb-tone);border-radius:0 var(--radius-md,8px) var(--radius-md,8px) 0}
.site-root [data-alert-icon]{display:inline-flex;flex:none;margin-top:.1rem;font-size:1.25rem;color:var(--wb-tone)}
.site-root [data-w="alert"][data-look="solid"] [data-alert-icon]{color:inherit}
.site-root [data-alert-body]{display:flex;flex:1;flex-direction:column;gap:.2rem}
.site-root [data-alert-body] p{opacity:.9}
.site-root [data-alert-link]{align-self:flex-start;margin-top:.25rem;color:inherit;font-weight:600;text-underline-offset:.2em}
.site-root [data-alert-close]{display:inline-flex;flex:none;padding:.15rem;border-radius:4px;opacity:.6;cursor:pointer;font-size:1.1rem}
.site-root [data-alert-close]:hover{opacity:1}
.site-root [data-w="alert"]:has([data-alert-dismiss]:checked){display:none}
.site-root [data-w="shortcode"] [data-sc-unknown]{padding:0 .2em;border-radius:3px;background:rgba(245,158,11,.2);color:inherit;font-family:ui-monospace,monospace;font-size:.9em}
.site-root [data-w="shortcode"] a[data-sc="button"]{display:inline-flex;padding:.7rem 1.3rem;border-radius:var(--radius-pill,999px);background:var(--color-primary,#111);color:var(--color-inverse,#fff);font-weight:600;text-decoration:none}
.site-root [data-w="shortcode"] svg{vertical-align:-.15em}
.site-root [data-w="shortcode"][data-empty]{min-height:2rem;background:repeating-linear-gradient(135deg,rgba(0,0,0,.03) 0 8px,rgba(0,0,0,.06) 8px 16px)}
.site-root [data-w="codesnippet"]{--wb-cs-bg:#0f172a;--wb-cs-fg:#e2e8f0;--wb-cs-muted:#64748b;overflow:hidden;background:var(--wb-cs-bg);color:var(--wb-cs-fg);font-size:.875rem}
.site-root [data-w="codesnippet"][data-theme="light"]{--wb-cs-bg:#f8fafc;--wb-cs-fg:#0f172a;--wb-cs-muted:#94a3b8;border:1px solid #e2e8f0}
.site-root [data-cs-bar]{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.5rem .75rem .5rem 1rem;border-bottom:1px solid color-mix(in srgb,var(--wb-cs-fg) 12%,transparent);color:var(--wb-cs-muted);font:500 .75rem/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
.site-root [data-copy]{display:inline-flex;align-items:center;gap:.35rem;padding:.3rem .6rem;border:0;border-radius:6px;background:color-mix(in srgb,var(--wb-cs-fg) 10%,transparent);color:var(--wb-cs-fg);font:inherit;cursor:pointer}
.site-root [data-copy]:hover{background:color-mix(in srgb,var(--wb-cs-fg) 18%,transparent)}
.site-root [data-w="codesnippet"]:not([data-ready]) [data-copy]{visibility:hidden}
.site-root [data-w="codesnippet"] pre{margin:0;padding:1rem 1.15rem;overflow:auto;font:400 1em/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;tab-size:2}
.site-root [data-w="codesnippet"][data-wrap] pre{white-space:pre-wrap;overflow-wrap:anywhere}
.site-root [data-w="codesnippet"] code{font:inherit;counter-reset:wb-ln}
.site-root [data-w="codesnippet"][data-numbers] [data-ln]{counter-increment:wb-ln}
.site-root [data-w="codesnippet"][data-numbers] [data-ln]::before{content:counter(wb-ln);display:inline-block;width:2.5ch;margin-right:1.25ch;color:var(--wb-cs-muted);text-align:right;user-select:none}
@media (prefers-reduced-motion:reduce){.site-root [data-w="textpath"][data-spin] svg{animation:none}}
`;
