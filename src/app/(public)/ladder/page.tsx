import Link from "next/link";
import { CalendarRange } from "lucide-react";
import type { CSSProperties } from "react";
import { FramedImage } from "@/components/ui/framed-image";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { SectionFrame } from "@/components/ui/section-frame";
import { getAssetDisplayPreset } from "@/lib/asset-display";
import { getDateOnlyKey, getShanghaiDateKey } from "@/lib/date";
import { getTalentPath } from "@/lib/public-path";
import { buildMetadata } from "@/lib/site";
import { getAutomaticLadderPage, getLadderPage, getSiteEditors } from "@/modules/content/service";
import { formatDouyinFollowerCount, formatDouyinFollowerDelta } from "@/modules/douyin/format";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type FollowerSort = "followers" | "growth" | "rate";
type FollowerComparisonRange = { from: string; to: string };
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getDateKeyDaysAgo(days: number) {
  return getShanghaiDateKey(new Date(Date.now() - days * DAY_IN_MS));
}

function getFollowerComparisonRange(params: Record<string, string | string[] | undefined>) {
  const today = getShanghaiDateKey();
  const requestedFrom = typeof params.from === "string" ? getDateOnlyKey(params.from) : null;
  const requestedTo = typeof params.to === "string" ? getDateOnlyKey(params.to) : null;
  const from = requestedFrom && requestedFrom <= today ? requestedFrom : getDateKeyDaysAgo(30);
  const to = requestedTo && requestedTo <= today ? requestedTo : today;
  return from <= to ? { from, to, today } : { from: to, to: from, today };
}

function getFollowerHref(sort: FollowerSort, range: FollowerComparisonRange) {
  const query = new URLSearchParams({ view: "followers", sort, from: range.from, to: range.to });
  return `/ladder?${query.toString()}`;
}

interface FollowerMetricsProps {
  followerCount: number | null;
  followerGrowth: number | null;
  followerGrowthRate: number | null;
  followerRecordedDays: number | null;
  sort: FollowerSort;
}

function FollowerMetrics({ followerCount, followerGrowth, followerGrowthRate, followerRecordedDays, sort }: FollowerMetricsProps) {
  const lines = {
    followers: {
      id: "followers",
      label: "粉丝",
      value: followerCount == null ? "—" : formatDouyinFollowerCount(followerCount),
      tone: followerCount == null ? "ui-muted" : "text-[var(--foreground-soft)]"
    },
    growth: {
      id: "growth",
      label: "涨粉",
      value: followerGrowth == null ? "—" : formatDouyinFollowerDelta(followerGrowth),
      tone: followerGrowth == null ? "ui-muted" : followerGrowth < 0 ? "text-[#16866b]" : "text-[#b13b45]"
    },
    rate: {
      id: "rate",
      label: "幅度",
      value: followerGrowthRate == null ? "—" : `${followerGrowthRate >= 0 ? "+" : ""}${(followerGrowthRate * 100).toFixed(2)}%`,
      tone: followerGrowthRate == null ? "ui-muted" : followerGrowthRate < 0 ? "text-[#16866b]" : "text-[#b13b45]"
    }
  } as const;
  const order: Record<FollowerSort, Array<keyof typeof lines>> = {
    followers: ["followers", "growth", "rate"],
    growth: ["growth", "rate", "followers"],
    rate: ["rate", "growth", "followers"]
  };

  return (
    <div className="mt-2 space-y-1 font-mono leading-4">
      {order[sort].map((key, index) => {
        const line = lines[key];
        return <p key={line.id} className={`${line.tone} ${index === 0 ? "text-[11px] font-semibold" : "text-[10px]"}`}>{line.label} {line.value}</p>;
      })}
      <p className="text-[10px] ui-muted">{followerRecordedDays == null ? "暂无历史" : `基于 ${followerRecordedDays} 天记录`}</p>
    </div>
  );
}

export const metadata = buildMetadata({
  title: "TIANTI | 天梯",
  description: "从不同编辑视角浏览 TIANTI 的公开排序与梯度。",
  path: "/ladder"
});

export default async function LadderPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const editors = await getSiteEditors();
  const isFollowers = params.view === "followers";
  const legacyAverageSlug = typeof params.view === "string" && params.view.startsWith("average-")
    ? params.view.slice("average-".length)
    : null;
  const editorSlug =
    typeof params.editor === "string" && editors.some((editor) => editor.slug === params.editor)
      ? params.editor
      : legacyAverageSlug && editors.some((editor) => editor.slug === legacyAverageSlug)
        ? legacyAverageSlug
        : editors[0]?.slug;
  const editorMode = params.mode === "average" || legacyAverageSlug ? "average" : "manual";
  const manualData = !isFollowers && editorMode === "manual" && editorSlug ? await getLadderPage(editorSlug) : null;
  const followerSorts = ["followers", "growth", "rate"] as const;
  const followerSort = typeof params.sort === "string" && followerSorts.includes(params.sort as typeof followerSorts[number])
    ? params.sort as typeof followerSorts[number]
    : "followers";
  const followerRange = getFollowerComparisonRange(params);
  const followerComparisonRange = { from: followerRange.from, to: followerRange.to };
  const followerShortcuts = [
    { id: "yesterday", label: "与昨天", range: { from: getDateKeyDaysAgo(1), to: followerRange.today } },
    { id: "seven-days", label: "近 7 天", range: { from: getDateKeyDaysAgo(7), to: followerRange.today } },
    { id: "thirty-days", label: "近 30 天", range: { from: getDateKeyDaysAgo(30), to: followerRange.today } }
  ];
  const averageMode = editorSlug === "lin" || editorSlug === "yu" ? `average-${editorSlug}` as const : null;
  const automaticMode = isFollowers ? "followers" : editorMode === "average" ? averageMode : null;
  const automaticData = automaticMode ? await getAutomaticLadderPage(automaticMode, followerSort, isFollowers ? followerComparisonRange : undefined) : null;
  const data = automaticData ? {
    ladder: { title: automaticData.title, subtitle: automaticData.subtitle },
    editor: automaticData.editor ?? { name: "自动计算" },
    tiers: automaticData.tiers
  } : manualData;

  return (
    <PageShell>
      <SectionFrame
        headingLevel="h1"
        eyebrow="Curated Ranking"
        title="公开排序并不是唯一答案，而是一种编辑视角"
        description="每位编辑维护自己的梯度和排序。公开页只负责让这些视角更清晰地被浏览。"
        titleTestId="ladder-page-title"
      />

      <div className="mt-10 space-y-8">
        <div className="flex flex-wrap gap-2">
          {editors.map((editor) => {
            const active = !isFollowers && editor.slug === editorSlug;
            return (
              <Link
                key={editor.id}
                href={`/ladder?editor=${editor.slug}`}
                className={`ui-pill px-5 py-3 text-sm ${
                  active ? "border-[rgba(43,109,246,0.22)] bg-[rgba(43,109,246,0.08)] text-[var(--color-accent)]" : ""
                }`}
              >
                {editor.name}
              </Link>
            );
          })}
          <Link href="/ladder?view=followers" className={`ui-pill px-5 py-3 text-sm ${isFollowers ? "border-[rgba(43,109,246,0.22)] bg-[rgba(43,109,246,0.08)] text-[var(--color-accent)]" : ""}`}>粉丝天梯</Link>
        </div>

        {data ? (
          <>
            {isFollowers ? (
              <div className="space-y-4">
                <div className="inline-flex rounded-[0.8rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] p-1" aria-label="粉丝天梯排序方式">
                  {([{ id: "followers", label: "粉丝量" }, { id: "growth", label: "涨粉量" }, { id: "rate", label: "涨粉比率" }] as const).map((item) => (
                    <Link key={item.id} href={getFollowerHref(item.id, followerComparisonRange)} className={`rounded-[0.6rem] px-4 py-2 text-sm ${followerSort === item.id ? "bg-[var(--surface-strong)] font-semibold shadow-sm" : "ui-muted"}`}>{item.label}</Link>
                  ))}
                </div>

                <section data-testid="follower-date-filter" className="ui-status-spine surface rounded-[1.25rem] p-4 pl-5" style={{ "--status-color": "var(--color-accent)" } as CSSProperties}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"><CalendarRange aria-hidden="true" className="size-4 text-[var(--color-accent)]" />对比区间</p>
                      <p className="mt-1 font-mono text-xs ui-muted">{followerRange.from} → {followerRange.to}</p>
                    </div>
                    <div className="flex flex-wrap gap-2" aria-label="快捷对比区间">
                      {followerShortcuts.map((shortcut) => {
                        const active = shortcut.range.from === followerRange.from && shortcut.range.to === followerRange.to;
                        return <Link key={shortcut.id} data-testid={`follower-range-${shortcut.id}`} href={getFollowerHref(followerSort, shortcut.range)} className={`ui-pill px-3 py-2 text-xs ${active ? "border-[rgba(43,109,246,0.28)] bg-[rgba(43,109,246,0.1)] font-semibold text-[var(--color-accent)]" : ""}`}>{shortcut.label}</Link>;
                      })}
                    </div>
                  </div>
                  <form action="/ladder" method="get" className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-end">
                    <input type="hidden" name="view" value="followers" />
                    <input type="hidden" name="sort" value={followerSort} />
                    <label className="ui-field-label"><span>起始日期</span><input data-testid="follower-range-from" type="date" name="from" defaultValue={followerRange.from} max={followerRange.today} className="ui-input font-mono text-sm" /></label>
                    <span aria-hidden="true" className="hidden pb-3 text-sm ui-muted sm:block">至</span>
                    <label className="ui-field-label"><span>结束日期</span><input data-testid="follower-range-to" type="date" name="to" defaultValue={followerRange.to} max={followerRange.today} className="ui-input font-mono text-sm" /></label>
                    <button type="submit" data-testid="apply-follower-range" className="ui-button-primary px-4 text-sm">应用对比</button>
                  </form>
                </section>
              </div>
            ) : editorSlug ? <div className="inline-flex rounded-[0.8rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] p-1" aria-label={`${data.editor.name}天梯类型`}>{([{ id: "manual", label: "普通天梯" }, { id: "average", label: "平均天梯" }] as const).map((item) => <Link key={item.id} href={`/ladder?editor=${editorSlug}${item.id === "average" ? "&mode=average" : ""}`} className={`rounded-[0.6rem] px-4 py-2 text-sm ${editorMode === item.id ? "bg-[var(--surface-strong)] font-semibold shadow-sm" : "ui-muted"}`}>{item.label}</Link>)}</div> : null}
            <section className="public-stage surface overflow-hidden rounded-[2rem] p-6 md:p-7">
              <div className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-3">
                  <h1 className="text-4xl tracking-[-0.04em] text-[var(--foreground)] md:text-5xl">
                    {data.ladder.title}
                  </h1>
                  <p className="max-w-2xl text-sm leading-7 ui-subtle md:text-base">{data.ladder.subtitle}</p>
                </div>
                <div className="grid gap-3">
                  <div className="ui-stat">
                    <p className="text-sm ui-muted">编辑</p>
                    <p className="mt-2 text-2xl text-[var(--foreground)]">{data.editor.name}</p>
                  </div>
                  <div className="ui-stat">
                    <p className="text-sm ui-muted">已入榜达人</p>
                    <p className="mt-2 text-2xl text-[var(--foreground)]">
                      {data.tiers.reduce((total, tier) => total + tier.talents.length, 0)}
                    </p>
                  </div>
                  <div className="ui-stat">
                    <p className="text-sm ui-muted">{isFollowers && followerSort !== "followers" ? "榜单人数" : "梯度人数"}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {data.tiers.map((tier) => (
                        <span key={tier.id} className="ui-pill inline-flex items-baseline gap-[0.9rem] px-3 py-2 text-sm">
                          <span className="font-semibold text-[var(--foreground)]">{tier.name}</span>
                          <span className="font-normal text-[var(--foreground-soft)]">{tier.talents.length}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="space-y-6">
              {data.tiers.map((tier, index) => (
                <section key={tier.id} className="surface rounded-[2rem] p-6 md:p-7">
                  <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-4 ui-divider">
                    <div>
                      <p className="ui-kicker">{isFollowers && followerSort !== "followers" ? "连续榜单" : `Tier ${index + 1}`}</p>
                      <h2 className="mt-3 text-3xl tracking-[-0.03em] text-[var(--foreground)]">{tier.name}</h2>
                    </div>
                    <p className="text-sm ui-subtle">{tier.talents.length} 位达人</p>
                  </div>
                  {tier.talents.length > 0 ? (
                    <div data-testid="ladder-tier-grid" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-8">
                      {tier.talents.map((talentItem, talentIndex) => {
                        const { talent, cover } = talentItem;
                        return (
                        <Link
                          key={talent.id}
                          href={getTalentPath(talent)}
                          data-testid={`ladder-tier-${tier.id}-talent-${talentIndex}`}
                          className="surface-strong overflow-hidden rounded-[1.5rem] transition hover:-translate-y-1 hover:shadow-[var(--shadow-soft)]"
                        >
                          <div
                            className="relative"
                            style={{ aspectRatio: getAssetDisplayPreset("talent_cover", cover).aspectStyle }}
                          >
                            {cover ? (
                              <FramedImage
                                asset={cover}
                                eager={index === 0 && talentIndex === 0}
                                sizes="(min-width: 1280px) 12.5vw, (min-width: 768px) 25vw, 50vw"
                              />
                            ) : (
                              <div className="absolute inset-0 bg-transparent" />
                            )}
                          </div>
                          <div className="p-3">
                            <p className="truncate text-sm font-semibold text-[var(--foreground)]">{talent.nickname}</p>
                            {isFollowers && "followerCount" in talentItem ? <FollowerMetrics followerCount={talentItem.followerCount} followerGrowth={talentItem.followerGrowth} followerGrowthRate={talentItem.followerGrowthRate} followerRecordedDays={talentItem.followerRecordedDays} sort={followerSort} /> : null}
                          </div>
                        </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="mt-6 rounded-[1.4rem] border border-dashed border-[var(--line-strong)] px-4 py-8 text-sm ui-subtle">
                      这个梯度还没有公开达人。
                    </div>
                  )}
                </section>
              ))}
            </div>
          </>
        ) : (
          <EmptyState title="没有可用的公开天梯" description="当前还没有可展示的编辑排序视角。" />
        )}
      </div>
    </PageShell>
  );
}
