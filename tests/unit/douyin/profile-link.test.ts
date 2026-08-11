import { extractDouyinProfileUrl, getPrimaryDouyinProfileLink, isSafeDouyinRelatedAccountUrl } from "@/modules/douyin/profile-link";
import type { Talent } from "@/modules/domain/types";

function talentWithUrl(url: string): Talent {
  return {
    id: "talent-profile-link",
    slug: null,
    nickname: "测试达人",
    bio: "",
    aliases: [],
    searchKeywords: [],
    coverAssetId: null,
    links: [{ id: "douyin-link", label: "抖音", url }],
    representations: [],
    updatedAt: "2026-08-04T00:00:00.000Z"
  };
}

describe("Douyin profile URL selection", () => {
  it("extracts and normalizes a profile URL from full share text", () => {
    expect(extractDouyinProfileUrl("复制此消息，打开抖音 https://v.douyin.com/AbC_123/ 一起看看"))
      .toBe("https://v.douyin.com/AbC_123/");
    expect(extractDouyinProfileUrl("这里没有主页链接")).toBeNull();
  });

  it("accepts only exact HTTPS profile and share-link shapes", () => {
    expect(
      getPrimaryDouyinProfileLink(
        talentWithUrl("https://www.douyin.com/user/MS4wLjABAAAA-test")
      ).link
    ).not.toBeNull();
    expect(
      getPrimaryDouyinProfileLink(talentWithUrl("https://v.douyin.com/short-code/")).link
    ).not.toBeNull();
    expect(
      getPrimaryDouyinProfileLink(
        talentWithUrl(
          "https://www.douyin.com/user/MS4wLjABAAAA-test?from_tab_name=main#profile"
        )
      ).link?.url
    ).toBe("https://www.douyin.com/user/MS4wLjABAAAA-test");

    for (const url of [
      "https://www.douyin.com/user/account/extra",
      "https://www.douyin.com:8443/user/account",
      "https://v.douyin.com/",
      "https://example.com/user/account",
      `https://www.douyin.com/user/${"a".repeat(513)}`,
      `https://v.douyin.com/${"a".repeat(513)}`
    ]) {
      expect(getPrimaryDouyinProfileLink(talentWithUrl(url)).link).toBeNull();
    }
  });

  it("does not expose short or malformed URLs as verified related accounts", () => {
    expect(isSafeDouyinRelatedAccountUrl("https://www.douyin.com/user/verified-account")).toBe(true);
    expect(isSafeDouyinRelatedAccountUrl("https://v.douyin.com/short-code/")).toBe(false);
    expect(isSafeDouyinRelatedAccountUrl("https://www.douyin.com/user/account/extra")).toBe(false);
    expect(isSafeDouyinRelatedAccountUrl("https://www.douyin.com/user/account?from_tab_name=main")).toBe(false);
  });
});
