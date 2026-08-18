import { AdminUnsavedChangesProvider } from "@/components/admin/admin-unsaved-changes";
import { AdminNav } from "@/components/admin/admin-nav";
import { ReturnToSiteButton } from "@/components/admin/return-to-site-button";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { requireAuthenticatedEditor } from "@/lib/session";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const editor = await requireAuthenticatedEditor();

  return (
    <AdminUnsavedChangesProvider>
      <main className="mx-auto max-w-[96rem] px-4 pb-8 md:px-6">
        <header className="sticky top-0 z-40 -mx-4 border-b border-[var(--line-soft)] bg-[rgba(243,246,245,0.94)] px-4 py-3 backdrop-blur-md md:-mx-6 md:px-6">
          <div className="mx-auto flex max-w-[96rem] flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <div className="border-r border-[var(--line-strong)] pr-4">
                <p className="font-display text-xl tracking-[0.16em] text-[var(--foreground)]">TIANTI</p>
                <p className="text-[10px] tracking-[0.16em] ui-muted">档案工作台</p>
              </div>
              <AdminNav />
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-sm ui-subtle lg:inline">{editor.name}</span>
              <ReturnToSiteButton />
              <SignOutButton />
            </div>
          </div>
        </header>

        <div className="pt-5">{children}</div>
      </main>
    </AdminUnsavedChangesProvider>
  );
}
