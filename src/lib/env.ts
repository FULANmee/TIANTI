import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  },
  z.string().optional()
);

const optionalHttpUrl = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed || undefined;
  },
  z
    .string()
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), "Must be an HTTP(S) URL.")
    .optional()
);

const optionalPositiveInteger = z.preprocess(
  (value) => {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z.coerce.number().int().positive().optional()
);

const optionalBoolean = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return value;
}, z.boolean().optional());

const envSchema = z.object({
  CRON_SECRET: optionalNonEmptyString,
  DATABASE_URL: z.string().optional(),
  DOUYIN_SCRAPER_URL: optionalHttpUrl,
  DOUYIN_SCRAPER_URL_OVERRIDE: optionalHttpUrl,
  DOUYIN_SYNC_CONCURRENCY: optionalPositiveInteger.refine(
    (value) => value === undefined || value <= 10,
    "DOUYIN_SYNC_CONCURRENCY must be at most 10."
  ),
  DOUYIN_SYNC_COOLDOWN_MINUTES: optionalPositiveInteger.refine(
    (value) => value === undefined || value <= 1_440,
    "DOUYIN_SYNC_COOLDOWN_MINUTES must be at most 1440."
  ),
  DOUYIN_SYNC_ENABLED: optionalBoolean,
  DOUYIN_SYNC_TIMEOUT_SECONDS: optionalPositiveInteger.refine(
    (value) => value === undefined || value <= 300,
    "DOUYIN_SYNC_TIMEOUT_SECONDS must be at most 300."
  ),
  ORPHAN_ASSET_CLEANUP_LIMIT: optionalPositiveInteger,
  ORPHAN_ASSET_GRACE_MINUTES: optionalPositiveInteger,
  SESSION_SECRET: z.string().optional(),
  SCRAPER_SHARED_SECRET: optionalNonEmptyString,
  R2_BUCKET: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),
  SEED_EDITOR_ONE_EMAIL: z.string().email().optional(),
  SEED_EDITOR_ONE_PASSWORD: z.string().min(8).optional(),
  SEED_EDITOR_TWO_EMAIL: z.string().email().optional(),
  SEED_EDITOR_TWO_PASSWORD: z.string().min(8).optional(),
  TIANTI_STORAGE_MODE: z.enum(["mock", "r2"]).optional(),
  TIANTI_CONTENT_MODE: z.enum(["mock", "database"]).optional()
});

const parsedEnv = envSchema.parse(process.env);

const defaultEditorCredentials = [
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
] as const;

export const appEnv = {
  ...parsedEnv,
  // A deployed environment with a database URL should not silently fall back
  // to the in-memory mock store when the mode override is omitted. Mock mode
  // is still the local/test default because those environments have no DB URL.
  contentMode: parsedEnv.TIANTI_CONTENT_MODE ?? (parsedEnv.DATABASE_URL ? "database" : "mock"),
  cronSecret: parsedEnv.CRON_SECRET?.trim() ?? null,
  douyinScraperUrl:
    (
      parsedEnv.DOUYIN_SCRAPER_URL_OVERRIDE ??
      parsedEnv.DOUYIN_SCRAPER_URL
    )?.replace(/\/+$/, "") ?? null,
  douyinSyncConcurrency: parsedEnv.DOUYIN_SYNC_CONCURRENCY ?? 2,
  douyinSyncCooldownMinutes: parsedEnv.DOUYIN_SYNC_COOLDOWN_MINUTES ?? 10,
  douyinSyncEnabled: parsedEnv.DOUYIN_SYNC_ENABLED ?? false,
  douyinSyncTimeoutSeconds: parsedEnv.DOUYIN_SYNC_TIMEOUT_SECONDS ?? 20,
  orphanAssetCleanupLimit: parsedEnv.ORPHAN_ASSET_CLEANUP_LIMIT ?? 50,
  orphanAssetGraceMinutes: parsedEnv.ORPHAN_ASSET_GRACE_MINUTES ?? 30,
  scraperSharedSecret: parsedEnv.SCRAPER_SHARED_SECRET?.trim() ?? null,
  storageMode: parsedEnv.TIANTI_STORAGE_MODE ?? "mock"
};

function resolveSeedEditorCredential(
  slot: 1 | 2,
  email: string | undefined,
  password: string | undefined,
  allowDefaults: boolean
) {
  const fallback = defaultEditorCredentials[slot - 1];
  const normalizedEmail = email?.trim();
  const normalizedPassword = password?.trim();

  if (normalizedEmail && normalizedPassword) {
    return {
      slot,
      email: normalizedEmail,
      password: normalizedPassword
    };
  }

  if (allowDefaults) {
    return { ...fallback };
  }

  const label = slot === 1 ? "ONE" : "TWO";
  const missing = [
    !normalizedEmail ? `SEED_EDITOR_${label}_EMAIL` : null,
    !normalizedPassword ? `SEED_EDITOR_${label}_PASSWORD` : null
  ].filter(Boolean);

  throw new Error(
    `Missing ${missing.join(", ")}. Set explicit editor seed credentials before running seeded non-mock content flows.`
  );
}

export function getSeedEditorCredentials(options: { allowDefaults?: boolean } = {}) {
  const allowDefaults = options.allowDefaults ?? false;

  return [
    resolveSeedEditorCredential(
      1,
      parsedEnv.SEED_EDITOR_ONE_EMAIL,
      parsedEnv.SEED_EDITOR_ONE_PASSWORD,
      allowDefaults
    ),
    resolveSeedEditorCredential(
      2,
      parsedEnv.SEED_EDITOR_TWO_EMAIL,
      parsedEnv.SEED_EDITOR_TWO_PASSWORD,
      allowDefaults
    )
  ] as const;
}

function normalizeHttpUrl(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Invalid R2 config: ${label} cannot be empty.`);
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error(`Invalid R2 config: ${label} must be a valid URL.`);
  }

  return url.toString().replace(/\/$/, "");
}

export function isMockContentMode() {
  return appEnv.contentMode === "mock" || !appEnv.DATABASE_URL;
}

export function isMockStorageMode() {
  return appEnv.storageMode === "mock";
}

export function getR2StorageConfig() {
  const missing = [
    !appEnv.R2_BUCKET?.trim() ? "R2_BUCKET" : null,
    !appEnv.R2_ENDPOINT?.trim() ? "R2_ENDPOINT" : null,
    !appEnv.R2_ACCESS_KEY_ID?.trim() ? "R2_ACCESS_KEY_ID" : null,
    !appEnv.R2_SECRET_ACCESS_KEY?.trim() ? "R2_SECRET_ACCESS_KEY" : null,
    !appEnv.R2_PUBLIC_BASE_URL?.trim() ? "R2_PUBLIC_BASE_URL" : null
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Invalid R2 config: missing ${missing.join(", ")}.`);
  }

  return {
    bucket: appEnv.R2_BUCKET!.trim(),
    endpoint: normalizeHttpUrl(appEnv.R2_ENDPOINT!, "R2_ENDPOINT"),
    accessKeyId: appEnv.R2_ACCESS_KEY_ID!.trim(),
    secretAccessKey: appEnv.R2_SECRET_ACCESS_KEY!.trim(),
    publicBaseUrl: normalizeHttpUrl(appEnv.R2_PUBLIC_BASE_URL!, "R2_PUBLIC_BASE_URL")
  };
}

export function getR2StorageSummary() {
  if (isMockStorageMode()) {
    return null;
  }

  try {
    const config = getR2StorageConfig();
    return {
      bucket: config.bucket,
      publicBaseUrl: config.publicBaseUrl,
      error: null
    };
  } catch (error) {
    return {
      bucket: appEnv.R2_BUCKET?.trim() ?? "",
      publicBaseUrl: appEnv.R2_PUBLIC_BASE_URL?.trim() ?? "",
      error: error instanceof Error ? error.message : "Invalid R2 config."
    };
  }
}

export function getOrphanAssetCleanupConfig() {
  return {
    graceMinutes: appEnv.orphanAssetGraceMinutes,
    limit: appEnv.orphanAssetCleanupLimit
  };
}

export function getDouyinSyncConfig() {
  const rawScraperUrl = appEnv.douyinScraperUrl;
  const sharedSecret = appEnv.scraperSharedSecret;
  const missing = [
    !rawScraperUrl
      ? "DOUYIN_SCRAPER_URL (or DOUYIN_SCRAPER_URL_OVERRIDE)"
      : null,
    !sharedSecret ? "SCRAPER_SHARED_SECRET" : null
  ].filter(Boolean);

  if (missing.length > 0 || !rawScraperUrl || !sharedSecret) {
    throw new Error(`Invalid Douyin sync config: missing ${missing.join(", ")}.`);
  }

  const scraperUrl = new URL(rawScraperUrl);
  if (scraperUrl.username || scraperUrl.password || scraperUrl.search || scraperUrl.hash) {
    throw new Error(
      "Invalid Douyin sync config: the Douyin scraper URL cannot include credentials, a query, or a fragment."
    );
  }

  const isLoopbackHttp =
    scraperUrl.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(scraperUrl.hostname);
  if (process.env.NODE_ENV === "production" && scraperUrl.protocol !== "https:") {
    throw new Error("Invalid Douyin sync config: the Douyin scraper URL must use HTTPS in production.");
  }
  if (scraperUrl.protocol !== "https:" && !isLoopbackHttp) {
    throw new Error(
      "Invalid Douyin sync config: the Douyin scraper URL must use HTTPS unless it is a local loopback URL."
    );
  }

  return {
    enabled: appEnv.douyinSyncEnabled,
    scraperUrl: scraperUrl.toString().replace(/\/+$/, ""),
    sharedSecret,
    concurrency: appEnv.douyinSyncConcurrency,
    cooldownMinutes: appEnv.douyinSyncCooldownMinutes,
    timeoutSeconds: appEnv.douyinSyncTimeoutSeconds
  };
}
