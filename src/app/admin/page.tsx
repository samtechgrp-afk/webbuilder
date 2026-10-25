import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserSites } from "@/lib/tenant";
import { logout } from "../login/actions";

export const metadata: Metadata = { title: "Your sites" };

/** After login: a client with one site goes straight to it; designers and staff pick. */
export default async function AdminHome() {
  const user = await requireUser();
  const sites = await listUserSites(user);
  if (sites.length === 1 && !user.isPlatformAdmin) redirect(`/admin/sites/${sites[0].site.id}`);

  return (
    <main className="mx-auto w-full max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">Your sites</h1>
        <form action={logout}>
          <button className="text-sm text-zinc-500 hover:text-zinc-900">Sign out</button>
        </form>
      </div>
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
        {sites.map(({ site, roleName }) => (
          <li key={site.id}>
            <Link href={`/admin/sites/${site.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-zinc-50">
              <span>
                <span className="block font-medium text-zinc-900">{site.name}</span>
                <span className="text-sm text-zinc-500">{site.customDomain ?? `${site.subdomain}.${process.env.ROOT_DOMAIN}`}</span>
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">{roleName}</span>
            </Link>
          </li>
        ))}
        {!sites.length && <li className="px-5 py-8 text-center text-sm text-zinc-500">You haven&apos;t been added to a site yet.</li>}
      </ul>
    </main>
  );
}
