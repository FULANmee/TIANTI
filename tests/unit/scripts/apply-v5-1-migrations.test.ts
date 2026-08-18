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

  it("rejects an unrelated Preview branch", () => {
    expect(() =>
      getTarget({ ...previewEnvironment, VERCEL_GIT_COMMIT_REF: "codex/other" })
    ).toThrow("5.1 Preview migration guard rejected this deployment context.");
  });
});
