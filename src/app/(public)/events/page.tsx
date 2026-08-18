import { AutoFilterForm } from "@/components/site/auto-filter-form";
import { EventCard } from "@/components/site/event-card";
import { LocationItineraryDialog } from "@/components/site/location-itinerary-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageShell } from "@/components/ui/page-shell";
import { SectionFrame } from "@/components/ui/section-frame";
import { compareByPinyin } from "@/lib/pinyin";
import { buildMetadata } from "@/lib/site";
import { getContentState, getEventIndex, getPublicLocationItineraries } from "@/modules/content/service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const sortLabels = {
  recent: "最近发生",
  upcoming: "即将发生",
  lineupSize: "阵容规模"
} as const;

export const metadata = buildMetadata({
  title: "TIANTI | 活动",
  description: "按时间、城市、阵容和状态浏览 TIANTI 的公开活动与档案。",
  path: "/events"
});

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const eventStatus =
    typeof params.eventStatus === "string" && ["future", "past"].includes(params.eventStatus)
      ? (params.eventStatus as "future" | "past")
      : undefined;
  const requestedSort = typeof params.sort === "string" ? params.sort : undefined;
  const sort =
    requestedSort && ["recent", "upcoming", "lineupSize"].includes(requestedSort)
      ? (requestedSort as "recent" | "upcoming" | "lineupSize")
      : undefined;
  const state = await getContentState();
  const locationItineraries = await getPublicLocationItineraries();
  const cities = [...new Set(state.events.map((event) => event.city).filter(Boolean))].sort(compareByPinyin);
  const requestedCity = typeof params.city === "string" ? params.city : undefined;
  const city = requestedCity && cities.includes(requestedCity) ? requestedCity : undefined;
  const requestedEditorSlug = typeof params.editor === "string" ? params.editor : undefined;
  const selectedEditor = state.editors.find((editor) => editor.slug === requestedEditorSlug) ?? null;
  const requestedTalentId = typeof params.talent === "string" ? params.talent : undefined;
  const talentId = state.talents.some((talent) => talent.id === requestedTalentId) ? requestedTalentId : undefined;
  const date = typeof params.date === "string" ? params.date : undefined;
  const events = await getEventIndex({
    query: q,
    eventStatus,
    city,
    editorId: selectedEditor?.id,
    talentId,
    date,
    sort
  });

  const activeSort = sort ?? "recent";

  return (
    <PageShell>
      <SectionFrame
        headingLevel="h1"
        eyebrow="活动通告与档案"
        title="按时间和城市查找活动"
        description="查看即将开始的活动阵容，也可以翻阅已经结束的活动与现场记录。"
        titleTestId="events-page-title"
        actions={<LocationItineraryDialog data={locationItineraries} />}
      />

      <div className="mt-10 space-y-8">
        <FilterBar>
          <AutoFilterForm className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1.4fr_0.8fr]">
            <label className="sr-only" htmlFor="event-filter-search">
              搜索活动
            </label>
            <input
              id="event-filter-search"
              name="q"
              defaultValue={q}
              placeholder="搜索活动名、城市、场馆或阵容达人"
              className="ui-input rounded-full"
              data-testid="event-filter-search"
            />
            <label className="sr-only" htmlFor="event-filter-status">
              按状态筛选活动
            </label>
            <select
              id="event-filter-status"
              name="eventStatus"
              defaultValue={eventStatus ?? ""}
              data-auto-submit="true"
              className="ui-select rounded-full"
            >
              <option value="">全部状态</option>
              <option value="future">未来活动</option>
              <option value="past">已结束活动</option>
            </select>
            </div>
            <details className="group rounded-[0.9rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] p-3">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground-soft)]">更多筛选条件</summary>
              <div className="advanced-filters mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="sr-only" htmlFor="event-filter-city">
              按城市筛选活动
            </label>
            <select
              id="event-filter-city"
              name="city"
              defaultValue={city ?? ""}
              data-auto-submit="true"
              className="ui-select rounded-full"
            >
              <option value="">全部城市</option>
              {cities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="event-filter-editor">
              按编辑者筛选活动
            </label>
            <select
              id="event-filter-editor"
              name="editor"
              defaultValue={selectedEditor?.slug ?? ""}
              data-auto-submit="true"
              className="ui-select rounded-full"
            >
              <option value="">全部编辑者</option>
              {state.editors.map((editor) => (
                <option key={editor.id} value={editor.slug}>
                  {editor.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="event-filter-talent">
              按相关达人筛选活动
            </label>
            <select
              id="event-filter-talent"
              name="talent"
              defaultValue={talentId ?? ""}
              data-auto-submit="true"
              className="ui-select rounded-full"
            >
              <option value="">全部相关达人</option>
              {state.talents.map((talent) => (
                <option key={talent.id} value={talent.id}>
                  {talent.nickname}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="event-filter-date">
              按日期筛选活动
            </label>
            <input
              id="event-filter-date"
              type="date"
              name="date"
              defaultValue={date ?? ""}
              data-auto-submit="true"
              className="ui-input rounded-full"
            />
            <label className="sr-only" htmlFor="event-filter-sort">
              活动排序方式
            </label>
            <select
              id="event-filter-sort"
              name="sort"
              defaultValue={activeSort}
              data-auto-submit="true"
              className="ui-select rounded-full"
            >
              <option value="recent">按最近发生</option>
              <option value="upcoming">按即将发生</option>
              <option value="lineupSize">按阵容规模</option>
            </select>
              </div>
            </details>
          </AutoFilterForm>
        </FilterBar>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm ui-subtle">
          <p>
            共找到 <span className="text-[var(--foreground)]">{events.length}</span> 场活动
          </p>
          <p>当前排序：{sortLabels[activeSort]}</p>
        </div>

        {events.length > 0 ? (
          <div className="grid gap-6">
            {events.map((event) => (
              <EventCard key={event.event.id} item={event} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="没有匹配的活动"
            description="可以放宽活动状态、日期、编辑者或阵容条件，重新回到更宽的浏览范围。"
          />
        )}
      </div>
    </PageShell>
  );
}
