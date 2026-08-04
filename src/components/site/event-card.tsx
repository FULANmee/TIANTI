import Link from "next/link";
import { formatDateRange } from "@/lib/date";
import { getEventDisplayName } from "@/lib/event-display";
import { getEventPath } from "@/lib/public-path";
import type { EventSummary } from "@/modules/domain/types";

export function EventCard({ item }: { item: EventSummary }) {
  const statusLabel =
    item.temporalStatus === "future" ? "未来活动" : item.temporalStatus === "past" ? "已结束活动" : "待定活动";

  return (
    <Link
      href={getEventPath(item.event)}
      className="surface group grid gap-6 rounded-[2rem] p-6 transition duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-strong)] md:grid-cols-[0.78fr_1.22fr]"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] uppercase tracking-[0.22em] ui-muted">
          <span>{item.event.city || "城市待定"}</span>
          <span>{statusLabel}</span>
        </div>
        <div className="space-y-3">
          <h3 className="text-3xl tracking-[-0.04em] text-[var(--foreground)]">
            {getEventDisplayName(item.event)}
          </h3>
          <div className="space-y-1 text-sm ui-subtle">
            <p>{formatDateRange(item.event.startsAt, item.event.endsAt)}</p>
            {item.event.venue ? <p>{item.event.venue}</p> : null}
          </div>
        </div>
        {item.event.note ? <p className="text-sm leading-7 ui-subtle">{item.event.note}</p> : null}
      </div>
      <div className="space-y-4">
        {item.lineupGroups.length > 0 ? (
          item.lineupGroups.map((group) => (
            <div key={group.date ?? "single"} className="space-y-3">
              {group.label ? <p className="ui-kicker">{group.label}</p> : null}
              <div data-testid="event-card-lineup-grid" className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-6">
                {group.items.map((lineup) => (
                  <div
                    key={lineup.lineup.id}
                    data-testid="event-card-lineup-talent"
                    className="surface-strong min-w-0 rounded-[1rem] p-2.5 sm:rounded-[1.15rem] sm:p-3"
                  >
                    <p className="truncate text-xs text-[var(--foreground)] sm:text-sm">{lineup.talent.nickname}</p>
                    {lineup.lineup.note ? (
                      <p className="mt-2 line-clamp-2 text-[11px] leading-4 ui-subtle sm:text-xs sm:leading-5">{lineup.lineup.note}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[1.15rem] border border-dashed border-[var(--line-strong)] px-4 py-6 text-sm ui-subtle">
            暂无公开阵容
          </div>
        )}
      </div>
    </Link>
  );
}
