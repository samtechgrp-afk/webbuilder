import { Kind, type DocumentNode, type FieldNode, type FragmentDefinitionNode, type OperationDefinitionNode, type SelectionSetNode, type ValueNode } from "graphql";

/**
 * Static checks that run before a GraphQL operation executes, so a hostile
 * query is refused without touching the database:
 *  - depth: nesting of fields (fragments expanded; introspection ignored so
 *    GraphiQL can load the schema),
 *  - cost: every field costs 1, and a list field multiplies the cost of what
 *    it selects by the number of items it can return (`first`, else a default).
 *
 * Pure, so it's unit-tested without a server.
 */

export const MAX_DEPTH = 5;
export const MAX_COST = 25_000;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
/** Lists without a `first` argument (terms, gallery, children) are assumed this long. */
export const DEFAULT_LIST_SIZE = 10;

export interface QueryLimits {
  depth: number;
  cost: number;
}

export class LimitError extends Error {
  constructor(
    message: string,
    public code: "DEPTH_LIMIT" | "COST_LIMIT" | "BAD_QUERY",
  ) {
    super(message);
  }
}

function intArg(field: FieldNode, name: string, variables: Record<string, unknown>): number | null {
  const arg = field.arguments?.find((a) => a.name.value === name);
  if (!arg) return null;
  const v: ValueNode = arg.value;
  if (v.kind === Kind.INT) return Number(v.value);
  if (v.kind === Kind.VARIABLE) {
    const raw = variables[v.name.value];
    return typeof raw === "number" ? raw : null;
  }
  return null;
}

export function analyzeQuery(
  doc: DocumentNode,
  opts: { operationName?: string | null; variables?: Record<string, unknown>; isList: (field: string) => boolean },
): QueryLimits {
  const variables = opts.variables ?? {};
  const fragments = new Map<string, FragmentDefinitionNode>();
  const operations: OperationDefinitionNode[] = [];
  for (const def of doc.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
    else if (def.kind === Kind.OPERATION_DEFINITION) operations.push(def);
  }
  const op = opts.operationName ? operations.find((o) => o.name?.value === opts.operationName) : operations.length === 1 ? operations[0] : null;
  if (!op) throw new LimitError(opts.operationName ? `Unknown operation ${opts.operationName}` : "Send exactly one operation, or name the one to run", "BAD_QUERY");

  let maxDepth = 0;

  /** Returns the cost of a selection set at `depth` (the depth of its fields). */
  const walk = (set: SelectionSetNode, depth: number, seen: Set<string>): number => {
    let cost = 0;
    for (const sel of set.selections) {
      if (sel.kind === Kind.FIELD) {
        const name = sel.name.value;
        if (name.startsWith("__")) continue; // introspection and __typename are free
        maxDepth = Math.max(maxDepth, depth);
        if (maxDepth > MAX_DEPTH) throw new LimitError(`Query is nested ${maxDepth} levels deep; the limit is ${MAX_DEPTH}`, "DEPTH_LIMIT");
        let fieldCost = 1;
        if (sel.selectionSet) {
          const first = intArg(sel, "first", variables);
          if (first !== null && first > MAX_PAGE_SIZE) throw new LimitError(`first can be at most ${MAX_PAGE_SIZE}`, "COST_LIMIT");
          const multiplier = opts.isList(name) ? (first ?? (name === "posts" || name === "mediaAssets" ? DEFAULT_PAGE_SIZE : DEFAULT_LIST_SIZE)) : 1;
          fieldCost += multiplier * walk(sel.selectionSet, depth + 1, seen);
        }
        cost += fieldCost;
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        cost += walk(sel.selectionSet, depth, seen);
      } else {
        const name = sel.name.value;
        if (seen.has(name)) throw new LimitError(`Fragment ${name} spreads itself`, "BAD_QUERY");
        const frag = fragments.get(name);
        if (!frag) throw new LimitError(`Unknown fragment ${name}`, "BAD_QUERY");
        cost += walk(frag.selectionSet, depth, new Set([...seen, name]));
      }
      if (cost > MAX_COST) throw new LimitError(`Query could load too much (cost over ${MAX_COST}); ask for fewer items or fields`, "COST_LIMIT");
    }
    return cost;
  };

  const cost = walk(op.selectionSet, 1, new Set());
  return { depth: maxDepth, cost };
}
