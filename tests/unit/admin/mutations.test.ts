import {
  removeEvent,
  removeTalent,
  saveArchive,
  saveAsset,
  saveEditorName,
  saveEvent,
  saveEventBulk,
  saveLadder,
  saveTalent,
  saveTalentBulk
} from "@/modules/admin/mutations";
import { demoSeedState } from "@/modules/domain/seed";
import { getMockState, setMockState } from "@/modules/repository/mock-store";

describe("admin mutations", () => {
  beforeEach(() => {
    setMockState(structuredClone(demoSeedState));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-17T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cascades deleting a referenced talent and removes linked references", async () => {
    await removeTalent("talent-qingluan");

    const state = getMockState();
    expect(state.talents.some((talent) => talent.id === "talent-qingluan")).toBe(false);
    expect(state.lineups.some((lineup) => lineup.talentId === "talent-qingluan")).toBe(false);
    expect(state.archives.some((archive) => archive.entries.some((entry) => entry.talentId === "talent-qingluan"))).toBe(
      false
    );
    expect(
      state.ladders.some((ladder) => ladder.tiers.some((tier) => tier.talentIds.includes("talent-qingluan")))
    ).toBe(false);
    expect(state.assets.some((asset) => asset.id === "asset-cover-qingluan")).toBe(false);
  });

  it("cascades deleting an event with archives and archive assets", async () => {
    await removeEvent("event-mist-lantern");

    const state = getMockState();
    expect(state.events.some((event) => event.id === "event-mist-lantern")).toBe(false);
    expect(state.lineups.some((lineup) => lineup.eventId === "event-mist-lantern")).toBe(false);
    expect(state.archives.some((archive) => archive.eventId === "event-mist-lantern")).toBe(false);
    expect(state.assets.some((asset) => asset.id === "asset-scene-1")).toBe(false);
    expect(state.assets.some((asset) => asset.id === "asset-scene-2")).toBe(false);
    expect(state.assets.some((asset) => asset.id === "asset-shared-1")).toBe(false);
  });

  it("creates a new talent without forcing a slug and still derives search keywords", async () => {
    const saved = await saveTalent({
      nickname: "Star Lume",
      bio: "",
      aliases: ["Star Lume CN", "Lume"],
      coverAssetId: null,
      links: [],
      representations: []
    });

    expect(saved.slug).toBeNull();
    expect(saved.searchKeywords).toEqual(expect.arrayContaining(["Star Lume", "Star Lume CN", "Lume"]));
    expect(saved.coverAssetId).toBeNull();
  });

  it("rejects creating a new talent with a duplicate nickname", async () => {
    await expect(
      saveTalent({
        nickname: demoSeedState.talents[0]?.nickname ?? "Qingluan",
        bio: "",
        aliases: [],
        coverAssetId: null,
        links: [],
        representations: []
      })
    ).rejects.toThrow("已存在同名达人，请修改昵称后再保存。");
  });

  it("rejects whitespace-only required names", async () => {
    await expect(
      saveTalent({
        nickname: "   ",
        bio: "",
        aliases: [],
        coverAssetId: null,
        links: [],
        representations: []
      })
    ).rejects.toThrow("达人昵称不能为空。");

    await expect(
      saveEvent({
        name: "  ",
        startsAt: null,
        endsAt: null,
        city: "",
        venue: "",
        note: "",
        lineups: []
      })
    ).rejects.toThrow("活动名称不能为空。");

    await expect(
      saveLadder("editor-lin", {
        id: "ladder-lin",
        subtitle: "   ",
        tiers: []
      })
    ).rejects.toThrow("天梯副标题不能为空。");

    await expect(
      saveLadder("editor-lin", {
        id: "ladder-lin",
        subtitle: "有效副标题",
        tiers: [
          {
            id: "blank-tier",
            name: "   ",
            order: 0,
            talentIds: []
          }
        ]
      })
    ).rejects.toThrow("梯度名称不能为空。");

    await expect(
      saveAsset({
        kind: "talent_cover",
        title: "   ",
        alt: "有效替代文本",
        url: "https://example.com/blank-title.jpg",
        width: 300,
        height: 400,
        objectKey: null
      })
    ).rejects.toThrow("图片标题不能为空。");

    await expect(
      saveAsset({
        kind: "talent_cover",
        title: "有效标题",
        alt: "   ",
        url: "https://example.com/blank-alt.jpg",
        width: 300,
        height: 400,
        objectKey: null
      })
    ).rejects.toThrow("图片替代文本不能为空。");
  });

  it("rejects impossible event dates and reversed ranges", async () => {
    await expect(
      saveEvent({
        name: "Impossible Date Event",
        startsAt: "2026-02-31",
        endsAt: "2026-03-01",
        city: "",
        venue: "",
        note: "",
        lineups: []
      })
    ).rejects.toThrow("请输入有效的日期。");

    await expect(
      saveEvent({
        name: "Reversed Date Event",
        startsAt: "2026-06-02",
        endsAt: "2026-06-01",
        city: "",
        venue: "",
        note: "",
        lineups: []
      })
    ).rejects.toThrow("活动结束日期不能早于开始日期。");
  });

  it("allows saving an event with blank dates and optional fields", async () => {
    const saved = await saveEvent({
      name: "Blank Event",
      startsAt: null,
      endsAt: null,
      city: "",
      venue: "",
      status: "future",
      note: "",
      lineups: []
    });

    expect(saved.slug).toBeNull();
    expect(saved.startsAt).toBeNull();
    expect(saved.endsAt).toBeNull();
  });

  it("requires lineup dates for multi-day events", async () => {
    await expect(
      saveEvent({
        name: "Two Day Event",
        startsAt: "2026-06-01",
        endsAt: "2026-06-02",
        city: "",
        venue: "",
        status: "future",
        note: "",
        lineups: [
          {
            talentId: "talent-qingluan",
            lineupDate: null,
            status: "confirmed",
            source: "",
            note: ""
          }
        ]
      })
    ).rejects.toThrow("多日活动的每条达人阵容都必须选择所属日期。");
  });

  it("rejects lineup dates outside the event range", async () => {
    await expect(
      saveEvent({
        name: "Two Day Event",
        startsAt: "2026-06-01",
        endsAt: "2026-06-02",
        city: "",
        venue: "",
        status: "future",
        note: "",
        lineups: [
          {
            talentId: "talent-qingluan",
            lineupDate: "2026-06-05",
            status: "confirmed",
            source: "",
            note: ""
          }
        ]
      })
    ).rejects.toThrow("达人阵容的所属日期必须落在活动开始和结束日期之间。");
  });

  it("normalizes lineup status and clears lineup sources", async () => {
    const saved = await saveEvent({
      name: "Source Normalization Event",
      startsAt: "2026-06-01",
      endsAt: "2026-06-01",
      city: "",
      venue: "",
      status: "future",
      note: "",
      lineups: [
        {
          talentId: "talent-qingluan",
          lineupDate: "2026-06-01",
          status: "confirmed",
          source: "Official announcement",
          note: "Confirmed note"
        },
        {
          talentId: "talent-yunmo",
          lineupDate: "2026-06-01",
          status: "pending",
          source: "Live hint",
          note: "Pending note"
        }
      ]
    });

    const savedLineups = getMockState().lineups.filter((lineup) => lineup.eventId === saved.id);
    expect(savedLineups.find((lineup) => lineup.talentId === "talent-qingluan")?.source).toBe("");
    expect(savedLineups.find((lineup) => lineup.talentId === "talent-yunmo")?.source).toBe("");
    expect(savedLineups.every((lineup) => lineup.status === "confirmed")).toBe(true);
  });

  it("converts an edited automatic lineup to manual and suppresses its source", async () => {
    const state = getMockState();
    state.events.push({
      id: "event-douyin-edit",
      slug: null,
      name: "金铲铲",
      aliases: [],
      searchKeywords: ["金铲铲", "深圳"],
      startsAt: "2026-06-01T12:00:00.000Z",
      endsAt: "2026-06-01T12:00:00.000Z",
      city: "深圳",
      venue: "",
      status: "future",
      note: "",
      updatedAt: "2026-04-01T00:00:00.000Z",
      origin: "douyin_sync"
    });
    state.lineups.push({
      id: "lineup-douyin-edit",
      eventId: "event-douyin-edit",
      talentId: "talent-qingluan",
      lineupDate: "2026-06-01T12:00:00.000Z",
      status: "confirmed",
      source: "douyin:schedule-douyin-edit",
      note: ""
    });
    state.douyinScheduleEntries.push({
      id: "schedule-douyin-edit",
      talentId: "talent-qingluan",
      fingerprint: "fingerprint-douyin-edit",
      rawText: "6.1深圳金铲铲",
      startsAt: "2026-06-01T12:00:00.000Z",
      endsAt: "2026-06-01T12:00:00.000Z",
      city: "深圳",
      eventName: "金铲铲",
      eventId: "event-douyin-edit",
      firstSeenAt: "2026-04-01T00:00:00.000Z",
      lastSeenAt: "2026-04-01T00:00:00.000Z",
      consecutiveMissingCount: 0,
      state: "active",
      parserVersion: "1"
    });
    setMockState(state);

    await saveEvent({
      id: "event-douyin-edit",
      name: "金铲铲",
      startsAt: "2026-06-01",
      endsAt: "2026-06-01",
      city: "深圳",
      venue: "",
      note: "",
      lineups: [
        {
          id: "lineup-douyin-edit",
          talentId: "talent-yunmo",
          lineupDate: "2026-06-01",
          status: "confirmed",
          source: "",
          note: "人工调整"
        }
      ]
    });

    const savedState = getMockState();
    expect(savedState.events.find((event) => event.id === "event-douyin-edit")?.origin).toBe("manual");
    expect(savedState.lineups.find((lineup) => lineup.id === "lineup-douyin-edit")?.source).toBe("");
    expect(savedState.douyinScheduleEntries.find((entry) => entry.id === "schedule-douyin-edit")?.state).toBe("suppressed");
  });

  it("requires archive entry dates for multi-day events", async () => {
    await expect(
      saveArchive("editor-lin", {
        eventId: "event-spring-gala",
        note: "archive note",
        entries: [
          {
            talentId: "talent-qingluan",
            entryDate: null,
            sceneAssetId: "asset-scene-1",
            sharedPhotoAssetId: null,
            cosplayTitle: "Role One",
            hasSharedPhoto: false
          }
        ]
      })
    ).rejects.toThrow("多日活动的每条现场档案记录都必须选择所属日期。");
  });

  it("allows archive role text to be blank", async () => {
    const saved = await saveArchive("editor-lin", {
      eventId: "event-mist-lantern",
      note: "blank role archive",
      entries: [
        {
          talentId: "talent-qingluan",
          entryDate: "2026-03-22",
          sceneAssetId: "asset-scene-1",
          sharedPhotoAssetId: null,
          cosplayTitle: "",
          hasSharedPhoto: false
        }
      ]
    });

    expect(saved.entries[0]?.cosplayTitle).toBe("");
  });

  it("rejects archive entry dates outside the event range", async () => {
    await expect(
      saveArchive("editor-lin", {
        eventId: "event-spring-gala",
        note: "archive note",
        entries: [
          {
            talentId: "talent-qingluan",
            entryDate: "2026-06-06",
            sceneAssetId: "asset-scene-1",
            sharedPhotoAssetId: null,
            cosplayTitle: "Role One",
            hasSharedPhoto: false
          }
        ]
      })
    ).rejects.toThrow("现场档案记录的所属日期必须落在活动开始和结束日期之间。");
  });

  it("rejects archive entries for talents outside the event lineup", async () => {
    await expect(
      saveArchive("editor-lin", {
        eventId: "event-spring-gala",
        note: "archive note",
        entries: [
          {
            talentId: "talent-yunmo",
            entryDate: "2026-05-15",
            sceneAssetId: "asset-scene-1",
            sharedPhotoAssetId: null,
            cosplayTitle: "Role One",
            hasSharedPhoto: false
          }
        ]
      })
    ).rejects.toThrow("现场档案只能选择已在当前活动阵容里的达人。");
  });

  it("rejects archive entry dates that do not match the talent lineup date", async () => {
    await expect(
      saveArchive("editor-lin", {
        eventId: "event-spring-gala",
        note: "archive note",
        entries: [
          {
            talentId: "talent-zhaoying",
            entryDate: "2026-05-15",
            sceneAssetId: "asset-scene-1",
            sharedPhotoAssetId: null,
            cosplayTitle: "Role One",
            hasSharedPhoto: false
          }
        ]
      })
    ).rejects.toThrow("现场档案记录的所属日期必须匹配该达人在活动阵容中的日期。");
  });

  it("ignores blank representation rows when saving a talent", async () => {
    const saved = await saveTalent({
      nickname: "No Rep Talent",
      bio: "",
      aliases: [],
      coverAssetId: null,
      links: [],
      representations: [
        {
          title: "",
          assetId: ""
        }
      ]
    });

    expect(saved.representations).toEqual([]);
  });

  it("preserves representation order when saving a talent", async () => {
    const saved = await saveTalent({
      id: "talent-qingluan",
      nickname: "Qingluan",
      bio: demoSeedState.talents[0]?.bio ?? "",
      aliases: demoSeedState.talents[0]?.aliases ?? [],
      coverAssetId: "asset-cover-qingluan",
      links: demoSeedState.talents[0]?.links ?? [],
      representations: [
        {
          id: "ql-rep-2",
          title: "Second First",
          assetId: "asset-rep-2"
        },
        {
          id: "ql-rep-1",
          title: "First Second",
          assetId: "asset-rep-1"
        }
      ]
    });

    expect(saved.representations.map((item) => item.id)).toEqual(["ql-rep-2", "ql-rep-1"]);
  });

  it("deletes cleanup candidate assets when they are no longer referenced", async () => {
    const asset = await saveAsset({
      kind: "talent_cover",
      title: "unused cover",
      alt: "unused cover",
      url: "https://example.com/unused-cover.jpg",
      width: 300,
      height: 400,
      objectKey: null
    });

    await saveTalent({
      id: "talent-qingluan",
      nickname: "Qingluan",
      bio: demoSeedState.talents[0]?.bio ?? "",
      aliases: demoSeedState.talents[0]?.aliases ?? [],
      coverAssetId: null,
      links: demoSeedState.talents[0]?.links ?? [],
      representations: demoSeedState.talents[0]?.representations ?? [],
      cleanupCandidateAssetIds: [asset.id]
    });

    expect(getMockState().assets.some((item) => item.id === asset.id)).toBe(false);
  });

  it("rejects saving assets outside the supported 3:4 and 4:3 ratios", async () => {
    await expect(
      saveAsset({
        kind: "talent_cover",
        title: "invalid ratio",
        alt: "invalid ratio",
        url: "https://example.com/invalid-ratio.jpg",
        width: 400,
        height: 400,
        objectKey: null
      })
    ).rejects.toThrow("图片比例仅支持 3:4 或 4:3。");
  });

  it("rejects landscape framing for talent representation assets", async () => {
    await expect(
      saveAsset({
        kind: "talent_representation",
        title: "landscape representation",
        alt: "landscape representation",
        url: "https://example.com/landscape-representation.jpg",
        width: 1200,
        height: 900,
        displayAspectWidth: 4,
        displayAspectHeight: 3,
        objectKey: null
      })
    ).rejects.toThrow("代表图仅支持竖版 3:4。");
  });

  it("keeps cleanup candidate assets when they are still referenced elsewhere", async () => {
    const candidateAssetId = "asset-rep-1";

    await saveTalent({
      id: "talent-qingluan",
      nickname: "Qingluan",
      bio: demoSeedState.talents[0]?.bio ?? "",
      aliases: demoSeedState.talents[0]?.aliases ?? [],
      coverAssetId: "asset-cover-qingluan",
      links: demoSeedState.talents[0]?.links ?? [],
      representations: demoSeedState.talents[0]?.representations ?? [],
      cleanupCandidateAssetIds: [candidateAssetId]
    });

    expect(getMockState().assets.some((item) => item.id === candidateAssetId)).toBe(true);
  });

  it("bulk deletes removable talents and reports blocked rows", async () => {
    const saved = await saveTalent({
      nickname: "bulk-temp",
      bio: "",
      coverAssetId: null,
      links: [],
      representations: []
    });

    const result = await saveTalentBulk({
      action: "delete",
      ids: [saved.id, "missing-talent"]
    });

    expect(result.succeededIds).toEqual([saved.id]);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]?.id).toBe("missing-talent");
    expect(getMockState().talents.some((talent) => talent.id === saved.id)).toBe(false);
  });

  it("derives event status from dates when saving", async () => {
    const savedFuture = await saveEvent({
      id: "event-echo-market",
      name: "Echo Market Archive",
      startsAt: "2026-04-19",
      endsAt: "2026-04-20",
      city: "",
      venue: "",
      note: "",
      lineups: []
    });

    const savedPast = await saveEvent({
      id: "event-mist-lantern",
      name: "Mist Lantern Festival",
      startsAt: "2026-03-22",
      endsAt: "2026-03-22",
      city: "",
      venue: "",
      note: "",
      lineups: []
    });

    expect(savedFuture.status).toBe("future");
    expect(savedPast.status).toBe("past");
  });

  it("allows saving archive entries without a scene asset", async () => {
    const archive = await saveArchive("editor-lin", {
      eventId: "event-mist-lantern",
      note: "archive note",
      entries: [
        {
          talentId: "talent-qingluan",
          entryDate: "2026-03-22",
          sceneAssetId: null,
          sharedPhotoAssetId: null,
          cosplayTitle: "Role One",
          hasSharedPhoto: false
        }
      ]
    });

    expect(archive.entries[0]?.sceneAssetId).toBeNull();
  });

  it("bulk deletes events and cascades their lineups and archives", async () => {
    const result = await saveEventBulk({
      action: "delete",
      ids: ["event-mist-lantern", "missing-event"]
    });

    expect(result.succeededIds).toEqual(["event-mist-lantern"]);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]?.id).toBe("missing-event");

    const state = getMockState();
    expect(state.events.some((event) => event.id === "event-mist-lantern")).toBe(false);
    expect(state.lineups.some((lineup) => lineup.eventId === "event-mist-lantern")).toBe(false);
    expect(state.archives.some((archive) => archive.eventId === "event-mist-lantern")).toBe(false);
  });

  it("merges future events into a persistent douyin target without losing archives", async () => {
    const state = getMockState();
    state.events.push(
      {
        id: "event-merge-target",
        slug: null,
        name: "保留活动名称",
        aliases: ["target-alias"],
        searchKeywords: ["target-search"],
        startsAt: "2026-05-01T12:00:00.000Z",
        endsAt: "2026-05-02T12:00:00.000Z",
        city: "深圳",
        venue: "目标场馆",
        status: "future",
        note: "目标备注",
        updatedAt: "2026-04-01T00:00:00.000Z",
        origin: "douyin_sync"
      },
      {
        id: "event-merge-source",
        slug: null,
        name: "另一个自动名称",
        aliases: [],
        searchKeywords: [],
        startsAt: "2026-05-01T12:00:00.000Z",
        endsAt: "2026-05-03T12:00:00.000Z",
        city: "深圳",
        venue: "来源场馆",
        status: "future",
        note: "来源备注",
        updatedAt: "2026-04-01T00:00:00.000Z",
        origin: "douyin_sync"
      }
    );
    state.lineups.push(
      {
        id: "lineup-merge-target",
        eventId: "event-merge-target",
        talentId: "talent-qingluan",
        lineupDate: "2026-05-01T12:00:00.000Z",
        status: "confirmed",
        source: "",
        note: "目标备注"
      },
      {
        id: "lineup-merge-source-auto",
        eventId: "event-merge-source",
        talentId: "talent-qingluan",
        lineupDate: "2026-05-01T12:00:00.000Z",
        status: "confirmed",
        source: "douyin:merge-entry-qingluan",
        note: ""
      },
      {
        id: "lineup-merge-source-yunmo",
        eventId: "event-merge-source",
        talentId: "talent-yunmo",
        lineupDate: "2026-05-03T12:00:00.000Z",
        status: "confirmed",
        source: "douyin:merge-entry-yunmo",
        note: ""
      }
    );
    state.archives.push(
      {
        id: "archive-merge-target",
        editorId: "editor-lin",
        eventId: "event-merge-target",
        note: "保留档案备注",
        updatedAt: "2026-04-01T00:00:00.000Z",
        entries: [
          {
            id: "archive-merge-target-entry",
            talentId: "talent-qingluan",
            entryDate: "2026-05-01T12:00:00.000Z",
            sceneAssetId: "asset-scene-1",
            sharedPhotoAssetId: null,
            cosplayTitle: "角色 A",
            hasSharedPhoto: false
          }
        ]
      },
      {
        id: "archive-merge-source",
        editorId: "editor-lin",
        eventId: "event-merge-source",
        note: "来源档案备注",
        updatedAt: "2026-04-01T00:00:00.000Z",
        entries: [
          {
            id: "archive-merge-source-entry",
            talentId: "talent-qingluan",
            entryDate: "2026-05-01T12:00:00.000Z",
            sceneAssetId: null,
            sharedPhotoAssetId: "asset-shared-1",
            cosplayTitle: "角色 A",
            hasSharedPhoto: true
          },
          {
            id: "archive-merge-source-entry-2",
            talentId: "talent-yunmo",
            entryDate: "2026-05-03T12:00:00.000Z",
            sceneAssetId: null,
            sharedPhotoAssetId: null,
            cosplayTitle: "角色 B",
            hasSharedPhoto: false
          }
        ]
      }
    );
    state.douyinScheduleEntries.push(
      {
        id: "merge-entry-qingluan",
        talentId: "talent-qingluan",
        fingerprint: "merge-fingerprint-qingluan",
        rawText: "5.1深圳活动 A",
        startsAt: "2026-05-01T12:00:00.000Z",
        endsAt: "2026-05-01T12:00:00.000Z",
        city: "深圳",
        eventName: "活动 A",
        eventId: "event-merge-source",
        firstSeenAt: "2026-04-01T00:00:00.000Z",
        lastSeenAt: "2026-04-01T00:00:00.000Z",
        consecutiveMissingCount: 0,
        state: "active",
        parserVersion: "1"
      },
      {
        id: "merge-entry-yunmo",
        talentId: "talent-yunmo",
        fingerprint: "merge-fingerprint-yunmo",
        rawText: "5.3深圳活动 B",
        startsAt: "2026-05-03T12:00:00.000Z",
        endsAt: "2026-05-03T12:00:00.000Z",
        city: "深圳",
        eventName: "活动 B",
        eventId: "event-merge-source",
        firstSeenAt: "2026-04-01T00:00:00.000Z",
        lastSeenAt: "2026-04-01T00:00:00.000Z",
        consecutiveMissingCount: 0,
        state: "active",
        parserVersion: "1"
      }
    );
    setMockState(state);

    const result = await saveEventBulk({
      action: "merge",
      ids: ["event-merge-target", "event-merge-source"],
      targetId: "event-merge-target"
    });

    expect(result.succeededIds).toEqual(["event-merge-source"]);
    expect(result.mergedEvent).toMatchObject({
      id: "event-merge-target",
      name: "保留活动名称",
      venue: "目标场馆",
      startsAt: "2026-05-01T12:00:00.000Z",
      endsAt: "2026-05-03T12:00:00.000Z",
      origin: "douyin_merged"
    });
    expect(result.mergedLineups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ talentId: "talent-qingluan", source: "douyin:merge-entry-qingluan" }),
        expect.objectContaining({ talentId: "talent-yunmo", source: "douyin:merge-entry-yunmo" })
      ])
    );
    expect(result.mergedArchives).toHaveLength(1);
    expect(result.mergedArchives?.[0]?.entries).toHaveLength(2);

    const nextState = getMockState();
    expect(nextState.events.some((event) => event.id === "event-merge-source")).toBe(false);
    expect(nextState.eventMergeRules).toHaveLength(1);
    expect(nextState.eventMergeRules[0]?.targetEventId).toBe("event-merge-target");
    expect(nextState.douyinScheduleEntries.filter((entry) => entry.eventId === "event-merge-target")).toHaveLength(2);
  });

  it("rejects merging a completed event without changing state", async () => {
    const before = structuredClone(getMockState());

    await expect(
      saveEventBulk({
        action: "merge",
        ids: ["event-mist-lantern", "event-echo-market"],
        targetId: "event-echo-market"
      })
    ).rejects.toThrow("只能合并尚未结束的活动");

    expect(getMockState().events).toEqual(before.events);
    expect(getMockState().lineups).toEqual(before.lineups);
    expect(getMockState().eventMergeRules).toEqual(before.eventMergeRules);
  });

  it("derives ladder titles from the current editor name and preserves tier talent order", async () => {
    const saved = await saveLadder("editor-lin", {
      id: "ladder-lin",
      title: "Old Custom Title",
      subtitle: "Updated subtitle",
      tiers: [
        {
          id: "lin-t0",
          name: "T0",
          order: 0,
          talentIds: ["talent-yunmo", "talent-qingluan"]
        },
        {
          id: "lin-t1",
          name: "T1",
          order: 1,
          talentIds: ["talent-zhaoying"]
        }
      ]
    });

    expect(saved.title).toBe("凛的天梯榜");
    expect(saved.tiers[0]?.talentIds).toEqual(["talent-yunmo", "talent-qingluan"]);
  });
  it("returns a sanitized editor profile when saving the editor name", async () => {
    const saved = await saveEditorName("editor-lin", { name: "Lin QA" });

    expect(saved).toMatchObject({
      id: "editor-lin",
      slug: "lin",
      name: "Lin QA"
    });
    expect(saved).not.toHaveProperty("email");
    expect(saved).not.toHaveProperty("passwordHash");
  });
});
