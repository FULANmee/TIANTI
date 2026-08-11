import type { Metadata } from "next";
import Link from "next/link";
import { FramedImage } from "@/components/ui/framed-image";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { HorizontalCardRail } from "@/components/ui/horizontal-card-rail";
import { PageShell } from "@/components/ui/page-shell";
import { PublicReveal } from "@/components/ui/public-reveal";
import { SectionFrame } from "@/components/ui/section-frame";
import { getAssetDisplayPreset } from "@/lib/asset-display";
import { formatDate, formatDateRange } from "@/lib/date";
import { getEventDisplayName } from "@/lib/event-display";
import { getEventPath, getPublicIdentifier, getTalentPath } from "@/lib/public-path";
import { buildMetadata } from "@/lib/site";
import { getTalentPage } from "@/modules/content/service";
import { formatDouyinFollowerCount } from "@/modules/douyin/format";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parsePageParam(value: string | string[] | undefined) {
  if (typeof value !== "string") {
    return 1;
  }

  const nextValue = Number.parseInt(value, 10);
  return Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 1;
}

function buildPageHref(
  identifier: string,
  currentUpcomingPage: number,
  currentHistoryPage: number,
  field: "upcomingPage" | "historyPage",
  value: number
) {
  const params = new URLSearchParams();

  const nextUpcomingPage = field === "upcomingPage" ? value : currentUpcomingPage;
  const nextHistoryPage = field === "historyPage" ? value : currentHistoryPage;

  if (nextUpcomingPage > 1) {
    params.set("upcomingPage", String(nextUpcomingPage));
  }

  if (nextHistoryPage > 1) {
    params.set("historyPage", String(nextHistoryPage));
  }

  const suffix = params.toString();
  const encodedIdentifier = encodeURIComponent(identifier);
  return suffix ? `/talents/${encodedIdentifier}?${suffix}` : `/talents/${encodedIdentifier}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getTalentPage(slug);

  if (!detail) {
    return buildMetadata({
      title: "TIANTI | 达人详情",
      description: "TIANTI 的公开达人详情页。",
      path: `/talents/${slug}`
    });
  }

  return buildMetadata({
    title: `TIANTI | ${detail.talent.nickname}`,
    description: `${detail.talent.nickname} 的公开资料、相关活动与编辑摘要。`,
    path: getTalentPath(detail.talent)
  });
}

export default async function TalentDetailPage({
  params,
  searchParams
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const detail = await getTalentPage(slug);

  if (!detail) {
    notFound();
  }

  const upcomingPage = parsePageParam(query.upcomingPage);
  const historyPage = parsePageParam(query.historyPage);
  const pageSize = 4;
  const totalUpcomingPages = Math.max(1, Math.ceil(detail.futureEvents.length / pageSize));
  const totalHistoryPages = Math.max(1, Math.ceil(detail.pastEvents.length / pageSize));
  const safeUpcomingPage = Math.min(upcomingPage, totalUpcomingPages);
  const safeHistoryPage = Math.min(historyPage, totalHistoryPages);
  const pagedUpcomingEvents = detail.futureEvents.slice((safeUpcomingPage - 1) * pageSize, safeUpcomingPage * pageSize);
  const pagedHistoryEvents = detail.pastEvents.slice((safeHistoryPage - 1) * pageSize, safeHistoryPage * pageSize);
  const talentIdentifier = getPublicIdentifier(detail.talent);
  const coverDisplayPreset = getAssetDisplayPreset("talent_cover", detail.cover);
  const douyinProfile = detail.douyinProfile;

  const publicInfoRows = [
    detail.talent.aliases.length > 0 ? { label: "别名", value: detail.talent.aliases.join(" / ") } : null,
    detail.talent.mcn ? { label: "所属机构", value: detail.talent.mcn } : null,
    detail.douyinProfile?.followerCount != null
      ? { label: "抖音粉丝", value: formatDouyinFollowerCount(detail.douyinProfile.followerCount) }
      : null
  ].filter(Boolean) as Array<{ label: string; value: string }>;
  const hasDouyinDetails =
    douyinProfile && (
      douyinProfile.itineraryBlocks.length > 0 ||
      douyinProfile.relatedAccounts.length > 0 ||
      Boolean(douyinProfile.latestWorkUrl)
    );

  return (
    <PageShell>
      <PublicReveal>
        <section className="surface overflow-hidden rounded-[2.4rem] p-6 md:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="relative overflow-hidden rounded-[1.8rem] bg-transparent">
              <div className="relative" style={{ aspectRatio: coverDisplayPreset.aspectStyle }}>
                {detail.cover ? (
                  <FramedImage
                    asset={detail.cover}
                    sizes="(min-width: 1024px) 36vw, 100vw"
                  />
                ) : (
                  <div className="absolute inset-0 bg-transparent" />
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <p className="ui-kicker">Talent Detail</p>
                <h1 className="text-5xl tracking-[-0.05em] text-[var(--foreground)] md:text-6xl">
                  {detail.talent.nickname}
                </h1>
                <p className="max-w-3xl whitespace-pre-line text-base leading-8 ui-subtle">
                  {detail.talent.bio || "当前公开页以结构化资料为主，后续内容会继续补齐。"}
                </p>
              </div>

              {douyinProfile && hasDouyinDetails ? (
                <div
                  className="grid gap-4 md:grid-cols-[1.35fr_0.65fr]"
                  data-testid="douyin-profile-summary"
                >
                  {douyinProfile.latestWorkUrl ? (
                    <section className="surface-strong rounded-[1.4rem] p-4 md:col-span-2" data-testid="douyin-latest-work">
                      <p className="text-sm ui-muted">最新作品</p>
                      <a
                        href={douyinProfile.latestWorkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex text-sm leading-7 text-[var(--foreground)] underline decoration-[var(--line-soft)] underline-offset-4"
                      >
                        {douyinProfile.latestWorkCaption?.trim() || "查看最新作品"}
                      </a>
                    </section>
                  ) : null}
                  {douyinProfile.itineraryBlocks.length > 0 ? (
                    <section
                      className={
                        douyinProfile.relatedAccounts.length > 0
                          ? "surface-strong rounded-[1.4rem] p-4"
                          : "surface-strong rounded-[1.4rem] p-4 md:col-span-2"
                      }
                      data-testid="douyin-itinerary"
                    >
                      <p className="text-sm ui-muted">主页行程</p>
                      <div className="mt-3 space-y-2">
                        {douyinProfile.itineraryBlocks.map((block, index) => (
                          <p
                            key={`${index}-${block}`}
                            className="whitespace-pre-wrap break-words text-sm leading-7 text-[var(--foreground)]"
                          >
                            {block}
                          </p>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {douyinProfile.relatedAccounts.length > 0 ? (
                    <section
                      className={
                        douyinProfile.itineraryBlocks.length > 0
                          ? "surface-strong rounded-[1.4rem] p-4"
                          : "surface-strong rounded-[1.4rem] p-4 md:col-span-2"
                      }
                      data-testid="douyin-related-accounts"
                    >
                      <p className="text-sm ui-muted">关联小号</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {douyinProfile.relatedAccounts.map((account) => (
                          <a
                            key={account.id}
                            href={account.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ui-button-secondary px-3 py-2 text-sm"
                          >
                            @{account.nickname}
                          </a>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {publicInfoRows.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {publicInfoRows.map((row) => (
                    <div key={row.label} className="surface-strong rounded-[1.4rem] p-4">
                      <p className="text-sm ui-muted">{row.label}</p>
                      <p className="mt-2 text-lg text-[var(--foreground)]">{row.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                {detail.editorSummaries.map((summary) => (
                  <div key={summary.editor.id} className="surface-strong rounded-[1.4rem] p-4">
                    <p className="text-sm ui-muted">{summary.editor.name}</p>
                    <p className="mt-2 text-lg text-[var(--foreground)]">{summary.tierName ?? "未入榜"}</p>
                    <div className="mt-3 flex gap-4 text-sm ui-subtle">
                      <span>{summary.seenCount} 次记录</span>
                      <span>{summary.sharedPhotoCount} 次集邮</span>
                    </div>
                  </div>
                ))}
              </div>

              {detail.talent.links.length > 0 ? (
                <div className="flex flex-wrap gap-3">
                  {detail.talent.links.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ui-button-secondary px-4 py-2 text-sm"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </PublicReveal>

      <div className="mt-14 space-y-14">
        <PublicReveal>
          <SectionFrame
            eyebrow="Activity Path"
            title="从未来活动到历史记录"
            description="先看即将发生的公开活动，再回到已经完成归档的历史出现，阅读路径更顺。"
          >
            <div className="grid gap-6 md:grid-cols-2">
              <section className="surface rounded-[1.9rem] p-6">
                <div className="border-b pb-4 ui-divider">
                  <p className="ui-kicker">Upcoming</p>
                  <h2 className="mt-3 text-3xl tracking-[-0.03em] text-[var(--foreground)]">即将参与</h2>
                </div>
                <div className="mt-5 space-y-4">
                  {pagedUpcomingEvents.length > 0 ? (
                    pagedUpcomingEvents.map((item) => (
                      <Link
                        key={item.event.id}
                        href={getEventPath(item.event)}
                        className="block border-b pb-4 last:border-none last:pb-0 ui-divider"
                      >
                        <p className="text-lg text-[var(--foreground)]">{getEventDisplayName(item.event)}</p>
                        <p className="mt-2 text-sm ui-subtle">
                          {[item.event.city, formatDateRange(item.event.startsAt, item.event.endsAt)].filter(Boolean).join(" · ")}
                        </p>
                        <p className="mt-2 text-sm ui-subtle">{item.detailText || "暂未录入备注"}</p>
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm ui-subtle">当前没有公开的未来活动。</p>
                  )}
                </div>
                {totalUpcomingPages > 1 ? (
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <Link
                      href={buildPageHref(talentIdentifier, Math.max(1, safeUpcomingPage - 1), safeHistoryPage, "upcomingPage", Math.max(1, safeUpcomingPage - 1))}
                      className={`ui-button-secondary text-sm ${safeUpcomingPage === 1 ? "pointer-events-none opacity-45" : ""}`}
                    >
                      上一页
                    </Link>
                    <p className="text-sm ui-subtle">
                      {safeUpcomingPage} / {totalUpcomingPages}
                    </p>
                    <Link
                      href={buildPageHref(talentIdentifier, Math.min(totalUpcomingPages, safeUpcomingPage + 1), safeHistoryPage, "upcomingPage", Math.min(totalUpcomingPages, safeUpcomingPage + 1))}
                      className={`ui-button-secondary text-sm ${safeUpcomingPage === totalUpcomingPages ? "pointer-events-none opacity-45" : ""}`}
                    >
                      下一页
                    </Link>
                  </div>
                ) : null}
              </section>

              <section className="surface rounded-[1.9rem] p-6">
                <div className="border-b pb-4 ui-divider">
                  <p className="ui-kicker">Archive</p>
                  <h2 className="mt-3 text-3xl tracking-[-0.03em] text-[var(--foreground)]">历史出现</h2>
                </div>
                <div className="mt-5 space-y-4">
                  {pagedHistoryEvents.length > 0 ? (
                    pagedHistoryEvents.map((item) => (
                      <Link
                        key={item.event.id}
                        href={getEventPath(item.event)}
                        className="block border-b pb-4 last:border-none last:pb-0 ui-divider"
                      >
                        <p className="text-lg text-[var(--foreground)]">{getEventDisplayName(item.event)}</p>
                        <p className="mt-2 text-sm ui-subtle">
                          {[item.event.city, formatDateRange(item.event.startsAt, item.event.endsAt)].filter(Boolean).join(" · ")}
                        </p>
                        {item.detailText ? <p className="mt-2 text-sm ui-subtle">{item.detailText}</p> : null}
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm ui-subtle">还没有可公开的历史活动记录。</p>
                  )}
                </div>
                {totalHistoryPages > 1 ? (
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <Link
                      href={buildPageHref(talentIdentifier, safeUpcomingPage, Math.max(1, safeHistoryPage - 1), "historyPage", Math.max(1, safeHistoryPage - 1))}
                      className={`ui-button-secondary text-sm ${safeHistoryPage === 1 ? "pointer-events-none opacity-45" : ""}`}
                    >
                      上一页
                    </Link>
                    <p className="text-sm ui-subtle">
                      {safeHistoryPage} / {totalHistoryPages}
                    </p>
                    <Link
                      href={buildPageHref(talentIdentifier, safeUpcomingPage, Math.min(totalHistoryPages, safeHistoryPage + 1), "historyPage", Math.min(totalHistoryPages, safeHistoryPage + 1))}
                      className={`ui-button-secondary text-sm ${safeHistoryPage === totalHistoryPages ? "pointer-events-none opacity-45" : ""}`}
                    >
                      下一页
                    </Link>
                  </div>
                ) : null}
              </section>
            </div>
          </SectionFrame>
        </PublicReveal>

        <PublicReveal>
          <SectionFrame eyebrow="Representation" title="代表图像" description="用图像作为中段阅读重心，减少纯文字堆叠带来的疲劳。">
            {detail.representationAssets.length > 0 ? (
              <HorizontalCardRail
                controlsLabel="代表图像"
                itemStyle={{ width: "min(20rem, calc(100vw - 5rem))" }}
                testIdPrefix="representation-rail"
              >
                {detail.representationAssets.map((representation, index) => (
                  <article
                    key={representation.id}
                    data-testid={`representation-card-${index}`}
                    className="surface flex h-full flex-col overflow-hidden rounded-[1.9rem]"
                  >
                    <div
                      className="relative"
                      style={{
                        aspectRatio: getAssetDisplayPreset("talent_representation", representation.asset).aspectStyle
                      }}
                    >
                      {representation.asset ? (
                        <FramedImage
                          asset={representation.asset}
                          sizes="(min-width: 1280px) 28vw, (min-width: 768px) 42vw, 100vw"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-transparent" />
                      )}
                    </div>
                    <div className="p-5">
                      <p data-testid={`representation-card-title-${index}`} className="text-lg text-[var(--foreground)]">
                        {representation.title}
                      </p>
                    </div>
                  </article>
                ))}
              </HorizontalCardRail>
            ) : (
              <EmptyState title="暂时没有公开代表图像" description="后续如果补充代表图或角色图，会优先出现在这一段。" />
            )}
          </SectionFrame>
        </PublicReveal>

        <PublicReveal>
          <SectionFrame
            eyebrow="Field Record"
            title="现场记录"
            description="把该达人在公开活动档案中的现场记录按活动与日期汇总，作为进入活动详情页的另一条路径。"
          >
            {detail.fieldRecords.length > 0 ? (
              <HorizontalCardRail
                controlsLabel="现场记录"
                itemStyle={{ width: "min(20rem, calc(100vw - 5rem))" }}
                testIdPrefix="field-records-rail"
              >
                {detail.fieldRecords.map((record, index) => (
                  <Link
                    key={record.id}
                    href={getEventPath(record.event)}
                    data-testid={`field-record-card-${index}`}
                    className="surface flex h-full flex-col overflow-hidden rounded-[1.9rem] transition hover:-translate-y-1 hover:shadow-[var(--shadow-soft)]"
                  >
                    <div
                      className="relative"
                      style={{
                        aspectRatio: getAssetDisplayPreset(record.asset?.kind ?? "event_scene", record.asset).aspectStyle
                      }}
                    >
                      {record.asset ? (
                        <FramedImage
                          asset={record.asset}
                          sizes="(min-width: 1280px) 28vw, (min-width: 768px) 42vw, 100vw"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-transparent" />
                      )}
                    </div>
                    <div className="space-y-3 p-5">
                      <p data-testid={`field-record-card-title-${index}`} className="text-lg leading-7 text-[var(--foreground)]">
                        {record.roleSummary}
                      </p>
                      <p className="text-sm ui-subtle">{formatDate(record.recordDate)}</p>
                      <p className="text-sm ui-subtle">{record.locationSummary}</p>
                    </div>
                  </Link>
                ))}
              </HorizontalCardRail>
            ) : (
              <EmptyState
                title="暂时没有公开现场记录"
                description="活动归档补齐后，这里会自动汇总该达人相关的现场记录。"
              />
            )}
          </SectionFrame>
        </PublicReveal>
      </div>
    </PageShell>
  );
}
