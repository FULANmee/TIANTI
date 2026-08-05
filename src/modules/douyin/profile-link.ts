import type { Talent } from "@/modules/domain/types";

const DOUYIN_HOSTS = new Set(["douyin.com", "www.douyin.com", "v.douyin.com"]);
const DIRECT_PROFILE_PATH = /^\/user\/[A-Za-z0-9_-]{1,512}\/?$/u;
const SHORT_PROFILE_PATH = /^\/[A-Za-z0-9_-]{1,512}\/?$/u;

function normalizeDouyinProfileUrl(value: string) {
  try {
    const url = new URL(value);
    const validPath =
      url.hostname === "v.douyin.com"
        ? SHORT_PROFILE_PATH.test(url.pathname)
        : DIRECT_PROFILE_PATH.test(url.pathname);
    if (!(
      url.protocol === "https:" &&
      DOUYIN_HOSTS.has(url.hostname) &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      validPath
    )) {
      return null;
    }

    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isPrimaryLabel(value: string) {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("zh-CN");
  return normalized === "抖音" || normalized === "抖音主页" || normalized === "douyin";
}

export function getPrimaryDouyinProfileLink(talent: Talent) {
  const douyinLinks = talent.links.flatMap((link) => {
    const normalizedUrl = normalizeDouyinProfileUrl(link.url);
    return normalizedUrl ? [{ ...link, url: normalizedUrl }] : [];
  });
  const explicitPrimaryLinks = douyinLinks.filter((link) => isPrimaryLabel(link.label));

  if (explicitPrimaryLinks.length === 1) {
    return { link: explicitPrimaryLinks[0], reason: null };
  }
  if (explicitPrimaryLinks.length > 1) {
    return { link: null, reason: "抖音主页链接不唯一。" };
  }
  if (douyinLinks.length > 0) {
    return { link: null, reason: "抖音主页链接需要标注为“抖音”。" };
  }
  return { link: null, reason: "未配置有效的抖音主页链接。" };
}

export function isSafeDouyinRelatedAccountUrl(value: string) {
  const normalizedUrl = normalizeDouyinProfileUrl(value);
  return Boolean(
    normalizedUrl &&
      new URL(normalizedUrl).hostname !== "v.douyin.com" &&
      normalizedUrl === value
  );
}
