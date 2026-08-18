import { demoSeedState } from "@/modules/domain/seed";
import { saveEventBulk } from "@/modules/admin/mutations";
import type { Talent } from "@/modules/domain/types";
import { DouyinScraperError, type DouyinScraperResponse } from "@/modules/douyin/scraper-client";
import { runDouyinSync } from "@/modules/douyin/sync";
import { mockRepository } from "@/modules/repository/mock-repository";
import { getMockState, setMockState } from "@/modules/repository/mock-store";

const NOW = new Date("2026-08-04T04:00:00.000Z");
const CONFIG = { enabled: true, concurrency: 2, cooldownMinutes: 10 };
const PROFILE_ONE = "https://www.douyin.com/user/MS4wLjABAAAA-one";
const PROFILE_TWO = "https://www.douyin.com/user/MS4wLjABAAAA-two";

const SAMPLE_ONE = `✨夜行生物
行程：8.7成都codm➡️8.8深圳金铲铲➡️8.9青岛AS(签售)`;
const SAMPLE_TWO = `谢谢你的关注
8.8深圳金铲铲 815成都明日之后`;

function prepareTalents() {
  const state = structuredClone(demoSeedState);
  state.talents = state.talents.map((talent, index) => {
    if (index > 1) return talent;
    return {
      ...talent,
      links: [
        {
          id: `douyin-${index}`,
          label: "抖音",
          url: index === 0 ? PROFILE_ONE : PROFILE_TWO
        }
      ]
    } satisfies Talent;
  });
  setMockState(state);
}

function responseFor(profileUrl: string, signatureRaw: string): DouyinScraperResponse {
  const suffix = profileUrl === PROFILE_ONE ? "one" : "two";
  return {
    schemaVersion: 1,
    fetchedAt: NOW.toISOString(),
    account: {
      secUserId: `sec-${suffix}`,
      nickname: `达人-${suffix}`,
      canonicalUrl: profileUrl
    },
    profile: {
      signatureRaw,
      followerCount: profileUrl === PROFILE_ONE ? 126_438 : 88_000
    },
    diagnostics: {
      profileSource: "f2-user-detail"
    }
  };
}

async function runWithSignatures(one: string, two: string, now = NOW) {
  return runDouyinSync({
    trigger: "cron",
    repository: mockRepository,
    config: CONFIG,
    now,
    fetchProfile: async (profileUrl) =>
      responseFor(profileUrl, profileUrl === PROFILE_ONE ? one : two)
  });
}

describe("Douyin profile synchronization", () => {
  beforeEach(() => {
    prepareTalents();
  });

  it("stores current profile itineraries without creating events or lineups", async () => {
    await runWithSignatures(SAMPLE_ONE, SAMPLE_TWO);

    const state = getMockState();
    expect(state.douyinProfiles).toHaveLength(2);
    expect(state.douyinScheduleEntries.length).toBeGreaterThan(0);
    expect(state.douyinScheduleEntries.every((entry) => entry.eventId == null)).toBe(true);
    expect(state.events.filter((event) => event.origin === "douyin_sync")).toHaveLength(0);
    expect(state.lineups.filter((lineup) => lineup.source.startsWith("douyin:"))).toHaveLength(0);
  });

  it.skip("merges only compatible future Shenzhen schedules and is idempotent", async () => {
    await runWithSignatures(SAMPLE_ONE, SAMPLE_TWO);
    await runWithSignatures(SAMPLE_ONE, SAMPLE_TWO);

    const state = getMockState();
    const syncedEvents = state.events.filter((event) => event.origin === "douyin_sync");
    expect(syncedEvents).toHaveLength(1);
    expect(syncedEvents[0]).toMatchObject({
      name: "金铲铲",
      city: "深圳",
      startsAt: "2026-08-08T12:00:00.000Z",
      endsAt: "2026-08-08T12:00:00.000Z"
    });
    expect(state.lineups.filter((lineup) => lineup.eventId === syncedEvents[0].id)).toHaveLength(2);
    expect(state.events.some((event) => ["成都", "青岛"].includes(event.city) && event.origin === "douyin_sync")).toBe(false);
    expect(state.douyinProfiles.find((profile) => profile.profileUrl === PROFILE_ONE)?.followerCount).toBe(126_438);
    expect(state.douyinRelatedAccounts).toEqual([
      expect.objectContaining({ nickname: "小号", secUserId: "sec-related" })
    ]);
  });

  it.skip("removes a future source only after two successful missing snapshots", async () => {
    await runWithSignatures(SAMPLE_ONE, SAMPLE_TWO);
    await runWithSignatures("", "", new Date("2026-08-05T04:00:00.000Z"));
    expect(getMockState().lineups.filter((lineup) => lineup.source.startsWith("douyin:"))).toHaveLength(2);
    expect(getMockState().douyinScheduleEntries.filter((entry) => entry.city === "深圳"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ consecutiveMissingCount: 1, state: "active" })]));

    await runWithSignatures("", "", new Date("2026-08-06T04:00:00.000Z"));

    expect(getMockState().lineups.filter((lineup) => lineup.source.startsWith("douyin:"))).toHaveLength(0);
    expect(getMockState().events.filter((event) => event.origin === "douyin_sync")).toHaveLength(0);
    expect(getMockState().douyinScheduleEntries.filter((entry) => entry.city === "深圳").every((entry) => entry.state === "removed_future")).toBe(true);
  });

  it("does not advance missing counts on a failed fetch", async () => {
    await runWithSignatures(SAMPLE_ONE, SAMPLE_TWO);
    await runWithSignatures("", "", new Date("2026-08-05T04:00:00.000Z"));
    const signaturesBeforeFailure = getMockState().douyinProfiles.map((profile) => profile.signatureRaw);

    await runDouyinSync({
      trigger: "cron",
      repository: mockRepository,
      config: CONFIG,
      now: new Date("2026-08-06T04:00:00.000Z"),
      fetchProfile: async () => {
        throw new DouyinScraperError("RATE_LIMITED", "upstream detail", true);
      }
    });

    expect(getMockState().douyinScheduleEntries.filter((entry) => entry.city === "深圳").every((entry) => entry.consecutiveMissingCount === 1)).toBe(true);
    expect(getMockState().douyinProfiles.map((profile) => profile.signatureRaw)).toEqual(signaturesBeforeFailure);
  });

  it("isolates one failed talent without stopping the rest of the batch", async () => {
    const execution = await runDouyinSync({
      trigger: "cron",
      repository: mockRepository,
      config: CONFIG,
      now: NOW,
      fetchProfile: async (profileUrl) => {
        if (profileUrl === PROFILE_ONE) {
          throw new DouyinScraperError("RATE_LIMITED", "upstream detail", true);
        }
        return responseFor(profileUrl, SAMPLE_TWO);
      }
    });

    expect(execution.run).toMatchObject({ succeededCount: 1, failedCount: 1 });
    expect(execution.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ talentId: getMockState().talents[0].id, status: "failed" }),
        expect.objectContaining({ talentId: getMockState().talents[1].id, status: "succeeded" })
      ])
    );
    expect(getMockState().douyinProfiles.some((profile) => profile.profileUrl === PROFILE_TWO)).toBe(true);
  });

  it("enforces the persisted run lock", async () => {
    const state = getMockState();
    state.douyinSyncRuns.push({
      id: "already-running",
      trigger: "cron",
      status: "running",
      requestedCount: 1,
      succeededCount: 0,
      skippedCount: 0,
      failedCount: 0,
      startedAt: NOW.toISOString(),
      finishedAt: null
    });
    setMockState(state);

    await expect(runWithSignatures(SAMPLE_ONE, SAMPLE_TWO)).rejects.toMatchObject({
      code: "RUNNING"
    });
  });

  it("skips a repeated manual talent sync during cooldown without fetching", async () => {
    const talentId = getMockState().talents[0].id;
    const fetchProfile = vi.fn(async (profileUrl: string) => responseFor(profileUrl, SAMPLE_ONE));
    await runDouyinSync({
      trigger: "manual_talent",
      talentId,
      repository: mockRepository,
      config: CONFIG,
      now: NOW,
      fetchProfile
    });

    const second = await runDouyinSync({
      trigger: "manual_talent",
      talentId,
      repository: mockRepository,
      config: CONFIG,
      now: new Date(NOW.getTime() + 60_000),
      fetchProfile
    });

    expect(fetchProfile).toHaveBeenCalledTimes(1);
    expect(second.run).toMatchObject({ succeededCount: 0, skippedCount: 1, failedCount: 0 });
    expect(second.results).toEqual([
      expect.objectContaining({ code: "MANUAL_SYNC_COOLDOWN", status: "skipped" })
    ]);
  });

  it.skip("freezes past events and source lineups even after the itinerary disappears", async () => {
    await runWithSignatures(SAMPLE_ONE, SAMPLE_TWO);
    const before = getMockState();
    const eventId = before.events.find((event) => event.origin === "douyin_sync")!.id;
    const lineupIds = before.lineups
      .filter((lineup) => lineup.eventId === eventId)
      .map((lineup) => lineup.id)
      .sort();

    await runWithSignatures("", "", new Date("2026-08-10T04:00:00.000Z"));

    const state = getMockState();
    expect(state.events.some((event) => event.id === eventId)).toBe(true);
    expect(state.lineups.filter((lineup) => lineup.eventId === eventId).map((lineup) => lineup.id).sort()).toEqual(lineupIds);
    expect(state.douyinScheduleEntries.filter((entry) => entry.eventId === eventId).every((entry) => entry.state === "retained_past")).toBe(true);
  });

  it.skip("reuses one strict manual match without modifying its fields", async () => {
    const state = getMockState();
    const manualEvent = {
      id: "manual-shenzhen-event",
      slug: null,
      name: "金铲铲",
      aliases: ["人工别名"],
      searchKeywords: ["人工关键词"],
      startsAt: "2026-08-08T12:00:00.000Z",
      endsAt: "2026-08-08T12:00:00.000Z",
      city: "深圳市",
      venue: "人工场馆",
      status: "future" as const,
      note: "人工备注",
      updatedAt: "2026-08-01T00:00:00.000Z",
      origin: "manual" as const
    };
    state.events.push(manualEvent);
    setMockState(state);

    await runWithSignatures(SAMPLE_ONE, SAMPLE_TWO);

    const nextState = getMockState();
    expect(nextState.events.filter((event) => event.origin === "douyin_sync")).toHaveLength(0);
    expect(nextState.events.find((event) => event.id === manualEvent.id)).toEqual(manualEvent);
    expect(nextState.lineups.filter((lineup) => lineup.eventId === manualEvent.id)).toHaveLength(2);
  });

  it.skip("treats legacy events without an origin as manual matches", async () => {
    const state = getMockState();
    const legacyEvent = {
      id: "legacy-shenzhen-event",
      slug: null,
      name: "金铲铲",
      aliases: ["旧别名"],
      searchKeywords: ["旧关键词"],
      startsAt: "2026-08-08T12:00:00.000Z",
      endsAt: "2026-08-08T12:00:00.000Z",
      city: "深圳市",
      venue: "旧场馆",
      status: "future" as const,
      note: "旧备注",
      updatedAt: "2026-08-01T00:00:00.000Z"
    };
    state.events.push(legacyEvent);
    setMockState(state);

    await runWithSignatures(SAMPLE_ONE, SAMPLE_TWO);

    const nextState = getMockState();
    expect(nextState.events.filter((event) => event.origin === "douyin_sync")).toHaveLength(0);
    expect(nextState.events.find((event) => event.id === legacyEvent.id)).toEqual(legacyEvent);
    expect(nextState.lineups.filter((lineup) => lineup.eventId === legacyEvent.id)).toHaveLength(2);
  });

  it("does not revive an admin-suppressed lineup when suppression races the final save", async () => {
    await runWithSignatures(SAMPLE_ONE, SAMPLE_TWO);
    const entryId = getMockState().douyinScheduleEntries.find(
      (entry) => entry.city === "深圳" && entry.talentId === getMockState().talents[0].id
    )!.id;
    let intercepted = false;
    const repository = {
      ...mockRepository,
      async saveDouyinSyncState(input: Parameters<typeof mockRepository.saveDouyinSyncState>[0]) {
        if (!intercepted) {
          intercepted = true;
          await mockRepository.suppressDouyinScheduleEntries([entryId]);
        }
        await mockRepository.saveDouyinSyncState(input);
      }
    };

    await runDouyinSync({
      trigger: "cron",
      repository,
      config: CONFIG,
      now: new Date("2026-08-05T04:00:00.000Z"),
      fetchProfile: async (profileUrl) =>
        responseFor(profileUrl, profileUrl === PROFILE_ONE ? SAMPLE_ONE : SAMPLE_TWO)
    });

    const state = getMockState();
    expect(state.douyinScheduleEntries.find((entry) => entry.id === entryId)?.state).toBe("suppressed");
    expect(state.lineups.some((lineup) => lineup.source === `douyin:${entryId}`)).toBe(false);
  });

  it("isolates duplicate primary accounts instead of failing the whole batch write", async () => {
    const execution = await runDouyinSync({
      trigger: "cron",
      repository: mockRepository,
      config: CONFIG,
      now: NOW,
      fetchProfile: async (profileUrl) => ({
        ...responseFor(profileUrl, "8.8深圳金铲铲"),
        account: {
          ...responseFor(profileUrl, "").account,
          secUserId: "same-primary-account"
        }
      })
    });

    expect(execution.run).toMatchObject({ succeededCount: 1, failedCount: 1 });
    expect(execution.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "failed", code: "DUPLICATE_PRIMARY_ACCOUNT" })
      ])
    );
    expect(getMockState().douyinProfiles.filter((profile) => profile.secUserId === "same-primary-account")).toHaveLength(1);
  });

  it.skip("does not duplicate a talent lineup when an unnamed schedule gains a name", async () => {
    await runWithSignatures("8.8深圳", "");
    await runWithSignatures(
      "8.8深圳金铲铲",
      "",
      new Date("2026-08-05T04:00:00.000Z")
    );

    const state = getMockState();
    const event = state.events.find((item) => item.origin === "douyin_sync");
    expect(event?.name).toBe("金铲铲");
    expect(
      state.lineups.filter(
        (lineup) => lineup.eventId === event?.id && lineup.talentId === state.talents[0].id
      )
    ).toHaveLength(1);
  });

  it.skip("keeps manually merged named groups on one target while continuing source updates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      await runWithSignatures("8.8深圳金铲铲", "8.8深圳和平精英");
      const beforeMerge = getMockState();
      const sourceEvents = beforeMerge.events.filter((event) => event.origin === "douyin_sync");
      expect(sourceEvents).toHaveLength(2);

      const targetId = sourceEvents[0]!.id;
      const mergeResult = await saveEventBulk({
        action: "merge",
        ids: sourceEvents.map((event) => event.id),
        targetId
      });

      expect(mergeResult.succeededIds).toHaveLength(1);
      expect(getMockState().eventMergeRules).toHaveLength(1);
      expect(getMockState().events.find((event) => event.id === targetId)?.origin).toBe("douyin_merged");

      await runWithSignatures("8.9深圳金铲铲新", "8.9深圳和平精英新", new Date("2026-08-05T04:00:00.000Z"));

      const afterSync = getMockState();
      expect(afterSync.events.filter((event) => event.origin === "douyin_sync")).toHaveLength(0);
      expect(afterSync.events.find((event) => event.id === targetId)).toMatchObject({
        origin: "douyin_merged",
        startsAt: "2026-08-08T12:00:00.000Z",
        endsAt: "2026-08-09T12:00:00.000Z"
      });
      expect(afterSync.lineups.filter((lineup) => lineup.eventId === targetId)).toHaveLength(4);
      expect(afterSync.douyinScheduleEntries.filter((entry) => entry.eventId === targetId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventName: "金铲铲新", startsAt: "2026-08-09T12:00:00.000Z" }),
          expect.objectContaining({ eventName: "和平精英新", startsAt: "2026-08-09T12:00:00.000Z" })
        ])
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it.skip("does not let a stale sync snapshot overwrite editor-owned merged fields", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      await runWithSignatures("8.8深圳金铲铲", "8.8深圳和平精英");
      const beforeMerge = getMockState();
      const sourceEvents = beforeMerge.events.filter((event) => event.origin === "douyin_sync");
      const targetId = sourceEvents[0]!.id;
      await saveEventBulk({
        action: "merge",
        ids: sourceEvents.map((event) => event.id),
        targetId
      });

      const repository = {
        ...mockRepository,
        async saveDouyinSyncState(input: Parameters<typeof mockRepository.saveDouyinSyncState>[0]) {
          const state = getMockState();
          setMockState({
            ...state,
            events: state.events.map((event) =>
              event.id === targetId
                ? {
                    ...event,
                    name: "管理员改名",
                    aliases: ["编辑别名"],
                    searchKeywords: ["编辑关键词"],
                    venue: "管理员场馆",
                    note: "管理员备注"
                  }
                : event
            )
          });
          await mockRepository.saveDouyinSyncState(input);
        }
      };

      await runDouyinSync({
        trigger: "cron",
        repository,
        config: CONFIG,
        now: new Date("2026-08-05T04:00:00.000Z"),
        fetchProfile: async (profileUrl) =>
          responseFor(profileUrl, profileUrl === PROFILE_ONE ? "8.9深圳金铲铲新" : "8.9深圳和平精英新")
      });

      expect(getMockState().events.find((event) => event.id === targetId)).toMatchObject({
        name: "管理员改名",
        aliases: ["编辑别名"],
        searchKeywords: ["编辑关键词"],
        venue: "管理员场馆",
        note: "管理员备注",
        origin: "douyin_merged",
        startsAt: "2026-08-08T12:00:00.000Z",
        endsAt: "2026-08-09T12:00:00.000Z"
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
