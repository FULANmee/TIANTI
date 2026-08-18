const ORIGINAL_ENV = { ...process.env };

async function loadClient() {
  vi.resetModules();
  process.env = {
    ...ORIGINAL_ENV,
    DOUYIN_SCRAPER_URL: "https://scraper.example.test",
    SCRAPER_SHARED_SECRET: "shared-test-secret",
    DOUYIN_SYNC_ENABLED: "true"
  };
  return import("@/modules/douyin/scraper-client");
}

function successBody(signatureRaw = "8.8深圳金铲铲") {
  return {
    schemaVersion: 1,
    fetchedAt: "2026-08-04T00:00:00.000Z",
    account: {
      secUserId: "primary-account",
      nickname: "测试达人",
      canonicalUrl: "https://www.douyin.com/user/primary-account"
    },
    profile: { signatureRaw, followerCount: 126_438 },
    diagnostics: { profileSource: "f2-user-detail" }
  };
}

describe("Douyin scraper client", () => {
  afterEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  it("sends the internal bearer contract and validates a successful response", async () => {
    const { fetchDouyinProfile } = await loadClient();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(successBody()), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    ) as unknown as typeof fetch;

    const response = await fetchDouyinProfile(
      "https://www.douyin.com/user/primary-account",
      "request-1",
      fetchImpl
    );

    expect(response.profile.followerCount).toBe(126_438);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://scraper.example.test/v1/profiles/fetch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer shared-test-secret" })
      })
    );
  });

  it("rejects oversized or malformed success bodies", async () => {
    const { DouyinScraperError, fetchDouyinProfile } = await loadClient();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(successBody("x".repeat(5_001))), { status: 200 })
    ) as unknown as typeof fetch;

    await expect(
      fetchDouyinProfile("https://www.douyin.com/user/primary-account", "request-2", fetchImpl)
    ).rejects.toMatchObject({
      constructor: DouyinScraperError,
      code: "INVALID_SCRAPER_RESPONSE",
      retryable: true
    });
  });

  it("maps the scraper's safe error envelope without exposing upstream details", async () => {
    const { fetchDouyinProfile } = await loadClient();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          detail: { code: "RATE_LIMITED", message: "Try later.", retryable: true }
        }),
        { status: 429 }
      )
    ) as unknown as typeof fetch;

    await expect(
      fetchDouyinProfile("https://www.douyin.com/user/primary-account", "request-3", fetchImpl)
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryable: true });
  });
});
