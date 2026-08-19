import { readFile } from "node:fs/promises";
import path from "node:path";
import { getTarget } from "../../../scripts/apply-v5-1-migrations";

const previewEnvironment = {
  TIANTI_PREVIEW_V5_1_MIGRATIONS: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  VERCEL_DEPLOYMENT_ID: "dpl_test"
};

describe("TIANTI 5.1+ migration gate", () => {
  it("accepts the current rating Preview branch", () => {
    expect(
      getTarget({ ...previewEnvironment, VERCEL_GIT_COMMIT_REF: "codex/5.3" })
    ).toBe("preview");
  });

  it("accepts the 5.4 Preview branch", () => {
    expect(getTarget({ ...previewEnvironment, VERCEL_GIT_COMMIT_REF: "codex/5.4" })).toBe("preview");
  });

  it("rejects an unrelated Preview branch", () => {
    expect(() =>
      getTarget({ ...previewEnvironment, VERCEL_GIT_COMMIT_REF: "codex/other" })
    ).toThrow("5.1 Preview migration guard rejected this deployment context.");
  });

  it("keeps the 5.4 migration independent from the already-applied rating constraint", async () => {
    const migration = await readFile(path.join(process.cwd(), "drizzle", "0013_true_warlock.sql"), "utf8");

    expect(migration).not.toContain("archive_entries_beauty_tier_check");
  });
});
