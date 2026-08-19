import {
  getAutomaticLadder,
  getEventDetail,
  getHomepageCollections,
  getLocationItineraryIndex,
  getTalentDetail,
  listEventSummaries,
  listTalents,
  searchSite
} from "@/modules/domain/queries";
import { demoSeedState } from "@/modules/domain/seed";

describe("domain queries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sorts talents by nickname pinyin", () => {
    const allTalents = listTalents(demoSeedState);
    expect(allTalents.map((item) => item.id)).toEqual([
      "talent-qingluan",
      "talent-yanjin",
      "talent-yunmo",
      "talent-zhaoying"
    ]);

  });

  it("expands homepage featured talents to four cards", () => {
    const homepage = getHomepageCollections(demoSeedState);
    expect(homepage.featuredTalents).toHaveLength(4);
  });

  it("calculates editor-specific beauty averages and automatic tiers", () => {
    const state = structuredClone(demoSeedState);
    state.archives[0]!.entries[0]!.beautyTier = 4;
    state.archives.push({
      id: "archive-lin-second",
      editorId: "editor-lin",
      eventId: "event-echo-market",
      note: "",
      updatedAt: "2026-04-20T00:00:00.000Z",
      entries: [{ id: "archive-lin-second-entry", talentId: "talent-qingluan", entryDate: "2026-04-20T00:00:00.000Z", cosplayTitle: "测试", hasSharedPhoto: false, beautyTier: 2 }]
    });
    state.archives.push({
      id: "archive-lin-yanjin",
      editorId: "editor-lin",
      eventId: "event-echo-market",
      note: "",
      updatedAt: "2026-04-20T00:00:00.000Z",
      entries: [
        { id: "archive-lin-yanjin-first", talentId: "talent-yanjin", entryDate: "2026-04-19T00:00:00.000Z", cosplayTitle: "测试一", hasSharedPhoto: false, beautyTier: 2 },
        { id: "archive-lin-yanjin-second", talentId: "talent-yanjin", entryDate: "2026-04-20T00:00:00.000Z", cosplayTitle: "测试二", hasSharedPhoto: false, beautyTier: 3 }
      ]
    });

    const detail = getTalentDetail(state, "talent-qingluan");
    expect(detail?.editorSummaries.find((item) => item.editor.id === "editor-lin")?.averageBeautyTier).toBe(3);
    expect(detail?.beautyTierSeries.find((item) => item.editor.id === "editor-lin")?.points).toHaveLength(2);
    const automatic = getAutomaticLadder(state, "average-lin");
    expect(automatic.tiers.slice(0, 5).map((tier) => tier.name)).toEqual([
      "T0～T1", "T1～T2", "T2～T3", "T3～T4", "T4～T5"
    ]);
    expect(automatic.tiers.find((tier) => tier.name === "T2～T3")?.talents.map((item) => item.talent.id)).toEqual([
      "talent-yanjin", "talent-qingluan"
    ]);
    expect(automatic.tiers.find((tier) => tier.name === "T2～T3")?.talents[1]?.valueLabel).toBe("平均 T3.0");
  });

  it("projects current profile itineraries into province and city locations", () => {
    const state = structuredClone(demoSeedState);
    state.talents[0]!.links.push({ id: "douyin-test", label: "抖音主页", url: "https://www.douyin.com/user/test-profile" });
    state.douyinProfiles.push({
      talentId: state.talents[0]!.id,
      profileUrl: "https://www.douyin.com/user/test-profile",
      signatureRaw: "行程：8.18深圳测试活动 / 8.20惠州见面会",
      itineraryText: "行程：8.18深圳测试活动 / 8.20惠州见面会",
      followerCount: 120_000,
      fetchedAt: "2026-08-18T00:00:00.000Z",
      lastSuccessAt: "2026-08-18T00:00:00.000Z",
      linkExtractionStatus: "unavailable",
      parserVersion: "1"
    });

    const index = getLocationItineraryIndex(state, new Date("2026-08-18T04:00:00.000Z"));
    expect(index.talents[0]?.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ province: "广东省", city: "深圳" }),
      expect.objectContaining({ province: "广东省", city: "惠州" })
    ]));
  });

  it("counts homepage stats with recent talent updates and the rolling event window", () => {
    const state = structuredClone(demoSeedState);
    state.talents[0] = {
      ...state.talents[0]!,
      updatedAt: "2026-04-29T09:00:00.000Z"
    };
    state.talents[1] = {
      ...state.talents[1]!,
      updatedAt: "2026-04-22T09:00:00.000Z"
    };
    state.talents[2] = {
      ...state.talents[2]!,
      updatedAt: "2026-04-21T09:00:00.000Z"
    };
    state.talents[3] = {
      ...state.talents[3]!,
      updatedAt: "2026-04-10T09:00:00.000Z"
    };

    state.events = [
      {
        ...state.events[0]!,
        id: "event-recent-past",
        slug: "event-recent-past",
        name: "Recent Past Event",
        startsAt: "2026-04-25T12:00:00.000Z",
        endsAt: "2026-04-25T12:00:00.000Z",
        updatedAt: "2026-04-25T12:00:00.000Z"
      },
      {
        ...state.events[1]!,
        id: "event-ongoing",
        slug: "event-ongoing",
        name: "Ongoing Event",
        startsAt: "2026-04-28T12:00:00.000Z",
        endsAt: "2026-04-30T12:00:00.000Z",
        updatedAt: "2026-04-28T12:00:00.000Z"
      },
      {
        ...state.events[2]!,
        id: "event-future-window",
        slug: "event-future-window",
        name: "Future Window Event",
        startsAt: "2026-05-03T12:00:00.000Z",
        endsAt: "2026-05-03T12:00:00.000Z",
        updatedAt: "2026-04-29T12:00:00.000Z"
      },
      {
        ...state.events[0]!,
        id: "event-old-past",
        slug: "event-old-past",
        name: "Old Past Event",
        startsAt: "2026-04-15T12:00:00.000Z",
        endsAt: "2026-04-15T12:00:00.000Z",
        updatedAt: "2026-04-15T12:00:00.000Z"
      }
    ];

    const homepage = getHomepageCollections(state, new Date("2026-04-29T12:00:00.000Z"));

    expect(homepage.stats.recentTalentCount).toBe(2);
    expect(homepage.stats.recentEventCount).toBe(3);
  });

  it("builds bio preview and future event hint from the largest future lineup, breaking ties by earlier date", () => {
    const state = structuredClone(demoSeedState);
    state.talents[0] = {
      ...state.talents[0]!,
      bio: "第一行简介\n第二行简介"
    };
    state.events.push(
      {
        id: "event-future-max-late",
        slug: "event-future-max-late",
        name: "Future Max Late",
        aliases: [],
        searchKeywords: [],
        startsAt: "2026-05-12T12:00:00.000Z",
        endsAt: "2026-05-12T12:00:00.000Z",
        city: "杭州",
        venue: "North Hall",
        status: "future",
        note: "",
        updatedAt: "2026-04-12T00:00:00.000Z"
      },
      {
        id: "event-future-max-early",
        slug: "event-future-max-early",
        name: "Future Max Early",
        aliases: [],
        searchKeywords: [],
        startsAt: "2026-05-10T12:00:00.000Z",
        endsAt: "2026-05-10T12:00:00.000Z",
        city: "苏州",
        venue: "River Stage",
        status: "future",
        note: "",
        updatedAt: "2026-04-12T00:00:00.000Z"
      }
    );
    state.lineups.push(
      {
        id: "lineup-future-max-late-1",
        eventId: "event-future-max-late",
        talentId: "talent-qingluan",
        lineupDate: "2026-05-12T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: ""
      },
      {
        id: "lineup-future-max-late-2",
        eventId: "event-future-max-late",
        talentId: "talent-yunmo",
        lineupDate: "2026-05-12T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: ""
      },
      {
        id: "lineup-future-max-late-3",
        eventId: "event-future-max-late",
        talentId: "talent-yanjin",
        lineupDate: "2026-05-12T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: ""
      },
      {
        id: "lineup-future-max-early-1",
        eventId: "event-future-max-early",
        talentId: "talent-qingluan",
        lineupDate: "2026-05-10T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: ""
      },
      {
        id: "lineup-future-max-early-2",
        eventId: "event-future-max-early",
        talentId: "talent-yunmo",
        lineupDate: "2026-05-10T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: ""
      },
      {
        id: "lineup-future-max-early-3",
        eventId: "event-future-max-early",
        talentId: "talent-yanjin",
        lineupDate: "2026-05-10T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: ""
      }
    );

    const qingluan = listTalents(state).find((item) => item.id === "talent-qingluan");

    expect(qingluan?.bioPreviewLine).toBe("第一行简介");
    expect(qingluan?.futureLocationHint).toBe("Future Max Early");
  });

  it("aggregates talent editor summary statistics", () => {
    const detail = getTalentDetail(demoSeedState, "talent-qingluan");
    expect(detail).not.toBeNull();
    expect(detail?.editorSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          seenCount: 1,
          sharedPhotoCount: 1
        })
      ])
    );
  });

  it("matches detail routes by id when slugs are blank", () => {
    expect(getTalentDetail(demoSeedState, "talent-qingluan")?.talent.id).toBe("talent-qingluan");
    expect(getEventDetail(demoSeedState, "event-mist-lantern")?.event.id).toBe("event-mist-lantern");
  });

  it("resolves percent-encoded Unicode slugs for talent and event detail pages", () => {
    const state = structuredClone(demoSeedState);
    state.talents.push({
      id: "talent-unicode-slug",
      slug: "雁锦",
      nickname: "雁锦",
      bio: "",
      aliases: [],
      searchKeywords: ["雁锦"],
      coverAssetId: null,
      links: [],
      representations: [],
      updatedAt: "2026-04-18T12:00:00.000Z"
    });
    state.events.push({
      id: "event-unicode-slug",
      slug: "萤火虫",
      name: "萤火虫",
      aliases: [],
      searchKeywords: ["萤火虫"],
      startsAt: "2026-04-18T12:00:00.000Z",
      endsAt: "2026-04-18T12:00:00.000Z",
      city: "",
      venue: "",
      status: "future",
      note: "",
      updatedAt: "2026-04-18T12:05:00.000Z"
    });

    expect(getTalentDetail(state, encodeURIComponent("雁锦"))?.talent.id).toBe("talent-unicode-slug");
    expect(getEventDetail(state, encodeURIComponent("萤火虫"))?.event.id).toBe("event-unicode-slug");
  });

  it("hydrates event archive layers", () => {
    const detail = getEventDetail(demoSeedState, "event-mist-lantern");
    expect(detail).not.toBeNull();
    expect(detail?.archives).toHaveLength(2);
    expect(detail?.archives[0]?.entries[0]?.sceneAsset?.url).toContain("/media/");
  });

  it("keeps archives grouped by editor and then date, with lineup-date backfill", () => {
    const state = structuredClone(demoSeedState);
    state.events.push({
      id: "event-archive-grouped",
      slug: "event-archive-grouped",
      name: "Archive Grouped Event",
      aliases: [],
      searchKeywords: [],
      startsAt: "2026-06-01T12:00:00.000Z",
      endsAt: "2026-06-02T12:00:00.000Z",
      city: "",
      venue: "",
      status: "future",
      note: "",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });
    state.lineups.push(
      {
        id: "lineup-archive-1",
        eventId: "event-archive-grouped",
        talentId: "talent-qingluan",
        lineupDate: "2026-06-01T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: ""
      },
      {
        id: "lineup-archive-2",
        eventId: "event-archive-grouped",
        talentId: "talent-yanjin",
        lineupDate: "2026-06-02T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: ""
      }
    );
    state.archives.push({
      id: "archive-grouped",
      editorId: "editor-lin",
      eventId: "event-archive-grouped",
      note: "archive grouped",
      updatedAt: "2026-04-11T01:00:00.000Z",
      entries: [
        {
          id: "archive-grouped-entry-1",
          talentId: "talent-qingluan",
          entryDate: null,
          sceneAssetId: "asset-scene-1",
          sharedPhotoAssetId: null,
          cosplayTitle: "Role One",
          hasSharedPhoto: false
        },
        {
          id: "archive-grouped-entry-2",
          talentId: "talent-yanjin",
          entryDate: "2026-06-02T12:00:00.000Z",
          sceneAssetId: "asset-scene-2",
          sharedPhotoAssetId: null,
          cosplayTitle: "Role Two",
          hasSharedPhoto: false
        }
      ]
    });

    const detail = getEventDetail(state, "event-archive-grouped");

    expect(detail?.archives).toHaveLength(1);
    expect(detail?.archives[0]?.entryGroups.map((group) => group.date)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(detail?.archives[0]?.entryGroups[0]?.items[0]?.entry.entryDate).toBe("2026-06-01T12:00:00.000Z");
  });

  it("groups multi-day lineups in ascending date order and backfills missing lineup dates", () => {
    const state = structuredClone(demoSeedState);
    state.events.push({
      id: "event-grouped",
      slug: "event-grouped",
      name: "Grouped Event",
      aliases: [],
      searchKeywords: [],
      startsAt: "2026-06-01T12:00:00.000Z",
      endsAt: "2026-06-02T12:00:00.000Z",
      city: "",
      venue: "",
      status: "future",
      note: "",
      updatedAt: "2026-04-11T00:00:00.000Z"
    });
    state.lineups.push(
      {
        id: "lineup-grouped-2",
        eventId: "event-grouped",
        talentId: "talent-yanjin",
        lineupDate: "2026-06-02T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: ""
      },
      {
        id: "lineup-grouped-1",
        eventId: "event-grouped",
        talentId: "talent-qingluan",
        lineupDate: null,
        status: "confirmed",
        source: "",
        note: ""
      }
    );

    const summary = listEventSummaries(state, { query: "Grouped Event" })[0];
    const detail = getEventDetail(state, "event-grouped");

    expect(summary?.lineupGroups.map((group) => group.date)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(summary?.lineupGroups[0]?.items[0]?.talent.id).toBe("talent-qingluan");
    expect(detail?.lineupGroups.map((group) => group.date)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(detail?.lineups[0]?.lineup.lineupDate).toBe("2026-06-01T12:00:00.000Z");
  });

  it("matches talent aliases in relevance search", () => {
    const results = listTalents(demoSeedState, { query: "Qingluan", sort: "relevance" });
    expect(results[0]?.id).toBe("talent-qingluan");
  });

  it("matches lineup talent names in event search", () => {
    const results = listEventSummaries(demoSeedState, { query: "Yanjin", sort: "relevance" });
    expect(results.map((item) => item.event.id)).toContain("event-echo-market");
  });

  it("filters events by a single date across ranges, single-side dates, and blank dates", () => {
    const state = structuredClone(demoSeedState);
    state.events.push(
      {
        id: "event-range",
        slug: "event-range",
        name: "Range Event",
        aliases: [],
        searchKeywords: [],
        startsAt: "2026-06-01T12:00:00.000Z",
        endsAt: "2026-06-03T12:00:00.000Z",
        city: "",
        venue: "",
        status: "future",
        note: "",
        updatedAt: "2026-04-10T00:00:00.000Z"
      },
      {
        id: "event-start-only",
        slug: "event-start-only",
        name: "Start Only",
        aliases: [],
        searchKeywords: [],
        startsAt: "2026-06-02T12:00:00.000Z",
        endsAt: null,
        city: "",
        venue: "",
        status: "future",
        note: "",
        updatedAt: "2026-04-10T00:00:00.000Z"
      },
      {
        id: "event-end-only",
        slug: "event-end-only",
        name: "End Only",
        aliases: [],
        searchKeywords: [],
        startsAt: null,
        endsAt: "2026-06-02T12:00:00.000Z",
        city: "",
        venue: "",
        status: "future",
        note: "",
        updatedAt: "2026-04-10T00:00:00.000Z"
      },
      {
        id: "event-no-date",
        slug: "event-no-date",
        name: "No Date",
        aliases: [],
        searchKeywords: [],
        startsAt: null,
        endsAt: null,
        city: "",
        venue: "",
        status: "future",
        note: "",
        updatedAt: "2026-04-10T00:00:00.000Z"
      }
    );

    const results = listEventSummaries(state, { date: "2026-06-02" });
    expect(results.map((item) => item.event.id)).toEqual(
      expect.arrayContaining(["event-range", "event-start-only", "event-end-only"])
    );
    expect(results.map((item) => item.event.id)).not.toContain("event-no-date");
  });

  it("builds related discovery sections for detail pages", () => {
    const talentDetail = getTalentDetail(demoSeedState, "talent-qingluan");
    const eventDetail = getEventDetail(demoSeedState, "event-mist-lantern");
    expect(talentDetail?.relatedTalents.length).toBeGreaterThan(0);
    expect(eventDetail?.relatedEvents.length).toBeGreaterThan(0);
  });

  it("derives related-event copy from dates when stored status is stale", () => {
    const state = structuredClone(demoSeedState);
    const event = state.events.find((item) => item.id === "event-spring-gala");
    if (!event) throw new Error("Missing event-spring-gala fixture");
    event.startsAt = "2026-05-15T12:00:00.000Z";
    event.endsAt = "2026-05-16T12:00:00.000Z";
    event.status = "past";

    const detail = getTalentDetail(state, "talent-qingluan");
    expect(detail?.relatedEvents.find((item) => item.event.event.id === event.id)?.reason).toBe("该达人即将参与");
  });

  it("keeps public read models stable for empty cover, empty dates, and empty public profile fields", () => {
    const state = structuredClone(demoSeedState);
    state.talents[0] = {
      ...state.talents[0],
      coverAssetId: null,
      bio: "",
      aliases: [],
      links: []
    };
    state.events[0] = {
      ...state.events[0],
      startsAt: null,
      endsAt: null,
      city: "",
      venue: "",
      note: ""
    };

    expect(() => getTalentDetail(state, state.talents[0]!.id)).not.toThrow();
    expect(() => getEventDetail(state, state.events[0]!.id)).not.toThrow();
  });

  it("scopes search results", () => {
    const result = searchSite(demoSeedState, "Qingluan", "events");
    expect(result.talents).toHaveLength(0);
    expect(result.events.length).toBeGreaterThan(0);
  });

  it("filters talents by whether they have a future schedule", () => {
    const filtered = listTalents(demoSeedState, { hasSchedule: true });
    expect(filtered.map((item) => item.id)).toEqual(["talent-qingluan", "talent-zhaoying"]);
  });

  it("filters events by editor archive presence", () => {
    const filtered = listEventSummaries(demoSeedState, { editorId: "editor-lin" });
    expect(filtered.map((item) => item.event.id)).toContain("event-mist-lantern");
    expect(filtered.map((item) => item.event.id)).not.toContain("event-spring-gala");
  });

  it("keeps event archive entries even when the scene asset is missing", () => {
    const state = structuredClone(demoSeedState);
    state.archives[0]!.entries[0] = {
      ...state.archives[0]!.entries[0]!,
      sceneAssetId: null
    };

    const detail = getEventDetail(state, "event-mist-lantern");
    expect(detail?.archives[0]?.entries[0]?.sceneAsset).toBeNull();
  });

  it("builds talent timeline details from lineup notes and archive roles", () => {
    const detail = getTalentDetail(demoSeedState, "talent-qingluan");
    const futureNote = demoSeedState.lineups.find((lineup) => lineup.id === "lineup-1")?.note ?? "";
    const archiveRole =
      demoSeedState.archives.find((archive) => archive.id === "archive-lin-mist")?.entries[0]?.cosplayTitle ?? "";

    expect(detail?.futureEvents[0]?.detailText).toContain(futureNote);
    expect(detail?.pastEvents[0]?.detailText).toContain(archiveRole);
  });

  it("aggregates talent field records across editors for the same event day", () => {
    const state = structuredClone(demoSeedState);
    state.events.push({
      id: "event-field-record-shared-day",
      slug: "event-field-record-shared-day",
      name: "Field Record Shared Day",
      aliases: [],
      searchKeywords: [],
      startsAt: "2026-06-02T12:00:00.000Z",
      endsAt: "2026-06-02T12:00:00.000Z",
      city: "Shanghai",
      venue: "River Hall",
      status: "past",
      note: "",
      updatedAt: "2026-06-03T00:00:00.000Z"
    });
    state.archives.push(
      {
        id: "archive-field-record-shared-day-lin",
        editorId: "editor-lin",
        eventId: "event-field-record-shared-day",
        note: "",
        updatedAt: "2026-06-03T08:00:00.000Z",
        entries: [
          {
            id: "archive-field-record-shared-day-lin-entry-1",
            talentId: "talent-yunmo",
            entryDate: "2026-06-02T12:00:00.000Z",
            sceneAssetId: null,
            sharedPhotoAssetId: "asset-shared-1",
            cosplayTitle: "Role Alpha",
            hasSharedPhoto: false
          }
        ]
      },
      {
        id: "archive-field-record-shared-day-yu",
        editorId: "editor-yu",
        eventId: "event-field-record-shared-day",
        note: "",
        updatedAt: "2026-06-03T10:00:00.000Z",
        entries: [
          {
            id: "archive-field-record-shared-day-yu-entry-1",
            talentId: "talent-yunmo",
            entryDate: "2026-06-02T12:00:00.000Z",
            sceneAssetId: "asset-scene-2",
            sharedPhotoAssetId: null,
            cosplayTitle: "Role Beta",
            hasSharedPhoto: false
          }
        ]
      }
    );

    const detail = getTalentDetail(state, "talent-yunmo");

    expect(detail?.fieldRecords).toHaveLength(1);
    expect(detail?.fieldRecords[0]).toEqual(
      expect.objectContaining({
        event: expect.objectContaining({ id: "event-field-record-shared-day" }),
        recordDate: "2026-06-02T12:00:00.000Z",
        roleSummary: "Role Beta / Role Alpha",
        locationSummary: "Shanghai / River Hall",
        asset: expect.objectContaining({ id: "asset-scene-2" })
      })
    );
  });

  it("splits multi-day talent field records by day, deduplicates roles, and sorts newest first", () => {
    const state = structuredClone(demoSeedState);
    state.events.push({
      id: "event-field-record-multi-day",
      slug: "event-field-record-multi-day",
      name: "Field Record Multi Day",
      aliases: [],
      searchKeywords: [],
      startsAt: "2026-06-01T12:00:00.000Z",
      endsAt: "2026-06-02T12:00:00.000Z",
      city: "Nanjing",
      venue: "North Stage",
      status: "past",
      note: "",
      updatedAt: "2026-06-03T00:00:00.000Z"
    });
    state.archives.push(
      {
        id: "archive-field-record-multi-day-lin",
        editorId: "editor-lin",
        eventId: "event-field-record-multi-day",
        note: "",
        updatedAt: "2026-06-03T08:00:00.000Z",
        entries: [
          {
            id: "archive-field-record-multi-day-lin-entry-1",
            talentId: "talent-zhaoying",
            entryDate: "2026-06-01T12:00:00.000Z",
            sceneAssetId: null,
            sharedPhotoAssetId: null,
            cosplayTitle: "Day One Role",
            hasSharedPhoto: false
          },
          {
            id: "archive-field-record-multi-day-lin-entry-2",
            talentId: "talent-zhaoying",
            entryDate: "2026-06-02T12:00:00.000Z",
            sceneAssetId: null,
            sharedPhotoAssetId: null,
            cosplayTitle: "Day Two Role",
            hasSharedPhoto: false
          }
        ]
      },
      {
        id: "archive-field-record-multi-day-yu",
        editorId: "editor-yu",
        eventId: "event-field-record-multi-day",
        note: "",
        updatedAt: "2026-06-03T09:00:00.000Z",
        entries: [
          {
            id: "archive-field-record-multi-day-yu-entry-1",
            talentId: "talent-zhaoying",
            entryDate: "2026-06-02T12:00:00.000Z",
            sceneAssetId: null,
            sharedPhotoAssetId: null,
            cosplayTitle: "Day Two Role",
            hasSharedPhoto: false
          },
          {
            id: "archive-field-record-multi-day-yu-entry-2",
            talentId: "talent-zhaoying",
            entryDate: "2026-06-02T12:00:00.000Z",
            sceneAssetId: null,
            sharedPhotoAssetId: null,
            cosplayTitle: "Side Quest",
            hasSharedPhoto: false
          }
        ]
      }
    );

    const detail = getTalentDetail(state, "talent-zhaoying");

    expect(detail?.fieldRecords.map((item) => item.recordDate)).toEqual([
      "2026-06-02T12:00:00.000Z",
      "2026-06-01T12:00:00.000Z"
    ]);
    expect(detail?.fieldRecords[0]?.roleSummary).toBe("Day Two Role / Side Quest");
    expect(detail?.fieldRecords[1]?.roleSummary).toBe("Day One Role");
  });

  it("falls back to a placeholder location summary for talent field records when city and venue are blank", () => {
    const state = structuredClone(demoSeedState);
    state.events.push({
      id: "event-field-record-no-location",
      slug: "event-field-record-no-location",
      name: "Field Record No Location",
      aliases: [],
      searchKeywords: [],
      startsAt: "2026-06-04T12:00:00.000Z",
      endsAt: "2026-06-04T12:00:00.000Z",
      city: "",
      venue: "",
      status: "past",
      note: "",
      updatedAt: "2026-06-05T00:00:00.000Z"
    });
    state.archives.push({
      id: "archive-field-record-no-location",
      editorId: "editor-lin",
      eventId: "event-field-record-no-location",
      note: "",
      updatedAt: "2026-06-05T08:00:00.000Z",
      entries: [
        {
          id: "archive-field-record-no-location-entry-1",
          talentId: "talent-qingluan",
          entryDate: "2026-06-04T12:00:00.000Z",
          sceneAssetId: null,
          sharedPhotoAssetId: null,
          cosplayTitle: "Fallback Role",
          hasSharedPhoto: false
        }
      ]
    });

    const detail = getTalentDetail(state, "talent-qingluan");
    expect(detail?.fieldRecords[0]?.locationSummary).toBe("地点待定");
  });

  it("increments the matching editor record count when a talent is added to another archive", () => {
    const state = structuredClone(demoSeedState);
    const baselineDetail = getTalentDetail(state, "talent-qingluan");
    const baselineLinCount =
      baselineDetail?.editorSummaries.find((summary) => summary.editor.id === "editor-lin")?.seenCount ?? 0;

    state.archives.push({
      id: "archive-lin-echo",
      editorId: "editor-lin",
      eventId: "event-echo-market",
      note: "New active-event archive",
      updatedAt: "2026-04-20T08:00:00.000Z",
      entries: [
        {
          id: "archive-lin-echo-entry-1",
          talentId: "talent-qingluan",
          entryDate: "2026-04-20T12:00:00.000Z",
          sceneAssetId: "asset-scene-1",
          sharedPhotoAssetId: null,
          cosplayTitle: "Echo Role",
          hasSharedPhoto: false
        }
      ]
    });

    const detail = getTalentDetail(state, "talent-qingluan");
    const linCount = detail?.editorSummaries.find((summary) => summary.editor.id === "editor-lin")?.seenCount;

    expect(linCount).toBe(baselineLinCount + 1);
  });

  it("keeps past lineup talents in history once a past multi-day event has any archive entry", () => {
    const state = structuredClone(demoSeedState);
    state.events.push({
      id: "event-partial-archive-history",
      slug: "event-partial-archive-history",
      name: "Partial Archive History",
      aliases: [],
      searchKeywords: [],
      startsAt: "2026-03-01T12:00:00.000Z",
      endsAt: "2026-03-02T12:00:00.000Z",
      city: "上海",
      venue: "Expo Center",
      status: "future",
      note: "",
      updatedAt: "2026-03-03T00:00:00.000Z"
    });
    state.lineups.push(
      {
        id: "lineup-partial-archive-1",
        eventId: "event-partial-archive-history",
        talentId: "talent-qingluan",
        lineupDate: "2026-03-01T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: "Day 1"
      },
      {
        id: "lineup-partial-archive-2",
        eventId: "event-partial-archive-history",
        talentId: "talent-yanjin",
        lineupDate: "2026-03-02T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: "Day 2"
      }
    );
    state.archives.push({
      id: "archive-partial-archive-history",
      editorId: "editor-lin",
      eventId: "event-partial-archive-history",
      note: "Only day one is archived",
      updatedAt: "2026-03-03T00:00:00.000Z",
      entries: [
        {
          id: "archive-partial-archive-entry-1",
          talentId: "talent-qingluan",
          entryDate: "2026-03-01T12:00:00.000Z",
          sceneAssetId: "asset-scene-1",
          sharedPhotoAssetId: null,
          cosplayTitle: "Day One Role",
          hasSharedPhoto: false
        }
      ]
    });

    const yanjinDetail = getTalentDetail(state, "talent-yanjin");

    expect(yanjinDetail?.pastEvents.map((item) => item.event.id)).toContain("event-partial-archive-history");
    expect(
      yanjinDetail?.pastEvents.find((item) => item.event.id === "event-partial-archive-history")?.detailText ?? null
    ).toBeNull();
  });

  it("excludes past events without archive entries from talent history", () => {
    const state = structuredClone(demoSeedState);
    state.events.push({
      id: "event-past-no-archive",
      slug: "event-past-no-archive",
      name: "Past Without Archive",
      aliases: [],
      searchKeywords: [],
      startsAt: "2026-03-01T12:00:00.000Z",
      endsAt: "2026-03-01T12:00:00.000Z",
      city: "",
      venue: "",
      status: "future",
      note: "",
      updatedAt: "2026-03-02T00:00:00.000Z"
    });
    state.lineups.push({
      id: "lineup-past-no-archive",
      eventId: "event-past-no-archive",
      talentId: "talent-qingluan",
      lineupDate: "2026-03-01T12:00:00.000Z",
      status: "confirmed",
      source: "",
      note: "Past lineup only"
    });

    const detail = getTalentDetail(state, "talent-qingluan");
    expect(detail?.pastEvents.map((item) => item.event.id)).not.toContain("event-past-no-archive");
  });
});
