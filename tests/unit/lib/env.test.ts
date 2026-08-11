import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadEnvModule(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, ...overrides };
  return import("@/lib/env");
}

describe("env helpers", () => {
  afterEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  it("normalizes R2 URLs without a protocol prefix", async () => {
    const { getR2StorageConfig } = await loadEnvModule({
      TIANTI_STORAGE_MODE: "r2",
      R2_BUCKET: "tianti-assets",
      R2_ENDPOINT: "abc123.r2.cloudflarestorage.com",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_PUBLIC_BASE_URL: "cdn.example.com/uploads/"
    });

    const config = getR2StorageConfig();
    expect(config.endpoint).toBe("https://abc123.r2.cloudflarestorage.com");
    expect(config.publicBaseUrl).toBe("https://cdn.example.com/uploads");
  });

  it("throws a clear error for invalid R2 URLs", async () => {
    const { getR2StorageConfig } = await loadEnvModule({
      TIANTI_STORAGE_MODE: "r2",
      R2_BUCKET: "tianti-assets",
      R2_ENDPOINT: "http://",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_PUBLIC_BASE_URL: "cdn.example.com/uploads"
    });

    expect(() => getR2StorageConfig()).toThrow("R2_ENDPOINT");
  });

  it("returns the orphan asset cleanup defaults when env vars are unset", async () => {
    const { getOrphanAssetCleanupConfig } = await loadEnvModule({
      CRON_SECRET: undefined,
      ORPHAN_ASSET_CLEANUP_LIMIT: undefined,
      ORPHAN_ASSET_GRACE_MINUTES: undefined
    });

    expect(getOrphanAssetCleanupConfig()).toEqual({
      graceMinutes: 30,
      limit: 50
    });
  });

  it("requires explicit seed editor credentials for non-mock seeded flows", async () => {
    const { getSeedEditorCredentials } = await loadEnvModule({
      TIANTI_CONTENT_MODE: "database",
      SEED_EDITOR_ONE_EMAIL: undefined,
      SEED_EDITOR_ONE_PASSWORD: undefined,
      SEED_EDITOR_TWO_EMAIL: undefined,
      SEED_EDITOR_TWO_PASSWORD: undefined
    });

    expect(() => getSeedEditorCredentials()).toThrow("Missing SEED_EDITOR_ONE_EMAIL");
  });

  it("allows default seed editor credentials in mock mode", async () => {
    const { getSeedEditorCredentials } = await loadEnvModule({
      TIANTI_CONTENT_MODE: "mock",
      SEED_EDITOR_ONE_EMAIL: undefined,
      SEED_EDITOR_ONE_PASSWORD: undefined,
      SEED_EDITOR_TWO_EMAIL: undefined,
      SEED_EDITOR_TWO_PASSWORD: undefined
    });

    expect(getSeedEditorCredentials({ allowDefaults: true })).toEqual([
      {
        slot: 1,
        email: "lin@example.com",
        password: "changeme-one"
      },
      {
        slot: 2,
        email: "yu@example.com",
        password: "changeme-two"
      }
    ]);
  });

  it("defaults to database mode when a database URL is configured", async () => {
    const { appEnv, isMockContentMode } = await loadEnvModule({
      TIANTI_CONTENT_MODE: undefined,
      DATABASE_URL: "postgres://preview.example.test/tianti"
    });

    expect(appEnv.contentMode).toBe("database");
    expect(isMockContentMode()).toBe(false);
  });

  it("requires HTTPS for the deployed Douyin scraper", async () => {
    const { getDouyinSyncConfig } = await loadEnvModule({
      NODE_ENV: "production",
      DOUYIN_SCRAPER_URL: "http://scraper.internal",
      DOUYIN_SCRAPER_URL_OVERRIDE: undefined,
      SCRAPER_SHARED_SECRET: "test-secret"
    });

    expect(() => getDouyinSyncConfig()).toThrow("must use HTTPS in production");
  });

  it("allows plain HTTP only for a local development scraper", async () => {
    const { getDouyinSyncConfig } = await loadEnvModule({
      NODE_ENV: "development",
      DOUYIN_SCRAPER_URL: undefined,
      DOUYIN_SCRAPER_URL_OVERRIDE: "http://scraper.example.test",
      SCRAPER_SHARED_SECRET: "test-secret"
    });

    expect(() => getDouyinSyncConfig()).toThrow("must use HTTPS unless it is a local loopback URL");
  });

  it("rejects scraper base URLs with credentials, queries, or fragments", async () => {
    const { getDouyinSyncConfig } = await loadEnvModule({
      NODE_ENV: "development",
      DOUYIN_SCRAPER_URL: undefined,
      DOUYIN_SCRAPER_URL_OVERRIDE: "https://user:password@scraper.example.test/base?token=secret#fragment",
      SCRAPER_SHARED_SECRET: "test-secret"
    });

    expect(() => getDouyinSyncConfig()).toThrow("cannot include credentials, a query, or a fragment");
  });

  it("uses the Vercel-generated Douyin service URL by default", async () => {
    const { getDouyinSyncConfig } = await loadEnvModule({
      NODE_ENV: "production",
      DOUYIN_SCRAPER_URL: "https://preview.example.test/_internal/douyin-scraper/",
      DOUYIN_SCRAPER_URL_OVERRIDE: undefined,
      SCRAPER_SHARED_SECRET: "test-secret"
    });

    expect(getDouyinSyncConfig().scraperUrl).toBe(
      "https://preview.example.test/_internal/douyin-scraper"
    );
  });

  it("allows a local or external scraper URL to override the generated service URL", async () => {
    const { getDouyinSyncConfig } = await loadEnvModule({
      NODE_ENV: "development",
      DOUYIN_SCRAPER_URL: "https://preview.example.test/_internal/douyin-scraper",
      DOUYIN_SCRAPER_URL_OVERRIDE: "http://127.0.0.1:8000///",
      SCRAPER_SHARED_SECRET: "test-secret"
    });

    expect(getDouyinSyncConfig().scraperUrl).toBe("http://127.0.0.1:8000");
  });

  it("bounds Douyin request concurrency", async () => {
    await expect(
      loadEnvModule({ DOUYIN_SYNC_CONCURRENCY: "11" })
    ).rejects.toThrow("DOUYIN_SYNC_CONCURRENCY must be at most 10");
  });
});
