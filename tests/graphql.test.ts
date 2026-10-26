import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSchema, GraphQLList, GraphQLNonNull, GraphQLObjectType, GraphQLUnionType, parse, validate } from "graphql";
import type { FieldDef } from "../src/lib/cms/fields";
import { analyzeQuery, LimitError, MAX_COST } from "../src/lib/graphql/limits";
import { customFieldsSdl, siteSdl } from "../src/lib/graphql/sdl";

const lists = new Set(["posts", "nodes", "terms", "children", "gallery", "variants"]);
const analyze = (q: string, variables?: Record<string, unknown>) => analyzeQuery(parse(q), { variables, isList: (f) => f !== "nodes" && lists.has(f) });
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof LimitError ? e.code : "other";
  }
  return null;
};

describe("query depth", () => {
  it("counts nesting from the root field", () => {
    assert.equal(analyze("{ site { name } }").depth, 2);
    assert.equal(analyze('{ posts(type:"x") { nodes { customFields { dimensions { label } } } } }').depth, 5);
  });

  it("refuses a sixth level, including through fragments", () => {
    assert.equal(code(() => analyze("{ post { parent { parent { parent { parent { title } } } } } }")), "DEPTH_LIMIT");
    assert.equal(code(() => analyze("query { post { ...P } } fragment P on Post { parent { parent { parent { parent { title } } } } }")), "DEPTH_LIMIT");
    assert.equal(code(() => analyze("{ post { ... on Post { parent { parent { parent { parent { id } } } } } } }")), "DEPTH_LIMIT");
  });

  it("ignores introspection, so GraphiQL can load the schema", () => {
    assert.doesNotThrow(() => analyze("{ __schema { types { fields { type { ofType { ofType { ofType { name } } } } } } } }"));
  });

  it("rejects recursive and unknown fragments", () => {
    assert.equal(code(() => analyze("{ post { ...A } } fragment A on Post { parent { ...A } }")), "BAD_QUERY");
    assert.equal(code(() => analyze("{ post { ...Nope } }")), "BAD_QUERY");
  });

  it("needs an operation name when a document has several", () => {
    assert.equal(code(() => analyze("query A { site { name } } query B { site { name } }")), "BAD_QUERY");
    assert.equal(analyzeQuery(parse("query A { site { name } } query B { site { id name } }"), { operationName: "B", isList: () => false }).cost, 3);
  });
});

describe("query cost", () => {
  it("multiplies list fields by first, with a default for lists without it", () => {
    assert.equal(analyze('{ posts(type:"x", first: 5) { nodes { title } } }').cost, 1 + 5 * (1 + 1));
    assert.equal(analyze('{ posts(type:"x") { nodes { terms { name } } } }').cost, 1 + 20 * (1 + (1 + 10 * 1)));
    assert.equal(analyze('query ($n: Int) { posts(type:"x", first: $n) { nodes { title } } }', { n: 2 }).cost, 5);
  });

  it("caps page size and total cost", () => {
    assert.equal(code(() => analyze('{ posts(type:"x", first: 101) { nodes { title } } }')), "COST_LIMIT");
    const heavy = 'p: posts(type:"x", first: 100) { nodes { terms { children { name } } } }';
    const q = `{ ${[1, 2, 3].map((i) => heavy.replace("p:", `p${i}:`)).join(" ")} }`;
    assert.equal(code(() => analyze(q)), "COST_LIMIT");
    assert.ok(analyze(`{ ${heavy} }`).cost < MAX_COST);
  });
});

const field = (key: string, type: FieldDef["type"], config: FieldDef["config"] = {}): FieldDef => ({ key, label: key, type, config });

describe("site schema", () => {
  const defs: FieldDef[] = [
    field("price", "PRICE"),
    field("rating", "NUMBER"),
    field("featured", "BOOLEAN"),
    field("hero", "IMAGE"),
    field("gallery", "GALLERY"),
    field("related", "RELATION", { multiple: true }),
    field("owner", "RELATION"),
    field("colours", "CHECKBOX"),
    field("size", "SELECT"),
    field("topics", "TAXONOMY"),
    field("dimensions", "REPEATER", { subFields: [field("label", "TEXT"), field("photo", "IMAGE")] }),
    field("sections", "FLEXIBLE", { layouts: [{ key: "quote", label: "Quote", subFields: [field("text", "TEXTAREA")] }, { key: "pics", label: "Pictures", subFields: [field("images", "GALLERY")] }] }),
    field("bad-key", "TEXT"),
  ];
  const { sdl, types } = siteSdl(defs);
  const schema = buildSchema(sdl);
  const cf = schema.getType("CustomFields") as GraphQLObjectType;
  const typeOf = (name: string) => String(cf.getFields()[name]?.type);

  it("builds a valid schema with strongly typed custom fields", () => {
    assert.equal(typeOf("price"), "Price");
    assert.equal(typeOf("rating"), "Float");
    assert.equal(typeOf("featured"), "Boolean");
    assert.equal(typeOf("hero"), "MediaAsset");
    assert.equal(typeOf("gallery"), "[MediaAsset!]");
    assert.equal(typeOf("related"), "[Post!]");
    assert.equal(typeOf("owner"), "Post");
    assert.equal(typeOf("colours"), "[String!]");
    assert.equal(typeOf("size"), "String");
    assert.equal(typeOf("topics"), "[Term!]");
    assert.equal(typeOf("_raw"), "JSON!");
    assert.equal(cf.getFields()["bad-key"], undefined);
  });

  it("gives repeaters a row type and flexible content a union of layouts", () => {
    const rows = cf.getFields().dimensions.type as GraphQLList<GraphQLNonNull<GraphQLObjectType>>;
    const row = rows.ofType.ofType;
    assert.equal(row.name, "CF_dimensions_Row");
    assert.equal(String(row.getFields().photo.type), "MediaAsset");
    const union = (cf.getFields().sections.type as GraphQLList<GraphQLNonNull<GraphQLUnionType>>).ofType.ofType;
    assert.deepEqual(union.getTypes().map((t) => t.name), ["CF_sections__quote", "CF_sections__pics"]);
    assert.deepEqual(types.unions[types.unionOf["CustomFields.sections"]], { quote: "CF_sections__quote", pics: "CF_sections__pics" });
    assert.ok(types.objects.CF_sections__pics.images);
  });

  it("validates real queries against the schema", () => {
    const q = parse('{ posts(type: "product", where: { terms: [{ taxonomy: "cat", slug: "a" }], status: [DRAFT] }) { nodes { title customFields { price { formatted } sections { ... on CF_sections__quote { _layout text } } } } } }');
    assert.deepEqual(validate(schema, q), []);
    assert.equal(validate(schema, parse("{ posts { nodes { secret } } }")).length > 0, true);
  });

  it("still builds for a site without custom fields", () => {
    const empty = customFieldsSdl([]);
    assert.doesNotThrow(() => buildSchema(siteSdl([]).sdl));
    assert.match(empty.sdl, /_raw: JSON!/);
  });
});
