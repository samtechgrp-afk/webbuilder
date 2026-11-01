import { safeCssValue } from "../design/css-values";
import { ICON_NAMES } from "./icons";
import type { BuilderNode } from "./types";

/**
 * Designer settings: the per-widget options that aren't content (a video's
 * autoplay, a divider's shape, a button's hover effect). Each widget declares
 * them in WIDGETS[type].settings; the same declaration drives the editor's
 * Settings tab, the defaults the renderer falls back to, and the check run on
 * every save. Settings are stored as plain props on the node, so a widget
 * saved before a setting existed simply renders with the default.
 *
 * Settings are design decisions: only designers may change them (the policy
 * diff classifies any non-content prop change as "design").
 */

interface Base {
  key: string;
  label: string;
  help?: string;
  /** Only shown (and only meaningful) when another setting has one of these values. */
  when?: { key: string; is: (string | boolean)[] };
}

export type SettingDef = Base &
  (
    | { kind: "select"; options: { value: string; label: string }[]; default: string }
    | { kind: "toggle"; default: boolean }
    | { kind: "number"; min: number; max: number; step?: number; unit?: string; default: number }
    | { kind: "text"; maxLength: number; placeholder?: string; default: string }
    /** A CSS colour or token reference (`var(--color-primary)`). Empty means "inherit". */
    | { kind: "color"; default: string }
    | { kind: "icon"; default: string }
    /** A video from the media library: `{ assetId, src }`, src resolved on the server. */
    | { kind: "media"; accept: "video"; default: null }
  );

export interface MediaRef {
  assetId: string;
  src: string;
}

const isMediaRef = (v: unknown): v is MediaRef =>
  !!v && typeof v === "object" && typeof (v as MediaRef).assetId === "string" && (v as MediaRef).assetId.length > 0 && (v as MediaRef).assetId.length <= 40 && typeof (v as MediaRef).src === "string";

/** The stored value of a setting, or its default when unset or invalid. */
export function settingValue<T = unknown>(defs: readonly SettingDef[] | undefined, node: Pick<BuilderNode, "props">, key: string): T {
  const def = defs?.find((d) => d.key === key);
  if (!def) return node.props[key] as T;
  const v = node.props[key];
  return (v === undefined || settingProblem(def, v) ? def.default : v) as T;
}

/** All settings of a node, defaults filled in. */
export function settingValues(defs: readonly SettingDef[] | undefined, node: Pick<BuilderNode, "props">): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of defs ?? []) out[def.key] = settingValue(defs, node, def.key);
  return out;
}

/** Why a value doesn't fit its setting, or null. `undefined` (unset) always fits. */
export function settingProblem(def: SettingDef, v: unknown): string | null {
  if (v === undefined) return null;
  switch (def.kind) {
    case "select":
      return typeof v === "string" && def.options.some((o) => o.value === v) ? null : `${def.label} has an unknown option`;
    case "toggle":
      return typeof v === "boolean" ? null : `${def.label} must be on or off`;
    case "number":
      return typeof v === "number" && Number.isFinite(v) && v >= def.min && v <= def.max ? null : `${def.label} must be between ${def.min} and ${def.max}`;
    case "text":
      return typeof v === "string" && v.length <= def.maxLength && !/[\u0000-\u001F\u007F]/.test(v) ? null : `${def.label} is too long`;
    case "color":
      return typeof v === "string" && v.length <= 120 && (v === "" || safeCssValue(v) === v) ? null : `${def.label} isn't a valid colour`;
    case "icon":
      return typeof v === "string" && (v === "" || ICON_NAMES.has(v)) ? null : `${def.label} is an unknown icon`;
    case "media":
      return v === null || isMediaRef(v) ? null : `${def.label} is invalid`;
  }
}

/** First problem among a node's declared settings. Undeclared props are left to their own checks. */
export function settingsProblem(defs: readonly SettingDef[] | undefined, props: Record<string, unknown>): string | null {
  for (const def of defs ?? []) {
    const problem = settingProblem(def, props[def.key]);
    if (problem) return problem;
  }
  return null;
}

/** Media references a node's settings hold, for server-side resolution against the library. */
export function mediaSettings(defs: readonly SettingDef[] | undefined, props: Record<string, unknown>): { key: string; ref: MediaRef }[] {
  const out: { key: string; ref: MediaRef }[] = [];
  for (const def of defs ?? []) if (def.kind === "media" && isMediaRef(props[def.key])) out.push({ key: def.key, ref: props[def.key] as MediaRef });
  return out;
}

/** Whether a setting is visible given the node's other settings. */
export function settingVisible(defs: readonly SettingDef[], def: SettingDef, node: Pick<BuilderNode, "props">) {
  if (!def.when) return true;
  return def.when.is.includes(settingValue(defs, node, def.when.key) as string | boolean);
}
