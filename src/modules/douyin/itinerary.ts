import { getShanghaiDateKey, isValidDateOnlyValue } from "@/lib/date";
import { findItineraryLocation, ITINERARY_LOCATION_PATTERN_SOURCE } from "@/modules/douyin/geography";

export const DOUYIN_ITINERARY_PARSER_VERSION = "1";

const CITY_SOURCE = ITINERARY_LOCATION_PATTERN_SOURCE;
const CITY_PATTERN = new RegExp(`(${CITY_SOURCE})(?:市)?`, "u");
const DATE_TOKEN_SOURCE = String.raw`(?<!\d)(?:(?:(\d{4})[./年])?(\d{1,2})[.月](\d{1,2})(?:日|号)?(?:\s*[-~～—至]\s*(?:(\d{1,2})[.月])?(\d{1,2})(?:日|号)?)?|(\d{3,4})(?=(?:${CITY_SOURCE})(?:市)?))`;
const TRIM_SEPARATORS = /^[\s/➡️→·,，;；:：|✨]+|[\s/➡️→·,，;；:：|✨]+$/gu;

interface DateCandidate {
  index: number;
  raw: string;
  dateKey: string | null;
  endDateKey: string | null;
}

interface DateToken extends DateCandidate {
  dateKey: string;
  endDateKey: string;
}

export interface ParsedItineraryEntry {
  rawText: string;
  dateKey: string;
  endDateKey: string;
  city: string | null;
  eventName: string;
  isFuture: boolean;
  blockIndex: number;
}

export interface ItineraryParseSkip {
  rawText: string;
  reason: "invalid_date" | "missing_date" | "missing_city" | "past";
}

export interface ItineraryParseResult {
  displayBlocks: string[];
  itineraryText: string;
  entries: ParsedItineraryEntry[];
  skipped: ItineraryParseSkip[];
  parserVersion: string;
}

export interface ShenzhenItineraryGroup {
  groupKey: string;
  name: string;
  normalizedName: string;
  startsOn: string;
  endsOn: string;
  entries: ParsedItineraryEntry[];
}

function formatDateKey(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseCompactDate(value: string) {
  if (value.length === 3) {
    return { month: Number(value.slice(0, 1)), day: Number(value.slice(1)) };
  }

  if (value.length === 4) {
    return { month: Number(value.slice(0, 2)), day: Number(value.slice(2)) };
  }

  return null;
}

function collectDateCandidates(line: string, currentYear: number) {
  const matcher = new RegExp(DATE_TOKEN_SOURCE, "gu");
  const candidates: DateCandidate[] = [];

  for (const match of line.matchAll(matcher)) {
    const raw = match[0];
    const explicitYear = match[1] ? Number(match[1]) : currentYear;
    const compact = match[6] ? parseCompactDate(match[6]) : null;
    const month = compact?.month ?? Number(match[2]);
    const day = compact?.day ?? Number(match[3]);
    const endMonth = match[4] ? Number(match[4]) : month;
    const endDay = match[5] ? Number(match[5]) : day;
    const dateKey = formatDateKey(explicitYear, month, day);
    const endDateKey = formatDateKey(explicitYear, endMonth, endDay);

    const valid =
      isValidDateOnlyValue(dateKey) &&
      isValidDateOnlyValue(endDateKey) &&
      endDateKey >= dateKey;
    candidates.push({
      index: match.index ?? 0,
      raw,
      dateKey: valid ? dateKey : null,
      endDateKey: valid ? endDateKey : null
    });
  }

  return candidates;
}

function isValidDateToken(candidate: DateCandidate): candidate is DateToken {
  return Boolean(candidate.dateKey && candidate.endDateKey);
}

function cleanSegment(value: string) {
  return value.replace(TRIM_SEPARATORS, "").trim();
}

function buildDisplayBlock(line: string, firstDateIndex: number) {
  const trimmed = line.trim();
  if (/行程\s*[:：]?/u.test(trimmed.slice(0, firstDateIndex + 1))) {
    return trimmed;
  }

  return cleanSegment(line.slice(firstDateIndex));
}

function parseEntrySegment(
  segment: string,
  token: DateToken,
  todayKey: string,
  blockIndex: number
): ParsedItineraryEntry {
  const afterDate = cleanSegment(segment.slice(token.raw.length));
  const cityMatch = CITY_PATTERN.exec(afterDate);
  const city = cityMatch ? findItineraryLocation(cityMatch[1])?.label ?? cityMatch[1] : null;
  const eventName = cityMatch
    ? cleanSegment(`${afterDate.slice(0, cityMatch.index)} ${afterDate.slice(cityMatch.index + cityMatch[0].length)}`)
    : afterDate;

  return {
    rawText: cleanSegment(segment),
    dateKey: token.dateKey,
    endDateKey: token.endDateKey,
    city,
    eventName,
    isFuture: token.endDateKey >= todayKey,
    blockIndex
  };
}

export function parseDouyinItinerary(signatureRaw: string, now = new Date()): ItineraryParseResult {
  const todayKey = getShanghaiDateKey(now);
  const currentYear = Number(todayKey.slice(0, 4));
  const displayBlocks: string[] = [];
  const entries: ParsedItineraryEntry[] = [];
  const skipped: ItineraryParseSkip[] = [];

  for (const line of signatureRaw.replace(/\r\n?/g, "\n").split("\n")) {
    const candidates = collectDateCandidates(line, currentYear);
    if (candidates.length === 0) {
      const labeledBlock = line.trim();
      if (/行程\s*[:：]?/u.test(labeledBlock)) {
        displayBlocks.push(labeledBlock);
        skipped.push({ rawText: labeledBlock, reason: "missing_date" });
      }
      continue;
    }

    const displayBlock = buildDisplayBlock(line, candidates[0].index);
    if (!displayBlock) {
      continue;
    }

    const blockIndex = displayBlocks.length;
    displayBlocks.push(displayBlock);

    candidates.forEach((candidate, candidateIndex) => {
      const segmentEnd = candidates[candidateIndex + 1]?.index ?? line.length;
      const segment = line.slice(candidate.index, segmentEnd);
      if (!isValidDateToken(candidate)) {
        skipped.push({ rawText: cleanSegment(segment), reason: "invalid_date" });
        return;
      }

      const token = candidate;
      const entry = parseEntrySegment(segment, token, todayKey, blockIndex);
      entries.push(entry);

      if (!entry.city) {
        skipped.push({ rawText: entry.rawText, reason: "missing_city" });
      } else if (!entry.isFuture) {
        skipped.push({ rawText: entry.rawText, reason: "past" });
      }
    });
  }

  return {
    displayBlocks,
    itineraryText: displayBlocks.join("\n"),
    entries,
    skipped,
    parserVersion: DOUYIN_ITINERARY_PARSER_VERSION
  };
}

export function normalizeDouyinEventName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function dateKeyToUtcTime(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function getDateSpanDays(startsOn: string, endsOn: string) {
  return Math.round((dateKeyToUtcTime(endsOn) - dateKeyToUtcTime(startsOn)) / 86_400_000);
}

function getCombinedBounds(group: ShenzhenItineraryGroup, entry: ParsedItineraryEntry) {
  return {
    startsOn: group.startsOn < entry.dateKey ? group.startsOn : entry.dateKey,
    endsOn: group.endsOn > entry.endDateKey ? group.endsOn : entry.endDateKey
  };
}

function canAddEntry(group: ShenzhenItineraryGroup, entry: ParsedItineraryEntry) {
  const bounds = getCombinedBounds(group, entry);
  return getDateSpanDays(bounds.startsOn, bounds.endsOn) <= 5;
}

function refreshGroup(group: ShenzhenItineraryGroup) {
  const entries = [...group.entries].sort(
    (left, right) => left.dateKey.localeCompare(right.dateKey) || left.rawText.localeCompare(right.rawText, "zh-CN")
  );
  const startsOn = entries.reduce((minimum, entry) => (entry.dateKey < minimum ? entry.dateKey : minimum), entries[0].dateKey);
  const endsOn = entries.reduce((maximum, entry) => (entry.endDateKey > maximum ? entry.endDateKey : maximum), entries[0].endDateKey);
  const normalizedName = group.normalizedName;

  return {
    ...group,
    groupKey: `${startsOn}:${endsOn}:${normalizedName || "unnamed"}`,
    startsOn,
    endsOn,
    entries
  };
}

function createGroup(entry: ParsedItineraryEntry, normalizedName: string): ShenzhenItineraryGroup {
  return refreshGroup({
    groupKey: "",
    name: entry.eventName,
    normalizedName,
    startsOn: entry.dateKey,
    endsOn: entry.endDateKey,
    entries: [entry]
  });
}

function addEntry(group: ShenzhenItineraryGroup, entry: ParsedItineraryEntry) {
  return refreshGroup({
    ...group,
    name: group.name || entry.eventName,
    normalizedName: group.normalizedName || normalizeDouyinEventName(entry.eventName),
    entries: [...group.entries, entry]
  });
}

function buildFixedWindowGroups(entries: ParsedItineraryEntry[], normalizedName: string) {
  const groups: ShenzhenItineraryGroup[] = [];

  for (const entry of entries) {
    const targetIndex = groups.findIndex((group) => canAddEntry(group, entry));
    if (targetIndex >= 0) {
      groups[targetIndex] = addEntry(groups[targetIndex], entry);
    } else {
      groups.push(createGroup(entry, normalizedName));
    }
  }

  return groups;
}

export function groupFutureShenzhenItineraries(entries: ParsedItineraryEntry[]) {
  const eligibleEntries = entries
    .filter((entry) => entry.isFuture && entry.city === "深圳")
    .sort(
      (left, right) =>
        left.dateKey.localeCompare(right.dateKey) ||
        normalizeDouyinEventName(left.eventName).localeCompare(normalizeDouyinEventName(right.eventName), "zh-CN") ||
        left.rawText.localeCompare(right.rawText, "zh-CN")
    );
  const namedEntries = new Map<string, ParsedItineraryEntry[]>();
  const unnamedEntries: ParsedItineraryEntry[] = [];

  for (const entry of eligibleEntries) {
    const normalizedName = normalizeDouyinEventName(entry.eventName);
    if (!normalizedName) {
      unnamedEntries.push(entry);
      continue;
    }

    const current = namedEntries.get(normalizedName) ?? [];
    current.push(entry);
    namedEntries.set(normalizedName, current);
  }

  const namedGroups = [...namedEntries.entries()].flatMap(([normalizedName, matchingEntries]) =>
    buildFixedWindowGroups(matchingEntries, normalizedName)
  );
  const remainingUnnamedGroups: ShenzhenItineraryGroup[] = [];

  for (const unnamedGroup of buildFixedWindowGroups(unnamedEntries, "")) {
    const compatibleNamedGroupIndexes = namedGroups.flatMap((group, index) => {
      const combinedEntries = [...group.entries, ...unnamedGroup.entries];
      const startsOn = combinedEntries.reduce(
        (minimum, entry) => (entry.dateKey < minimum ? entry.dateKey : minimum),
        combinedEntries[0].dateKey
      );
      const endsOn = combinedEntries.reduce(
        (maximum, entry) => (entry.endDateKey > maximum ? entry.endDateKey : maximum),
        combinedEntries[0].endDateKey
      );
      return getDateSpanDays(startsOn, endsOn) <= 5 ? [index] : [];
    });

    if (compatibleNamedGroupIndexes.length === 1) {
      const targetIndex = compatibleNamedGroupIndexes[0];
      namedGroups[targetIndex] = refreshGroup({
        ...namedGroups[targetIndex],
        entries: [...namedGroups[targetIndex].entries, ...unnamedGroup.entries]
      });
    } else {
      remainingUnnamedGroups.push(unnamedGroup);
    }
  }

  return [...namedGroups, ...remainingUnnamedGroups].sort(
    (left, right) => left.startsOn.localeCompare(right.startsOn) || left.normalizedName.localeCompare(right.normalizedName, "zh-CN")
  );
}
