import { NextResponse } from "next/server";
import { getAuthenticatedEditor } from "@/lib/session";
import { getDouyinAdminStatuses } from "@/modules/content/service";
import { DouyinSyncOperationError, runDouyinSync } from "@/modules/douyin/sync";

export const maxDuration = 120;

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const editor = await getAuthenticatedEditor();
  if (!editor) {
    return NextResponse.json({ error: "未登录。" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const execution = await runDouyinSync({ trigger: "manual_talent", talentId: id });
    return NextResponse.json({ ok: true, ...execution, statuses: await getDouyinAdminStatuses() });
  } catch (error) {
    if (error instanceof DouyinSyncOperationError) {
      const status = error.code === "RUNNING" ? 409 : error.code === "TALENT_NOT_FOUND" ? 404 : 503;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: "抖音同步失败，请稍后重试。" }, { status: 500 });
  }
}
