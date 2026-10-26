import type { FieldDef } from "@/lib/cms/fields";

/**
 * The GraphQL schema of one site, as SDL. The fixed part describes the
 * content model every site shares (site, post types, entries, taxonomies,
 * media); `customFieldsSdl` adds a strongly typed `CustomFields` object built
 * from the site's own field definitions, so a product's `price` is a `Price`,
 * its `gallery` a list of `MediaAsset`s and its repeater rows real objects.
 *
 * Pure, so it's unit-tested without a server.
 */

export const BASE_SDL = /* GraphQL */ `
"""Arbitrary JSON (builder documents, raw field values)."""
scalar JSON
"""ISO-8601 date and time."""
scalar DateTime

enum PostStatus { DRAFT PENDING_REVIEW SCHEDULED PUBLISHED ARCHIVED }
enum PostOrder { DATE_DESC DATE_ASC TITLE_ASC TITLE_DESC MENU_ORDER MODIFIED_DESC }

type Query {
  site: Site!
  postTypes: [PostType!]!
  postType(key: String!): PostType
  """One entry by id, or by post type and slug. preview: true reads the working copy (needs a read-write key or a signed-in editor)."""
  post(id: ID, type: String, slug: String, preview: Boolean = false, """A language code such as fr-FR: the entry in that language (with an id, its translation)."""
  locale: String): Post
  """A page by slug ("home" is the home page) or id."""
  page(slug: String, id: ID, preview: Boolean = false, locale: String): Post
  """Entries of one post type. Without status, only live (published) entries; drafts need private access. Without locale, the default language."""
  posts(type: String!, first: Int = 20, after: String, where: PostWhere, orderBy: PostOrder = DATE_DESC, locale: String): PostConnection!
  """Top-level pages (parent: null) or the children of one page."""
  pages(parent: ID, first: Int = 20, after: String, orderBy: PostOrder = MENU_ORDER, locale: String): PostConnection!
  """The site's languages, default first. Empty for a single-language site."""
  locales: [Locale!]!
  taxonomies: [Taxonomy!]!
  taxonomy(key: String!): Taxonomy
  term(taxonomy: String!, slug: String!): Term
  mediaAsset(id: ID!): MediaAsset
  """Browse the media library (needs a read-write key or a signed-in editor: it includes files for unpublished work)."""
  mediaAssets(first: Int = 20, after: String, mimeType: String, search: String): MediaConnection!
}

type Mutation {
  """Creates a draft entry. Needs a read-write key."""
  createEntry(type: String!, title: String!): Post!
  """Saves a new draft version of an entry (never publishes). Needs a read-write key."""
  updateEntry(id: ID!, input: EntryUpdateInput!): Post!
}

input EntryUpdateInput {
  title: String
  slug: String
  excerpt: String
  """HTML body for entries that don't use the visual builder."""
  content: String
  featuredImageId: ID
  termIds: [ID!]
  """Custom field values by key; keys you leave out keep their value."""
  customFields: JSON
  """Submit for review instead of saving a draft."""
  submitForReview: Boolean
}

input PostWhere {
  """Entries that have every listed term."""
  terms: [TermRef!]
  """Shortcut for terms: [{ taxonomy: "category", slug }]."""
  category: String
  """Shortcut for terms: [{ taxonomy: "tag", slug }]."""
  tag: String
  """Statuses other than PUBLISHED need private access and read working copies."""
  status: [PostStatus!]
  search: String
  parent: ID
}

input TermRef { taxonomy: String!, slug: String! }

type Site {
  id: ID!
  name: String!
  tagline: String
  subdomain: String!
  customDomain: String
  url: String!
  logo: MediaAsset
  seo: SiteSeo!
}

type Locale {
  """BCP 47 tag, such as fr-FR."""
  code: String!
  label: String!
  """URL prefix (/fr); the default language has clean URLs."""
  prefix: String!
  isDefault: Boolean!
  currency: String!
  """The language's own domain, if it has one."""
  domain: String
  """Home page URL in this language."""
  url: String!
}

"""One language version of an entry, for <link rel="alternate" hreflang>."""
type Hreflang {
  """BCP 47 tag, or x-default for the default-language version."""
  hreflang: String!
  locale: String
  url: String!
}

type SiteSeo {
  titleTemplate: String
  homeTitle: String
  defaultDescription: String
  defaultImage: MediaAsset
  twitterHandle: String
}

type PostType {
  key: String!
  labelSingular: String!
  labelPlural: String!
  description: String
  hierarchical: Boolean!
  hasArchive: Boolean!
  routePrefix: String
  usesBuilder: Boolean!
  taxonomies: [Taxonomy!]!
  fields: [FieldDefinition!]!
}

type FieldDefinition {
  key: String!
  label: String!
  type: String!
  required: Boolean!
  multiple: Boolean!
  instructions: String
}

type Post {
  id: ID!
  type: PostType!
  title: String!
  slug: String!
  """Path on the site, such as /shop/oak-table."""
  uri: String!
  url: String!
  status: PostStatus!
  """True when this is the working copy rather than the live version."""
  isPreview: Boolean!
  excerpt: String
  """HTML body (entries without the visual builder)."""
  content: String
  """Visual builder document (pages and builder entries)."""
  document: JSON
  date: DateTime
  modified: DateTime!
  menuOrder: Int!
  author: Author
  featuredImage: MediaAsset
  terms(taxonomy: String): [Term!]!
  """Language code (null on a single-language site)."""
  locale: String
  """The same entry in the site's other languages (live versions, or working copies in a preview)."""
  translations: [Post!]!
  """Live language versions of this entry with absolute URLs, x-default included. Empty without translations."""
  hreflangs: [Hreflang!]!
  customFields: CustomFields!
  seo: PostSeo!
  parent: Post
  children: [Post!]!
}

type PostSeo {
  title: String
  description: String
  canonicalUrl: String
  noIndex: Boolean!
  image: MediaAsset
}

type Author { id: ID!, name: String }

type Price { amount: Float!, currency: String!, formatted: String! }

type Taxonomy {
  key: String!
  label: String!
  hierarchical: Boolean!
  terms: [Term!]!
  postTypes: [PostType!]!
}

type Term {
  id: ID!
  name: String!
  slug: String!
  taxonomy: Taxonomy!
  parent: Term
  children: [Term!]!
}

type MediaAsset {
  id: ID!
  url: String!
  mimeType: String!
  altText: String
  title: String
  caption: String
  width: Int
  height: Int
  sizeBytes: Int!
  srcSet: String
  variants: [MediaVariant!]!
  blurDataUrl: String
}

type MediaVariant { width: Int!, url: String! }

type PageInfo { hasNextPage: Boolean!, endCursor: String }
type PostConnection { nodes: [Post!]!, totalCount: Int!, pageInfo: PageInfo! }
type MediaConnection { nodes: [MediaAsset!]!, totalCount: Int!, pageInfo: PageInfo! }
`;

/** How a generated object type's fields map back to field definitions, for the resolvers. */
export interface CustomFieldTypes {
  /** GraphQL object type → its fields (by GraphQL field name). */
  objects: Record<string, Record<string, FieldDef>>;
  /** Flexible content union → layout key → member type. */
  unions: Record<string, Record<string, string>>;
  /** "<ObjectType>.<fieldKey>" → the union its flexible field returns. */
  unionOf: Record<string, string>;
}

const GRAPHQL_NAME = /^[_A-Za-z][_0-9A-Za-z]*$/;
const RESERVED = new Set(["_raw"]);

function scalarFor(def: FieldDef): string {
  switch (def.type) {
    case "NUMBER":
      return "Float";
    case "BOOLEAN":
      return "Boolean";
    case "PRICE":
      return "Price";
    case "IMAGE":
    case "FILE":
      return "MediaAsset";
    case "GALLERY":
      return "[MediaAsset!]";
    case "RELATION":
      return def.config.multiple ? "[Post!]" : "Post";
    case "USER":
      return "Author";
    case "TAXONOMY":
      return "[Term!]";
    case "CHECKBOX":
      return "[String!]";
    case "SELECT":
      return def.config.multiple ? "[String!]" : "String";
    default:
      return "String";
  }
}

const describe = (def: FieldDef) => JSON.stringify(`${def.label}${def.instructions ? `. ${def.instructions}` : ""}`);

/** SDL for `CustomFields` and the row / block types its repeaters and flexible fields need. */
export function customFieldsSdl(defs: FieldDef[]): { sdl: string; types: CustomFieldTypes } {
  const types: CustomFieldTypes = { objects: {}, unions: {}, unionOf: {} };
  const blocks: string[] = [];
  const taken = new Set<string>();
  const typeName = (base: string) => {
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base}${i}`;
    taken.add(name);
    return name;
  };

  const objectType = (name: string, fields: FieldDef[], path: string[], extra: string[] = []) => {
    const lines = [...extra];
    const map: Record<string, FieldDef> = {};
    for (const def of fields) {
      if (!GRAPHQL_NAME.test(def.key) || RESERVED.has(def.key) || map[def.key]) continue;
      map[def.key] = def;
      let gqlType: string;
      if (def.type === "REPEATER" && def.config.subFields?.length) {
        const row = typeName(`CF_${[...path, def.key].join("__")}_Row`);
        objectType(row, def.config.subFields, [...path, def.key]);
        gqlType = `[${row}!]`;
      } else if (def.type === "FLEXIBLE" && def.config.layouts?.length) {
        const union = typeName(`CF_${[...path, def.key].join("__")}_Block`);
        const members: Record<string, string> = {};
        for (const layout of def.config.layouts) {
          const member = typeName(`CF_${[...path, def.key, layout.key].join("__")}`);
          objectType(member, layout.subFields, [...path, def.key, layout.key], ['  "Layout key of this block."\n  _layout: String!']);
          members[layout.key] = member;
        }
        types.unions[union] = members;
        types.unionOf[`${name}.${def.key}`] = union;
        blocks.push(`union ${union} = ${Object.values(members).join(" | ")}`);
        gqlType = `[${union}!]`;
      } else if (def.type === "REPEATER" || def.type === "FLEXIBLE") {
        gqlType = "JSON";
      } else {
        gqlType = scalarFor(def);
      }
      lines.push(`  ${describe(def)}\n  ${def.key}: ${gqlType}`);
    }
    if (!lines.length) lines.push("  _empty: Boolean");
    types.objects[name] = map;
    blocks.push(`type ${name} {\n${lines.join("\n")}\n}`);
  };

  taken.add("CustomFields");
  objectType("CustomFields", defs, [], ['  "Every value as stored, by field key."\n  _raw: JSON!']);
  return { sdl: blocks.reverse().join("\n\n"), types };
}

/** The full schema SDL for a site. */
export function siteSdl(defs: FieldDef[]) {
  const custom = customFieldsSdl(defs);
  return { sdl: `${BASE_SDL}\n${custom.sdl}\n`, types: custom.types };
}
