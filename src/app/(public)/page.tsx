import Link from "next/link";
import { EventCard } from "@/components/site/event-card";
import { TalentCard } from "@/components/site/talent-card";
import { EditorialHero } from "@/components/ui/editorial-hero";
import { PageShell } from "@/components/ui/page-shell";
import { PublicReveal } from "@/components/ui/public-reveal";
import { SectionFrame } from "@/components/ui/section-frame";
import { getTalentPath } from "@/lib/public-path";
import { buildMetadata } from "@/lib/site";
import { getHomepageData } from "@/modules/content/service";

export const metadata = buildMetadata({
  title: "TIANTI | 内容入口",
  description: "从达人、活动、公开档案与编辑视角进入 TIANTI 的统一浏览入口。",
  path: "/"
});

export default async function HomePage() {
  const homepage = await getHomepageData();

  return (
    <PageShell className="pt-5 md:pt-6">
      <PublicReveal>
        <EditorialHero
          eyebrow="深圳 · 人物与活动档案"
          title="TIANTI"
          description="查找你关注的达人，看看她们接下来会出现在哪里，也回到已经发生过的活动与现场记录。"
          actions={
            <>
              <Link href="/talents" data-testid="home-cta-talents" className="ui-button-primary text-sm">
                浏览达人
              </Link>
              <Link
                href="/events?eventStatus=future&sort=lineupSize"
                data-testid="home-cta-events"
                className="ui-button-secondary text-sm"
              >
                查看近期活动
              </Link>
            </>
          }
          aside={
            <div className="grid gap-4">
              <div className="surface rounded-[1.7rem] p-5">
                <p className="ui-kicker">档案速览</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div className="ui-stat">
                    <p className="text-sm ui-muted">近期活动</p>
                    <p className="mt-2 text-3xl tracking-[-0.04em] text-[var(--foreground)]">
                      {homepage.stats.recentEventCount}
                    </p>
                  </div>
                  <div className="ui-stat">
                    <p className="text-sm ui-muted">更新达人</p>
                    <p className="mt-2 text-3xl tracking-[-0.04em] text-[var(--foreground)]">
                      {homepage.stats.recentTalentCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          }
        />
      </PublicReveal>

      <div className="mt-14 space-y-16 md:space-y-20">
        {homepage.futureEvents.length > 0 ? (
          <PublicReveal>
            <SectionFrame
              eyebrow="近期通告"
              title="接下来可以见到谁"
              description="未来活动按阵容规模排列，时间、城市和已确认达人都在这里。"
              actions={
                <Link href="/events?eventStatus=future&sort=lineupSize" className="ui-button-secondary text-sm">
                  查看全部活动
                </Link>
              }
            >
              <div className="grid gap-6">
                {homepage.futureEvents.map((event) => (
                  <EventCard key={event.event.id} item={event} />
                ))}
              </div>
            </SectionFrame>
          </PublicReveal>
        ) : null}

        <PublicReveal>
          <SectionFrame
            eyebrow="人物索引"
            title="近期更新的达人"
            description="从人物进入她参与的活动、公开行程与已经收录的现场档案。"
            actions={
              <Link href="/talents" className="ui-button-secondary text-sm">
                打开达人索引
              </Link>
            }
          >
            <div data-testid="home-talent-grid" className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              {homepage.featuredTalents.map((talent, index) => (
                <TalentCard key={talent.id} talent={talent} eagerImage={index < 6} />
              ))}
            </div>
          </SectionFrame>
        </PublicReveal>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <PublicReveal className="h-full">
            <section className="surface h-full rounded-[2rem] p-6 md:p-7">
              <div className="flex items-center justify-between gap-4 border-b pb-4 ui-divider">
                <div>
                  <p className="ui-kicker">Editorial Views</p>
                  <h2 className="mt-3 text-3xl tracking-[-0.03em] text-[var(--foreground)]">公开视角入口</h2>
                </div>
                <Link href="/ladder" className="ui-button-secondary text-sm">
                  进入天梯
                </Link>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {homepage.editorSpotlights.map((spotlight) => (
                  <article key={spotlight.editor.id} className="surface-strong rounded-[1.5rem] p-5">
                    <h3 className="text-2xl tracking-[-0.03em] text-[var(--foreground)]">{spotlight.editor.name}</h3>
                    <p className="mt-3 text-sm leading-7 ui-subtle">{spotlight.summary}</p>
                    <Link href={spotlight.href} className="mt-4 inline-flex text-sm text-[var(--color-accent)]">
                      查看公开排序
                    </Link>
                  </article>
                ))}
              </div>
            </section>
          </PublicReveal>

          <PublicReveal delay={0.08} className="h-full">
            <section className="surface h-full rounded-[2rem] p-6 md:p-7">
              <div className="border-b pb-4 ui-divider">
                <p className="ui-kicker">Recent Talents</p>
                <h2 className="mt-3 text-3xl tracking-[-0.03em] text-[var(--foreground)]">最近达人</h2>
              </div>
              <div className="mt-5 space-y-4">
                {homepage.recentTalents.slice(0, 4).map((talent) => (
                  <Link
                    key={talent.id}
                    href={getTalentPath(talent)}
                    className="flex items-center justify-between gap-4 border-b pb-4 transition ui-divider last:border-none last:pb-0 hover:text-[var(--color-accent)]"
                  >
                    <div>
                      <p className="text-lg text-[var(--foreground)]">{talent.nickname}</p>
                      <p className="mt-1 text-sm ui-subtle">{talent.recentHint ?? "公开资料已更新"}</p>
                    </div>
                    <span className="text-sm ui-muted">{talent.archiveCount} 条记录</span>
                  </Link>
                ))}
              </div>
            </section>
          </PublicReveal>
        </div>
      </div>
    </PageShell>
  );
}
