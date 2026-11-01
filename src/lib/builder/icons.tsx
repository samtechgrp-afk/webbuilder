import { createElement } from "react";
import { ICONS } from "./icon-set";

/**
 * Lucide icons for site widgets, rendered as inline SVG on the server: no
 * icon font, no client JavaScript, and they inherit `currentColor` so the
 * widget's text colour (or a token) styles them.
 */
export const ICON_NAMES: ReadonlySet<string> = new Set(Object.keys(ICONS));

export const iconLabel = (name: string) => name.replace(/-/g, " ").replace(/(\D)(\d)/g, "$1 $2");

export function SiteIcon({ name, size, strokeWidth = 1.75, title }: { name: string; size?: number | string; strokeWidth?: number; title?: string }) {
  const node = ICONS[name];
  if (!node) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size ?? "1em"}
      height={size ?? "1em"}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      data-icon={name}
    >
      {title ? <title>{title}</title> : null}
      {node.map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
