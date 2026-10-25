import { z } from "zod";

/**
 * Field group location rules, ACF style: a list of rule groups. A group
 * matches when every rule in it matches (AND); the field group shows when
 * any group matches (OR). Values are ids, so renaming a post type, term or
 * page never breaks a rule.
 */
export const LOCATION_PARAMS = {
  post_type: "Post type",
  page_template: "Page template",
  post_term: "Post category or tag",
  parent_page: "Parent page",
} as const;

export type LocationParam = keyof typeof LOCATION_PARAMS;

export interface LocationRule {
  param: LocationParam;
  op: "==" | "!=";
  value: string;
}

export type LocationRules = LocationRule[][];

export const locationRulesSchema = z
  .array(
    z
      .array(
        z.object({
          param: z.enum(Object.keys(LOCATION_PARAMS) as [LocationParam, ...LocationParam[]]),
          op: z.enum(["==", "!="]),
          value: z.string().min(1, "Pick a value for every rule").max(80),
        }),
      )
      .min(1)
      .max(10),
  )
  .min(1, "Add at least one location rule")
  .max(10);

/** What an entry looks like to the rules. */
export interface LocationSubject {
  postTypeId: string;
  template: string | null;
  termIds: string[];
  parentId: string | null;
}

function ruleMatches(rule: LocationRule, s: LocationSubject): boolean {
  let hit: boolean;
  switch (rule.param) {
    case "post_type":
      hit = s.postTypeId === rule.value;
      break;
    case "page_template":
      hit = (s.template ?? "default") === rule.value;
      break;
    case "post_term":
      hit = s.termIds.includes(rule.value);
      break;
    case "parent_page":
      hit = s.parentId === rule.value;
      break;
  }
  return rule.op === "==" ? hit : !hit;
}

export function matchesLocation(rules: unknown, subject: LocationSubject): boolean {
  const parsed = locationRulesSchema.safeParse(rules);
  if (!parsed.success) return false;
  return parsed.data.some((group) => group.every((rule) => ruleMatches(rule, subject)));
}

/**
 * Post types a group can possibly appear on: those named by an `==` post
 * type rule, or every type when a group has no post type rule at all. Used
 * to list bindable fields per post type on the canvas.
 */
export function postTypesForRules(rules: unknown, allPostTypeIds: string[]): string[] {
  const parsed = locationRulesSchema.safeParse(rules);
  if (!parsed.success) return [];
  const out = new Set<string>();
  for (const group of parsed.data) {
    const eq = group.filter((r) => r.param === "post_type" && r.op === "==").map((r) => r.value);
    const ne = new Set(group.filter((r) => r.param === "post_type" && r.op === "!=").map((r) => r.value));
    for (const id of eq.length ? eq.slice(0, 1) : allPostTypeIds) if (!ne.has(id) && allPostTypeIds.includes(id)) out.add(id);
  }
  return [...out];
}
