import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedEditor } from "@/lib/session";
import {
  discoverDouyinProfiles,
  DouyinProfileDiscoveryError
} from "@/modules/douyin/profile-discovery";

const requestSchema = z.object({
  nickname: z.string().trim().min(1).max(64)
});

export const maxDuration = 30;

export async function POST(request: Request) {
  const editor = await getAuthenticatedEditor();
  if (!editor) {
    return NextResponse.json({ error: "未登录。" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入有效的达人昵称。" }, { status: 400 });
  }

  try {
    const candidates = await discoverDouyinProfiles(parsed.data.nickname);
    return NextResponse.json({ candidates });
  } catch (error) {
    console.error("[douyin-profile-candidates] discovery failed", {
      error: error instanceof Error ? error.name : "unknown",
      upstreams: error instanceof DouyinProfileDiscoveryError ? error.upstreams : []
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "抖音账号候选暂时无法查询，请稍后重试或手动填写主页链接。"
      },
      { status: 503 }
    );
  }
}
