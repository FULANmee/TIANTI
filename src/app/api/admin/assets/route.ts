import { NextResponse } from "next/server";
import { z } from "zod";
import { isMockStorageMode } from "@/lib/env";
import { getAuthenticatedEditor } from "@/lib/session";
import { saveAsset } from "@/modules/admin/mutations";
import { getContentRepository } from "@/modules/repository";
import { uploadObjectToR2 } from "@/storage/r2";

const assetSchema = z.object({
  kind: z.enum(["talent_cover", "talent_representation", "event_scene", "shared_photo"]),
  title: z.string().trim().min(1),
  alt: z.string().trim().min(1),
  width: z.coerce.number().int().positive(),
  height: z.coerce.number().int().positive(),
  cropX: z.coerce.number().min(0).max(1),
  cropY: z.coerce.number().min(0).max(1),
  cropWidth: z.coerce.number().positive().max(1),
  cropHeight: z.coerce.number().positive().max(1),
  displayAspectWidth: z.coerce.number().int(),
  displayAspectHeight: z.coerce.number().int()
});

const assetFetchSchema = z.object({
  assetId: z.string().min(1)
});

export async function GET(request: Request) {
  const editor = await getAuthenticatedEditor();
  if (!editor) {
    return NextResponse.json({ error: "未登录。" }, { status: 401 });
  }

  try {
    const { assetId } = assetFetchSchema.parse({
      assetId: new URL(request.url).searchParams.get("assetId")
    });
    const state = await getContentRepository().getState();
    const asset = state.assets.find((item) => item.id === assetId);

    if (!asset) {
      return NextResponse.json({ error: "当前图片不存在或已被删除。" }, { status: 404 });
    }

    const sourceUrl = asset.url.startsWith("http://") || asset.url.startsWith("https://") || asset.url.startsWith("data:")
      ? asset.url
      : new URL(asset.url, request.url).toString();
    const response = await fetch(sourceUrl, { cache: "no-store" });

    if (!response.ok) {
      return NextResponse.json({ error: "读取当前图片失败，请重新上传后再试。" }, { status: 400 });
    }

    const bytes = await response.arrayBuffer();
    return new Response(bytes, {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取当前图片失败。" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const editor = await getAuthenticatedEditor();
  if (!editor) {
    return NextResponse.json({ error: "未登录。" }, { status: 401 });
  }

  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      const input = assetSchema.extend({ url: z.string().url(), objectKey: z.string().min(1) }).parse(await request.json());
      const asset = await saveAsset(input);
      return NextResponse.json({ asset });
    }
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请先选择图片文件。" }, { status: 400 });
    }

    const meta = assetSchema.parse({
      kind: formData.get("kind"),
      title: formData.get("title"),
      alt: formData.get("alt"),
      width: formData.get("width"),
      height: formData.get("height"),
      cropX: formData.get("cropX"),
      cropY: formData.get("cropY"),
      cropWidth: formData.get("cropWidth"),
      cropHeight: formData.get("cropHeight"),
      displayAspectWidth: formData.get("displayAspectWidth"),
      displayAspectHeight: formData.get("displayAspectHeight")
    });

    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploadResult = isMockStorageMode()
      ? null
      : await uploadObjectToR2(file.name, file.type || "application/octet-stream", bytes);
    const url = isMockStorageMode()
      ? `data:${file.type || "application/octet-stream"};base64,${Buffer.from(bytes).toString("base64")}`
      : uploadResult!.publicUrl;

    const asset = await saveAsset({
      ...meta,
      url,
      objectKey: uploadResult?.objectKey ?? null
    });

    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "素材保存失败。" },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  const editor = await getAuthenticatedEditor();
  if (!editor) return NextResponse.json({ error: "未登录。" }, { status: 401 });
  try {
    const input = assetFetchSchema.extend({
      cropX: z.number().min(0).max(1), cropY: z.number().min(0).max(1),
      cropWidth: z.number().positive().max(1), cropHeight: z.number().positive().max(1),
      displayAspectWidth: z.union([z.literal(3), z.literal(4)]),
      displayAspectHeight: z.union([z.literal(3), z.literal(4)])
    }).parse(await request.json());
    const { assetId, ...framing } = input;
    const asset = await getContentRepository().updateAssetFraming(assetId, framing);
    return NextResponse.json({ asset });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存取景失败。" }, { status: 400 });
  }
}
