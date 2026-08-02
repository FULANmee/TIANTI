import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

function toDate(value?: string | Date | null) {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(date?: string | Date | null, pattern = "yyyy.MM.dd") {
  const value = toDate(date);
  if (!value) {
    return "日期待定";
  }
  return format(value, pattern, { locale: zhCN });
}

export function formatDateKey(value?: string | null, pattern = "MM.dd") {
  return formatDate(toDateOnlyIso(value ?? "") ?? null, pattern);
}

export function formatDateRange(startsAt?: string | Date | null, endsAt?: string | Date | null) {
  const start = toDate(startsAt);
  const end = toDate(endsAt);

  if (!start && !end) {
    return "日期待定";
  }

  if (!start) {
    return formatDate(end);
  }

  if (!end) {
    return formatDate(start);
  }

  const formattedStart = formatDate(start, "MM.dd");
  const formattedEnd = formatDate(end, "MM.dd");
  const year = formatDate(start, "yyyy");

  return formattedStart === formattedEnd ? `${year}.${formattedStart}` : `${year}.${formattedStart}-${formattedEnd}`;
}

export function toDateInputValue(value?: string | null) {
  const date = toDate(value);
  return date ? format(date, "yyyy-MM-dd") : "";
}

export function getDateOnlyKey(value?: string | Date | null) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return isValidDateOnlyValue(value) ? value : null;
  }

  const date = toDate(value);
  return date ? format(date, "yyyy-MM-dd") : null;
}

export function toDateOnlyIso(value?: string | null) {
  if (!value) return null;

  const date = createUtcDateFromKey(value);
  return date?.toISOString() ?? null;
}

export function isValidDateOnlyValue(value: string) {
  return parseDateKey(value) !== null;
}

export function getDateSortTime(value?: string | Date | null) {
  const date = toDate(value);
  return date ? date.getTime() : null;
}

export function getTimeZoneDateKey(value: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(value);
}

export function getShanghaiDateKey(value = new Date()) {
  return getTimeZoneDateKey(value, SHANGHAI_TIME_ZONE);
}

export function deriveEventTemporalStatus(
  startsAt?: string | Date | null,
  endsAt?: string | Date | null,
  now = new Date()
) {
  const boundaryDateKey = getDateOnlyKey(endsAt ?? startsAt ?? null);
  if (!boundaryDateKey) {
    return "undated" as const;
  }

  return boundaryDateKey < getShanghaiDateKey(now) ? ("past" as const) : ("future" as const);
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if ([year, month, day].some((part) => Number.isNaN(part))) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function createUtcDateFromKey(value: string) {
  const parts = parseDateKey(value);
  if (!parts) {
    return null;
  }

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
}

export function isSameDateOnly(left?: string | Date | null, right?: string | Date | null) {
  return getDateOnlyKey(left) === getDateOnlyKey(right);
}

export function isMultiDayRange(startsAt?: string | Date | null, endsAt?: string | Date | null) {
  const start = getDateOnlyKey(startsAt);
  const end = getDateOnlyKey(endsAt);
  return Boolean(start && end && start !== end);
}

export function getDateRangeDays(startsAt?: string | Date | null, endsAt?: string | Date | null) {
  const startKey = getDateOnlyKey(startsAt);
  const endKey = getDateOnlyKey(endsAt);

  if (!startKey || !endKey) {
    return [];
  }

  const startDate = createUtcDateFromKey(startKey);
  const endDate = createUtcDateFromKey(endKey);
  if (!startDate || !endDate) {
    return [];
  }

  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  const [rangeStart, rangeEnd] = startTime <= endTime ? [startDate, endDate] : [endDate, startDate];
  const dates: string[] = [];

  for (let cursor = new Date(rangeStart); cursor.getTime() <= rangeEnd.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(format(cursor, "yyyy-MM-dd"));
  }

  return dates;
}
