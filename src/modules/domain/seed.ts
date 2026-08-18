import type { RepositoryState } from "@/modules/domain/types";

export const demoSeedState: RepositoryState = {
  editors: [
    {
      id: "editor-lin",
      slug: "lin",
      name: "凛",
      title: "策展编辑 / 国风观察",
      bio: "偏好人物气质、服化细节与现场镜头秩序，负责更偏策展的公开首页与一部分共享资料整理。",
      accent: "#ef5b45",
      intro: "偏爱镜头里的静态戏剧感，倾向把人物放进完整的氛围里去看。",
      email: "lin@example.com",
      passwordHash:
        "$argon2id$v=19$m=19456,t=2,p=1$/c4DTv95+TXMEkClzcxQqA$fCkwjO/nspG7JpD4wrj6kuT71pbhjq90OnDymIRXQE4"
    },
    {
      id: "editor-yu",
      slug: "yu",
      name: "屿",
      title: "活动编辑 / 现场记录",
      bio: "偏好现场互动、活动动线与人物持续出勤情况，负责行程、活动档案与另一部分共享资料维护。",
      accent: "#2e8b99",
      intro: "更在意人和活动之间的关系链，也更擅长把现场经验沉淀成结构化信息。",
      email: "yu@example.com",
      passwordHash:
        "$argon2id$v=19$m=19456,t=2,p=1$xuFG5HXrk5t0oGBccfqe6w$5rgrv71qVHazDlLz6+sXVy7O4/9/mFfHgAjrGZLQF7Y"
    }
  ],
  assets: [
    {
      id: "asset-cover-qingluan",
      kind: "talent_cover",
      title: "青鸾封面",
      alt: "青鸾封面海报",
      url: "/media/poster-crimson.svg",
      width: 1280,
      height: 1600
    },
    {
      id: "asset-cover-yunmo",
      kind: "talent_cover",
      title: "云墨封面",
      alt: "云墨封面海报",
      url: "/media/poster-teal.svg",
      width: 1280,
      height: 1600
    },
    {
      id: "asset-cover-zhaoying",
      kind: "talent_cover",
      title: "昭映封面",
      alt: "昭映封面海报",
      url: "/media/poster-gold.svg",
      width: 1280,
      height: 1600
    },
    {
      id: "asset-cover-yanjin",
      kind: "talent_cover",
      title: "雁锦封面",
      alt: "雁锦封面海报",
      url: "/media/poster-indigo.svg",
      width: 1280,
      height: 1600
    },
    {
      id: "asset-rep-1",
      kind: "talent_representation",
      title: "代表作 1",
      alt: "达人代表作品视觉图",
      url: "/media/gallery-ember.svg",
      width: 1280,
      height: 960
    },
    {
      id: "asset-rep-2",
      kind: "talent_representation",
      title: "代表作 2",
      alt: "达人代表作品视觉图",
      url: "/media/gallery-mist.svg",
      width: 1280,
      height: 960
    },
    {
      id: "asset-rep-3",
      kind: "talent_representation",
      title: "代表作 3",
      alt: "达人代表作品视觉图",
      url: "/media/gallery-jade.svg",
      width: 1280,
      height: 960
    },
    {
      id: "asset-scene-1",
      kind: "event_scene",
      title: "活动现场一",
      alt: "活动现场视觉图",
      url: "/media/scene-plaza.svg",
      width: 1440,
      height: 960
    },
    {
      id: "asset-scene-2",
      kind: "event_scene",
      title: "活动现场二",
      alt: "活动现场视觉图",
      url: "/media/scene-night.svg",
      width: 1440,
      height: 960
    },
    {
      id: "asset-shared-1",
      kind: "shared_photo",
      title: "合照一",
      alt: "达人合照",
      url: "/media/shared-bloom.svg",
      width: 1200,
      height: 1200
    }
  ],
  talents: [
    {
      id: "talent-qingluan",
      slug: null,
      nickname: "青鸾",
      bio: "以古典角色重构和高完成度发型妆面见长，现场镜头表现稳定。",
      aliases: ["青鸾", "Qingluan"],
      searchKeywords: ["国风", "汉服", "古典角色", "现场摄影"],
      coverAssetId: "asset-cover-qingluan",
      links: [
        { id: "ql-xhs", label: "小红书", url: "https://example.com/qingluan" },
        { id: "ql-weibo", label: "微博", url: "https://example.com/qingluan-weibo" }
      ],
      representations: [
        { id: "ql-rep-1", title: "《花朝记》", assetId: "asset-rep-1" },
        { id: "ql-rep-2", title: "《山鬼》", assetId: "asset-rep-2" }
      ],
      updatedAt: "2026-04-05T09:30:00.000Z"
    },
    {
      id: "talent-yunmo",
      slug: null,
      nickname: "云墨",
      bio: "偏原创国风与轻舞台改编，动作表达和服饰层次都很完整。",
      aliases: ["云墨", "Yunmo"],
      searchKeywords: ["原创国风", "舞台改编", "灯市夜游"],
      coverAssetId: "asset-cover-yunmo",
      links: [{ id: "ym-bili", label: "Bilibili", url: "https://example.com/yunmo" }],
      representations: [{ id: "ym-rep-1", title: "《灯市夜游》", assetId: "asset-rep-3" }],
      updatedAt: "2026-04-09T08:10:00.000Z"
    },
    {
      id: "talent-zhaoying",
      slug: null,
      nickname: "昭映",
      bio: "以大型游戏角色 cosplay 为主，擅长冷色系造型和锐利镜头表达。",
      aliases: ["昭映", "Zhaoying"],
      searchKeywords: ["游戏角色", "冷色造型", "明昼"],
      coverAssetId: "asset-cover-zhaoying",
      links: [{ id: "zy-dy", label: "抖音", url: "https://example.com/zhaoying" }],
      representations: [{ id: "zy-rep-1", title: "《明昼》", assetId: "asset-rep-2" }],
      updatedAt: "2026-04-01T15:30:00.000Z"
    },
    {
      id: "talent-yanjin",
      slug: null,
      nickname: "雁锦",
      bio: "主打古偶与舞台混搭，线下活动密度高，互动反馈很好。",
      aliases: ["雁锦", "Yanjin"],
      searchKeywords: ["舞台返场", "高频出勤", "夜锦"],
      coverAssetId: "asset-cover-yanjin",
      links: [{ id: "yj-weibo", label: "微博", url: "https://example.com/yanjin" }],
      representations: [
        { id: "yj-rep-1", title: "《折枝》", assetId: "asset-rep-1" },
        { id: "yj-rep-2", title: "《夜锦》", assetId: "asset-rep-3" }
      ],
      updatedAt: "2026-04-06T12:00:00.000Z"
    }
  ],
  events: [
    {
      id: "event-spring-gala",
      slug: null,
      name: "春序漫展 2026",
      aliases: ["春序漫展", "Spring Gala 2026"],
      searchKeywords: ["上海漫展", "国风舞台", "主视觉活动"],
      startsAt: "2026-05-15T10:00:00.000Z",
      endsAt: "2026-05-17T18:00:00.000Z",
      city: "上海",
      venue: "虹馆 West Hall",
      status: "future",
      note: "以国风与游戏角色舞台为主场，适合作为首页近期重点活动入口。",
      updatedAt: "2026-04-09T12:00:00.000Z"
    },
    {
      id: "event-mist-lantern",
      slug: null,
      name: "雾灯国风夜",
      aliases: ["雾灯国风夜", "Mist Lantern Festival"],
      searchKeywords: ["杭州", "夜景活动", "运河会展中心"],
      startsAt: "2026-03-22T09:30:00.000Z",
      endsAt: "2026-03-22T21:00:00.000Z",
      city: "杭州",
      venue: "运河会展中心",
      status: "past",
      note: "偏室内夜景，适合展示现场照片与合照档案。",
      updatedAt: "2026-03-25T08:00:00.000Z"
    },
    {
      id: "event-echo-market",
      slug: null,
      name: "回声市集特别场",
      aliases: ["回声市集", "Echo Market"],
      searchKeywords: ["南京", "创意园", "开放式园区活动"],
      startsAt: "2026-04-19T11:00:00.000Z",
      endsAt: "2026-04-20T20:00:00.000Z",
      city: "南京",
      venue: "青奥创意园",
      status: "future",
      note: "开放式园区活动，适合未来行程页展示来源与备注差异。",
      updatedAt: "2026-04-10T16:30:00.000Z"
    }
  ],
  eventMergeRules: [],
  lineups: [
    {
      id: "lineup-1",
      eventId: "event-spring-gala",
      talentId: "talent-qingluan",
      lineupDate: "2026-05-15T12:00:00.000Z",
      status: "confirmed",
      source: "",
      note: "主视觉第一轮海报已出现"
    },
    {
      id: "lineup-2",
      eventId: "event-spring-gala",
      talentId: "talent-zhaoying",
      lineupDate: "2026-05-16T12:00:00.000Z",
      status: "confirmed",
      source: "",
      note: "待主办二宣"
    },
    {
      id: "lineup-3",
      eventId: "event-echo-market",
      talentId: "talent-yunmo",
      lineupDate: "2026-04-19T12:00:00.000Z",
      status: "confirmed",
      source: "",
      note: "签售时段待补"
    },
    {
      id: "lineup-4",
      eventId: "event-echo-market",
      talentId: "talent-yanjin",
      lineupDate: "2026-04-20T12:00:00.000Z",
      status: "confirmed",
      source: "",
      note: "预计双日均在"
    },
    {
      id: "lineup-5",
      eventId: "event-mist-lantern",
      talentId: "talent-qingluan",
      lineupDate: "2026-03-22T12:00:00.000Z",
      status: "confirmed",
      source: "",
      note: "现场返图已归档"
    },
    {
      id: "lineup-6",
      eventId: "event-mist-lantern",
      talentId: "talent-yanjin",
      lineupDate: "2026-03-22T12:00:00.000Z",
      status: "confirmed",
      source: "",
      note: "舞台返场一次"
    }
  ],
  ladders: [
    {
      id: "ladder-lin",
      editorId: "editor-lin",
      title: "凛的天梯榜",
      subtitle: "更看重角色完成度、镜头稳定性与策展气质。",
      tiers: [
        { id: "lin-t0", name: "T0", order: 0, talentIds: ["talent-qingluan"] },
        { id: "lin-t1", name: "T1", order: 1, talentIds: ["talent-yunmo", "talent-zhaoying"] },
        { id: "lin-t2", name: "T2", order: 2, talentIds: ["talent-yanjin"] },
        { id: "lin-t3", name: "T3", order: 3, talentIds: [] },
        { id: "lin-t4", name: "T4", order: 4, talentIds: [] },
        { id: "lin-t5", name: "T5", order: 5, talentIds: [] }
      ]
    },
    {
      id: "ladder-yu",
      editorId: "editor-yu",
      title: "屿的天梯榜",
      subtitle: "更看重出勤稳定、现场互动与后续可追踪性。",
      tiers: [
        { id: "yu-t0", name: "T0", order: 0, talentIds: ["talent-yanjin"] },
        { id: "yu-t1", name: "T1", order: 1, talentIds: ["talent-qingluan", "talent-yunmo"] },
        { id: "yu-t2", name: "T2", order: 2, talentIds: ["talent-zhaoying"] },
        { id: "yu-t3", name: "T3", order: 3, talentIds: [] },
        { id: "yu-t4", name: "T4", order: 4, talentIds: [] },
        { id: "yu-t5", name: "T5", order: 5, talentIds: [] }
      ]
    }
  ],
  archives: [
    {
      id: "archive-lin-mist",
      editorId: "editor-lin",
      eventId: "event-mist-lantern",
      note: "夜景与人物局部都很稳定，比较适合在首页做近期更新展示。",
      updatedAt: "2026-03-26T10:00:00.000Z",
      entries: [
        {
          id: "archive-lin-entry-1",
          talentId: "talent-qingluan",
          sceneAssetId: "asset-scene-1",
          sharedPhotoAssetId: "asset-shared-1",
          cosplayTitle: "《花朝记》春庭版",
          hasSharedPhoto: true,
          beautyTier: 4
        }
      ]
    },
    {
      id: "archive-yu-mist",
      editorId: "editor-yu",
      eventId: "event-mist-lantern",
      note: "现场排队很长，但互动效率很好，后续返场值得继续跟。",
      updatedAt: "2026-03-26T12:30:00.000Z",
      entries: [
        {
          id: "archive-yu-entry-1",
          talentId: "talent-yanjin",
          sceneAssetId: "asset-scene-2",
          sharedPhotoAssetId: null,
          cosplayTitle: "《夜锦》活动舞台版",
          hasSharedPhoto: false,
          beautyTier: 3
        }
      ]
    }
  ],
  sessions: [],
  douyinProfiles: [],
  douyinRelatedAccounts: [],
  douyinScheduleEntries: [],
  douyinSyncRuns: [],
  douyinSyncResults: [],
  assetObjectDeletionJobs: [],
  assetCleanupRuns: []
};
