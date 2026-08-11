import {
  discoverDouyinProfiles,
  parseDouyinProfileCandidates,
  parseSogouDouyinProfileCandidates
} from "@/modules/douyin/profile-discovery";

function result(url: string, title: string) {
  return `<div class="snippet result" data-pos="1" data-type="web">
    <a href="${url}" target="_self">
      <div class="title search-snippet-title" title="${title}">${title}</div>
    </a>
  </div>`;
}

describe("Douyin profile candidate discovery", () => {
  it("extracts safe profile candidates, deduplicates them and ranks exact nicknames first", () => {
    const exactUrl = "https://www.douyin.com/user/MS4wLjABAAAA-exact";
    const html = [
      result("https://www.douyin.com/user/MS4wLjABAAAA-near", "青鸾工作室的主页"),
      result(exactUrl, "青鸾的抖音 - 抖音"),
      result(exactUrl, "青鸾的主页"),
      result("https://www.douyin.com/user/MS4wLjABAAAA-unrelated", "其他达人的主页"),
      result("https://example.com/user/not-douyin", "青鸾的主页")
    ].join("");

    expect(parseDouyinProfileCandidates(html, "青鸾")).toEqual([
      { nickname: "青鸾", profileUrl: exactUrl, exactNickname: true },
      {
        nickname: "青鸾工作室",
        profileUrl: "https://www.douyin.com/user/MS4wLjABAAAA-near",
        exactNickname: false
      }
    ]);
  });

  it("decodes indexed titles without accepting unsafe URL shapes", () => {
    const html = [
      result("https://www.douyin.com/user/account_one", "A&amp;B的主页"),
      result("https://www.douyin.com/user/account/two", "A&amp;B的主页"),
      result("http://www.douyin.com/user/account_three", "A&amp;B的主页")
    ].join("");

    expect(parseDouyinProfileCandidates(html, "A&B")).toEqual([
      {
        nickname: "A&B",
        profileUrl: "https://www.douyin.com/user/account_one",
        exactNickname: true
      }
    ]);
  });

  it("parses relevant Sogou profile results and ignores unrelated indexed accounts", () => {
    const html = `
      <div class="vrwrap" id="result-1">
        <h3 class="vr-title"><a><em>青鸾</em>的<em>抖音</em> - <em>抖音</em></a></h3>
        <div data-url="https://www.douyin.com/user/MS4wLjABAAAA-qingluan"></div>
      </div><!--STATUS VR OK-->
      <div class="vrwrap" id="result-2">
        <h3 class="vr-title"><a>其他达人的抖音 - 抖音</a></h3>
        <div data-url="https://www.douyin.com/user/MS4wLjABAAAA-other"></div>
      </div><!--STATUS VR OK-->
    `;

    expect(parseSogouDouyinProfileCandidates(html, "青鸾")).toEqual([
      {
        nickname: "青鸾",
        profileUrl: "https://www.douyin.com/user/MS4wLjABAAAA-qingluan",
        exactNickname: true
      }
    ]);
  });

  it("falls back to Sogou when Brave is rate limited", async () => {
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      requests.push(url);
      if (url.startsWith("https://search.brave.com/")) {
        return new Response("rate limited", { status: 429 });
      }
      return new Response(
        `<div class="vrwrap"><h3 class="vr-title"><a>青鸾的主页</a></h3><div data-url="https://www.douyin.com/user/account"></div></div><!--STATUS VR OK-->`,
        { status: 200 }
      );
    }) as typeof fetch;

    await expect(discoverDouyinProfiles("青鸾", fetchImpl)).resolves.toEqual([
      {
        nickname: "青鸾",
        profileUrl: "https://www.douyin.com/user/account",
        exactNickname: true
      }
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toContain("www.sogou.com/web");
  });
});
