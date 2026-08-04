import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

type VercelConfig = {
  experimentalServices?: Record<
    string,
    {
      entrypoint?: string;
      routePrefix?: string;
    }
  >;
  crons?: Array<{ path: string; schedule: string }>;
};

async function readVercelConfig(): Promise<VercelConfig> {
  const contents = await readFile(path.join(process.cwd(), "vercel.json"), "utf8");
  return JSON.parse(contents) as VercelConfig;
}

describe("Vercel Services config", () => {
  it("deploys the Next.js app and FastAPI scraper from the existing project", async () => {
    const config = await readVercelConfig();

    expect(config.experimentalServices).toEqual({
      web: {
        entrypoint: ".",
        routePrefix: "/"
      },
      douyin_scraper: {
        entrypoint: "services/douyin-scraper/main.py",
        routePrefix: "/_internal/douyin-scraper"
      }
    });
  });

  it("preserves both daily cron routes", async () => {
    const config = await readVercelConfig();

    expect(config.crons).toEqual(
      expect.arrayContaining([
        {
          path: "/api/cron/cleanup-orphan-assets",
          schedule: "17 3 * * *"
        },
        {
          path: "/api/cron/sync-douyin-profiles",
          schedule: "23 4 * * *"
        }
      ])
    );
  });
});
