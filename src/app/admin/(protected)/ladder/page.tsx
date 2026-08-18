import { LadderManager } from "@/components/admin/ladder-manager";
import { requireAuthenticatedEditor } from "@/lib/session";
import { getContentState } from "@/modules/content/service";

export default async function AdminLadderPage() {
  const editor = await requireAuthenticatedEditor();
  const state = await getContentState();
  const ladder = state.ladders.find((item) => item.editorId === editor.id);

  if (!ladder) {
    return (
      <div className="surface rounded-[var(--radius-panel)] p-6 ui-subtle">
        当前账号还没有自己的天梯榜。
      </div>
    );
  }

  return <LadderManager ladder={ladder} talents={state.talents} editorName={editor.name} />;
}
