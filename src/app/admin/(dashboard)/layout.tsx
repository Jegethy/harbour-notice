import { signOutAction } from "@/app/admin/actions";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/auth";

export default async function DashboardLayout({ children }: LayoutProps<"/admin">) {
  // proxy.ts already redirects unauthenticated requests. This is the check that
  // actually enforces it — see the note in lib/auth.ts.
  const user = await requireAdmin();

  return (
    <div className="min-h-dvh bg-neutral-light">
      <header className="bg-brand-primary">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <p className="text-lg font-bold text-brand-cream">Harbour Care Centre</p>

          <AdminNav />

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-cream-dim sm:inline">{user.email}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-lg border-2 border-cream-dim/50 px-4 py-1.5 text-sm font-bold text-brand-cream transition-colors hover:bg-brand-deep"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
