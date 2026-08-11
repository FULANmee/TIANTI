import "server-only";

import { z } from "zod";
import { getDouyinSyncConfig } from "@/lib/env";

const responseSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  fetchedAt: z.string().datetime(),
  account: z.object({
    secUserId: z.string().min(1).max(512),
    nickname: z.string().max(256),
    canonicalUrl: z.string().url()
  }),
  profile: z.object({
    signatureRaw: z.string().max(5_000),
    followerCount: z.number().int().nonnegative()
  }),
  relatedAccounts: z.array(
    z.object({
      nickname: z.string().max(256),
      secUserId: z.string().min(1).max(512),
      url: z.string().url()
    })
  ).max(100),
  diagnostics: z.object({
    profileSource: z.literal("f2-user-detail"),
    linkSource: z.enum(["structured", "rendered", "unavailable"])
  })
});

const errorSchema = z.union([
  z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }),
  z.object({
    detail: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() })
  }).transform((value) => value.detail)
]);

export type DouyinScraperResponse = z.infer<typeof responseSchema>;

export class DouyinScraperError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
  }
}

export async function fetchDouyinProfile(
  profileUrl: string,
  requestId: string,
  fetchImpl: typeof fetch = fetch
): Promise<DouyinScraperResponse> {
  const config = getDouyinSyncConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutSeconds * 1000);

  try {
    const response = await fetchImpl(`${config.scraperUrl}/v1/profiles/fetch`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.sharedSecret}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ requestId, profileUrl }),
      cache: "no-store",
      signal: controller.signal
    });

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsedError = errorSchema.safeParse(body);
      if (parsedError.success) {
        throw new DouyinScraperError(
          parsedError.data.code,
          parsedError.data.message,
          parsedError.data.retryable
        );
      }
      throw new DouyinScraperError("SCRAPER_HTTP_ERROR", `抓取服务返回 ${response.status}。`, true);
    }

    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) {
      throw new DouyinScraperError("INVALID_SCRAPER_RESPONSE", "抓取服务响应格式无效。", true);
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof DouyinScraperError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new DouyinScraperError("SCRAPER_TIMEOUT", "抓取服务请求超时。", true);
    }
    throw new DouyinScraperError("SCRAPER_UNAVAILABLE", "无法连接抖音抓取服务。", true);
  } finally {
    clearTimeout(timeout);
  }
}
