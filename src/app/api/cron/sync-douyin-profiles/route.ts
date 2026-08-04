import { NextResponse } from "next/server";
import { appEnv } from "@/lib/env";
import { DouyinSyncOperationError, runDouyinSync } from "@/modules/douyin/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!appEnv.cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is required." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${appEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const execution = await runDouyinSync({ trigger: "cron" });
    return NextResponse.json({ ok: true, ...execution });
  } catch (error) {
    if (error instanceof DouyinSyncOperationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "RUNNING" ? 409 : 503 }
      );
    }
    return NextResponse.json({ error: "Douyin sync failed." }, { status: 500 });
  }
}
