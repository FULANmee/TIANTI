import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { deriveEventTemporalStatus, getDateOnlyKey, getShanghaiDateKey, toDateOnlyIso } from "@/lib/date";
import { appEnv, getDouyinSyncConfig } from "@/lib/env";
import type {
  ContentState,
  DouyinSyncResult,
  DouyinSyncRun,
  DouyinSyncTrigger,
  Event,
  EventLineup,
  EventMergeRule,
  EventMergeRuleMember,
  Talent,
  TalentDouyinProfile,
  TalentDouyinRelatedAccount,
  TalentDouyinScheduleEntry
} from "@/modules/domain/types";
import {
  DOUYIN_ITINERARY_PARSER_VERSION,
  groupFutureShenzhenItineraries,
  normalizeDouyinEventName,
  parseDouyinItinerary,
  type ParsedItineraryEntry
} from "@/modules/douyin/itinerary";
import {
  getPrimaryDouyinProfileLink,
  isSafeDouyinRelatedAccountUrl
} from "@/modules/douyin/profile-link";
import {
  DouyinScraperError,
  fetchDouyinProfile,
  type DouyinScraperResponse
} from "@/modules/douyin/scraper-client";
import { getContentRepository } from "@/modules/repository";
import type { ContentRepository } from "@/modules/repository/types";

const RUN_LOCK_STALE_MS = 30 * 60 * 1000;

export interface DouyinSyncConfig {
  enabled: boolean;
  concurrency: number;
  cooldownMinutes: number;
}

export interface RunDouyinSyncOptions {
  trigger: DouyinSyncTrigger;
  talentId?: string;
  repository?: ContentRepository;
  fetchProfile?: typeof fetchDouyinProfile;
  config?: DouyinSyncConfig;
  now?: Date;
}

export interface DouyinSyncExecution {
  run: DouyinSyncRun;
  results: DouyinSyncResult[];
}

export class DouyinSyncOperationError extends Error {
  constructor(
    readonly code: "DISABLED" | "RUNNING" | "TALENT_NOT_FOUND",
    message: string
  ) {
    super(message);
  }
}

interface SuccessfulTalentSnapshot {
  talent: Talent;
  profileUrl: string;
  response: DouyinScraperResponse;
  parsed: ReturnType<typeof parseDouyinItinerary>;
}

interface TalentSyncOutcome {
  result: DouyinSyncResult;
  snapshot?: SuccessfulTalentSnapshot;
  profileOnFailure?: TalentDouyinProfile;
}

function createResult(
  runId: string,
  talentId: string | null,
  status: DouyinSyncResult["status"],
  code: string,
  message: string,
  createdAt: string
): DouyinSyncResult {
  return {
    id: randomUUID(),
    runId,
    talentId,
    status,
    code,
    message,
    createdAt
  };
}

function getSafeFailureMessage(error: unknown) {
  if (error instanceof DouyinScraperError) {
    return {
      code: error.code,
      message: `抖音主页抓取失败（${error.code}）。`
    };
  }

  return {
    code: "SYNC_FAILED",
    message: "抖音主页同步失败。"
  };
}

function getFingerprint(talentId: string, entry: ParsedItineraryEntry) {
  return createHash("sha256")
    .update(
      [
        talentId,
        entry.dateKey,
        entry.endDateKey,
        entry.city ?? "",
        normalizeDouyinEventName(entry.eventName)
      ].join("\u0000")
    )
    .digest("hex");
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60 * 1000).toISOString();
}

function isManualTrigger(trigger: DouyinSyncTrigger) {
  return trigger === "manual_all" || trigger === "manual_talent";
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, values.length)) }, () =>
      worker()
    )
  );
  return results;
}

function getSelectedTalents(state: ContentState, talentId?: string) {
  if (!talentId) {
    return state.talents;
  }

  const talent = state.talents.find((item) => item.id === talentId);
  if (!talent) {
    throw new DouyinSyncOperationError("TALENT_NOT_FOUND", "达人不存在或已被删除。");
  }
  return [talent];
}

async function fetchTalentSnapshot(
  talent: Talent,
  run: DouyinSyncRun,
  state: ContentState,
  options: {
    fetchProfile: typeof fetchDouyinProfile;
    config: DouyinSyncConfig;
    now: Date;
  }
): Promise<TalentSyncOutcome> {
  const createdAt = options.now.toISOString();
  const primary = getPrimaryDouyinProfileLink(talent);
  if (!primary.link) {
    return {
      result: createResult(
        run.id,
        talent.id,
        "skipped",
        "PRIMARY_PROFILE_UNAVAILABLE",
        primary.reason ?? "未配置唯一的主抖音主页链接。",
        createdAt
      )
    };
  }

  const existingProfile = state.douyinProfiles.find((profile) => profile.talentId === talent.id);
  if (
    isManualTrigger(run.trigger) &&
    existingProfile?.manualSyncAvailableAt &&
    Date.parse(existingProfile.manualSyncAvailableAt) > options.now.getTime()
  ) {
    return {
      result: createResult(
        run.id,
        talent.id,
        "skipped",
        "MANUAL_SYNC_COOLDOWN",
        "该达人仍在手动同步冷却中。",
        createdAt
      )
    };
  }

  const manualSyncAvailableAt = isManualTrigger(run.trigger)
    ? addMinutes(options.now, options.config.cooldownMinutes)
    : existingProfile?.manualSyncAvailableAt ?? null;

  try {
    const response = await options.fetchProfile(primary.link.url, randomUUID());
    if (!isSafeDouyinRelatedAccountUrl(response.account.canonicalUrl)) {
      throw new DouyinScraperError("INVALID_CANONICAL_PROFILE", "主抖音主页地址无效。", false);
    }
    const parsed = parseDouyinItinerary(response.profile.signatureRaw, options.now);
    const skippedReasons = [...new Set(parsed.skipped.map((item) => item.reason))];

    return {
      result: createResult(
        run.id,
        talent.id,
        "succeeded",
        skippedReasons.length > 0 ? "SYNCED_WITH_SKIPS" : "SYNCED",
        skippedReasons.length > 0
          ? `抖音主页同步成功；${parsed.skipped.length} 条行程仅展示（${skippedReasons.join(",")}）。`
          : "抖音主页同步成功。",
        createdAt
      ),
      snapshot: {
        talent,
        profileUrl: primary.link.url,
        response,
        parsed
      }
    };
  } catch (error) {
    const safeFailure = getSafeFailureMessage(error);
    return {
      result: createResult(
        run.id,
        talent.id,
        "failed",
        safeFailure.code,
        safeFailure.message,
        createdAt
      ),
      profileOnFailure: existingProfile
        ? {
            ...existingProfile,
            profileUrl: primary.link.url,
            lastErrorCode: safeFailure.code,
            manualSyncAvailableAt
          }
        : {
            talentId: talent.id,
            profileUrl: primary.link.url,
            secUserId: null,
            signatureRaw: "",
            itineraryText: "",
            followerCount: null,
            fetchedAt: null,
            lastSuccessAt: null,
            lastErrorCode: safeFailure.code,
            linkExtractionStatus: "unavailable",
            manualSyncAvailableAt,
            parserVersion: DOUYIN_ITINERARY_PARSER_VERSION
          }
    };
  }
}

function buildProfile(
  snapshot: SuccessfulTalentSnapshot,
  existingProfile: TalentDouyinProfile | undefined,
  trigger: DouyinSyncTrigger,
  config: DouyinSyncConfig,
  now: Date
): TalentDouyinProfile {
  const latestWork = snapshot.response.latestWork;
  const preserveLatestWork =
    !snapshot.response.diagnostics.latestWorkStatus ||
    snapshot.response.diagnostics.latestWorkStatus === "unavailable";
  return {
    talentId: snapshot.talent.id,
    profileUrl: snapshot.response.account.canonicalUrl,
    secUserId: snapshot.response.account.secUserId,
    signatureRaw: snapshot.response.profile.signatureRaw,
    itineraryText: snapshot.parsed.itineraryText,
    followerCount: snapshot.response.profile.followerCount,
    fetchedAt: snapshot.response.fetchedAt,
    lastSuccessAt: snapshot.response.fetchedAt,
    lastErrorCode: null,
    linkExtractionStatus: snapshot.response.diagnostics.linkSource,
    manualSyncAvailableAt: isManualTrigger(trigger)
      ? addMinutes(now, config.cooldownMinutes)
      : existingProfile?.manualSyncAvailableAt ?? null,
    parserVersion: snapshot.parsed.parserVersion,
    latestWorkUrl: preserveLatestWork ? existingProfile?.latestWorkUrl ?? null : latestWork?.url ?? null,
    latestWorkCaption: preserveLatestWork ? existingProfile?.latestWorkCaption ?? null : latestWork?.caption ?? null,
    latestWorkPublishedAt: preserveLatestWork
      ? existingProfile?.latestWorkPublishedAt ?? null
      : latestWork?.publishedAt ?? null
  };
}

function reconcileRelatedAccounts(
  state: ContentState,
  snapshots: SuccessfulTalentSnapshot[]
): TalentDouyinRelatedAccount[] {
  const successfulTalentIds = new Set(snapshots.map((snapshot) => snapshot.talent.id));
  const nextAccounts = state.douyinRelatedAccounts.filter(
    (account) => !successfulTalentIds.has(account.talentId)
  );
  const existingAccountIdByIdentity = new Map(
    state.douyinRelatedAccounts.map((account) => [
      `${account.talentId}:${account.secUserId}`,
      account.id
    ])
  );

  for (const snapshot of snapshots) {
    if (snapshot.response.diagnostics.linkSource === "unavailable") {
      nextAccounts.push(
        ...state.douyinRelatedAccounts.filter((account) => account.talentId === snapshot.talent.id)
      );
      continue;
    }

    const seenSecUserIds = new Set<string>([snapshot.response.account.secUserId]);
    for (const account of snapshot.response.relatedAccounts) {
      if (
        seenSecUserIds.has(account.secUserId) ||
        !isSafeDouyinRelatedAccountUrl(account.url)
      ) {
        continue;
      }
      seenSecUserIds.add(account.secUserId);
      nextAccounts.push({
        id:
          existingAccountIdByIdentity.get(`${snapshot.talent.id}:${account.secUserId}`) ??
          randomUUID(),
        talentId: snapshot.talent.id,
        nickname: account.nickname,
        secUserId: account.secUserId,
        url: account.url,
        sortOrder: seenSecUserIds.size - 2
      });
    }
  }

  return nextAccounts;
}

function isEntryPast(entry: TalentDouyinScheduleEntry, state: ContentState, now: Date) {
  const mappedEvent = entry.eventId
    ? state.events.find((event) => event.id === entry.eventId)
    : null;
  if (mappedEvent) {
    return deriveEventTemporalStatus(mappedEvent.startsAt, mappedEvent.endsAt, now) === "past";
  }

  const endDateKey = getDateOnlyKey(entry.endsAt);
  return Boolean(endDateKey && endDateKey < getShanghaiDateKey(now));
}

function reconcileScheduleEntries(
  state: ContentState,
  snapshots: SuccessfulTalentSnapshot[],
  now: Date
) {
  const nextEntries = structuredClone(state.douyinScheduleEntries);
  const nextIndexByIdentity = new Map(
    nextEntries.map((entry, index) => [`${entry.talentId}:${entry.fingerprint}`, index])
  );
  const seenByTalentId = new Map<string, Set<string>>();
  const nowIso = now.toISOString();

  for (const snapshot of snapshots) {
    const seenFingerprints = new Set<string>();
    seenByTalentId.set(snapshot.talent.id, seenFingerprints);

    for (const parsedEntry of snapshot.parsed.entries) {
      if (!parsedEntry.city) {
        continue;
      }

      const fingerprint = getFingerprint(snapshot.talent.id, parsedEntry);
      if (seenFingerprints.has(fingerprint)) {
        continue;
      }
      seenFingerprints.add(fingerprint);
      const identity = `${snapshot.talent.id}:${fingerprint}`;
      const existingIndex = nextIndexByIdentity.get(identity);
      const startsAt = toDateOnlyIso(parsedEntry.dateKey)!;
      const endsAt = toDateOnlyIso(parsedEntry.endDateKey)!;

      if (existingIndex === undefined) {
        const nextEntry: TalentDouyinScheduleEntry = {
          id: randomUUID(),
          talentId: snapshot.talent.id,
          fingerprint,
          rawText: parsedEntry.rawText,
          startsAt,
          endsAt,
          city: parsedEntry.city,
          eventName: parsedEntry.eventName,
          eventId: null,
          firstSeenAt: nowIso,
          lastSeenAt: nowIso,
          consecutiveMissingCount: 0,
          state: parsedEntry.isFuture ? "active" : "retained_past",
          parserVersion: snapshot.parsed.parserVersion
        };
        nextIndexByIdentity.set(identity, nextEntries.length);
        nextEntries.push(nextEntry);
        continue;
      }

      const existing = nextEntries[existingIndex];
      const past = isEntryPast(existing, state, now) || !parsedEntry.isFuture;
      nextEntries[existingIndex] = {
        ...existing,
        rawText: parsedEntry.rawText,
        startsAt,
        endsAt,
        city: parsedEntry.city,
        eventName: parsedEntry.eventName,
        lastSeenAt: nowIso,
        consecutiveMissingCount: existing.state === "suppressed" ? existing.consecutiveMissingCount : 0,
        state:
          existing.state === "suppressed"
            ? "suppressed"
            : past
              ? "retained_past"
              : "active",
        parserVersion: snapshot.parsed.parserVersion
      };
    }
  }

  for (let index = 0; index < nextEntries.length; index += 1) {
    const entry = nextEntries[index];
    const seenFingerprints = seenByTalentId.get(entry.talentId);
    if (!seenFingerprints || seenFingerprints.has(entry.fingerprint)) {
      continue;
    }
    if (entry.state === "suppressed" || entry.state === "removed_future") {
      continue;
    }
    if (isEntryPast(entry, state, now)) {
      nextEntries[index] = { ...entry, state: "retained_past" };
      continue;
    }

    const missingCount = entry.consecutiveMissingCount + 1;
    nextEntries[index] = {
      ...entry,
      consecutiveMissingCount: missingCount,
      state: missingCount >= 2 ? "removed_future" : "active"
    };
  }

  return nextEntries;
}

function entryToParsedItinerary(entry: TalentDouyinScheduleEntry): ParsedItineraryEntry | null {
  const dateKey = getDateOnlyKey(entry.startsAt);
  const endDateKey = getDateOnlyKey(entry.endsAt);
  if (!dateKey || !endDateKey) {
    return null;
  }

  return {
    rawText: entry.id,
    dateKey,
    endDateKey,
    city: entry.city,
    eventName: entry.eventName,
    isFuture: true,
    blockIndex: 0
  };
}

function namesAreCompatible(left: string, right: string) {
  const normalizedLeft = normalizeDouyinEventName(left);
  const normalizedRight = normalizeDouyinEventName(right);
  return !normalizedLeft || !normalizedRight || normalizedLeft === normalizedRight;
}

function isShenzhenCity(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, "").replace(/市$/u, "") === "深圳";
}

function rangesOverlap(event: Event, startsOn: string, endsOn: string) {
  const eventStart = getDateOnlyKey(event.startsAt ?? event.endsAt ?? null);
  const eventEnd = getDateOnlyKey(event.endsAt ?? event.startsAt ?? null);
  return Boolean(eventStart && eventEnd && eventStart <= endsOn && eventEnd >= startsOn);
}

function getDateDistanceDays(left: string, right: string) {
  const [leftYear, leftMonth, leftDay] = left.split("-").map(Number);
  const [rightYear, rightMonth, rightDay] = right.split("-").map(Number);
  return Math.abs(
    (Date.UTC(rightYear, rightMonth - 1, rightDay) - Date.UTC(leftYear, leftMonth - 1, leftDay)) /
      86_400_000
  );
}

function syncEventCanBeReused(
  event: Event,
  startsOn: string,
  endsOn: string,
  name: string,
  now: Date
) {
  if (
    event.origin !== "douyin_sync" ||
    !isShenzhenCity(event.city) ||
    deriveEventTemporalStatus(event.startsAt, event.endsAt, now) !== "future" ||
    !namesAreCompatible(event.name, name)
  ) {
    return false;
  }

  const eventStart = getDateOnlyKey(event.startsAt ?? event.endsAt ?? null);
  const eventEnd = getDateOnlyKey(event.endsAt ?? event.startsAt ?? null);
  if (!eventStart || !eventEnd) {
    return false;
  }
  const combinedStart = eventStart < startsOn ? eventStart : startsOn;
  const combinedEnd = eventEnd > endsOn ? eventEnd : endsOn;
  return getDateDistanceDays(combinedStart, combinedEnd) <= 5;
}

function isManualEvent(event: Event) {
  // Older rows and mock seed data may omit origin; the database default treats
  // those rows as manual rather than as automatic sync-owned activities.
  return event.origin === undefined || event.origin === "manual";
}

function isSameDouyinCity(left: string, right: string) {
  return isShenzhenCity(left) && isShenzhenCity(right);
}

function getMergeMemberDistance(member: EventMergeRuleMember, entry: TalentDouyinScheduleEntry) {
  const memberStart = getDateOnlyKey(member.startsAt);
  const memberEnd = getDateOnlyKey(member.endsAt);
  const entryStart = getDateOnlyKey(entry.startsAt);
  const entryEnd = getDateOnlyKey(entry.endsAt);
  if (!memberStart || !memberEnd || !entryStart || !entryEnd) {
    return null;
  }

  if (memberStart <= entryEnd && memberEnd >= entryStart) {
    return 0;
  }

  return Math.min(getDateDistanceDays(memberStart, entryEnd), getDateDistanceDays(memberEnd, entryStart));
}

function getMergeMemberNameScore(member: EventMergeRuleMember, entry: TalentDouyinScheduleEntry) {
  const memberName = member.normalizedName;
  const entryName = normalizeDouyinEventName(entry.eventName);
  if (memberName === entryName) return 0;
  if (!memberName || !entryName) return 1;
  return 2;
}

function findMergeMemberMatch(
  rule: EventMergeRule,
  entry: TalentDouyinScheduleEntry,
  claimedMemberIds: Set<string>
) {
  const candidates = rule.members
    .filter(
      (member) =>
        !claimedMemberIds.has(member.id) &&
        member.talentId === entry.talentId &&
        isSameDouyinCity(member.city, entry.city)
    )
    .flatMap((member) => {
      const distance = getMergeMemberDistance(member, entry);
      return distance === null || distance > 5 ? [] : [{ member, distance, nameScore: getMergeMemberNameScore(member, entry) }];
    })
    .sort(
      (left, right) =>
        left.nameScore - right.nameScore ||
        left.distance - right.distance ||
        left.member.id.localeCompare(right.member.id)
    );

  const best = candidates[0];
  const second = candidates[1];
  if (!best || (second && second.nameScore === best.nameScore && second.distance === best.distance)) {
    return null;
  }

  return best.member;
}

function refreshMergeRuleMember(member: EventMergeRuleMember, entry: TalentDouyinScheduleEntry, nowIso: string) {
  return {
    ...member,
    sourceEntryId: entry.id,
    talentId: entry.talentId,
    city: entry.city,
    normalizedName: normalizeDouyinEventName(entry.eventName),
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    lastSeenAt: nowIso
  };
}

function buildMergedEvent(
  existing: Event,
  startsOn: string,
  endsOn: string,
  nowIso: string
): Event {
  return {
    ...existing,
    startsAt: toDateOnlyIso(startsOn),
    endsAt: toDateOnlyIso(endsOn),
    status: "future",
    updatedAt: nowIso,
    origin: "douyin_merged"
  };
}

function buildAutoEvent(
  existing: Event | undefined,
  id: string,
  name: string,
  startsOn: string,
  endsOn: string,
  nowIso: string
): Event {
  return {
    id,
    slug: existing?.slug ?? null,
    name,
    aliases: [],
    searchKeywords: [name, "深圳"].filter(Boolean),
    startsAt: toDateOnlyIso(startsOn),
    endsAt: toDateOnlyIso(endsOn),
    city: "深圳",
    venue: "",
    status: "future",
    note: "",
    updatedAt: nowIso,
    origin: "douyin_sync"
  };
}

function reconcileEventsAndLineups(
  state: ContentState,
  scheduleEntries: TalentDouyinScheduleEntry[],
  eventMergeRules: EventMergeRule[],
  now: Date
) {
  const nowIso = now.toISOString();
  const entryMap = new Map(scheduleEntries.map((entry) => [entry.id, entry]));
  const nextMergeRules = structuredClone(eventMergeRules);
  const mergeRuleByTargetEventId = new Map(nextMergeRules.map((rule) => [rule.targetEventId, rule]));
  const claimedMergeMemberIds = new Set<string>();
  const activeParsedEntries = scheduleEntries
    .filter(
      (entry) =>
        entry.state === "active" &&
        entry.city === "深圳" &&
        !isEntryPast(entry, state, now)
    )
    .map(entryToParsedItinerary)
    .filter((entry): entry is ParsedItineraryEntry => Boolean(entry));
  const groups = groupFutureShenzhenItineraries(activeParsedEntries);
  const eventMap = new Map(state.events.map((event) => [event.id, event]));
  const usedEventIds = new Set<string>();
  const upsertEvents: Event[] = [];
  const mergedBoundsByTarget = new Map<string, { startsOn: string; endsOn: string }>();

  for (const group of groups) {
    const groupedEntries = group.entries
      .map((entry) => entryMap.get(entry.rawText))
      .filter((entry): entry is TalentDouyinScheduleEntry => Boolean(entry));
    const forcedTargetIds = new Set<string>();
    for (const entry of groupedEntries) {
      const directRule = [...mergeRuleByTargetEventId.values()].find((rule) =>
        rule.members.some((member) => member.sourceEntryId === entry.id)
      );
      if (directRule) {
        forcedTargetIds.add(directRule.targetEventId);
        const directMember = directRule.members.find((member) => member.sourceEntryId === entry.id);
        if (directMember && entry.lastSeenAt === nowIso) {
          const refreshed = refreshMergeRuleMember(directMember, entry, nowIso);
          directRule.members = directRule.members.map((member) =>
            member.id === refreshed.id ? refreshed : member
          );
          claimedMergeMemberIds.add(directMember.id);
        }
        continue;
      }

      const matchedRules = nextMergeRules.flatMap((rule) => {
        const member = findMergeMemberMatch(rule, entry, claimedMergeMemberIds);
        return member ? [{ rule, member }] : [];
      });
      if (matchedRules.length === 1) {
        const { rule, member } = matchedRules[0];
        forcedTargetIds.add(rule.targetEventId);
        claimedMergeMemberIds.add(member.id);
        const refreshed = refreshMergeRuleMember(member, entry, nowIso);
        rule.members = rule.members.map((item) => (item.id === refreshed.id ? refreshed : item));
      }
    }
    const forcedTargetId = forcedTargetIds.size === 1 ? [...forcedTargetIds][0] : null;
    const forcedTarget = forcedTargetId ? eventMap.get(forcedTargetId) ?? null : null;
    const mappedSyncCandidates = [...new Set(groupedEntries.map((entry) => entry.eventId).filter(Boolean))]
      .map((eventId) => eventMap.get(eventId!))
      .filter(
        (event): event is Event =>
          Boolean(
            event &&
              !usedEventIds.has(event.id) &&
              syncEventCanBeReused(event, group.startsOn, group.endsOn, group.name, now)
          )
      )
      .sort((left, right) => {
        const leftCount = groupedEntries.filter((entry) => entry.eventId === left.id).length;
        const rightCount = groupedEntries.filter((entry) => entry.eventId === right.id).length;
        return rightCount - leftCount || left.id.localeCompare(right.id);
      });

    let targetEvent = forcedTarget ?? mappedSyncCandidates[0];
    const isForcedMergedTarget = Boolean(forcedTarget);
    if (!targetEvent && !isForcedMergedTarget) {
      const reusableSyncEvents = state.events
        .filter(
          (event) =>
            !usedEventIds.has(event.id) &&
            syncEventCanBeReused(event, group.startsOn, group.endsOn, group.name, now)
        )
        .sort((left, right) => left.id.localeCompare(right.id));
      targetEvent = reusableSyncEvents[0];
    }

    if (!targetEvent && !isForcedMergedTarget) {
      const manualMatches = state.events.filter(
        (event) =>
          isManualEvent(event) &&
          isShenzhenCity(event.city) &&
          deriveEventTemporalStatus(event.startsAt, event.endsAt, now) === "future" &&
          rangesOverlap(event, group.startsOn, group.endsOn) &&
          namesAreCompatible(event.name, group.name)
      );
      if (manualMatches.length === 1 && !usedEventIds.has(manualMatches[0].id)) {
        targetEvent = manualMatches[0];
      }
    }

    if (!targetEvent && !isForcedMergedTarget) {
      const id = randomUUID();
      targetEvent = buildAutoEvent(undefined, id, group.name, group.startsOn, group.endsOn, nowIso);
    }

    usedEventIds.add(targetEvent.id);
    if (isForcedMergedTarget) {
      const previousBounds = mergedBoundsByTarget.get(targetEvent.id);
      const startsOn = previousBounds
        ? previousBounds.startsOn < group.startsOn
          ? previousBounds.startsOn
          : group.startsOn
        : group.startsOn;
      const endsOn = previousBounds
        ? previousBounds.endsOn > group.endsOn
          ? previousBounds.endsOn
          : group.endsOn
        : group.endsOn;
      mergedBoundsByTarget.set(targetEvent.id, { startsOn, endsOn });
    } else if (targetEvent.origin === "douyin_sync") {
      const nextEvent = buildAutoEvent(
        targetEvent,
        targetEvent.id,
        group.name,
        group.startsOn,
        group.endsOn,
        nowIso
      );
      upsertEvents.push(nextEvent);
      eventMap.set(nextEvent.id, nextEvent);
    }

    for (const entry of groupedEntries) {
      entry.eventId = targetEvent.id;
    }
  }

  for (const [targetId, bounds] of mergedBoundsByTarget) {
    const targetEvent = eventMap.get(targetId);
    if (!targetEvent) continue;
    const nextEvent = buildMergedEvent(targetEvent, bounds.startsOn, bounds.endsOn, nowIso);
    eventMap.set(targetId, nextEvent);
    upsertEvents.push(nextEvent);
  }

  const existingSourceLineupByEntryId = new Map(
    state.lineups
      .filter((lineup) => lineup.source.startsWith("douyin:"))
      .map((lineup) => [lineup.source.slice("douyin:".length), lineup])
  );
  const sourceLineups: EventLineup[] = [];
  const futureLineupByAttendance = new Map<
    string,
    { entry: TalentDouyinScheduleEntry; lineup: EventLineup }
  >();

  for (const entry of scheduleEntries) {
    const existingLineup = existingSourceLineupByEntryId.get(entry.id);
    const mappedEvent = entry.eventId ? eventMap.get(entry.eventId) : null;
    const mappedEventIsPast = mappedEvent
      ? deriveEventTemporalStatus(mappedEvent.startsAt, mappedEvent.endsAt, now) === "past"
      : false;

    if (entry.state === "suppressed" || entry.state === "removed_future") {
      continue;
    }
    if ((entry.state === "retained_past" || mappedEventIsPast) && existingLineup) {
      sourceLineups.push(existingLineup);
      continue;
    }
    if (entry.state !== "active" || !entry.eventId) {
      continue;
    }

    const nextLineup = {
      id: existingLineup?.id ?? randomUUID(),
      eventId: entry.eventId,
      talentId: entry.talentId,
      status: "confirmed",
      source: `douyin:${entry.id}`,
      note: existingLineup?.note ?? "",
      lineupDate: entry.startsAt
    } satisfies EventLineup;
    const attendanceKey = `${entry.eventId}:${entry.talentId}:${getDateOnlyKey(entry.startsAt) ?? entry.startsAt}`;
    const current = futureLineupByAttendance.get(attendanceKey);
    if (
      !current ||
      entry.consecutiveMissingCount < current.entry.consecutiveMissingCount ||
      (entry.consecutiveMissingCount === current.entry.consecutiveMissingCount &&
        Boolean(existingLineup) &&
        !existingSourceLineupByEntryId.has(current.entry.id))
    ) {
      futureLineupByAttendance.set(attendanceKey, { entry, lineup: nextLineup });
    }
  }
  sourceLineups.push(...[...futureLineupByAttendance.values()].map((item) => item.lineup));

  for (const existingLineup of state.lineups.filter((lineup) => lineup.source.startsWith("douyin:"))) {
    const entryId = existingLineup.source.slice("douyin:".length);
    if (entryMap.has(entryId) || sourceLineups.some((lineup) => lineup.id === existingLineup.id)) {
      continue;
    }
    const event = eventMap.get(existingLineup.eventId);
    if (event && deriveEventTemporalStatus(event.startsAt, event.endsAt, now) === "past") {
      sourceLineups.push(existingLineup);
    }
  }

  const eventIdsWithLineups = new Set([
    ...state.lineups.filter((lineup) => !lineup.source.startsWith("douyin:")).map((lineup) => lineup.eventId),
    ...sourceLineups.map((lineup) => lineup.eventId)
  ]);
  const eventIdsWithArchives = new Set(state.archives.map((archive) => archive.eventId));
  const deleteSyncEventIds = state.events
    .filter(
      (event) =>
        event.origin === "douyin_sync" &&
        deriveEventTemporalStatus(event.startsAt, event.endsAt, now) === "future" &&
        !eventIdsWithLineups.has(event.id) &&
        !eventIdsWithArchives.has(event.id)
    )
    .map((event) => event.id);
  const deletedEventIdSet = new Set(deleteSyncEventIds);
  for (const entry of scheduleEntries) {
    if (entry.eventId && deletedEventIdSet.has(entry.eventId)) {
      entry.eventId = null;
    }
  }

  return {
    upsertEvents,
    sourceLineups,
    deleteSyncEventIds,
    eventMergeRules: nextMergeRules
  };
}

function finalizeRun(run: DouyinSyncRun, results: DouyinSyncResult[], finishedAt: string): DouyinSyncRun {
  const succeededCount = results.filter((result) => result.status === "succeeded").length;
  const skippedCount = results.filter((result) => result.status === "skipped").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  return {
    ...run,
    status: failedCount > 0 ? "completed_with_errors" : "completed",
    succeededCount,
    skippedCount,
    failedCount,
    finishedAt
  };
}

export async function runDouyinSync(options: RunDouyinSyncOptions): Promise<DouyinSyncExecution> {
  const repository = options.repository ?? getContentRepository();
  if (!options.config && !appEnv.douyinSyncEnabled) {
    throw new DouyinSyncOperationError("DISABLED", "抖音主页同步当前未启用。");
  }
  const configured = options.config ?? getDouyinSyncConfig();
  const config: DouyinSyncConfig = {
    enabled: configured.enabled,
    concurrency: configured.concurrency,
    cooldownMinutes: configured.cooldownMinutes
  };
  if (!config.enabled) {
    throw new DouyinSyncOperationError("DISABLED", "抖音主页同步当前未启用。");
  }

  const now = options.now ?? new Date();
  const initialState = await repository.getState();
  const selectedTalents = getSelectedTalents(initialState, options.talentId);
  const run: DouyinSyncRun = {
    id: randomUUID(),
    trigger: options.trigger,
    status: "running",
    requestedCount: selectedTalents.length,
    succeededCount: 0,
    skippedCount: 0,
    failedCount: 0,
    startedAt: now.toISOString(),
    finishedAt: null
  };
  const acquired = await repository.tryStartDouyinSyncRun(
    run,
    new Date(now.getTime() - RUN_LOCK_STALE_MS).toISOString()
  );
  if (!acquired) {
    throw new DouyinSyncOperationError("RUNNING", "已有抖音同步任务正在运行。");
  }

  let results: DouyinSyncResult[] = [];
  try {
    const outcomes = await mapWithConcurrency(
      selectedTalents,
      config.concurrency,
      async (talent) =>
        fetchTalentSnapshot(talent, run, initialState, {
          fetchProfile: options.fetchProfile ?? fetchDouyinProfile,
          config,
          now
        })
    );
    // Fetching a batch can take minutes. Rebase the write on the newest repository
    // state so an admin edit made while upstream requests were in flight is not
    // overwritten by the state captured before the run lock was acquired.
    const reconciliationState = await repository.getState();
    const currentTalentById = new Map(
      reconciliationState.talents.map((talent) => [talent.id, talent])
    );
    const freshSnapshots = outcomes.flatMap((outcome) => {
      if (!outcome.snapshot) {
        return [];
      }
      const currentTalent = currentTalentById.get(outcome.snapshot.talent.id);
      const currentPrimary = currentTalent ? getPrimaryDouyinProfileLink(currentTalent).link : null;
      return currentTalent && currentPrimary?.url === outcome.snapshot.profileUrl
        ? [{ ...outcome.snapshot, talent: currentTalent }]
        : [];
    });
    const freshSnapshotTalentIds = new Set(
      freshSnapshots.map((snapshot) => snapshot.talent.id)
    );
    const claimedSecUserIds = new Map(
      reconciliationState.douyinProfiles.flatMap((profile) =>
        profile.secUserId ? [[profile.secUserId, profile.talentId] as const] : []
      )
    );
    const duplicateProfileTalentIds = new Set<string>();
    const snapshots = freshSnapshots.filter((snapshot) => {
      const ownerTalentId = claimedSecUserIds.get(snapshot.response.account.secUserId);
      if (ownerTalentId && ownerTalentId !== snapshot.talent.id) {
        duplicateProfileTalentIds.add(snapshot.talent.id);
        return false;
      }
      claimedSecUserIds.set(snapshot.response.account.secUserId, snapshot.talent.id);
      return true;
    });
    results = outcomes.map((outcome) => {
      const talentId = outcome.result.talentId;
      const currentTalent = talentId ? currentTalentById.get(talentId) : null;
      const currentPrimary = currentTalent ? getPrimaryDouyinProfileLink(currentTalent).link : null;
      const profileUrl = outcome.snapshot?.profileUrl ?? outcome.profileOnFailure?.profileUrl;
      const changedDuringSync =
        Boolean(outcome.snapshot && talentId && !freshSnapshotTalentIds.has(talentId)) ||
        Boolean(profileUrl && currentPrimary?.url !== profileUrl);
      if (changedDuringSync) {
        return createResult(
            run.id,
            talentId ?? null,
            "skipped",
            "PROFILE_CHANGED_DURING_SYNC",
            "同步期间主抖音主页已变更，本次结果未写入。",
            now.toISOString()
          );
      }
      if (talentId && duplicateProfileTalentIds.has(talentId)) {
        return createResult(
          run.id,
          talentId,
          "failed",
          "DUPLICATE_PRIMARY_ACCOUNT",
          "该抖音账号已绑定到另一位达人，本次结果未写入。",
          now.toISOString()
        );
      }
      return outcome.result;
    });
    const profileMap = new Map(
      reconciliationState.douyinProfiles.map((profile) => [profile.talentId, profile])
    );
    for (const outcome of outcomes) {
      if (outcome.profileOnFailure) {
        const currentTalent = currentTalentById.get(outcome.profileOnFailure.talentId);
        const currentPrimary = currentTalent ? getPrimaryDouyinProfileLink(currentTalent).link : null;
        if (currentPrimary?.url !== outcome.profileOnFailure.profileUrl) {
          continue;
        }
        const currentProfile = profileMap.get(outcome.profileOnFailure.talentId);
        profileMap.set(
          outcome.profileOnFailure.talentId,
          currentProfile
            ? {
                ...currentProfile,
                profileUrl: outcome.profileOnFailure.profileUrl,
                lastErrorCode: outcome.profileOnFailure.lastErrorCode,
                manualSyncAvailableAt: outcome.profileOnFailure.manualSyncAvailableAt
              }
            : outcome.profileOnFailure
        );
      }
    }
    for (const snapshot of snapshots) {
      profileMap.set(
        snapshot.talent.id,
        buildProfile(snapshot, profileMap.get(snapshot.talent.id), run.trigger, config, now)
      );
    }

    const scheduleEntries = reconcileScheduleEntries(reconciliationState, snapshots, now);
    const reconciliation = reconcileEventsAndLineups(
      reconciliationState,
      scheduleEntries,
      reconciliationState.eventMergeRules,
      now
    );
    const finishedRun = finalizeRun(run, results, new Date().toISOString());

    await repository.saveDouyinSyncState({
      profiles: [...profileMap.values()],
      relatedAccounts: reconcileRelatedAccounts(reconciliationState, snapshots),
      scheduleEntries,
      upsertEvents: reconciliation.upsertEvents,
      sourceLineups: reconciliation.sourceLineups,
      eventMergeRules: reconciliation.eventMergeRules,
      deleteSyncEventIds: reconciliation.deleteSyncEventIds,
      syncRun: finishedRun,
      syncResults: results
    });
    return { run: finishedRun, results };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const failureResult = createResult(
      run.id,
      null,
      "failed",
      "RUN_FAILED",
      "抖音同步任务执行失败。",
      finishedAt
    );
    const failedRun: DouyinSyncRun = {
      ...run,
      status: "failed",
      failedCount: Math.max(1, run.requestedCount),
      finishedAt
    };
    await repository.finishDouyinSyncRun(failedRun, [...results, failureResult]).catch(() => undefined);
    throw error;
  }
}
