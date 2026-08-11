import { normalizeDouyinProfileUrl } from "@/modules/douyin/profile-link";

export interface DouyinProfileCandidate {
  nickname: string;
  profileUrl: string;
  exactNickname: boolean;
}

const SEARCH_TIMEOUT_MS = 10_000;
const MAX_CANDIDATES = 8;
const RESULT_BLOCK_PATTERN = /<div\s+class="snippet[^>]*data-type="web"[\s\S]*?(?=<div\s+class="snippet[^>]*data-type="web"|<\/main>|$)/gu;
const SOGOU_RESULT_BLOCK_PATTERN = /<div\s+class="vrwrap"[^>]*>[\s\S]*?(?=<!--STATUS VR OK-->|<div\s+class="vrwrap"|$)/gu;
const PROFILE_URL_PATTERN = /href="(https:\/\/www\.douyin\.com\/user\/[A-Za-z0-9_-]{1,512})"/u;
const DATA_PROFILE_URL_PATTERN = /data-url="(https:\/\/www\.douyin\.com\/user\/[A-Za-z0-9_-]{1,512})"/u;
const TITLE_PATTERN = /<div\s+class="title[^>]*\stitle="([^"]{1,300})"/u;
const SOGOU_TITLE_PATTERN = /<h3\s+class="vr-title[^>]*>[\s\S]*?<a[^>]*>([\s\S]{1,800}?)<\/a>/u;

interface DiscoveryProvider {
  name: "brave" | "sogou";
  buildUrl(query: string): URL;
  parse(html: string, query: string): DouyinProfileCandidate[];
}

export class DouyinProfileDiscoveryError extends Error {
  constructor(readonly upstreams: string[]) {
    super("抖音账号候选暂时无法查询，请稍后重试或手动填写主页链接。");
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function titleToNickname(value: string) {
  return decodeHtmlEntities(value)
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<[^>]+>/gu, "")
    .replace(/\s*(?:的主页|的抖音\s*-\s*抖音|[-–—]\s*抖音官方账号)\s*$/u, "")
    .trim();
}

function normalizeNickname(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·•・._\-—–（）()【】\[\]]+/gu, "");
}

function candidateScore(candidate: DouyinProfileCandidate, query: string) {
  const candidateNickname = normalizeNickname(candidate.nickname);
  const normalizedQuery = normalizeNickname(query);
  if (candidateNickname === normalizedQuery) return 100;
  if (candidateNickname.startsWith(normalizedQuery)) return 80;
  if (candidateNickname.includes(normalizedQuery)) return 60;
  return 0;
}

function rankCandidates(candidates: DouyinProfileCandidate[], query: string) {
  const seen = new Set<string>();
  return candidates
    .filter((candidate) => {
      if (seen.has(candidate.profileUrl)) return false;
      seen.add(candidate.profileUrl);
      return true;
    })
    .map((candidate, index) => ({ candidate, index, score: candidateScore(candidate, query) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, MAX_CANDIDATES)
    .map(({ candidate }) => candidate);
}

function toCandidate(rawUrl: string, rawTitle: string, query: string) {
  const profileUrl = normalizeDouyinProfileUrl(decodeHtmlEntities(rawUrl));
  const nickname = titleToNickname(rawTitle);
  if (!profileUrl || !nickname) return null;

  return {
    nickname,
    profileUrl,
    exactNickname: normalizeNickname(nickname) === normalizeNickname(query)
  } satisfies DouyinProfileCandidate;
}

export function parseDouyinProfileCandidates(html: string, query: string) {
  const candidates: DouyinProfileCandidate[] = [];

  for (const block of html.match(RESULT_BLOCK_PATTERN) ?? []) {
    const rawUrl = PROFILE_URL_PATTERN.exec(block)?.[1];
    const rawTitle = TITLE_PATTERN.exec(block)?.[1];
    if (!rawUrl || !rawTitle) continue;
    const candidate = toCandidate(rawUrl, rawTitle, query);
    if (candidate) candidates.push(candidate);
  }

  return rankCandidates(candidates, query);
}

export function parseSogouDouyinProfileCandidates(html: string, query: string) {
  const candidates: DouyinProfileCandidate[] = [];
  for (const block of html.match(SOGOU_RESULT_BLOCK_PATTERN) ?? []) {
    const rawUrl = DATA_PROFILE_URL_PATTERN.exec(block)?.[1];
    const rawTitle = SOGOU_TITLE_PATTERN.exec(block)?.[1];
    if (!rawUrl || !rawTitle) continue;
    const candidate = toCandidate(rawUrl, rawTitle, query);
    if (candidate) candidates.push(candidate);
  }
  return rankCandidates(candidates, query);
}

const PROVIDERS: DiscoveryProvider[] = [
  {
    name: "brave",
    buildUrl(query) {
      const url = new URL("https://search.brave.com/search");
      url.searchParams.set("q", `site:www.douyin.com/user/ ${query} 抖音`);
      url.searchParams.set("source", "web");
      return url;
    },
    parse: parseDouyinProfileCandidates
  },
  {
    name: "sogou",
    buildUrl(query) {
      const url = new URL("https://www.sogou.com/web");
      url.searchParams.set("query", `site:www.douyin.com/user/ ${query} 抖音`);
      return url;
    },
    parse: parseSogouDouyinProfileCandidates
  }
];

export async function discoverDouyinProfiles(
  nickname: string,
  fetchImpl: typeof fetch = fetch
): Promise<DouyinProfileCandidate[]> {
  const query = nickname.trim();
  if (!query || query.length > 64) {
    throw new Error("请输入 1 到 64 个字符的达人昵称。");
  }

  const candidates: DouyinProfileCandidate[] = [];
  const upstreams: string[] = [];
  let successfulProviders = 0;

  for (const provider of PROVIDERS) {
    try {
      const response = await fetchImpl(provider.buildUrl(query), {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36"
        },
        cache: "no-store",
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS)
      });
      if (!response.ok) {
        upstreams.push(`${provider.name}:${response.status}`);
        continue;
      }

      successfulProviders += 1;
      candidates.push(...provider.parse(await response.text(), query));
    } catch (error) {
      upstreams.push(`${provider.name}:${error instanceof Error ? error.name : "unknown"}`);
    }
  }

  if (successfulProviders === 0) {
    throw new DouyinProfileDiscoveryError(upstreams);
  }
  return rankCandidates(candidates, query);
}
