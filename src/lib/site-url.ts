/** Set by the proxy when a request reached a site on its own host (so links live at "/"). */
export const SITE_ROOT_HEADER = "x-site-root";

/** Where a site's root-relative links point: "" on its own domain, "/sites/<key>" under the platform. */
export const siteLinkBase = (key: string, onOwnHost: boolean) => (onOwnHost ? "" : `/sites/${key}`);
