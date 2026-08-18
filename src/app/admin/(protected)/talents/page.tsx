import { TalentManager } from "@/components/admin/talent-manager";
import { getContentState, getDouyinAdminStatuses } from "@/modules/content/service";

export default async function AdminTalentsPage() {
  const state = await getContentState();
  const lastRun = [...state.douyinSyncRuns].sort(
    (left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)
  )[0] ?? null;

  return (
    <TalentManager
      talents={state.talents}
      assets={state.assets}
      douyinStatuses={await getDouyinAdminStatuses()}
      initialLastSyncRun={lastRun}
      initialLastSyncResults={
        lastRun ? state.douyinSyncResults.filter((result) => result.runId === lastRun.id) : []
      }
    />
  );
}
