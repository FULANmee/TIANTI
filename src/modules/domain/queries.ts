import "server-only";

import {
  deriveEventTemporalStatus,
  formatDateKey,
  getDateOnlyKey,
  getDateRangeDays,
  getDateSortTime,
  getShanghaiDateKey,
  isMultiDayRange,
  toDateOnlyIso
} from "@/lib/date";
import { compareByPinyin } from "@/lib/pinyin";
import { matchesPublicIdentifier } from "@/lib/public-path";
import { getEventDisplayName } from "@/lib/event-display";
import { isSafeDouyinRelatedAccountUrl } from "@/modules/douyin/profile-link";
import type {
  Asset,
  ArchiveEntry,
  ArchiveEntryDisplayItem,
  ArchiveEntryGroup,
  ContentState,
  DashboardSummary,
  DerivedEventStatus,
  DiscoverySection,
  EditorLadder,
  Event,
  EventDetail,
  EventSummary,
  HomepageDiscovery,
  LadderTier,
  RelatedEventSummary,
  RelatedTalentSummary,
  SiteSearchResult,
  Talent,
  TalentDetail,
  TalentEventTimelineItem,
  TalentFieldRecordItem,
  TalentSummary
} from "@/modules/domain/types";

function byId<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function sortByDateDesc<T extends { updatedAt: string }>(rows: T[]) {
  return [...rows].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function getDateKeyDaysAgo(now: Date, days: number) {
  return getShanghaiDateKey(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
}

function getEventPrimaryTime(event: Event) {
  return getDateSortTime(event.startsAt ?? event.endsAt ?? null);
}

function getEventStartBoundary(event: Event) {
  return getDateSortTime(event.startsAt ?? event.endsAt ?? null);
}

function getEventEndBoundary(event: Event) {
  return getDateSortTime(event.endsAt ?? event.startsAt ?? null);
}

function sortEventsChronologically(events: Event[]) {
  return [...events].sort((left, right) => {
    const leftTime = getEventPrimaryTime(left);
    const rightTime = getEventPrimaryTime(right);

    if (leftTime === null && rightTime === null) return 0;
    if (leftTime === null) return 1;
    if (rightTime === null) return -1;
    return leftTime - rightTime;
  });
}

function sortEventsByRecent(events: Event[]) {
  return [...events].sort((left, right) => {
    const leftTime = getEventPrimaryTime(left);
    const rightTime = getEventPrimaryTime(right);

    if (leftTime === null && rightTime === null) return 0;
    if (leftTime === null) return 1;
    if (rightTime === null) return -1;
    return rightTime - leftTime;
  });
}

function compareEventRecent(left: Event, right: Event) {
  const leftTime = getEventPrimaryTime(left);
  const rightTime = getEventPrimaryTime(right);

  if (leftTime === null && rightTime === null) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return rightTime - leftTime;
}

function compareEventChronological(left: Event, right: Event) {
  const leftTime = getEventPrimaryTime(left);
  const rightTime = getEventPrimaryTime(right);

  if (leftTime === null && rightTime === null) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;
  return leftTime - rightTime;
}

function getEventTemporalStatus(event: Event): DerivedEventStatus {
  return deriveEventTemporalStatus(event.startsAt, event.endsAt);
}

function getBioPreviewLine(bio: string) {
  const lines = bio
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length > 0) {
    return lines[0] ?? null;
  }

  const trimmedBio = bio.trim();
  return trimmedBio || null;
}

function getDerivedLadderTitle(editorName: string) {
  return `${editorName}的天梯榜`;
}

function hasArchiveEntriesForEvent(state: ContentState, eventId: string) {
  return state.archives.some((archive) => archive.eventId === eventId && archive.entries.length > 0);
}

function getArchiveEditorIdsForEvent(state: ContentState, eventId: string) {
  return [
    ...new Set(
      state.archives
        .filter((archive) => archive.eventId === eventId && archive.entries.length > 0)
        .map((archive) => archive.editorId)
    )
  ];
}

function collectDistinctTexts(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function buildLocationSummary(event: Event) {
  const parts = [event.city, event.venue].map((value) => value.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "地点待定";
}

function splitQuery(value?: string) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function includesEveryTerm(haystacks: string[], terms: string[]) {
  if (terms.length === 0) return true;
  const combined = haystacks.join(" ").toLowerCase();
  return terms.every((term) => combined.includes(term));
}

function scoreTerms(value: string, terms: string[], weight: number) {
  const lower = value.toLowerCase();
  return terms.reduce((score, term) => score + (lower.includes(term) ? weight : 0), 0);
}

function matchesEventDate(event: Event, date?: string) {
  if (!date) return true;

  const targetTime = getDateSortTime(toDateOnlyIso(date));
  if (targetTime === null) return false;

  const start = getEventStartBoundary(event);
  const end = getEventEndBoundary(event);

  if (start === null && end === null) {
    return false;
  }

  if (start !== null && end !== null) {
    return targetTime >= Math.min(start, end) && targetTime <= Math.max(start, end);
  }

  return (start ?? end) === targetTime;
}

export interface TalentFilters {
  query?: string;
  tag?: string;
  editorId?: string;
  tierId?: string;
  hasSchedule?: boolean;
  mcn?: string;
  sort?: "alphabetical" | "recent" | "relevance";
}

export interface EventFilters {
  query?: string;
  eventStatus?: "future" | "past";
  city?: string;
  editorId?: string;
  talentId?: string;
  date?: string;
  sort?: "relevance" | "upcoming" | "recent" | "lineupSize";
}

function getArchiveCountForTalent(state: ContentState, talentId: string) {
  return state.archives.reduce(
    (count, archive) => count + archive.entries.filter((entry) => entry.talentId === talentId).length,
    0
  );
}

function getEditorArchiveRecordCountForTalent(state: ContentState, editorId: string, talentId: string) {
  return state.archives
    .filter((archive) => archive.editorId === editorId)
    .reduce((count, archive) => count + archive.entries.filter((entry) => entry.talentId === talentId).length, 0);
}

function getEditorSharedPhotoCountForTalent(state: ContentState, editorId: string, talentId: string) {
  return state.archives
    .filter((archive) => archive.editorId === editorId)
    .reduce(
      (count, archive) =>
        count +
        archive.entries.filter((entry) => entry.talentId === talentId && entry.hasSharedPhoto).length,
      0
    );
}

function getEventLineupSize(state: ContentState, eventId: string) {
  return state.lineups.filter((lineup) => lineup.eventId === eventId).length;
}

function getPreferredFutureEventForTalent(state: ContentState, talentId: string) {
  return (
    state.events
      .filter(
        (event) =>
          getEventTemporalStatus(event) === "future" &&
          state.lineups.some((lineup) => lineup.eventId === event.id && lineup.talentId === talentId)
      )
      .sort((left, right) => {
        const lineupSizeDiff = getEventLineupSize(state, right.id) - getEventLineupSize(state, left.id);
        if (lineupSizeDiff !== 0) {
          return lineupSizeDiff;
        }

        return compareEventChronological(left, right) || compareEventRecent(left, right);
      })[0] ?? null
  );
}

function buildTalentSummary(state: ContentState, talent: Talent, relevanceScore?: number): TalentSummary {
  const assetMap = byId(state.assets);
  const relatedEvents = state.events.filter((event) =>
    state.lineups.some((lineup) => lineup.eventId === event.id && lineup.talentId === talent.id)
  );
  const latestEvent = sortEventsByRecent(relatedEvents)[0] ?? null;
  const preferredFutureEvent = getPreferredFutureEventForTalent(state, talent.id);
  const futureLocationHint = preferredFutureEvent ? getEventDisplayName(preferredFutureEvent) : null;
  const recentHint = latestEvent
    ? latestEvent.name.trim()
      ? [latestEvent.city, latestEvent.name].filter(Boolean).join(" · ")
      : getEventDisplayName(latestEvent)
    : null;

  return {
    id: talent.id,
    slug: talent.slug,
    nickname: talent.nickname,
    bio: talent.bio,
    bioPreviewLine: getBioPreviewLine(talent.bio),
    aliases: talent.aliases,
    tags: talent.tags,
    cover: talent.coverAssetId ? assetMap.get(talent.coverAssetId) ?? null : null,
    recentHint: recentHint || null,
    futureLocationHint: futureLocationHint || null,
    hasFutureEvent: relatedEvents.some((event) => getEventTemporalStatus(event) === "future"),
    archiveCount: getArchiveCountForTalent(state, talent.id),
    relevanceScore
  };
}

function getTalentRelevanceScore(state: ContentState, talent: Talent, terms: string[]) {
  if (terms.length === 0) return 0;

  const lineups = state.lineups.filter((lineup) => lineup.talentId === talent.id);
  const lineupEvents = state.events.filter((event) => lineups.some((lineup) => lineup.eventId === event.id));

  return (
    scoreTerms(talent.nickname, terms, 8) +
    scoreTerms(talent.aliases.join(" "), terms, 6) +
    scoreTerms(talent.tags.join(" "), terms, 4) +
    scoreTerms(talent.searchKeywords.join(" "), terms, 3) +
    scoreTerms(talent.bio, terms, 2) +
    scoreTerms(talent.mcn, terms, 2) +
    scoreTerms(
      lineupEvents.map((event) => `${event.name} ${event.city} ${event.venue}`).join(" "),
      terms,
      1
    )
  );
}

function getEventRelevanceScore(state: ContentState, event: Event, terms: string[]) {
  if (terms.length === 0) return 0;

  const lineupTalents = state.lineups
    .filter((lineup) => lineup.eventId === event.id)
    .map((lineup) => state.talents.find((talent) => talent.id === lineup.talentId))
    .filter(Boolean) as Talent[];

  return (
    scoreTerms(event.name, terms, 8) +
    scoreTerms(event.aliases.join(" "), terms, 6) +
    scoreTerms(event.city, terms, 4) +
    scoreTerms(event.venue, terms, 3) +
    scoreTerms(event.searchKeywords.join(" "), terms, 3) +
    scoreTerms(event.note, terms, 2) +
    scoreTerms(
      lineupTalents.map((talent) => `${talent.nickname} ${talent.aliases.join(" ")} ${talent.tags.join(" ")}`).join(" "),
      terms,
      2
    )
  );
}

function getResolvedLineupDate(event: Event, lineupDate?: string | null) {
  return lineupDate ?? event.startsAt ?? event.endsAt ?? null;
}

function buildResolvedEventLineups(state: ContentState, event: Event) {
  const assetMap = byId(state.assets);
  const talentMap = byId(state.talents);

  return state.lineups
    .filter((lineup) => lineup.eventId === event.id)
    .map((lineup, index) => {
      const talent = talentMap.get(lineup.talentId);
      if (!talent) {
        return null;
      }

      return {
        index,
        lineup: {
          ...lineup,
          lineupDate: getResolvedLineupDate(event, lineup.lineupDate)
        },
        talent,
        cover: talent.coverAssetId ? assetMap.get(talent.coverAssetId) ?? null : null
      };
    })
    .filter(
      (
        item
      ): item is {
        index: number;
        lineup: ContentState["lineups"][number] & { lineupDate: string | null };
        talent: Talent;
        cover: ContentState["assets"][number] | null;
      } => Boolean(item)
    )
    .sort((left, right) => {
      const leftTime = getDateSortTime(left.lineup.lineupDate);
      const rightTime = getDateSortTime(right.lineup.lineupDate);

      if (leftTime === null && rightTime === null) {
        return left.index - right.index;
      }

      if (leftTime === null) return 1;
      if (rightTime === null) return -1;
      return leftTime - rightTime || left.index - right.index;
    })
    .map((item) => ({
      lineup: item.lineup,
      talent: item.talent,
      cover: item.cover
    }));
}

function buildLineupGroups(event: Event, lineups: ReturnType<typeof buildResolvedEventLineups>) {
  if (lineups.length === 0) {
    return [];
  }

  if (!isMultiDayRange(event.startsAt, event.endsAt)) {
    return [
      {
        date: null,
        label: null,
        items: lineups
      }
    ];
  }

  const grouped = new Map<string, (typeof lineups)[number][]>();
  const orderedDates = getDateRangeDays(event.startsAt, event.endsAt);

  for (const date of orderedDates) {
    grouped.set(date, []);
  }

  for (const item of lineups) {
    const fallbackDate = orderedDates[0] ?? getDateOnlyKey(item.lineup.lineupDate);
    const dateKey = getDateOnlyKey(item.lineup.lineupDate) ?? fallbackDate;
    if (!dateKey) {
      continue;
    }

    const bucket = grouped.get(dateKey);
    if (bucket) {
      bucket.push(item);
      continue;
    }

    grouped.set(dateKey, [item]);
  }

  return [...grouped.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([date, items]) => ({
      date,
      label: formatDateKey(date),
      items
    }));
}

function getResolvedArchiveEntryDate(state: ContentState, event: Event, entry: ArchiveEntry) {
  if (entry.entryDate) {
    return entry.entryDate;
  }

  const matchingLineupDates = state.lineups
    .filter((lineup) => lineup.eventId === event.id && lineup.talentId === entry.talentId)
    .map((lineup) => getResolvedLineupDate(event, lineup.lineupDate))
    .filter(Boolean) as string[];
  const uniqueLineupDates = [...new Set(matchingLineupDates.map((lineupDate) => getDateOnlyKey(lineupDate)).filter(Boolean))];

  if (uniqueLineupDates.length === 1) {
    return toDateOnlyIso(uniqueLineupDates[0] ?? "") ?? null;
  }

  return event.startsAt ?? event.endsAt ?? null;
}

function buildArchiveEntryGroups(event: Event, entries: ArchiveEntryDisplayItem[]) {
  if (entries.length === 0) {
    return [];
  }

  if (!isMultiDayRange(event.startsAt, event.endsAt)) {
    return [
      {
        date: null,
        label: null,
        items: entries
      }
    ];
  }

  const grouped = new Map<string, ArchiveEntryDisplayItem[]>();
  const orderedDates = getDateRangeDays(event.startsAt, event.endsAt);
  const undatedItems: ArchiveEntryDisplayItem[] = [];

  for (const date of orderedDates) {
    grouped.set(date, []);
  }

  for (const item of entries) {
    const dateKey = getDateOnlyKey(item.entry.entryDate);
    if (!dateKey) {
      undatedItems.push(item);
      continue;
    }

    const bucket = grouped.get(dateKey);
    if (!bucket) {
      undatedItems.push(item);
      continue;
    }

    bucket.push(item);
  }

  const groups: ArchiveEntryGroup[] = [...grouped.entries()]
    .filter(([, items]) => items.length > 0)
    .map(([date, items]) => ({
      date,
      label: formatDateKey(date),
      items
    }));

  if (undatedItems.length > 0) {
    groups.push({
      date: null,
      label: "未分配日期",
      items: undatedItems
    });
  }

  return groups;
}

function buildEventSummary(state: ContentState, event: Event, relevanceScore?: number): EventSummary {
  const lineups = buildResolvedEventLineups(state, event);

  return {
    event,
    temporalStatus: getEventTemporalStatus(event),
    lineups,
    lineupGroups: buildLineupGroups(event, lineups),
    lineupSize: lineups.length,
    relevanceScore
  };
}

function buildTagSpotlights(state: ContentState): HomepageDiscovery["tagSpotlights"] {
  const counts = new Map<string, number>();
  for (const talent of state.talents) {
    for (const tag of talent.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || compareByPinyin(left[0], right[0]))
    .slice(0, 6)
    .map(([tag, count]) => ({
      tag: tag as Talent["tags"][number],
      count,
      href: `/talents?tag=${encodeURIComponent(tag)}`
    }));
}

function countRecentUpdatedTalents(state: ContentState, now: Date) {
  const thresholdDateKey = getDateKeyDaysAgo(now, 7);
  return state.talents.filter((talent) => {
    const updatedDateKey = getDateOnlyKey(talent.updatedAt);
    return Boolean(updatedDateKey && updatedDateKey >= thresholdDateKey);
  }).length;
}

function countHomepageRecentEvents(state: ContentState, now: Date) {
  const thresholdDateKey = getDateKeyDaysAgo(now, 7);
  return state.events.filter((event) => {
    const boundaryDateKey = getDateOnlyKey(event.endsAt ?? event.startsAt ?? null);
    return Boolean(boundaryDateKey && boundaryDateKey >= thresholdDateKey);
  }).length;
}

export function getEditors(state: ContentState) {
  return state.editors;
}

export function getHomepageCollections(state: ContentState, now = new Date()): HomepageDiscovery {
  const recentTalents = sortByDateDesc(state.talents).map((talent) => buildTalentSummary(state, talent));
  const futureEvents = listEventSummaries(state, { eventStatus: "future", sort: "lineupSize" }).sort(
    (left, right) => right.lineupSize - left.lineupSize || compareEventChronological(left.event, right.event)
  );

  return {
    stats: {
      recentTalentCount: countRecentUpdatedTalents(state, now),
      recentEventCount: countHomepageRecentEvents(state, now)
    },
    featuredTalents: recentTalents.slice(0, 4),
    futureEvents: futureEvents.slice(0, 2),
    recentTalents: recentTalents.slice(0, 6),
    tagSpotlights: buildTagSpotlights(state),
    editorSpotlights: state.editors.map((editor) => ({
      editor,
      href: `/ladder?editor=${editor.slug}`,
      summary: editor.intro
    })),
    ladderSpotlights: state.ladders.map((ladder) => ({
      ladder: {
        ...ladder,
        title: getDerivedLadderTitle(
          state.editors.find((editor) => editor.id === ladder.editorId)?.name ?? ladder.title
        )
      },
      topTier:
        [...ladder.tiers].sort((a, b) => a.order - b.order).find((tier) => tier.talentIds.length > 0) ??
        ladder.tiers[0],
      href: `/ladder?editor=${state.editors.find((editor) => editor.id === ladder.editorId)?.slug ?? ""}`
    }))
  };
}

export function listTalents(state: ContentState, filters: TalentFilters = {}): TalentSummary[] {
  const queryTerms = splitQuery(filters.query);

  const filtered = state.talents
    .map((talent) => ({
      talent,
      relevanceScore: getTalentRelevanceScore(state, talent, queryTerms)
    }))
    .filter(({ talent, relevanceScore }) => {
      const haystacks = [
        talent.nickname,
        talent.aliases.join(" "),
        talent.tags.join(" "),
        talent.searchKeywords.join(" "),
        talent.bio,
        talent.mcn
      ];
      const matchesQuery = queryTerms.length === 0 || (relevanceScore > 0 && includesEveryTerm(haystacks, queryTerms));
      const matchesTag = !filters.tag || talent.tags.includes(filters.tag as Talent["tags"][number]);
      const matchesMcn = !filters.mcn || talent.mcn === filters.mcn;
      const matchesSchedule =
        !filters.hasSchedule ||
        state.lineups
          .filter((lineup) => lineup.talentId === talent.id)
          .some((lineup) => {
            const event = state.events.find((item) => item.id === lineup.eventId);
            return event ? getEventTemporalStatus(event) === "future" : false;
          });

      let matchesLadder = true;
      if (filters.editorId) {
        const ladder = state.ladders.find((item) => item.editorId === filters.editorId);
        const tiers = ladder?.tiers ?? [];
        matchesLadder = tiers.some((tier) => tier.talentIds.includes(talent.id));

        if (filters.tierId) {
          matchesLadder = tiers.some((tier) => tier.id === filters.tierId && tier.talentIds.includes(talent.id));
        }
      }

      return matchesQuery && matchesTag && matchesMcn && matchesSchedule && matchesLadder;
    });

  const sort = filters.sort ?? "alphabetical";

  filtered.sort((left, right) => {
    if (sort === "recent") {
      return Date.parse(right.talent.updatedAt) - Date.parse(left.talent.updatedAt);
    }

    if (sort === "relevance") {
      return (
        right.relevanceScore - left.relevanceScore ||
        compareByPinyin(left.talent.nickname, right.talent.nickname) ||
        left.talent.id.localeCompare(right.talent.id)
      );
    }

    return (
      compareByPinyin(left.talent.nickname, right.talent.nickname) ||
      left.talent.id.localeCompare(right.talent.id)
    );
  });

  return filtered.map(({ talent, relevanceScore }) => buildTalentSummary(state, talent, relevanceScore));
}

export function listEventSummaries(state: ContentState, filters: EventFilters = {}): EventSummary[] {
  const queryTerms = splitQuery(filters.query);

  const filtered = state.events
    .map((event) => ({
      event,
      relevanceScore: getEventRelevanceScore(state, event, queryTerms)
    }))
    .filter(({ event, relevanceScore }) => {
      const eventLineups = state.lineups.filter((lineup) => lineup.eventId === event.id);
      const temporalStatus = getEventTemporalStatus(event);
      const lineupText = eventLineups
        .map((lineup) => {
          const talent = state.talents.find((item) => item.id === lineup.talentId);
          return talent
            ? `${talent.nickname} ${talent.aliases.join(" ")} ${talent.tags.join(" ")} ${talent.searchKeywords.join(" ")}`
            : "";
        })
        .join(" ");
      const matchesQuery =
        queryTerms.length === 0 ||
        (relevanceScore > 0 &&
          includesEveryTerm(
            [
              event.name,
              event.aliases.join(" "),
              event.city,
              event.venue,
              event.searchKeywords.join(" "),
              event.note,
              lineupText
            ],
            queryTerms
          ));
      const matchesStatus = !filters.eventStatus || temporalStatus === filters.eventStatus;
      const matchesCity = !filters.city || event.city === filters.city;
      const matchesEditor =
        !filters.editorId || getArchiveEditorIdsForEvent(state, event.id).includes(filters.editorId);
      const matchesTalent = !filters.talentId || eventLineups.some((lineup) => lineup.talentId === filters.talentId);
      const matchesDate = matchesEventDate(event, filters.date);

      return matchesQuery && matchesStatus && matchesCity && matchesEditor && matchesTalent && matchesDate;
    });

  const sort = filters.sort ?? "recent";

  filtered.sort((left, right) => {
    if (sort === "relevance") {
      return (
        right.relevanceScore - left.relevanceScore ||
        compareEventRecent(left.event, right.event)
      );
    }

    if (sort === "lineupSize") {
      return (
        state.lineups.filter((lineup) => lineup.eventId === right.event.id).length -
          state.lineups.filter((lineup) => lineup.eventId === left.event.id).length ||
        compareEventRecent(left.event, right.event)
      );
    }

    if (sort === "upcoming") {
      return compareEventChronological(left.event, right.event);
    }

    return compareEventRecent(left.event, right.event);
  });

  return filtered.map(({ event, relevanceScore }) => buildEventSummary(state, event, relevanceScore));
}

function buildRelatedTalentSummaries(
  state: ContentState,
  relatedTalentIds: string[],
  reasonBuilder: (talent: Talent) => string
): RelatedTalentSummary[] {
  const uniqueIds = [...new Set(relatedTalentIds)];
  return uniqueIds
    .map((talentId) => state.talents.find((talent) => talent.id === talentId))
    .filter(Boolean)
    .slice(0, 4)
    .map((talent) => ({
      talent: buildTalentSummary(state, talent!),
      reason: reasonBuilder(talent!)
    }));
}

function buildRelatedEventSummaries(
  state: ContentState,
  relatedEventIds: string[],
  reasonBuilder: (event: Event) => string
): RelatedEventSummary[] {
  const uniqueIds = [...new Set(relatedEventIds)];
  return uniqueIds
    .map((eventId) => state.events.find((event) => event.id === eventId))
    .filter(Boolean)
    .slice(0, 4)
    .map((event) => ({
      event: buildEventSummary(state, event!),
      reason: reasonBuilder(event!)
    }));
}

function buildTalentFutureTimelineItems(state: ContentState, talentId: string): TalentEventTimelineItem[] {
  const futureEventIds = [
    ...new Set(state.lineups.filter((lineup) => lineup.talentId === talentId).map((lineup) => lineup.eventId))
  ];

  return sortEventsByRecent(
    state.events.filter((event) => futureEventIds.includes(event.id) && getEventTemporalStatus(event) === "future")
  ).map((event) => ({
    event,
    temporalStatus: getEventTemporalStatus(event),
    detailText:
      collectDistinctTexts(
        state.lineups
          .filter((lineup) => lineup.eventId === event.id && lineup.talentId === talentId)
          .map((lineup) => lineup.note)
      ).join(" / ") || null
  }));
}

function buildTalentPastTimelineItems(state: ContentState, talentId: string): TalentEventTimelineItem[] {
  const pastEventIds = [
    ...new Set(state.lineups.filter((lineup) => lineup.talentId === talentId).map((lineup) => lineup.eventId))
  ];

  return sortEventsByRecent(
    state.events.filter(
      (event) =>
        pastEventIds.includes(event.id) &&
        getEventTemporalStatus(event) === "past" &&
        hasArchiveEntriesForEvent(state, event.id)
    )
  ).map((event) => ({
    event,
    temporalStatus: getEventTemporalStatus(event),
    detailText:
      collectDistinctTexts(
        state.archives.flatMap((archive) =>
          archive.eventId !== event.id
            ? []
            : archive.entries
                .filter((entry) => entry.talentId === talentId)
                .map((entry) => entry.cosplayTitle)
        )
      ).join(" / ") || null
  }));
}

function getTalentFieldRecordSortTime(record: Pick<TalentFieldRecordItem, "recordDate" | "event">) {
  return getDateSortTime(record.recordDate) ?? getEventPrimaryTime(record.event) ?? Number.NEGATIVE_INFINITY;
}

function getArchiveEntryPreviewAsset(assetMap: Map<string, Asset>, entry: ArchiveEntry) {
  return (
    (entry.sceneAssetId ? assetMap.get(entry.sceneAssetId) ?? null : null) ??
    (entry.sharedPhotoAssetId ? assetMap.get(entry.sharedPhotoAssetId) ?? null : null) ??
    null
  );
}

function buildTalentFieldRecords(state: ContentState, talentId: string, assetMap: Map<string, Asset>): TalentFieldRecordItem[] {
  const eventMap = byId(state.events);
  const grouped = new Map<
    string,
    {
      event: Event;
      recordDate: string | null;
      roleTexts: string[];
      asset: Asset | null;
    }
  >();

  for (const archive of sortByDateDesc(state.archives)) {
    const event = eventMap.get(archive.eventId);
    if (!event) {
      continue;
    }

    for (const entry of archive.entries) {
      if (entry.talentId !== talentId) {
        continue;
      }

      const resolvedDate = getResolvedArchiveEntryDate(state, event, entry);
      const dateKey = getDateOnlyKey(resolvedDate);
      const normalizedDate = dateKey ? toDateOnlyIso(dateKey) : null;
      const groupKey = `${event.id}:${dateKey ?? "undated"}`;
      const current = grouped.get(groupKey);
      const previewAsset = getArchiveEntryPreviewAsset(assetMap, entry);

      if (current) {
        current.roleTexts.push(entry.cosplayTitle);
        current.asset ??= previewAsset;
        continue;
      }

      grouped.set(groupKey, {
        event,
        recordDate: normalizedDate,
        roleTexts: [entry.cosplayTitle],
        asset: previewAsset
      });
    }
  }

  return [...grouped.entries()]
    .map(([id, item]) => ({
      id,
      event: item.event,
      recordDate: item.recordDate,
      roleSummary: collectDistinctTexts(item.roleTexts).join(" / ") || "未记录角色 / 作品 / 游戏",
      locationSummary: buildLocationSummary(item.event),
      asset: item.asset
    }))
    .sort((left, right) => {
      const sortTimeDiff = getTalentFieldRecordSortTime(right) - getTalentFieldRecordSortTime(left);
      if (sortTimeDiff !== 0) {
        return sortTimeDiff;
      }

      const eventTimeDiff = (getEventPrimaryTime(right.event) ?? Number.NEGATIVE_INFINITY) - (getEventPrimaryTime(left.event) ?? Number.NEGATIVE_INFINITY);
      if (eventTimeDiff !== 0) {
        return eventTimeDiff;
      }

      return compareByPinyin(left.event.name, right.event.name);
    });
}

export function getTalentDetail(state: ContentState, slug: string): TalentDetail | null {
  const assetMap = byId(state.assets);
  const talent = state.talents.find((item) => matchesPublicIdentifier(item, slug));
  if (!talent) return null;

  const relatedEventIds = state.lineups
    .filter((lineup) => lineup.talentId === talent.id)
    .map((lineup) => lineup.eventId);

  const futureEvents = buildTalentFutureTimelineItems(state, talent.id);
  const pastEvents = buildTalentPastTimelineItems(state, talent.id);
  const douyinProfile = state.douyinProfiles.find(
    (profile) => profile.talentId === talent.id && profile.lastSuccessAt
  );

  const archiveHits = state.archives.flatMap((archive) =>
    archive.entries.filter((entry) => entry.talentId === talent.id).map(() => archive.eventId)
  );

  const coTalentIds = state.archives
    .filter((archive) => archive.entries.some((entry) => entry.talentId === talent.id))
    .flatMap((archive) => archive.entries.map((entry) => entry.talentId))
    .filter((talentId) => talentId !== talent.id);

  const lineupTalentIds = state.lineups
    .filter((lineup) => relatedEventIds.includes(lineup.eventId) && lineup.talentId !== talent.id)
    .map((lineup) => lineup.talentId);

  const relatedTalents = buildRelatedTalentSummaries(
    state,
    [...coTalentIds, ...lineupTalentIds],
    (relatedTalent) =>
      lineupTalentIds.includes(relatedTalent.id) ? "曾在同场活动阵容中出现" : "曾在同一活动档案中被记录"
  );

  const relatedEventsForTalent = buildRelatedEventSummaries(
    state,
    [
      ...state.events
        .filter(
          (event) =>
            state.lineups.some((lineup) => lineup.eventId === event.id && lineup.talentId === talent.id)
        )
        .map((event) => event.id),
      ...archiveHits
    ],
    (event) =>
      getEventTemporalStatus(event) === "future" ? "该达人即将参与" : "该达人曾出现在活动档案中"
  );

  return {
    talent,
    cover: talent.coverAssetId ? assetMap.get(talent.coverAssetId) ?? null : null,
    representationAssets: talent.representations
      .map((representation) => ({
        ...representation,
        asset: representation.assetId ? assetMap.get(representation.assetId) ?? null : null
      })),
    fieldRecords: buildTalentFieldRecords(state, talent.id, assetMap),
    futureEvents,
    pastEvents,
    relatedTalents,
    relatedEvents: relatedEventsForTalent,
    douyinProfile: douyinProfile
      ? {
          followerCount: douyinProfile.followerCount ?? null,
          itineraryBlocks: douyinProfile.itineraryText
            .split("\n")
            .map((block) => block.trim())
            .filter(Boolean),
          relatedAccounts: state.douyinRelatedAccounts
            .filter(
              (account) =>
                account.talentId === talent.id &&
                account.secUserId !== douyinProfile.secUserId &&
                isSafeDouyinRelatedAccountUrl(account.url)
            )
            .sort((left, right) => left.sortOrder - right.sortOrder)
        }
      : null,
    editorSummaries: state.editors.map((editor) => {
      const ladder = state.ladders.find((item) => item.editorId === editor.id);
      const tierName = ladder?.tiers.find((tier) => tier.talentIds.includes(talent.id))?.name ?? null;

      return {
        editor,
        tierName,
        seenCount: getEditorArchiveRecordCountForTalent(state, editor.id, talent.id),
        sharedPhotoCount: getEditorSharedPhotoCountForTalent(state, editor.id, talent.id)
      };
    })
  };
}

export function getEventDetail(state: ContentState, slug: string): EventDetail | null {
  const event = state.events.find((item) => matchesPublicIdentifier(item, slug));
  if (!event) return null;

  const assetMap = byId(state.assets);
  const talentMap = byId(state.talents);
  const editorMap = byId(state.editors);
  const eventSummary = buildEventSummary(state, event);
  const { lineups, lineupGroups } = eventSummary;
  const lineupTalentIds = lineups.map((item) => item.talent.id);

  const relatedEvents = state.events
    .filter((candidate) => candidate.id !== event.id)
    .map((candidate) => {
      const candidateTalentIds = state.lineups
        .filter((lineup) => lineup.eventId === candidate.id)
        .map((lineup) => lineup.talentId);
      const sharedLineupCount = candidateTalentIds.filter((talentId) => lineupTalentIds.includes(talentId)).length;
      const cityBonus = candidate.city && candidate.city === event.city ? 1 : 0;
      const eventTime = getEventPrimaryTime(event);
      const candidateTime = getEventPrimaryTime(candidate);
      const timeDistance =
        eventTime !== null && candidateTime !== null ? Math.abs(candidateTime - eventTime) : Number.POSITIVE_INFINITY;
      const timeBonus = timeDistance <= 1000 * 60 * 60 * 24 * 30 ? 1 : 0;
      return {
        candidate,
        score: sharedLineupCount * 3 + cityBonus + timeBonus
      };
    })
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (getEventPrimaryTime(right.candidate) ?? -Infinity) - (getEventPrimaryTime(left.candidate) ?? -Infinity)
    );

  return {
    event,
    lineups,
    lineupGroups,
    archives: state.archives
      .filter((archive) => archive.eventId === event.id)
      .map((archive) => {
        const entries = archive.entries
          .map((entry) => {
            const talent = talentMap.get(entry.talentId);
            if (!talent) {
              return null;
            }

            return {
              entry: {
                ...entry,
                entryDate: getResolvedArchiveEntryDate(state, event, entry)
              },
              talent,
              sceneAsset: entry.sceneAssetId ? assetMap.get(entry.sceneAssetId) ?? null : null,
              sharedPhotoAsset: entry.sharedPhotoAssetId ? assetMap.get(entry.sharedPhotoAssetId) ?? null : null
            };
          })
          .filter(Boolean) as ArchiveEntryDisplayItem[];

        return entries.length > 0
          ? {
          editor: editorMap.get(archive.editorId)!,
          archive,
          entries,
          entryGroups: buildArchiveEntryGroups(event, entries)
            }
          : null;
      })
      .filter(Boolean) as EventDetail["archives"],
    relatedEvents: buildRelatedEventSummaries(
      state,
      relatedEvents.map((item) => item.candidate.id),
      (relatedEvent) => (relatedEvent.city === event.city ? "同城且阵容相关" : "阵容或时间接近")
    ),
    relatedTalents: buildRelatedTalentSummaries(state, lineupTalentIds, () => "当前活动阵容达人")
  };
}

export function getLadders(state: ContentState) {
  return state.ladders.map((ladder) => ({
    ladder: {
      ...ladder,
      title: getDerivedLadderTitle(state.editors.find((editor) => editor.id === ladder.editorId)?.name ?? ladder.title)
    },
    editor: state.editors.find((editor) => editor.id === ladder.editorId)!,
    tiers: [...ladder.tiers].sort((a, b) => a.order - b.order)
  }));
}

export function getLadderByEditor(state: ContentState, editorSlug: string) {
  const editor = state.editors.find((item) => item.slug === editorSlug);
  if (!editor) return null;

  const assetMap = byId(state.assets);
  const talentMap = byId(state.talents);
  const ladder = state.ladders.find((item) => item.editorId === editor.id);
  if (!ladder) return null;

  return {
    editor,
    ladder: {
      ...ladder,
      title: getDerivedLadderTitle(editor.name)
    },
    tiers: [...ladder.tiers]
      .sort((a, b) => a.order - b.order)
      .map((tier) => ({
        ...tier,
        talents: tier.talentIds
          .map((talentId) => talentMap.get(talentId))
          .filter(Boolean)
          .map((talent) => ({
            talent: talent!,
            cover: talent!.coverAssetId ? assetMap.get(talent!.coverAssetId) ?? null : null
          }))
      }))
  };
}

export function searchSite(
  state: ContentState,
  query: string,
  scope: "all" | "talents" | "events" = "all"
): SiteSearchResult {
  return {
    talents: scope === "events" ? [] : listTalents(state, { query, sort: "relevance" }),
    events: scope === "talents" ? [] : listEventSummaries(state, { query, sort: "relevance" })
  };
}

export function getDashboardSummary(state: ContentState, editorId: string): DashboardSummary {
  return {
    recentTalents: sortByDateDesc(state.talents).slice(0, 4),
    recentEvents: sortByDateDesc(state.events).slice(0, 4),
    upcomingEvents: sortEventsChronologically(
      state.events.filter((event) => getEventTemporalStatus(event) === "future")
    ).slice(0, 4),
    myRecentArchives: sortByDateDesc(state.archives.filter((archive) => archive.editorId === editorId)).slice(0, 4)
  };
}

export function getEditorArchiveForEvent(state: ContentState, editorId: string, eventId: string) {
  return state.archives.find((archive) => archive.editorId === editorId && archive.eventId === eventId) ?? null;
}

export function getTierNameForTalent(ladder: EditorLadder, talentId: string) {
  return ladder.tiers.find((tier) => tier.talentIds.includes(talentId))?.name ?? null;
}

export function getArchiveEntryStats(entries: ArchiveEntry[]) {
  return {
    seenCount: entries.length,
    sharedPhotoCount: entries.filter((entry) => entry.hasSharedPhoto).length
  };
}

export function reorderTiers(tiers: LadderTier[]) {
  return [...tiers].sort((a, b) => a.order - b.order);
}

export function summarizeDiscoverySections(state: ContentState): DiscoverySection<unknown>[] {
  const homepage = getHomepageCollections(state);
  return [
    {
      title: "近期活动",
      href: "/events?eventStatus=future",
      description: "按时间查看未来活动与阵容",
      items: homepage.futureEvents
    },
    {
      title: "最近更新达人",
      href: "/talents",
      description: "按最新维护切入内容库",
      items: homepage.recentTalents
    }
  ];
}
