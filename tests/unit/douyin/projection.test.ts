import { getEventDisplayName } from "@/lib/event-display";
import { getTalentDetail } from "@/modules/domain/queries";
import { demoSeedState } from "@/modules/domain/seed";
import { formatDouyinFollowerCount } from "@/modules/douyin/format";

describe("Douyin public projection", () => {
  it("projects only a successful current profile and verified related accounts", () => {
    const state = structuredClone(demoSeedState);
    const talent = state.talents[0];
    state.douyinProfiles.push({
      talentId: talent.id,
      profileUrl: "https://www.douyin.com/user/main",
      secUserId: "main",
      signatureRaw: "8.8深圳金铲铲",
      itineraryText: "8.8深圳金铲铲\n8.9上海闪魂绝区零",
      followerCount: 126_438,
      latestWorkUrl: null,
      latestWorkCaption: null,
      latestWorkPublishedAt: null,
      fetchedAt: "2026-08-04T04:00:00.000Z",
      lastSuccessAt: "2026-08-04T04:00:00.000Z",
      lastErrorCode: null,
      linkExtractionStatus: "rendered",
      manualSyncAvailableAt: null,
      parserVersion: "1"
    });
    state.douyinRelatedAccounts.push(
      {
        id: "related-valid",
        talentId: talent.id,
        nickname: "理想型账号",
        secUserId: "related",
        url: "https://www.douyin.com/user/related",
        sortOrder: 0
      },
      {
        id: "related-unsafe",
        talentId: talent.id,
        nickname: "错误链接",
        secUserId: "unsafe",
        url: "https://example.com/user/unsafe",
        sortOrder: 1
      }
    );

    expect(getTalentDetail(state, talent.id)?.douyinProfile).toEqual({
      followerCount: 126_438,
      latestWorkUrl: null,
      latestWorkCaption: null,
      latestWorkPublishedAt: null,
      itineraryBlocks: ["8.8深圳金铲铲", "8.9上海闪魂绝区零"],
      relatedAccounts: [expect.objectContaining({ id: "related-valid", nickname: "理想型账号" })]
    });
  });

  it("formats followers in 万 and uses factual city/date for an unnamed event", () => {
    expect(formatDouyinFollowerCount(126_438)).toBe("12.6 万");
    expect(
      getEventDisplayName({
        name: "",
        city: "深圳",
        startsAt: "2026-08-08T12:00:00.000Z",
        endsAt: "2026-08-08T12:00:00.000Z"
      })
    ).toBe("深圳 · 2026.08.08");
  });
});
