import { BRAND_ICONS } from "./brand-icons";
import type { SettingDef } from "./settings";
import type { CatalogWidgetType } from "./types";
import type { WidgetDefinition } from "./widgets";

/**
 * The master catalog additions: the widgets the original library didn't have
 * (frames, grids, anchors, vector shapes, hero banners, composite cards,
 * alerts, shortcodes, code snippets…). They follow the same rules as every
 * other widget: content fields are what clients may edit, settings are
 * designer options with defaults, and the renderer (render-catalog.tsx) is a
 * plain server component that works without JavaScript.
 *
 * Kept in its own module so the core registry (widgets.ts) stays readable;
 * WIDGETS merges both.
 */

/** Networks a social profile can point at: brand icons plus email, phone and website. */
export const SOCIAL_NETWORKS = [
  ...Object.entries(BRAND_ICONS)
    .map(([value, b]) => ({ value, label: b.label }))
    .sort((a, b) => a.label.localeCompare(b.label)),
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "website", label: "Website" },
];

const COLOR = (key: string, label: string, o: { help?: string; default?: string; when?: SettingDef["when"] } = {}): SettingDef => ({ key, label, kind: "color", default: o.default ?? "", help: o.help, when: o.when });
const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const EMPTY_IMAGE = { assetId: null, src: "", alt: "" };
const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "p"].map((v) => ({ value: v, label: v.toUpperCase() }));
const ASPECTS = opts(["16 / 9", "Widescreen (16:9)"], ["21 / 9", "Cinema (21:9)"], ["3 / 1", "Banner (3:1)"], ["4 / 3", "Classic (4:3)"], ["1 / 1", "Square"], ["4 / 5", "Portrait (4:5)"], ["3 / 4", "Tall (3:4)"]);
const HOVER: SettingDef = { key: "hover", label: "Hover effect", kind: "select", default: "lift", options: opts(["none", "None"], ["lift", "Lift"], ["grow", "Grow"], ["glow", "Glow"]) };

/** Fill, outline and rotation shared by every vector shape. */
const SHAPE: SettingDef[] = [
  COLOR("fill", "Fill", { default: "var(--color-primary, var(--color-accent, #6366f1))", help: "Empty leaves the shape see-through." }),
  COLOR("stroke", "Outline colour"),
  { key: "strokeWidth", label: "Outline width", kind: "number", min: 0, max: 40, unit: "px", default: 0 },
  { key: "rotate", label: "Rotation", kind: "number", min: 0, max: 360, step: 5, unit: "°", default: 0 },
];
const SHAPE_STYLE = { desktop: { width: "160px", aspectRatio: "1 / 1" } };

export const CATALOG_WIDGETS: Record<CatalogWidgetType, WidgetDefinition> = {
  // ── Layout & structure ────────────────────────────────────────────────────
  frame: {
    label: "Frame",
    category: "layout",
    icon: "frame",
    keywords: "artboard board canvas clip layer stack overlay",
    isContainer: true,
    defaultTag: "div",
    allowedTags: ["div", "section", "figure", "article"],
    contentFields: [],
    hint: "Fixed-size board that clips its content; can stack layers",
    settings: [
      { key: "arrange", label: "Arrange children", kind: "select", default: "flow", options: opts(["flow", "One after another"], ["stack", "Stacked as layers"]), help: "Layers sit on top of each other, later ones in front. Align them with the Style tab." },
      { key: "clip", label: "Clip content", kind: "toggle", default: true, help: "Hides anything that spills outside the frame." },
    ],
    defaults: {
      props: {},
      style: { desktop: { display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "var(--space-sm)", width: "100%", minHeight: "320px", padding: "var(--space-md)", borderRadius: "var(--radius-lg, 16px)", background: "var(--color-surface, rgba(0,0,0,.04))" } },
    },
  },
  grid: {
    label: "Grid",
    category: "layout",
    icon: "grid-3x3",
    keywords: "columns css grid cells layout tiles",
    isContainer: true,
    defaultTag: "div",
    allowedTags: ["div", "section", "main", "article", "aside"],
    contentFields: [],
    hint: "CSS Grid with equal columns that wrap on smaller screens",
    defaults: {
      props: {},
      style: {
        desktop: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-md)" },
        tablet: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
        mobile: { gridTemplateColumns: "minmax(0, 1fr)" },
      },
    },
  },
  anchor: {
    label: "Menu anchor",
    category: "layout",
    icon: "anchor",
    keywords: "jump link id hash scroll one page section target",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [],
    hint: "Invisible target that menu links like #services jump to",
    settings: [
      { key: "anchorId", label: "Anchor name", kind: "text", maxLength: 60, default: "section", placeholder: "services", help: "Link to it with #name. Letters, numbers and dashes; other characters are replaced." },
      { key: "offset", label: "Scroll offset", kind: "number", min: 0, max: 400, step: 4, unit: "px", default: 80, help: "Room left above the anchor for a sticky header." },
    ],
    defaults: { props: { anchorId: "section" }, style: {} },
  },
  sidebar: {
    label: "Sidebar",
    category: "layout",
    icon: "panel-left",
    keywords: "aside side column sticky widget area",
    isContainer: true,
    defaultTag: "aside",
    allowedTags: ["aside", "div", "nav"],
    contentFields: [],
    hint: "Side column that can stay in view while the page scrolls",
    settings: [
      { key: "sticky", label: "Stay in view on scroll", kind: "toggle", default: true, help: "Only on screens wider than a phone." },
      { key: "top", label: "Distance from the top", kind: "number", min: 0, max: 300, step: 4, unit: "px", default: 24, when: { key: "sticky", is: [true] } },
    ],
    defaults: {
      props: {},
      style: { desktop: { display: "flex", flexDirection: "column", gap: "var(--space-sm)", width: "100%", maxWidth: "320px", padding: "var(--space-md)", borderRadius: "var(--radius-md)", background: "var(--color-surface, rgba(0,0,0,.03))" }, mobile: { maxWidth: "100%" } },
    },
  },
  linkinbio: {
    label: "Link in bio",
    category: "layout",
    icon: "link",
    keywords: "linktree bio links profile instagram tiktok creator landing",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "section", "main"],
    contentFields: [
      { key: "avatar", label: "Photo", kind: "image" },
      { key: "name", label: "Name", kind: "text", maxLength: 80 },
      { key: "bio", label: "Bio", kind: "multiline", maxLength: 300 },
      {
        key: "items",
        label: "Links",
        kind: "items",
        itemLabel: "Link",
        minItems: 1,
        maxItems: 20,
        itemFields: [
          { key: "link", label: "Link", kind: "link", maxLength: 80 },
          { key: "icon", label: "Icon", kind: "icon" },
          { key: "featured", label: "Highlight", kind: "toggle" },
        ],
      },
    ],
    hint: "Photo, short bio and a stack of big link buttons",
    settings: [
      { key: "look", label: "Buttons", kind: "select", default: "solid", options: opts(["solid", "Solid"], ["outline", "Outline"], ["soft", "Soft"]) },
      { key: "shape", label: "Button shape", kind: "select", default: "pill", options: opts(["pill", "Pill"], ["rounded", "Rounded"], ["square", "Square"]) },
      COLOR("accent", "Button colour", { default: "var(--color-primary)" }),
    ],
    defaults: {
      props: {
        avatar: EMPTY_IMAGE,
        name: "Alex Rivera",
        bio: "Designer and maker. New work every week.",
        items: [
          { link: { label: "Latest project", href: "/work" }, icon: "sparkles", featured: true },
          { link: { label: "Book a call", href: "/contact" }, icon: "calendar" },
          { link: { label: "Shop prints", href: "/shop" }, icon: "shopping-bag" },
          { link: { label: "Newsletter", href: "/newsletter" }, icon: "mail" },
        ],
      },
      style: { desktop: { maxWidth: "420px", width: "100%", margin: "0 auto", padding: "var(--space-md)" } },
    },
  },

  // ── Shapes & vectors ──────────────────────────────────────────────────────
  rectangle: {
    label: "Rectangle",
    category: "shapes",
    icon: "rectangle-horizontal",
    keywords: "shape box square block vector",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [],
    hint: "Solid or outlined rectangle with rounded corners",
    settings: [...SHAPE, { key: "radius", label: "Corner radius", kind: "number", min: 0, max: 200, unit: "px", default: 12 }],
    defaults: { props: {}, style: { desktop: { width: "240px", aspectRatio: "3 / 2" } } },
  },
  ellipse: {
    label: "Ellipse",
    category: "shapes",
    icon: "circle",
    keywords: "circle oval round dot shape vector",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [],
    hint: "Circle or oval; change its shape in the Style tab",
    settings: SHAPE,
    defaults: { props: {}, style: SHAPE_STYLE },
  },
  polygon: {
    label: "Polygon",
    category: "shapes",
    icon: "hexagon",
    keywords: "triangle pentagon hexagon octagon shape vector",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [],
    hint: "Triangle, hexagon or any regular polygon",
    settings: [{ key: "sides", label: "Sides", kind: "number", min: 3, max: 12, default: 6 }, ...SHAPE],
    defaults: { props: { sides: 6 }, style: SHAPE_STYLE },
  },
  star: {
    label: "Star",
    category: "shapes",
    icon: "star",
    keywords: "burst badge sparkle shape vector",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [],
    hint: "Star or starburst with adjustable points",
    settings: [
      { key: "points", label: "Points", kind: "number", min: 3, max: 24, default: 5 },
      { key: "inner", label: "Inner radius", kind: "number", min: 10, max: 95, step: 5, unit: "%", default: 45, help: "Higher values make a rounder burst." },
      ...SHAPE,
    ],
    defaults: { props: { points: 5 }, style: SHAPE_STYLE },
  },
  line: {
    label: "Line & arrow",
    category: "shapes",
    icon: "move-right",
    keywords: "arrow line stroke connector pointer vector",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [],
    hint: "Straight line with optional arrowheads",
    settings: [
      { key: "thickness", label: "Thickness", kind: "number", min: 1, max: 24, unit: "px", default: 2 },
      { key: "lineStyle", label: "Style", kind: "select", default: "solid", options: opts(["solid", "Solid"], ["dashed", "Dashed"], ["dotted", "Dotted"]) },
      { key: "start", label: "Start", kind: "select", default: "none", options: opts(["none", "Plain"], ["arrow", "Arrow"], ["circle", "Dot"]) },
      { key: "end", label: "End", kind: "select", default: "arrow", options: opts(["none", "Plain"], ["arrow", "Arrow"], ["circle", "Dot"]) },
      COLOR("color", "Colour", { help: "Empty uses the text colour." }),
      { key: "rotate", label: "Angle", kind: "number", min: 0, max: 360, step: 5, unit: "°", default: 0 },
    ],
    defaults: { props: {}, style: { desktop: { width: "200px" } } },
  },

  // ── Basic content ─────────────────────────────────────────────────────────
  textpath: {
    label: "Text path",
    category: "basic",
    icon: "spline",
    keywords: "curved text arc circle badge svg",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [{ key: "text", label: "Text", kind: "text", maxLength: 160 }],
    hint: "Text that curves along an arc or circle",
    settings: [
      { key: "path", label: "Path", kind: "select", default: "arc", options: opts(["arc", "Arc"], ["wave", "Wave"], ["circle", "Circle"]) },
      { key: "size", label: "Text size", kind: "number", min: 8, max: 80, default: 26, help: "Relative to the widget's width." },
      { key: "offset", label: "Start position", kind: "number", min: 0, max: 100, step: 1, unit: "%", default: 50 },
      { key: "spin", label: "Rotate slowly", kind: "toggle", default: false, when: { key: "path", is: ["circle"] } },
      COLOR("color", "Colour"),
    ],
    defaults: { props: { text: "Made with care · Since 2020 ·" }, style: { desktop: { width: "320px", fontFamily: "var(--font-display)", letterSpacing: "0.08em", textTransform: "uppercase" } } },
  },
  readmore: {
    label: "Read more",
    category: "basic",
    icon: "unfold-vertical",
    keywords: "expand collapse show more truncate excerpt",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "article"],
    contentFields: [
      { key: "text", label: "Text", kind: "multiline", maxLength: 8000 },
      { key: "moreLabel", label: "Expand label", kind: "text", maxLength: 40 },
      { key: "lessLabel", label: "Collapse label", kind: "text", maxLength: 40 },
    ],
    hint: "Long text that opens with a Read more link",
    settings: [
      { key: "lines", label: "Lines shown", kind: "number", min: 1, max: 20, default: 3 },
      COLOR("linkColor", "Link colour", { default: "var(--color-primary)" }),
    ],
    defaults: {
      props: {
        text: "We started in a small studio with one idea: make things that last. Ten years on, the team has grown, but the idea hasn't changed. Every project starts with listening, then sketching, then building it properly. We work with founders, charities and established brands, and we treat each one the same way: as a long-term partnership rather than a one-off job.",
        moreLabel: "Read more",
        lessLabel: "Show less",
      },
      style: { desktop: { lineHeight: "1.6", maxWidth: "68ch" } },
    },
  },
  detaillist: {
    label: "Detail list",
    category: "basic",
    icon: "list",
    keywords: "specs specifications facts key value description list dl table info",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "aside"],
    contentFields: [
      {
        key: "items",
        label: "Details",
        kind: "items",
        itemLabel: "Detail",
        minItems: 1,
        maxItems: 40,
        itemFields: [
          { key: "label", label: "Label", kind: "text", maxLength: 80 },
          { key: "value", label: "Value", kind: "text", maxLength: 300 },
          { key: "icon", label: "Icon", kind: "icon" },
        ],
      },
    ],
    hint: "Label and value pairs: specs, opening hours, project facts",
    settings: [
      { key: "layout", label: "Layout", kind: "select", default: "rows", options: opts(["rows", "Label beside value"], ["stacked", "Label above value"], ["columns", "Columns"]) },
      { key: "dividers", label: "Dividing lines", kind: "toggle", default: true },
      COLOR("labelColor", "Label colour"),
    ],
    defaults: {
      props: {
        items: [
          { label: "Client", value: "Northwind Studio", icon: "briefcase" },
          { label: "Year", value: "2026", icon: "calendar" },
          { label: "Services", value: "Brand, web, print", icon: "layers" },
          { label: "Location", value: "London", icon: "map-pin" },
        ],
      },
      style: {},
    },
  },
  tags: {
    label: "Tag chips",
    category: "basic",
    icon: "tags",
    keywords: "chips pills badges labels categories keywords topics",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "nav", "aside"],
    contentFields: [
      {
        key: "items",
        label: "Tags",
        kind: "items",
        itemLabel: "Tag",
        minItems: 1,
        maxItems: 40,
        itemFields: [
          { key: "label", label: "Label", kind: "text", maxLength: 40 },
          { key: "link", label: "Link (optional)", kind: "link", maxLength: 40 },
          { key: "icon", label: "Icon", kind: "icon" },
        ],
      },
    ],
    hint: "Row of small labels or category pills",
    settings: [
      { key: "look", label: "Look", kind: "select", default: "soft", options: opts(["soft", "Soft"], ["outline", "Outline"], ["solid", "Solid"]) },
      { key: "size", label: "Size", kind: "select", default: "md", options: opts(["sm", "Small"], ["md", "Medium"], ["lg", "Large"]) },
      { key: "shape", label: "Shape", kind: "select", default: "pill", options: opts(["pill", "Pill"], ["rounded", "Rounded"]) },
      COLOR("accent", "Colour", { default: "var(--color-primary)" }),
    ],
    defaults: { props: { items: [{ label: "Branding" }, { label: "Web design" }, { label: "Strategy" }, { label: "Photography" }] }, style: {} },
  },
  buttongroup: {
    label: "Button group",
    category: "basic",
    icon: "rectangle-ellipsis",
    keywords: "buttons cta actions pair row segmented",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "nav"],
    contentFields: [
      {
        key: "items",
        label: "Buttons",
        kind: "items",
        itemLabel: "Button",
        minItems: 1,
        maxItems: 6,
        itemFields: [
          { key: "link", label: "Button", kind: "link", maxLength: 60 },
          { key: "look", label: "Look", kind: "choice", options: opts(["solid", "Solid"], ["outline", "Outline"], ["ghost", "Ghost"], ["link", "Text link"]) },
          { key: "icon", label: "Icon", kind: "icon" },
        ],
      },
    ],
    hint: "Two or more buttons side by side",
    settings: [
      { key: "align", label: "Align", kind: "select", default: "start", options: opts(["start", "Left"], ["center", "Centre"], ["end", "Right"], ["stretch", "Fill the width"]) },
      { key: "joined", label: "Joined (segmented)", kind: "toggle", default: false },
      { key: "stack", label: "Stack on phones", kind: "toggle", default: true },
      COLOR("accent", "Colour", { default: "var(--color-primary)" }),
    ],
    defaults: {
      props: {
        items: [
          { link: { label: "Get started", href: "/contact" }, look: "solid", icon: "arrow-right" },
          { link: { label: "See our work", href: "/work" }, look: "outline" },
        ],
      },
      style: { desktop: { gap: "var(--space-sm, .75rem)" } },
    },
  },

  // ── Media & embeds ────────────────────────────────────────────────────────
  soundcloud: {
    label: "SoundCloud",
    category: "media",
    icon: "audio-lines",
    keywords: "music podcast audio track playlist player embed",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div"],
    contentFields: [{ key: "url", label: "SoundCloud address", kind: "text", maxLength: 500 }],
    hint: "Track or playlist player from soundcloud.com",
    settings: [
      { key: "visual", label: "Large artwork", kind: "toggle", default: false },
      { key: "height", label: "Height", kind: "number", min: 120, max: 600, step: 10, unit: "px", default: 166, help: "166 fits a single track; playlists need about 450." },
      { key: "color", label: "Play button colour", kind: "text", maxLength: 7, default: "#ff5500", placeholder: "#ff5500", help: "A hex colour." },
      { key: "autoplay", label: "Autoplay", kind: "toggle", default: false },
      { key: "comments", label: "Show comments", kind: "toggle", default: true },
    ],
    defaults: { props: { url: "https://soundcloud.com/forss/flickermood" }, style: { desktop: { width: "100%" } } },
  },
  herocarousel: {
    label: "Hero carousel",
    category: "media",
    icon: "gallery-horizontal-end",
    keywords: "hero slider slideshow full screen banner rotating header",
    isContainer: false,
    defaultTag: "section",
    allowedTags: ["section", "header", "div"],
    contentFields: [
      {
        key: "items",
        label: "Slides",
        kind: "items",
        itemLabel: "Slide",
        minItems: 1,
        maxItems: 10,
        itemFields: [
          { key: "image", label: "Background image", kind: "image" },
          { key: "eyebrow", label: "Small heading", kind: "text", maxLength: 60 },
          { key: "title", label: "Headline", kind: "text", maxLength: 160 },
          { key: "text", label: "Text", kind: "multiline", maxLength: 400 },
          { key: "link", label: "Button", kind: "link", maxLength: 60 },
          { key: "link2", label: "Second button", kind: "link", maxLength: 60 },
        ],
      },
    ],
    hint: "Full-width hero slides with headline and buttons",
    settings: [
      { key: "height", label: "Height", kind: "number", min: 40, max: 100, step: 5, unit: "% of the screen", default: 80 },
      { key: "align", label: "Text", kind: "select", default: "left", options: opts(["left", "Left"], ["center", "Centre"]) },
      COLOR("overlay", "Overlay colour", { default: "rgba(0,0,0,.45)" }),
      { key: "headingTag", label: "Headline tag", kind: "select", default: "h2", options: HEADING_TAGS, help: "Use H1 when this is the page's main heading." },
      { key: "arrows", label: "Arrows", kind: "toggle", default: true },
      { key: "dots", label: "Pagination dots", kind: "toggle", default: true },
      { key: "autoplay", label: "Autoplay", kind: "toggle", default: true, help: "Pauses while hovered or focused, and for visitors who prefer reduced motion." },
      { key: "interval", label: "Seconds per slide", kind: "number", min: 2, max: 20, default: 6, when: { key: "autoplay", is: [true] } },
      { key: "loop", label: "Loop back to the start", kind: "toggle", default: true },
    ],
    defaults: {
      props: {
        items: [
          { image: EMPTY_IMAGE, eyebrow: "New season", title: "Spaces that feel like home", text: "Interior design for people who care about the details.", link: { label: "Start a project", href: "/contact" }, link2: { label: "View work", href: "/work" } },
          { image: EMPTY_IMAGE, eyebrow: "Studio", title: "Designed in-house, built to last", text: "Every piece considered, every finish tested.", link: { label: "Meet the team", href: "/about" }, link2: { label: "", href: "" } },
        ],
      },
      style: { desktop: { color: "#fff", background: "var(--color-deep, #18181b)" } },
    },
  },
  herobanner: {
    label: "Hero banner",
    category: "media",
    icon: "panel-top",
    keywords: "hero header banner masthead landing above the fold",
    isContainer: false,
    defaultTag: "section",
    allowedTags: ["section", "header", "div"],
    contentFields: [
      { key: "image", label: "Background image", kind: "image" },
      { key: "eyebrow", label: "Small heading", kind: "text", maxLength: 60 },
      { key: "title", label: "Headline", kind: "text", maxLength: 160 },
      { key: "text", label: "Text", kind: "multiline", maxLength: 600 },
      { key: "link", label: "Button", kind: "link", maxLength: 60, optionalLink: true },
      { key: "link2", label: "Second button", kind: "link", maxLength: 60, optionalLink: true },
    ],
    hint: "Big headline over a background image with buttons",
    settings: [
      { key: "height", label: "Height", kind: "number", min: 30, max: 100, step: 5, unit: "% of the screen", default: 70 },
      { key: "align", label: "Horizontal position", kind: "select", default: "center", options: opts(["left", "Left"], ["center", "Centre"], ["right", "Right"]) },
      { key: "valign", label: "Vertical position", kind: "select", default: "center", options: opts(["top", "Top"], ["center", "Middle"], ["bottom", "Bottom"]) },
      COLOR("overlay", "Overlay colour", { default: "rgba(0,0,0,.4)" }),
      { key: "headingTag", label: "Headline tag", kind: "select", default: "h1", options: HEADING_TAGS },
    ],
    defaults: {
      props: {
        image: EMPTY_IMAGE,
        eyebrow: "Award-winning studio",
        title: "Websites that win you work",
        text: "Strategy, design and build under one roof, so your launch is calm and on time.",
        link: { label: "Book a call", href: "/contact" },
        link2: { label: "Our process", href: "/process" },
      },
      style: { desktop: { color: "#fff", background: "var(--color-deep, #18181b)", padding: "var(--space-xl, 5rem) 2rem" }, mobile: { padding: "4rem 1.25rem" } },
    },
  },
  imagebanner: {
    label: "Image banner",
    category: "media",
    icon: "images",
    keywords: "banner promo image caption overlay link wide",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "figure", "aside"],
    contentFields: [
      { key: "image", label: "Image", kind: "image" },
      { key: "title", label: "Title", kind: "text", maxLength: 120 },
      { key: "text", label: "Text", kind: "text", maxLength: 240 },
      { key: "link", label: "Link", kind: "link", maxLength: 60, optionalLink: true },
    ],
    hint: "Wide image with a caption or promo link on top",
    settings: [
      { key: "aspect", label: "Shape", kind: "select", default: "3 / 1", options: ASPECTS },
      { key: "position", label: "Text position", kind: "select", default: "bottom-left", options: opts(["bottom-left", "Bottom left"], ["bottom", "Bottom centre"], ["center", "Centre"], ["top-left", "Top left"], ["none", "No text"]) },
      COLOR("overlay", "Overlay colour", { default: "rgba(0,0,0,.35)" }),
      { key: "zoom", label: "Zoom on hover", kind: "toggle", default: true },
    ],
    defaults: {
      props: { image: EMPTY_IMAGE, title: "The summer edit", text: "Light layers for long days.", link: { label: "Shop the edit", href: "/shop" } },
      style: { desktop: { borderRadius: "var(--radius-lg, 16px)", color: "#fff" } },
    },
  },

  // ── Composite cards ───────────────────────────────────────────────────────
  projectgrid: {
    label: "Project grid",
    category: "cards",
    icon: "layout-dashboard",
    keywords: "portfolio work case studies filter gallery showcase",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "section"],
    contentFields: [
      {
        key: "items",
        label: "Projects",
        kind: "items",
        itemLabel: "Project",
        minItems: 1,
        maxItems: 48,
        itemFields: [
          { key: "image", label: "Image", kind: "image" },
          { key: "title", label: "Title", kind: "text", maxLength: 120 },
          { key: "category", label: "Category", kind: "text", maxLength: 40 },
          { key: "link", label: "Link", kind: "link", maxLength: 60 },
        ],
      },
    ],
    hint: "Portfolio cards with category filters",
    settings: [
      { key: "columns", label: "Columns", kind: "number", min: 1, max: 4, default: 3, help: "Two on tablets, one on phones." },
      { key: "aspect", label: "Image shape", kind: "select", default: "4 / 3", options: ASPECTS },
      { key: "caption", label: "Titles", kind: "select", default: "below", options: opts(["below", "Below the image"], ["hover", "Over the image on hover"]) },
      { key: "filter", label: "Category filter", kind: "toggle", default: true, help: "Buttons for up to 8 categories. Works without JavaScript." },
      { key: "allLabel", label: "\"All\" button", kind: "text", maxLength: 30, default: "All", when: { key: "filter", is: [true] } },
    ],
    defaults: {
      props: {
        items: [
          { image: EMPTY_IMAGE, title: "Harbour House", category: "Branding", link: { label: "View project", href: "/work/harbour-house" } },
          { image: EMPTY_IMAGE, title: "Field Notes", category: "Web", link: { label: "View project", href: "/work/field-notes" } },
          { image: EMPTY_IMAGE, title: "Oak & Iron", category: "Branding", link: { label: "View project", href: "/work/oak-and-iron" } },
          { image: EMPTY_IMAGE, title: "Northwind", category: "Web", link: { label: "View project", href: "/work/northwind" } },
          { image: EMPTY_IMAGE, title: "Salt Market", category: "Print", link: { label: "View project", href: "/work/salt-market" } },
          { image: EMPTY_IMAGE, title: "Bright Lane", category: "Web", link: { label: "View project", href: "/work/bright-lane" } },
        ],
      },
      style: { desktop: { gap: "var(--space-md)" } },
    },
  },
  imagebox: {
    label: "Image box",
    category: "cards",
    icon: "book-image",
    keywords: "card feature service image title text",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "article"],
    contentFields: [
      { key: "image", label: "Image", kind: "image" },
      { key: "title", label: "Title", kind: "text", maxLength: 120 },
      { key: "text", label: "Text", kind: "multiline", maxLength: 600 },
      { key: "link", label: "Link", kind: "link", maxLength: 60, optionalLink: true },
    ],
    hint: "Image with a title, text and link",
    settings: [
      { key: "layout", label: "Image position", kind: "select", default: "top", options: opts(["top", "Above the text"], ["left", "Beside the text"], ["overlay", "Behind the text"]) },
      { key: "aspect", label: "Image shape", kind: "select", default: "4 / 3", options: ASPECTS },
      { key: "titleTag", label: "Title tag", kind: "select", default: "h3", options: HEADING_TAGS },
      { key: "zoom", label: "Zoom image on hover", kind: "toggle", default: true },
      HOVER,
    ],
    defaults: {
      props: { image: EMPTY_IMAGE, title: "Considered design", text: "A short description of this service, product or idea.", link: { label: "Learn more", href: "/services" } },
      style: { desktop: { maxWidth: "380px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border, rgba(0,0,0,.1))", background: "var(--color-background, #fff)" }, mobile: { maxWidth: "100%" } },
    },
  },
  iconlist: {
    label: "Icon list",
    category: "cards",
    icon: "list-checks",
    keywords: "checklist bullet list features benefits ticks",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "nav", "aside"],
    contentFields: [
      {
        key: "items",
        label: "Items",
        kind: "items",
        itemLabel: "Item",
        minItems: 1,
        maxItems: 40,
        itemFields: [
          { key: "icon", label: "Icon", kind: "icon" },
          { key: "text", label: "Text", kind: "text", maxLength: 200 },
          { key: "link", label: "Link (optional)", kind: "link", maxLength: 60 },
        ],
      },
    ],
    hint: "List with an icon before each item",
    settings: [
      { key: "layout", label: "Layout", kind: "select", default: "list", options: opts(["list", "One per line"], ["inline", "In a row"]) },
      { key: "iconSize", label: "Icon size", kind: "number", min: 12, max: 64, unit: "px", default: 20 },
      COLOR("iconColor", "Icon colour", { default: "var(--color-primary)" }),
      { key: "dividers", label: "Dividing lines", kind: "toggle", default: false, when: { key: "layout", is: ["list"] } },
    ],
    defaults: {
      props: {
        items: [
          { icon: "check", text: "Free consultation" },
          { icon: "check", text: "Fixed-price proposals" },
          { icon: "check", text: "Launch support included" },
        ],
      },
      style: {},
    },
  },
  profilecard: {
    label: "Profile card",
    category: "cards",
    icon: "contact",
    keywords: "team member person bio author staff about",
    isContainer: false,
    defaultTag: "article",
    allowedTags: ["article", "div", "figure"],
    contentFields: [
      { key: "photo", label: "Photo", kind: "image" },
      { key: "name", label: "Name", kind: "text", maxLength: 80 },
      { key: "role", label: "Role", kind: "text", maxLength: 120 },
      { key: "bio", label: "Bio", kind: "multiline", maxLength: 600 },
      {
        key: "items",
        label: "Profiles",
        kind: "items",
        itemLabel: "Profile",
        maxItems: 8,
        itemFields: [
          { key: "network", label: "Network", kind: "choice", options: SOCIAL_NETWORKS },
          { key: "link", label: "Address", kind: "link" },
        ],
      },
    ],
    hint: "Team member with photo, role, bio and social links",
    settings: [
      { key: "layout", label: "Layout", kind: "select", default: "vertical", options: opts(["vertical", "Photo on top"], ["horizontal", "Photo beside"]) },
      { key: "photoShape", label: "Photo shape", kind: "select", default: "circle", options: opts(["circle", "Circle"], ["rounded", "Rounded"], ["square", "Square"]) },
      { key: "photoSize", label: "Photo size", kind: "number", min: 48, max: 320, step: 8, unit: "px", default: 120 },
    ],
    defaults: {
      props: {
        photo: EMPTY_IMAGE,
        name: "Sam Taylor",
        role: "Creative director",
        bio: "Fifteen years of brand and product design for companies large and small.",
        items: [
          { network: "linkedin", link: { label: "", href: "https://linkedin.com/" } },
          { network: "x", link: { label: "", href: "https://x.com/" } },
        ],
      },
      style: { desktop: { padding: "var(--space-md, 2rem)", borderRadius: "var(--radius-md)", background: "var(--color-surface, rgba(0,0,0,.03))", textAlign: "center" } },
    },
  },

  // ── Interactive & UI ──────────────────────────────────────────────────────
  alert: {
    label: "Alert",
    category: "interactive",
    icon: "circle-alert",
    keywords: "notice callout message banner warning info success error tip",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "aside"],
    contentFields: [
      { key: "title", label: "Title", kind: "text", maxLength: 120 },
      { key: "text", label: "Message", kind: "multiline", maxLength: 600 },
      { key: "link", label: "Link", kind: "link", maxLength: 60, optionalLink: true },
    ],
    hint: "Info, success, warning or error message box",
    settings: [
      { key: "tone", label: "Type", kind: "select", default: "info", options: opts(["info", "Info"], ["success", "Success"], ["warning", "Warning"], ["error", "Error"], ["neutral", "Neutral"]) },
      { key: "look", label: "Look", kind: "select", default: "soft", options: opts(["soft", "Soft"], ["outline", "Outline"], ["solid", "Solid"], ["bar", "Side bar"]) },
      { key: "showIcon", label: "Show icon", kind: "toggle", default: true },
      { key: "dismissible", label: "Can be closed", kind: "toggle", default: false, help: "Adds a close button. Works without JavaScript." },
    ],
    defaults: {
      props: { title: "Heads up", text: "Our studio is closed on public holidays. Orders placed then ship the next working day.", link: { label: "", href: "" } },
      style: {},
    },
  },

  // ── Custom code ───────────────────────────────────────────────────────────
  shortcode: {
    label: "Shortcode",
    category: "code",
    icon: "brackets",
    keywords: "shortcode dynamic year date site name token placeholder",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "p", "span"],
    contentFields: [],
    hint: "Text with [year], [site_name], [button] and other shortcodes",
    settings: [
      {
        key: "code",
        label: "Shortcode",
        kind: "code",
        maxLength: 2000,
        default: "© [year] [site_name]. All rights reserved.",
        placeholder: "[button label=\"Book now\" url=\"/contact\"]",
        help: "Supported: [year] [date] [site_name] [site_tagline] [site_url] [page_title] [page_url] [icon name=\"star\"] [button label=\"…\" url=\"…\"] [link label=\"…\" url=\"…\"]. Unknown shortcodes are left out on the live site.",
      },
    ],
    defaults: { props: {}, style: {} },
  },
  codesnippet: {
    label: "Code snippet",
    category: "code",
    icon: "square-code",
    keywords: "code block pre syntax snippet developer copy terminal",
    isContainer: false,
    defaultTag: "div",
    allowedTags: ["div", "figure"],
    contentFields: [{ key: "code", label: "Code", kind: "multiline", maxLength: 20000 }],
    hint: "Formatted code block with a copy button",
    settings: [
      { key: "language", label: "Language", kind: "select", default: "javascript", options: opts(["plaintext", "Plain text"], ["html", "HTML"], ["css", "CSS"], ["javascript", "JavaScript"], ["typescript", "TypeScript"], ["json", "JSON"], ["bash", "Shell"], ["python", "Python"], ["php", "PHP"], ["sql", "SQL"], ["yaml", "YAML"], ["markdown", "Markdown"]) },
      { key: "filename", label: "File name", kind: "text", maxLength: 80, default: "", placeholder: "app.js" },
      { key: "theme", label: "Theme", kind: "select", default: "dark", options: opts(["dark", "Dark"], ["light", "Light"]) },
      { key: "lineNumbers", label: "Line numbers", kind: "toggle", default: true },
      { key: "wrap", label: "Wrap long lines", kind: "toggle", default: false },
      { key: "copy", label: "Copy button", kind: "toggle", default: true },
    ],
    defaults: {
      props: { code: "const greet = (name) => {\n  return `Hello, ${name}!`;\n};\n\nconsole.log(greet(\"world\"));" },
      style: { desktop: { borderRadius: "var(--radius-md, 8px)" } },
    },
  },
};
