import { EditorNameForm } from "@/components/admin/editor-name-form";
import { AdminPanel } from "@/components/ui/admin-panel";
import { formatDate } from "@/lib/date";
import { getEventDisplayName } from "@/lib/event-display";
import { requireAuthenticatedEditor } from "@/lib/session";
import { getAdminDashboard, getContentState } from "@/modules/content/service";

export default async function AdminDashboardPage() {
  const editor = await requireAuthenticatedEditor();
  const [data, state] = await Promise.all([getAdminDashboard(editor.id), getContentState()]);
  const eventMap = new Map(state.events.map((event) => [event.id, event]));

  return (
    <div className="space-y-6">
      <AdminPanel
        eyebrow="Overview"
        title="当前工作上下文"
        description="从最近更新、即将发生的活动和我的档案记录开始，快速回到正在维护的内容。"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="ui-stat">
            <p className="text-sm ui-muted">公开达人</p>
            <p className="mt-2 text-3xl tracking-[-0.04em] text-[var(--foreground)]">{state.talents.length}</p>
          </div>
          <div className="ui-stat">
            <p className="text-sm ui-muted">公开活动</p>
            <p className="mt-2 text-3xl tracking-[-0.04em] text-[var(--foreground)]">{state.events.length}</p>
          </div>
          <div className="ui-stat">
            <p className="text-sm ui-muted">我的档案</p>
            <p className="mt-2 text-3xl tracking-[-0.04em] text-[var(--foreground)]">
              {state.archives.filter((archive) => archive.editorId === editor.id).length}
            </p>
          </div>
          <div className="ui-stat">
            <p className="text-sm ui-muted">我的天梯</p>
            <p className="mt-2 text-3xl tracking-[-0.04em] text-[var(--foreground)]">
              {state.ladders.find((ladder) => ladder.editorId === editor.id)?.tiers.length ?? 0}
            </p>
          </div>
        </div>
      </AdminPanel>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <AdminPanel eyebrow="Recent Talents" title="最近更新的达人">
          <div className="space-y-4">
            {data.recentTalents.map((talent) => (
              <div key={talent.id} className="border-b pb-4 last:border-none last:pb-0 ui-divider">
                <p className="text-lg text-[var(--foreground)]">{talent.nickname}</p>
                <p className="mt-1 text-sm ui-subtle">{formatDate(talent.updatedAt)}</p>
              </div>
            ))}
          </div>
        </AdminPanel>

        <AdminPanel eyebrow="Recent Events" title="最近更新的活动">
          <div className="space-y-4">
            {data.recentEvents.map((event) => (
              <div key={event.id} className="border-b pb-4 last:border-none last:pb-0 ui-divider">
                <p className="text-lg text-[var(--foreground)]">{getEventDisplayName(event)}</p>
                <p className="mt-1 text-sm ui-subtle">{event.city || "城市待定"}</p>
              </div>
            ))}
          </div>
        </AdminPanel>

        <AdminPanel eyebrow="Upcoming" title="即将发生的活动">
          <div className="space-y-4">
            {data.upcomingEvents.map((event) => (
              <div key={event.id} className="border-b pb-4 last:border-none last:pb-0 ui-divider">
                <p className="text-lg text-[var(--foreground)]">{getEventDisplayName(event)}</p>
                <p className="mt-1 text-sm ui-subtle">{event.city || "城市待定"}</p>
              </div>
            ))}
          </div>
        </AdminPanel>

        <AdminPanel eyebrow="My Archives" title="我最近编辑的档案">
          <div className="space-y-4">
            {data.myRecentArchives.map((archive) => {
              const event = eventMap.get(archive.eventId);
              return (
                <div key={archive.id} className="border-b pb-4 last:border-none last:pb-0 ui-divider">
                  <p className="text-lg text-[var(--foreground)]">
                    {event ? getEventDisplayName(event) : "活动已删除"}
                  </p>
                  <p className="mt-1 text-sm ui-subtle">{formatDate(archive.updatedAt)}</p>
                </div>
              );
            })}
          </div>
        </AdminPanel>
      </div>

      <AdminPanel
        eyebrow="Profile"
        title="编辑者昵称"
        description="你可以在这里修改自己的显示昵称。登录邮箱和权限不变，公开天梯、首页、详情页与后台顶部都会同步更新。"
      >
        <EditorNameForm currentName={editor.name} />
      </AdminPanel>
    </div>
  );
}
