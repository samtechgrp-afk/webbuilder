/**
 * Everything under /admin is per-user and per-request (session, membership,
 * edit locks), so it renders dynamically rather than from a static shell.
 */
export const instant = false;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
