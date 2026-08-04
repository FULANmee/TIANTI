import { NextResponse } from "next/server";
import { getAuthenticatedEditor } from "@/lib/session";
import { getDouyinAdminStatuses } from "@/modules/content/service";
import { DouyinSyncOperationError, runDouyinSync } from "@/modules/douyin/sync";

export const maxDuration = 300;

export async function POST() {
  const editor = await getAuthenticatedEditor();
  if (!editor) {
    return NextResponse.json({ error: "未登录。" }, { status: 401 });
  }

  try {
    const execution = await runDouyinSync({ trigger: "manual_all" });
    return NextResponse.json({ ok: true, ...execution, statuses: await getDouyinAdminStatuses() });
  } catch (error) {
    if (error instanceof DouyinSyncOperationError) {
      const status = error.code === "RUNNING" ? 409 : error.code === "TALENT_NOT_FOUND" ? 404 : 503;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: "抖音同步失败，请稍后重试。" }, { status: 500 });
  }
}
