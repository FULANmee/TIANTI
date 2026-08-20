import Link from "next/link";
import { FramedImage } from "@/components/ui/framed-image";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { SectionFrame } from "@/components/ui/section-frame";
import { getAssetDisplayPreset } from "@/lib/asset-display";
import { getTalentPath } from "@/lib/public-path";
import { buildMetadata } from "@/lib/site";
import { getAutomaticLadderPage, getLadderPage, getSiteEditors } from "@/modules/content/service";
import { formatDouyinFollowerCount, formatDouyinFollowerDelta } from "@/modules/douyin/format";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = buildMetadata({
  title: "TIANTI | 天梯",
  description: "从不同编辑视角浏览 TIANTI 的公开排序与梯度。",
  path: "/ladder"
});

export default async function LadderPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const editors = await getSiteEditors();
  const automaticModes = ["followers", "average-lin", "average-yu"] as const;
  const automaticMode = typeof params.view === "string" && automaticModes.includes(params.view as typeof automaticModes[number])
    ? params.view as typeof automaticModes[number]
    : null;
  const editorSlug =
    typeof params.editor === "string" && editors.some((editor) => editor.slug === params.editor)
      ? params.editor
      : editors[0]?.slug;
  const manualData = !automaticMode && editorSlug ? await getLadderPage(editorSlug) : null;
  const followerSorts = ["followers", "growth", "rate"] as const;
  const followerSort = typeof params.sort === "string" && followerSorts.includes(params.sort as typeof followerSorts[number])
    ? params.sort as typeof followerSorts[number]
    : "followers";
  const automaticData = automaticMode ? await getAutomaticLadderPage(automaticMode, followerSort) : null;
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
            const active = !automaticMode && editor.slug === editorSlug;
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
          <Link href="/ladder?view=followers" className={`ui-pill px-5 py-3 text-sm ${automaticMode === "followers" ? "border-[rgba(43,109,246,0.22)] bg-[rgba(43,109,246,0.08)] text-[var(--color-accent)]" : ""}`}>粉丝天梯</Link>
          {editors.map((editor) => <Link key={`average-${editor.id}`} href={`/ladder?view=average-${editor.slug}`} className={`ui-pill px-5 py-3 text-sm ${automaticMode === `average-${editor.slug}` ? "border-[rgba(43,109,246,0.22)] bg-[rgba(43,109,246,0.08)] text-[var(--color-accent)]" : ""}`}>{editor.name}平均梯度</Link>)}
        </div>

        {data ? (
          <>
            {automaticMode === "followers" ? <div className="inline-flex rounded-[0.8rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] p-1" aria-label="粉丝天梯排序方式">{([{ id: "followers", label: "粉丝量" }, { id: "growth", label: "涨粉量" }, { id: "rate", label: "涨粉比率" }] as const).map((item) => <Link key={item.id} href={`/ladder?view=followers&sort=${item.id}`} className={`rounded-[0.6rem] px-4 py-2 text-sm ${followerSort === item.id ? "bg-[var(--surface-strong)] font-semibold shadow-sm" : "ui-muted"}`}>{item.label}</Link>)}</div> : null}
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
                    <p className="text-sm ui-muted">梯度人数</p>
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
                      <p className="ui-kicker">Tier {index + 1}</p>
                      <h2 className="mt-3 text-3xl tracking-[-0.03em] text-[var(--foreground)]">{tier.name}</h2>
                    </div>
                    <p className="text-sm ui-subtle">{tier.talents.length} 位达人</p>
                  </div>
                  {tier.talents.length > 0 ? (
                    <div data-testid="ladder-tier-grid" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10">
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
                            {automaticMode === "followers" && "followerCount" in talentItem ? <div className="mt-2 space-y-1 font-mono text-[10px] leading-4"><p className="text-[var(--foreground-soft)]">粉丝 {talentItem.followerCount == null ? "—" : formatDouyinFollowerCount(talentItem.followerCount)}</p><p className={talentItem.followerGrowth == null ? "ui-muted" : talentItem.followerGrowth < 0 ? "text-[#16866b]" : "text-[#b13b45]"}>涨粉 {talentItem.followerGrowth == null ? "—" : formatDouyinFollowerDelta(talentItem.followerGrowth)}</p><p className={talentItem.followerGrowthRate == null ? "ui-muted" : talentItem.followerGrowthRate < 0 ? "text-[#16866b]" : "text-[#b13b45]"}>幅度 {talentItem.followerGrowthRate == null ? "—" : `${talentItem.followerGrowthRate >= 0 ? "+" : ""}${(talentItem.followerGrowthRate * 100).toFixed(2)}%`}</p><p className="ui-muted">{talentItem.followerRecordedDays == null ? "暂无历史" : talentItem.followerRecordedDays >= 30 ? "近 30 天" : `基于 ${talentItem.followerRecordedDays} 天记录`}</p></div> : null}
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
