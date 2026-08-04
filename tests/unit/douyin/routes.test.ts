const mocks = vi.hoisted(() => ({
  getAuthenticatedEditor: vi.fn(),
  runDouyinSync: vi.fn(),
  getDouyinAdminStatuses: vi.fn()
}));

vi.mock("@/lib/env", () => ({ appEnv: { cronSecret: "cron-secret" } }));
vi.mock("@/lib/session", () => ({ getAuthenticatedEditor: mocks.getAuthenticatedEditor }));
vi.mock("@/modules/content/service", () => ({
  getDouyinAdminStatuses: mocks.getDouyinAdminStatuses
}));
vi.mock("@/modules/douyin/sync", () => {
  class MockDouyinSyncOperationError extends Error {
    constructor(
      readonly code: "DISABLED" | "RUNNING" | "TALENT_NOT_FOUND",
      message: string
    ) {
      super(message);
    }
  }

  return {
    DouyinSyncOperationError: MockDouyinSyncOperationError,
    runDouyinSync: mocks.runDouyinSync
  };
});

import { POST as syncAll } from "@/app/api/admin/douyin-sync/route";
import { POST as syncTalent } from "@/app/api/admin/talents/[id]/douyin-sync/route";
import { GET as syncCron } from "@/app/api/cron/sync-douyin-profiles/route";

const execution = {
  run: {
    id: "run-1",
    trigger: "manual_all" as const,
    status: "completed" as const,
    requestedCount: 1,
    succeededCount: 1,
    skippedCount: 0,
    failedCount: 0,
    startedAt: "2026-08-04T00:00:00.000Z",
    finishedAt: "2026-08-04T00:00:01.000Z"
  },
  results: []
};

describe("Douyin sync routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDouyinAdminStatuses.mockResolvedValue([]);
    mocks.runDouyinSync.mockResolvedValue(execution);
  });

  it("requires an editor session for manual sync routes", async () => {
    mocks.getAuthenticatedEditor.mockResolvedValue(null);

    expect((await syncAll()).status).toBe(401);
    expect(
      (
        await syncTalent(new Request("https://tianti.test/api/admin/talents/talent-1/douyin-sync"), {
          params: Promise.resolve({ id: "talent-1" })
        })
      ).status
    ).toBe(401);
    expect(mocks.runDouyinSync).not.toHaveBeenCalled();
  });

  it("passes the selected talent through the authenticated route", async () => {
    mocks.getAuthenticatedEditor.mockResolvedValue({ id: "editor-1" });

    const response = await syncTalent(
      new Request("https://tianti.test/api/admin/talents/talent-1/douyin-sync"),
      { params: Promise.resolve({ id: "talent-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.runDouyinSync).toHaveBeenCalledWith({
      trigger: "manual_talent",
      talentId: "talent-1"
    });
  });

  it("requires the exact cron bearer secret", async () => {
    const unauthorized = await syncCron(
      new Request("https://tianti.test/api/cron/sync-douyin-profiles", {
        headers: { authorization: "Bearer wrong-secret" }
      })
    );
    const authorized = await syncCron(
      new Request("https://tianti.test/api/cron/sync-douyin-profiles", {
        headers: { authorization: "Bearer cron-secret" }
      })
    );

    expect(unauthorized.status).toBe(401);
    expect(authorized.status).toBe(200);
    expect(mocks.runDouyinSync).toHaveBeenCalledTimes(1);
    expect(mocks.runDouyinSync).toHaveBeenCalledWith({ trigger: "cron" });
  });
});
