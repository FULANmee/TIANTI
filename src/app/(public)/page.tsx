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
          eyebrow="Premium Public Archive"
          title="TIANTI"
          description="把达人、活动、公开档案与编辑视角编排成一条更清晰的浏览路径，让内容本身先被看见。"
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
                <p className="ui-kicker">Highlights</p>
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
              <div className="surface rounded-[1.7rem] p-5">
                <p className="ui-kicker">热门标签</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {homepage.tagSpotlights.map((spotlight) => (
                    <Link key={spotlight.tag} href={spotlight.href} className="ui-pill px-4 py-2 text-sm">
                      {spotlight.tag}
                      <span className="ui-muted">{spotlight.count}</span>
                    </Link>
                  ))}
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
              eyebrow="Upcoming Events"
              title="优先看到即将发生的活动"
              description="按阵容规模优先浏览未来活动，把时间、城市、阵容与详情入口压缩到同一屏。"
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
            eyebrow="Featured Talents"
            title="从重点人物进入内容脉络"
            description="精选封面、最近维护与公开资料摘要，让首页更像内容入口，而不是功能说明页。"
            actions={
              <Link href="/talents" className="ui-button-secondary text-sm">
                打开达人索引
              </Link>
            }
          >
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {homepage.featuredTalents.map((talent, index) => (
                <TalentCard key={talent.id} talent={talent} eagerImage={index === 0} />
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
