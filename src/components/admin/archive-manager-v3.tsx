"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { InlineAssetUpload } from "@/components/admin/inline-asset-upload";
import { useAdminUnsavedChanges } from "@/components/admin/admin-unsaved-changes";
import { StatusNotice } from "@/components/ui/status-notice";
import {
  createArchiveDraft,
  createEmptyEventDraft,
  createEventDraft,
  createLineupDrafts,
  normalizeArchiveDraft,
  normalizeEventDraft,
  normalizeLineupDrafts,
  type EditableEvent,
  type EditableLineup
} from "@/components/admin/archive-manager-utils";
import {
  deriveEventTemporalStatus,
  formatDateKey,
  getDateRangeDays,
  getDateSortTime,
  isMultiDayRange,
  toDateOnlyIso
} from "@/lib/date";
import { getEventDisplayName } from "@/lib/event-display";
import { compareByPinyin } from "@/lib/pinyin";
import type { BulkActionResult } from "@/modules/admin/types";
import type { Asset, EditorArchive, Event, EventLineup, Talent } from "@/modules/domain/types";

interface ArchiveManagerProps {
  events: Event[];
  talents: Talent[];
  assets: Asset[];
  lineups: EventLineup[];
  archives: EditorArchive[];
  initialSelectedEventId?: string | null;
}

interface AddLineupDateDraft {
  date: string;
  selected: boolean;
  note: string;
}

interface AddLineupDraft {
  talentId: string;
  note: string;
  dates: AddLineupDateDraft[];
}

interface AddArchiveEntryDraft {
  id: string;
  talentId: string;
  entryDate: string | null;
  cosplayTitle: string;
}

const UNSAVED_MESSAGE = "当前活动仍有未保存的修改，离开后会丢失。确定继续吗？";

function sortEventsForManager(value: Event[]) {
  const statusOrder = {
    future: 0,
    undated: 1,
    past: 2
  } as const;

  return [...value].sort((left, right) => {
    const leftStatus = deriveEventTemporalStatus(left.startsAt ?? null, left.endsAt ?? null);
    const rightStatus = deriveEventTemporalStatus(right.startsAt ?? null, right.endsAt ?? null);
    if (statusOrder[leftStatus] !== statusOrder[rightStatus]) {
      return statusOrder[leftStatus] - statusOrder[rightStatus];
    }

    const leftTime = getDateSortTime(left.startsAt ?? left.endsAt ?? null);
    const rightTime = getDateSortTime(right.startsAt ?? right.endsAt ?? null);

    if (leftTime === null && rightTime === null) {
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    }

    if (leftTime === null) return 1;
    if (rightTime === null) return -1;
    return rightTime - leftTime;
  });
}

function sortTalentsForSelection(value: Talent[]) {
  return [...value].sort(
    (left, right) =>
      compareByPinyin(left.nickname, right.nickname) ||
      left.nickname.localeCompare(right.nickname, "zh-CN") ||
      left.id.localeCompare(right.id)
  );
}

function createEditableLineup(talentId = "", lineupDate = ""): EditableLineup {
  return {
    id: crypto.randomUUID(),
    talentId,
    lineupDate,
    status: "confirmed",
    source: "",
    note: ""
  };
}

function createArchiveEntry(
  talentId = "",
  entryDate = "",
  sceneAssetId = "",
  cosplayTitle = ""
): EditorArchive["entries"][number] {
  return {
    id: crypto.randomUUID(),
    talentId,
    entryDate: entryDate || null,
    sceneAssetId,
    sharedPhotoAssetId: null,
    cosplayTitle,
    hasSharedPhoto: false
  };
}

function createArchiveEntryDraft(talentId = "", entryDate = ""): AddArchiveEntryDraft {
  return {
    id: crypto.randomUUID(),
    talentId,
    entryDate: entryDate || null,
    cosplayTitle: ""
  };
}

function updateBrowserSelection(eventId: string | null) {
  const url = new URL(window.location.href);
  if (eventId) {
    url.searchParams.set("event", eventId);
  } else {
    url.searchParams.delete("event");
  }
  window.history.replaceState(null, "", url);
}

function buildBulkSummary(result: BulkActionResult, label: string) {
  const blocked =
    result.blocked.length > 0
      ? `，${result.blocked.length} 项未完成：${result.blocked.map((item) => item.reason).join(" / ")}`
      : "";
  return `${label} ${result.succeededIds.length} 项${blocked}`;
}

function validateEventDraft(eventDraft: EditableEvent, editableLineups: EditableLineup[]) {
  if (!eventDraft.name.trim()) return "请先填写活动名称。";
  if (eventDraft.startsAt && eventDraft.endsAt && eventDraft.endsAt < eventDraft.startsAt) {
    return "活动结束日期不能早于开始日期。";
  }

  const validDateKeys = new Set(getDateRangeDays(eventDraft.startsAt, eventDraft.endsAt));
  if (isMultiDayRange(eventDraft.startsAt, eventDraft.endsAt)) {
    for (const lineup of editableLineups) {
      if (!lineup.talentId) continue;
      if (!lineup.lineupDate) return "多日活动的每条达人阵容都必须选择所属日期。";
      if (!validDateKeys.has(lineup.lineupDate)) {
        return "达人阵容的所属日期必须落在活动开始和结束日期之间。";
      }
    }
  }

  return null;
}

function validateArchiveDraft(
  archiveDraft: EditorArchive,
  isMultiDayEvent: boolean,
  validDateKeys: Set<string>,
  validTalentIds: Set<string>,
  validDateKeysByTalentId: Map<string, Set<string>>
) {
  for (const entry of archiveDraft.entries) {
    if (!entry.talentId) return "档案条目里还有达人未选择。";
    if (!validTalentIds.has(entry.talentId)) return "现场档案只能选择当前活动阵容里的达人。";
    if (isMultiDayEvent && !entry.entryDate) return "多日活动的每条现场档案记录都必须选择所属日期。";
    if (entry.entryDate && validDateKeys.size > 0 && !validDateKeys.has(entry.entryDate)) {
      return "现场档案记录的所属日期必须落在活动开始和结束日期之间。";
    }
    if (isMultiDayEvent && entry.entryDate && !validDateKeysByTalentId.get(entry.talentId)?.has(entry.entryDate)) {
      return "现场档案记录的所属日期必须匹配该达人在活动阵容中的日期。";
    }
    if (entry.hasSharedPhoto && !entry.sharedPhotoAssetId) {
      return "已勾选合照的档案条目必须选择一张合照素材。";
    }
  }

  return null;
}

function buildEditableLineupGroups(lineups: EditableLineup[], dateOptions: string[], isMultiDayEvent: boolean) {
  if (!isMultiDayEvent) {
    return [
      {
        key: "single",
        label: null,
        items: lineups.map((lineup, index) => ({ lineup, index }))
      }
    ];
  }

  const groups = dateOptions.map((date) => ({
    key: date,
    label: formatDateKey(date),
    items: [] as Array<{ lineup: EditableLineup; index: number }>
  }));
  const groupMap = new Map(groups.map((group) => [group.key, group]));
  const undatedItems: Array<{ lineup: EditableLineup; index: number }> = [];

  lineups.forEach((lineup, index) => {
    const group = lineup.lineupDate ? groupMap.get(lineup.lineupDate) : null;
    if (!group) {
      undatedItems.push({ lineup, index });
      return;
    }

    group.items.push({ lineup, index });
  });

  return undatedItems.length > 0
    ? [
        ...groups,
        {
          key: "undated",
          label: "未分配日期",
          items: undatedItems
        }
      ]
    : groups;
}

function buildEditableArchiveGroups(
  entries: EditorArchive["entries"],
  dateOptions: string[],
  isMultiDayEvent: boolean
) {
  if (!isMultiDayEvent) {
    return [
      {
        key: "single",
        label: null,
        items: entries.map((entry, index) => ({ entry, index }))
      }
    ];
  }

  const groups = dateOptions.map((date) => ({
    key: date,
    label: formatDateKey(date),
    items: [] as Array<{ entry: EditorArchive["entries"][number]; index: number }>
  }));
  const groupMap = new Map(groups.map((group) => [group.key, group]));
  const undatedItems: Array<{ entry: EditorArchive["entries"][number]; index: number }> = [];

  entries.forEach((entry, index) => {
    const group = entry.entryDate ? groupMap.get(entry.entryDate) : null;
    if (!group) {
      undatedItems.push({ entry, index });
      return;
    }

    group.items.push({ entry, index });
  });

  return undatedItems.length > 0
    ? [
        ...groups,
        {
          key: "undated",
          label: "未分配日期",
          items: undatedItems
        }
      ]
    : groups;
}

export function ArchiveManager({
  events,
  talents,
  assets,
  lineups,
  archives,
  initialSelectedEventId
}: ArchiveManagerProps) {
  const initialEvents = sortEventsForManager(events);
  const initialEventId = initialEvents.some((event) => event.id === initialSelectedEventId)
    ? (initialSelectedEventId ?? null)
    : (initialEvents[0]?.id ?? null);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [liveAssets, setLiveAssets] = useState(assets);
  const [cleanupCandidateAssetIds, setCleanupCandidateAssetIds] = useState<string[]>([]);
  const [liveEvents, setLiveEvents] = useState(initialEvents);
  const [liveLineups, setLiveLineups] = useState(lineups);
  const [liveArchives, setLiveArchives] = useState(archives);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId);
  const [isEventEditorOpen, setIsEventEditorOpen] = useState(false);
  const [isLineupDialogOpen, setIsLineupDialogOpen] = useState(false);
  const [lineupDialogDraft, setLineupDialogDraft] = useState<AddLineupDraft | null>(null);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [archiveDialogDrafts, setArchiveDialogDrafts] = useState<AddArchiveEntryDraft[]>([]);
  const [eventDraft, setEventDraft] = useState<EditableEvent>(() =>
    createEventDraft(initialEvents.find((event) => event.id === initialEventId) ?? null)
  );
  const [editableLineups, setEditableLineups] = useState<EditableLineup[]>(() =>
    createLineupDrafts(initialEvents.find((event) => event.id === initialEventId) ?? null, lineups)
  );
  const [archiveDraft, setArchiveDraft] = useState<EditorArchive>(() =>
    createArchiveDraft(initialEventId, archives)
  );
  const { setGuard } = useAdminUnsavedChanges();

  const filteredEvents = useMemo(
    () =>
      liveEvents.filter((event) =>
        `${event.name} ${event.aliases.join(" ")} ${event.city} ${event.venue} ${event.searchKeywords.join(" ")}`
          .toLowerCase()
          .includes(deferredQuery.toLowerCase())
      ),
    [deferredQuery, liveEvents]
  );
  const selectedEvent = liveEvents.find((event) => event.id === selectedEventId) ?? null;
  const persistedEventDraft = useMemo(() => createEventDraft(selectedEvent), [selectedEvent]);
  const persistedLineups = useMemo(
    () => createLineupDrafts(selectedEvent, liveLineups),
    [liveLineups, selectedEvent]
  );
  const persistedArchive = useMemo(
    () => createArchiveDraft(selectedEventId, liveArchives),
    [liveArchives, selectedEventId]
  );
  const sortedTalents = useMemo(() => sortTalentsForSelection(talents), [talents]);
  const talentMap = useMemo(() => new Map(sortedTalents.map((talent) => [talent.id, talent])), [sortedTalents]);
  const assetMap = useMemo(() => new Map(liveAssets.map((asset) => [asset.id, asset])), [liveAssets]);
  const lineupDateOptions = useMemo(
    () => getDateRangeDays(eventDraft.startsAt, eventDraft.endsAt),
    [eventDraft.endsAt, eventDraft.startsAt]
  );
  const archiveDateOptions = lineupDateOptions;
  const isMultiDayEvent = useMemo(
    () => isMultiDayRange(eventDraft.startsAt, eventDraft.endsAt),
    [eventDraft.endsAt, eventDraft.startsAt]
  );
  const validArchiveDateKeys = useMemo(() => new Set(archiveDateOptions), [archiveDateOptions]);
  const editableLineupGroups = useMemo(
    () => buildEditableLineupGroups(editableLineups, lineupDateOptions, isMultiDayEvent),
    [editableLineups, isMultiDayEvent, lineupDateOptions]
  );
  const editableArchiveGroups = useMemo(
    () => buildEditableArchiveGroups(archiveDraft.entries, archiveDateOptions, isMultiDayEvent),
    [archiveDateOptions, archiveDraft.entries, isMultiDayEvent]
  );
  const editableLineupDateKeysByTalentId = useMemo(() => {
    const dateMap = new Map<string, Set<string>>();
    for (const lineup of editableLineups) {
      if (!lineup.talentId) continue;
      const current = dateMap.get(lineup.talentId) ?? new Set<string>();
      current.add(lineup.lineupDate || "");
      dateMap.set(lineup.talentId, current);
    }
    return dateMap;
  }, [editableLineups]);
  const savedLineupDateKeysByTalentId = useMemo(() => {
    const dateMap = new Map<string, Set<string>>();
    for (const lineup of persistedLineups) {
      if (!lineup.talentId) continue;
      const current = dateMap.get(lineup.talentId) ?? new Set<string>();
      current.add(lineup.lineupDate || "");
      dateMap.set(lineup.talentId, current);
    }
    return dateMap;
  }, [persistedLineups]);
  const savedLineupTalentIds = useMemo(
    () => [...new Set(persistedLineups.map((lineup) => lineup.talentId).filter(Boolean))],
    [persistedLineups]
  );
  const savedLineupTalentIdSet = useMemo(() => new Set(savedLineupTalentIds), [savedLineupTalentIds]);
  const lineupTalentOptions = useMemo(
    () =>
      savedLineupTalentIds
        .map((talentId) => talentMap.get(talentId))
        .filter((talent): talent is Talent => Boolean(talent)),
    [savedLineupTalentIds, talentMap]
  );
  const defaultArchiveTalentId = useMemo(() => {
    const usedTalentIds = new Set(archiveDraft.entries.map((entry) => entry.talentId));
    return savedLineupTalentIds.find((talentId) => !usedTalentIds.has(talentId)) ?? savedLineupTalentIds[0] ?? "";
  }, [archiveDraft.entries, savedLineupTalentIds]);
  const defaultLineupTalentId = useMemo(() => {
    if (isMultiDayEvent && lineupDateOptions.length > 0) {
      return (
        sortedTalents.find((talent) => {
          const takenDates = editableLineupDateKeysByTalentId.get(talent.id) ?? new Set<string>();
          return lineupDateOptions.some((date) => !takenDates.has(date));
        })?.id ??
        sortedTalents[0]?.id ??
        ""
      );
    }

    const usedTalentIds = new Set(editableLineups.map((lineup) => lineup.talentId));
    return sortedTalents.find((talent) => !usedTalentIds.has(talent.id))?.id ?? sortedTalents[0]?.id ?? "";
  }, [editableLineupDateKeysByTalentId, editableLineups, isMultiDayEvent, lineupDateOptions, sortedTalents]);
  const defaultLineupDate = lineupDateOptions[0] ?? "";
  const defaultArchiveEntryDate = archiveDateOptions[0] ?? "";
  const areAllFilteredEventsSelected =
    filteredEvents.length > 0 && filteredEvents.every((event) => selectedEventIds.includes(event.id));
  const isEventDirty =
    JSON.stringify(normalizeEventDraft(eventDraft)) !== JSON.stringify(normalizeEventDraft(persistedEventDraft)) ||
    JSON.stringify(normalizeLineupDrafts(editableLineups)) !== JSON.stringify(normalizeLineupDrafts(persistedLineups));
  const isArchiveDirty =
    JSON.stringify(normalizeArchiveDraft(archiveDraft)) !== JSON.stringify(normalizeArchiveDraft(persistedArchive));
  const hasUnsavedChanges = isEventDirty || isArchiveDirty;
  const canEditArchive = Boolean(eventDraft.id);

  useEffect(() => {
    setGuard(hasUnsavedChanges ? { isDirty: true, message: UNSAVED_MESSAGE } : null);
    return () => setGuard(null);
  }, [hasUnsavedChanges, setGuard]);

  function enqueueCleanupAssetId(assetId?: string | null) {
    if (!assetId) return;
    setCleanupCandidateAssetIds((current) => [...new Set([...current, assetId])]);
  }

  function resetDrafts(
    nextEventId: string | null,
    nextEvents = liveEvents,
    nextLineups = liveLineups,
    nextArchives = liveArchives
  ) {
    const nextSelectedEvent = nextEvents.find((event) => event.id === nextEventId) ?? null;
    setSelectedEventId(nextEventId);
    setEventDraft(createEventDraft(nextSelectedEvent));
    setEditableLineups(createLineupDrafts(nextSelectedEvent, nextLineups));
    setArchiveDraft(createArchiveDraft(nextEventId, nextArchives));
    setCleanupCandidateAssetIds([]);
    updateBrowserSelection(nextEventId);
  }

  function canLeaveCurrentWork() {
    return !hasUnsavedChanges || window.confirm(UNSAVED_MESSAGE);
  }

  function closeEventEditor() {
    if (hasUnsavedChanges && !window.confirm(UNSAVED_MESSAGE)) return;
    const currentEvent = liveEvents.find((event) => event.id === selectedEventId) ?? null;
    setEventDraft(createEventDraft(currentEvent));
    setEditableLineups(createLineupDrafts(currentEvent, liveLineups));
    setArchiveDraft(createArchiveDraft(selectedEventId, liveArchives));
    setCleanupCandidateAssetIds([]);
    setIsEventEditorOpen(false);
  }

  function selectEvent(eventId: string | null) {
    if (eventId === selectedEventId) {
      setIsEventEditorOpen(true);
      return;
    }
    if (!canLeaveCurrentWork()) return;
    resetDrafts(eventId);
    setMessage(null);
    setIsEventEditorOpen(true);
  }

  function handleNewEvent() {
    if (!canLeaveCurrentWork()) return;
    setSelectedEventId(null);
    setEventDraft(createEmptyEventDraft());
    setEditableLineups([]);
    setArchiveDraft(createArchiveDraft(null, liveArchives));
    setCleanupCandidateAssetIds([]);
    updateBrowserSelection(null);
    setMessage(null);
    setIsEventEditorOpen(true);
  }

  function isLineupDateTaken(talentId: string, date: string) {
    if (!talentId) return false;
    const takenDates = editableLineupDateKeysByTalentId.get(talentId);
    if (isMultiDayEvent) {
      return Boolean(takenDates?.has(date));
    }
    return Boolean(takenDates && takenDates.size > 0);
  }

  function createLineupDialogDraft(talentId = defaultLineupTalentId): AddLineupDraft {
    const dateRows = lineupDateOptions.map((date) => ({
      date,
      selected: false,
      note: ""
    }));
    const firstAvailableDate = dateRows.find((row) => !isLineupDateTaken(talentId, row.date))?.date;

    return {
      talentId,
      note: "",
      dates: dateRows.map((row) => ({
        ...row,
        selected: row.date === firstAvailableDate
      }))
    };
  }

  function openLineupDialog() {
    if (sortedTalents.length === 0) {
      setMessage("请先在达人库里添加达人。");
      return;
    }
    setLineupDialogDraft(createLineupDialogDraft());
    setIsLineupDialogOpen(true);
    setMessage(null);
  }

  function updateLineupDialogTalent(talentId: string) {
    setLineupDialogDraft(createLineupDialogDraft(talentId));
  }

  function updateLineupDialogDate(date: string, patch: Partial<AddLineupDateDraft>) {
    setLineupDialogDraft((current) =>
      current
        ? {
            ...current,
            dates: current.dates.map((item) => (item.date === date ? { ...item, ...patch } : item))
          }
        : current
    );
  }

  function submitLineupDialog() {
    if (!lineupDialogDraft?.talentId) {
      setMessage("请先选择达人。");
      return;
    }

    const nextLineups = isMultiDayEvent
      ? lineupDialogDraft.dates
          .filter((dateDraft) => dateDraft.selected && !isLineupDateTaken(lineupDialogDraft.talentId, dateDraft.date))
          .map((dateDraft) => ({
            ...createEditableLineup(lineupDialogDraft.talentId, dateDraft.date),
            note: dateDraft.note
          }))
      : [
          {
            ...createEditableLineup(lineupDialogDraft.talentId, defaultLineupDate),
            note: lineupDialogDraft.note
          }
        ];

    if (!isMultiDayEvent && isLineupDateTaken(lineupDialogDraft.talentId, defaultLineupDate)) {
      setMessage("该达人已经在当前活动阵容里。");
      return;
    }

    if (nextLineups.length === 0) {
      setMessage("请至少选择一个该达人尚未录入的活动日期。");
      return;
    }

    setEditableLineups((current) => [...current, ...nextLineups]);
    setIsLineupDialogOpen(false);
    setLineupDialogDraft(null);
    setMessage(`已添加 ${nextLineups.length} 条达人阵容。`);
  }

  function updateLineup(index: number, patch: Partial<EditableLineup>) {
    setEditableLineups((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item))
    );
  }

  function updateArchiveEntry(index: number, patch: Partial<EditorArchive["entries"][number]>) {
    setArchiveDraft((current) => ({
      ...current,
      eventId: eventDraft.id ?? current.eventId,
      entries: current.entries.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    }));
  }

  function getArchiveDateOptionsForTalent(talentId: string) {
    return [...(savedLineupDateKeysByTalentId.get(talentId) ?? new Set<string>())].filter(Boolean);
  }

  function getDefaultArchiveDateForTalent(talentId: string) {
    return isMultiDayEvent ? (getArchiveDateOptionsForTalent(talentId)[0] ?? "") : defaultArchiveEntryDate;
  }

  function openArchiveDialog() {
    if (!eventDraft.id) {
      setMessage("请先保存活动基础信息，再录入我的现场档案。");
      return;
    }

    if (isEventDirty) {
      setMessage("请先保存活动信息，再添加现场档案。");
      return;
    }

    if (lineupTalentOptions.length === 0) {
      setMessage("请先在达人阵容中添加并保存至少一位达人。");
      return;
    }

    setArchiveDialogDrafts([
      createArchiveEntryDraft(defaultArchiveTalentId, getDefaultArchiveDateForTalent(defaultArchiveTalentId))
    ]);
    setIsArchiveDialogOpen(true);
    setMessage(null);
  }

  function updateArchiveDialogEntry(index: number, patch: Partial<AddArchiveEntryDraft>) {
    setArchiveDialogDrafts((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry))
    );
  }

  function updateArchiveDialogTalent(index: number, talentId: string) {
    updateArchiveDialogEntry(index, {
      talentId,
      entryDate: getDefaultArchiveDateForTalent(talentId) || null
    });
  }

  function addArchiveDialogEntry() {
    setArchiveDialogDrafts((current) => [
      ...current,
      createArchiveEntryDraft(defaultArchiveTalentId, getDefaultArchiveDateForTalent(defaultArchiveTalentId))
    ]);
  }

  function removeArchiveDialogEntry(index: number) {
    setArchiveDialogDrafts((current) =>
      current.length > 1 ? current.filter((_, entryIndex) => entryIndex !== index) : current
    );
  }

  function submitArchiveDialog() {
    const nextEntries = archiveDialogDrafts
      .filter((entry) => entry.talentId)
      .map((entry) =>
        createArchiveEntry(entry.talentId, entry.entryDate ?? "", "", entry.cosplayTitle)
      );

    if (nextEntries.length === 0) {
      setMessage("请至少选择一位阵容达人。");
      return;
    }

    setArchiveDraft((current) => ({
      ...current,
      eventId: eventDraft.id ?? current.eventId,
      entries: [...current.entries, ...nextEntries]
    }));
    setIsArchiveDialogOpen(false);
    setArchiveDialogDrafts([]);
    setMessage(`已添加 ${nextEntries.length} 条现场记录。`);
  }

  async function handleSaveEvent() {
    const validationError = validateEventDraft(eventDraft, editableLineups);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setMessage(null);

    const payload = {
      id: eventDraft.id,
      name: eventDraft.name,
      startsAt: eventDraft.startsAt || null,
      endsAt: eventDraft.endsAt || null,
      city: eventDraft.city,
      venue: eventDraft.venue,
      note: eventDraft.note,
      lineups: editableLineups
    };

    startTransition(async () => {
      const response = await fetch(eventDraft.id ? `/api/admin/events/${eventDraft.id}` : "/api/admin/events", {
        method: eventDraft.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = (await response.json().catch(() => null)) as { error?: string; event?: Event } | null;
      if (!response.ok || !data?.event) {
        setMessage(data?.error ?? "保存活动失败。");
        return;
      }

      const nextEventId = data.event.id;
      const nextEvents = sortEventsForManager(
        liveEvents.some((event) => event.id === nextEventId)
          ? liveEvents.map((event) => (event.id === nextEventId ? data.event! : event))
          : [...liveEvents, data.event]
      );
      const nextLineups = [
        ...liveLineups.filter((lineup) => lineup.eventId !== nextEventId),
        ...editableLineups
          .filter((lineup) => lineup.talentId)
          .map((lineup) => ({
            ...lineup,
            eventId: nextEventId,
            lineupDate: toDateOnlyIso(lineup.lineupDate) ?? null,
            status: "confirmed" as const,
            source: ""
          }))
      ];

      setLiveEvents(nextEvents);
      setLiveLineups(nextLineups);
      resetDrafts(nextEventId, nextEvents, nextLineups, liveArchives);
      setIsEventEditorOpen(false);
      setMessage(`活动「${data.event.name}」已保存。`);
    });
  }

  async function handleSaveArchive() {
    if (!eventDraft.id) {
      setMessage("请先保存活动基础信息，再录入我的现场档案。");
      return;
    }
    const eventId = eventDraft.id;

    const validationError = validateArchiveDraft(
      archiveDraft,
      isMultiDayEvent,
      validArchiveDateKeys,
      savedLineupTalentIdSet,
      savedLineupDateKeysByTalentId
    );
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/archives", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: archiveDraft.id || undefined,
          eventId,
          note: archiveDraft.note,
          cleanupCandidateAssetIds,
          entries: archiveDraft.entries
        })
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; archive?: EditorArchive }
        | null;
      if (!response.ok || !data?.archive) {
        setMessage(data?.error ?? "保存档案失败。");
        return;
      }

      const nextArchives = liveArchives.some((archive) => archive.eventId === eventId)
        ? liveArchives.map((archive) => (archive.eventId === eventId ? data.archive! : archive))
        : [...liveArchives, data.archive];

      setLiveArchives(nextArchives);
      resetDrafts(eventId, liveEvents, liveLineups, nextArchives);
      setMessage(`我的档案已保存到「${selectedEvent ? getEventDisplayName(selectedEvent) : eventDraft.name}」。`);
    });
  }

  async function handleDeleteEvent() {
    if (!selectedEvent?.id) return;
    if (!window.confirm(`确定删除 ${getEventDisplayName(selectedEvent)} 吗？这会同时删除该活动的阵容和关联档案。`)) return;

    setMessage(null);

    startTransition(async () => {
      const response = await fetch(`/api/admin/events/${selectedEvent.id}`, {
        method: "DELETE"
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setMessage(data?.error ?? "删除失败。");
        return;
      }

      const nextEvents = liveEvents.filter((event) => event.id !== selectedEvent.id);
      const nextLineups = liveLineups.filter((lineup) => lineup.eventId !== selectedEvent.id);
      const nextArchives = liveArchives.filter((archive) => archive.eventId !== selectedEvent.id);

      setLiveEvents(nextEvents);
      setLiveLineups(nextLineups);
      setLiveArchives(nextArchives);
      setSelectedEventIds((current) => current.filter((id) => id !== selectedEvent.id));
      resetDrafts(nextEvents[0]?.id ?? null, nextEvents, nextLineups, nextArchives);
      setIsEventEditorOpen(false);
      setMessage(`活动「${getEventDisplayName(selectedEvent)}」已删除。`);
    });
  }

  async function handleBulkEventAction() {
    if (selectedEventIds.length === 0) {
      setMessage("请先勾选至少一个活动。");
      return;
    }

    if (hasUnsavedChanges) {
      setMessage("请先保存或放弃当前修改，再执行批量操作。");
      return;
    }

    if (!window.confirm(`确定批量删除 ${selectedEventIds.length} 个活动吗？这会同时删除这些活动的阵容和关联档案。`)) {
      return;
    }

    setMessage(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/events/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "delete",
          ids: selectedEventIds
        })
      });

      const data = (await response.json().catch(() => null)) as
        | { error?: string; result?: BulkActionResult }
        | null;
      if (!response.ok || !data?.result) {
        setMessage(data?.error ?? "批量操作失败。");
        return;
      }

      const removedIds = new Set(data.result.succeededIds);
      const nextEvents = liveEvents.filter((event) => !removedIds.has(event.id));
      const nextLineups = liveLineups.filter((lineup) => !removedIds.has(lineup.eventId));
      const nextArchives = liveArchives.filter((archive) => !removedIds.has(archive.eventId));
      const nextSelectedEventId = removedIds.has(selectedEventId ?? "") ? (nextEvents[0]?.id ?? null) : selectedEventId;

      setLiveEvents(nextEvents);
      setLiveLineups(nextLineups);
      setLiveArchives(nextArchives);
      setSelectedEventIds((current) => current.filter((id) => !removedIds.has(id)));
      resetDrafts(nextSelectedEventId, nextEvents, nextLineups, nextArchives);
      if (removedIds.has(selectedEventId ?? "")) {
        setIsEventEditorOpen(false);
      }
      setMessage(buildBulkSummary(data.result, "已批量删除活动"));
    });
  }

  function toggleSelectedEvent(id: string, checked: boolean) {
    setSelectedEventIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)
    );
  }

  function toggleAllFilteredEvents() {
    const filteredIds = filteredEvents.map((event) => event.id);
    setSelectedEventIds((current) =>
      areAllFilteredEventsSelected
        ? current.filter((id) => !filteredIds.includes(id))
        : [...new Set([...current, ...filteredIds])]
    );
  }

  function importLineupEntries() {
    if (!eventDraft.id) {
      setMessage("请先保存活动信息，再从阵容导入档案条目。");
      return;
    }

    if (isEventDirty) {
      setMessage("请先保存活动信息，再从当前阵容导入档案条目。");
      return;
    }

    const existingTalentIds = new Set(archiveDraft.entries.map((entry) => entry.talentId));
    const missingTalentIds = savedLineupTalentIds.filter((talentId) => !existingTalentIds.has(talentId));

    if (missingTalentIds.length === 0) {
      setMessage("当前阵容达人都已经在档案里了。");
      return;
    }

    setArchiveDraft((current) => ({
      ...current,
      eventId: eventDraft.id ?? current.eventId,
      entries: [
        ...current.entries,
        ...missingTalentIds.map((talentId) => {
          return createArchiveEntry(talentId, getDefaultArchiveDateForTalent(talentId));
        })
      ]
    }));
    setMessage(`已从当前阵容导入 ${missingTalentIds.length} 条档案记录。`);
  }

  function addArchiveEntry() {
    openArchiveDialog();
  }

  function duplicateArchiveEntry(index: number) {
    const source = archiveDraft.entries[index];
    if (!source) return;

    const duplicate = {
      ...source,
      id: crypto.randomUUID()
    };

    setArchiveDraft((current) => ({
      ...current,
      eventId: eventDraft.id ?? current.eventId,
      entries: [...current.entries.slice(0, index + 1), duplicate, ...current.entries.slice(index + 1)]
    }));
    setMessage("已复制当前档案记录，可继续微调。");
  }

  function removeArchiveEntry(index: number) {
    const source = archiveDraft.entries[index];
    if (!source) return;

    enqueueCleanupAssetId(source.sceneAssetId);
    enqueueCleanupAssetId(source.sharedPhotoAssetId ?? null);
    setArchiveDraft((current) => ({
      ...current,
      entries: current.entries.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  function handleSceneUploaded(index: number, asset: Asset) {
    const currentAssetId = archiveDraft.entries[index]?.sceneAssetId ?? null;
    setLiveAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
    enqueueCleanupAssetId(currentAssetId);
    updateArchiveEntry(index, { sceneAssetId: asset.id });
    setMessage(`已上传并替换现场图「${asset.title}」。`);
  }

  function handleClearScene(index: number) {
    enqueueCleanupAssetId(archiveDraft.entries[index]?.sceneAssetId ?? null);
    updateArchiveEntry(index, { sceneAssetId: "" });
    setMessage("已清空当前现场图，保存后会同步生效。");
  }

  function handleSharedUploaded(index: number, asset: Asset) {
    const currentSharedAssetId = archiveDraft.entries[index]?.sharedPhotoAssetId ?? null;
    setLiveAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
    enqueueCleanupAssetId(currentSharedAssetId);
    updateArchiveEntry(index, {
      hasSharedPhoto: true,
      sharedPhotoAssetId: asset.id
    });
    setMessage(`已上传并替换合照「${asset.title}」。`);
  }

  function handleSharedToggle(index: number, checked: boolean) {
    if (!checked) {
      enqueueCleanupAssetId(archiveDraft.entries[index]?.sharedPhotoAssetId ?? null);
    }

    updateArchiveEntry(index, {
      hasSharedPhoto: checked,
      sharedPhotoAssetId: checked ? archiveDraft.entries[index]?.sharedPhotoAssetId ?? null : null
    });
  }

  function handleClearShared(index: number) {
    enqueueCleanupAssetId(archiveDraft.entries[index]?.sharedPhotoAssetId ?? null);
    updateArchiveEntry(index, {
      hasSharedPhoto: false,
      sharedPhotoAssetId: null
    });
    setMessage("已清空当前合照，保存后会同步生效。");
  }

  return (
    <>
    <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
      <aside className="surface rounded-[1.8rem] p-5">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索活动"
          className="w-full rounded-full border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
        />
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/55">
          <button
            type="button"
            data-testid="event-select-all"
            onClick={toggleAllFilteredEvents}
            className="rounded-full border border-white/12 px-3 py-2 transition hover:border-white/25 hover:text-white"
          >
            {areAllFilteredEventsSelected ? "取消全选当前结果" : "全选当前结果"}
          </button>
          <span className="rounded-full border border-white/8 px-3 py-2">
            已选 {selectedEventIds.length} / {liveEvents.length}
          </span>
          {hasUnsavedChanges ? (
            <span className="rounded-full border border-[#c48b26]/45 px-3 py-2 text-[#5f3d00]">
              当前编辑未保存
            </span>
          ) : null}
        </div>
        <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-black/15 p-4">
          <p className="text-xs uppercase tracking-[0.25em] text-white/45">Bulk Actions</p>
          <div className="mt-3 grid gap-3">
            <button
              type="button"
              data-testid="bulk-delete-events"
              onClick={handleBulkEventAction}
              disabled={pending || selectedEventIds.length === 0}
              className="rounded-full border border-[#b13b45]/45 px-4 py-2 text-sm text-[#5f0f18] disabled:opacity-50"
            >
              批量删除活动
            </button>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          <button
            type="button"
            data-testid="new-event-button"
            onClick={handleNewEvent}
            className="w-full rounded-[1.2rem] border border-dashed border-white/15 px-4 py-4 text-left text-sm text-white/70 transition hover:border-white/30 hover:text-white"
          >
            + 新建活动档案
          </button>
          {filteredEvents.map((event) => {
            const isChecked = selectedEventIds.includes(event.id);
            const eventDateLabel = event.startsAt ? formatDateKey(event.startsAt.slice(0, 10)) : null;

            return (
              <div
                key={event.id}
                className={`flex items-start gap-3 rounded-[1.2rem] px-3 py-3 transition ${
                  selectedEventId === event.id ? "bg-white/10" : "bg-black/10 hover:bg-white/6"
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`选择 ${getEventDisplayName(event)}`}
                  checked={isChecked}
                  onChange={(nextEvent) => toggleSelectedEvent(event.id, nextEvent.target.checked)}
                  className="mt-1 size-4 rounded border-white/20 bg-black/30"
                />
                <button type="button" onClick={() => selectEvent(event.id)} className="flex-1 text-left">
                  <p className="text-lg text-white">{getEventDisplayName(event)}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-white/40">
                    {[event.city || "城市待定", eventDateLabel].filter(Boolean).join(" · ")}
                  </p>
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <section className="space-y-6">
        {message ? <StatusNotice variant="warning">{message}</StatusNotice> : null}
        {isEventEditorOpen ? (
          <AdminDialog
            title={selectedEvent ? `编辑 ${getEventDisplayName(selectedEvent)}` : "新建活动档案"}
            description="活动基础信息和公开阵容在这里编辑；保存成功后弹窗会自动关闭。"
            onClose={closeEventEditor}
            size="xl"
            footer={<span className="text-xs leading-6 ui-muted">活动信息与现场档案可分别保存。</span>}
          >
            <section className="space-y-5">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">Archive Workspace</p>
                {isEventDirty ? (
                  <span className="rounded-full border border-[#c48b26]/45 px-3 py-1 text-[11px] text-[#5f3d00]">
                    活动信息未保存
                  </span>
                ) : null}
              </div>
              <h2 className="mt-3 text-3xl text-white">
                {selectedEvent ? `编辑 ${getEventDisplayName(selectedEvent)}` : "新建活动档案"}
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/60">
                活动名称必填，其他信息都可以留空；现场档案也在这个弹窗里维护。
              </p>
            </div>
            {selectedEvent ? (
              <button
                type="button"
                onClick={handleDeleteEvent}
                className="rounded-full border border-[#b13b45]/55 px-4 py-2 text-sm text-[#5f0f18]"
              >
                删除活动
              </button>
            ) : null}
          </div>

          <div className="space-y-5">
            <div className="grid gap-4">
              <input
                name="name"
                value={eventDraft.name}
                onChange={(event) => setEventDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="活动名称"
                className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                name="startsAt"
                type="date"
                value={eventDraft.startsAt}
                onChange={(event) => setEventDraft((current) => ({ ...current, startsAt: event.target.value }))}
                className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
              />
              <input
                name="endsAt"
                type="date"
                value={eventDraft.endsAt}
                onChange={(event) => setEventDraft((current) => ({ ...current, endsAt: event.target.value }))}
                className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                name="city"
                value={eventDraft.city}
                onChange={(event) => setEventDraft((current) => ({ ...current, city: event.target.value }))}
                placeholder="城市"
                className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
              />
              <input
                name="venue"
                value={eventDraft.venue}
                onChange={(event) => setEventDraft((current) => ({ ...current, venue: event.target.value }))}
                placeholder="场馆"
                className="rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
              />
            </div>
            <textarea
              name="note"
              value={eventDraft.note}
              onChange={(event) => setEventDraft((current) => ({ ...current, note: event.target.value }))}
              rows={4}
              data-testid="event-note"
              placeholder="活动说明或备注"
              className="w-full rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
            />
            <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-black/15 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg text-white">达人阵容</h3>
                  <p className="mt-2 text-xs leading-6 text-white/45">
                    {isMultiDayEvent
                      ? "当前活动跨多天，阵容会按日期分组；每条达人阵容都需要选择所属日期。"
                      : "单日活动保持轻量录入体验，阵容不额外按日期拆分。"}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="add-lineup"
                  onClick={openLineupDialog}
                  className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/70"
                >
                  + 添加达人
                </button>
              </div>

              {editableLineups.length === 0 ? (
                <div className="rounded-[1.2rem] border border-dashed border-white/10 px-4 py-5 text-sm text-white/55">
                  还没有阵容达人，可以先添加一位。
                </div>
              ) : null}

              <div className="space-y-4">
                {editableLineupGroups.map((group) => (
                  <div key={group.key} className="space-y-3">
                    {group.label ? (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-accent)]">{group.label}</p>
                        <span className="text-xs text-white/45">{group.items.length} 位达人</span>
                      </div>
                    ) : null}

                    {group.items.length === 0 ? (
                      <div className="rounded-[1.2rem] border border-dashed border-white/10 px-4 py-5 text-sm text-white/52">
                        本日还没有阵容达人。
                      </div>
                    ) : null}

                    {group.items.map(({ lineup, index }) => {
                      const gridClass = isMultiDayEvent
                        ? "xl:grid-cols-[1fr_0.9fr_auto]"
                        : "md:grid-cols-[1fr_auto]";

                      return (
                        <div
                          key={lineup.id}
                          data-testid="lineup-item"
                          className={`grid gap-3 rounded-[1.2rem] border border-white/8 p-4 ${gridClass}`}
                        >
                          <select
                            data-testid={`lineup-talent-${index}`}
                            value={lineup.talentId}
                            onChange={(event) => updateLineup(index, { talentId: event.target.value })}
                            className="rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                          >
                            <option value="">暂不选择达人</option>
                            {sortedTalents.map((talent) => (
                              <option key={talent.id} value={talent.id}>
                                {talent.nickname}
                              </option>
                            ))}
                          </select>
                          {isMultiDayEvent ? (
                            <select
                              data-testid={`lineup-date-${index}`}
                              value={lineup.lineupDate}
                              onChange={(event) => updateLineup(index, { lineupDate: event.target.value })}
                              className="rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                            >
                              <option value="">选择日期</option>
                              {lineupDateOptions.map((date) => (
                                <option key={date} value={date}>
                                  {formatDateKey(date)}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              setEditableLineups((current) => current.filter((_, itemIndex) => itemIndex !== index))
                            }
                            className="rounded-[1rem] border border-[#b13b45]/45 px-3 py-2 text-sm text-[#5f0f18]"
                          >
                            删除
                          </button>
                          <textarea
                            data-testid={`lineup-note-${index}`}
                            value={lineup.note}
                            onChange={(event) => updateLineup(index, { note: event.target.value })}
                            rows={2}
                            placeholder="补充备注"
                            className={`rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none ${
                              isMultiDayEvent ? "xl:col-span-3" : "md:col-span-2"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs leading-6 text-white/45">
                保存活动信息后不会刷新整页，当前活动和档案草稿都会继续保留。
              </p>
              <button
                type="button"
                onClick={handleSaveEvent}
                disabled={pending}
                data-testid="save-event"
                className="rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm uppercase tracking-[0.25em] text-black disabled:opacity-60"
              >
                {pending ? "保存中..." : "保存活动信息"}
              </button>
            </div>
          </div>
            </section>
        {!canEditArchive ? (
          <section className="surface rounded-[1.8rem] px-6 py-10 text-center text-white/68">
            先保存活动基础信息，再开始录入我的现场档案。
          </section>
        ) : (
          <>
            <section className="surface rounded-[1.8rem] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">My Archive</p>
                    {isArchiveDirty ? (
                      <span className="rounded-full border border-[#c48b26]/45 px-3 py-1 text-[11px] text-[#5f3d00]">
                        档案未保存
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-3 text-2xl text-white">我的现场档案</h3>
                  <p className="mt-3 text-sm leading-7 text-white/60">
                    现场档案现在也支持按日期分组；图片位只保留当前图、上传新图和清空当前图。
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    data-testid="import-lineup-entries"
                    onClick={importLineupEntries}
                    className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/70"
                  >
                    从当前阵容导入
                  </button>
                  <button
                    type="button"
                    data-testid="add-archive-entry"
                    onClick={addArchiveEntry}
                    className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/70"
                  >
                    + 添加现场记录
                  </button>
                </div>
              </div>
              <textarea
                value={archiveDraft.note}
                data-testid="archive-note"
                onChange={(event) =>
                  setArchiveDraft((current) => ({
                    ...current,
                    eventId: eventDraft.id ?? current.eventId,
                    note: event.target.value
                  }))
                }
                rows={3}
                placeholder="活动档案备注"
                className="mt-4 w-full rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
              />
            </section>

            {archiveDraft.entries.length === 0 ? (
              <section className="surface rounded-[1.8rem] px-6 py-10 text-center text-white/60">
                还没有现场记录。可以先从当前阵容导入，或者手动新增一条。
              </section>
            ) : (
              <div className="space-y-5">
                {editableArchiveGroups.map((group) => (
                  <div key={group.key} className="space-y-3">
                    {group.label ? (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-accent)]">{group.label}</p>
                        <span className="text-xs text-white/45">{group.items.length} 条记录</span>
                      </div>
                    ) : null}

                    {group.items.map(({ entry, index }) => {
                      const entryDateOptions = getArchiveDateOptionsForTalent(entry.talentId);

                      return (
                      <section key={entry.id} data-testid="archive-entry" className="surface rounded-[1.8rem] p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm uppercase tracking-[0.2em] text-white/45">记录 {index + 1}</p>
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              data-testid={`archive-copy-${index}`}
                              onClick={() => duplicateArchiveEntry(index)}
                              className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/70"
                            >
                              复制此条
                            </button>
                            <button
                              type="button"
                              onClick={() => removeArchiveEntry(index)}
                              className="rounded-full border border-[#b13b45]/45 px-4 py-2 text-sm text-[#5f0f18]"
                            >
                              删除
                            </button>
                          </div>
                        </div>

                        <div
                          className={`mt-4 grid gap-4 ${
                            isMultiDayEvent ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3"
                          }`}
                        >
                          <select
                            data-testid={`archive-talent-${index}`}
                            value={entry.talentId}
                            onChange={(event) => {
                              const talentId = event.target.value;
                              updateArchiveEntry(index, {
                                talentId,
                                entryDate: getDefaultArchiveDateForTalent(talentId) || null
                              });
                            }}
                            className="rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                          >
                            <option value="">暂不选择达人</option>
                            {lineupTalentOptions.map((talent) => (
                              <option key={talent.id} value={talent.id}>
                                {talent.nickname}
                              </option>
                            ))}
                          </select>
                          {isMultiDayEvent ? (
                            <select
                              data-testid={`archive-date-${index}`}
                              value={entry.entryDate ?? ""}
                              onChange={(event) => updateArchiveEntry(index, { entryDate: event.target.value || null })}
                              className="rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                            >
                              <option value="">选择日期</option>
                              {entryDateOptions.map((date) => (
                                <option key={date} value={date}>
                                  {formatDateKey(date)}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <input
                            data-testid={`archive-cosplay-${index}`}
                            value={entry.cosplayTitle}
                            onChange={(event) => updateArchiveEntry(index, { cosplayTitle: event.target.value })}
                            placeholder="角色 / 作品 / 游戏"
                            className="rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                          />
                        </div>

                        <div className="mt-4">
                          <InlineAssetUpload
                            kind="event_scene"
                            dataTestId={`archive-scene-upload-${index}`}
                            currentAsset={entry.sceneAssetId ? (assetMap.get(entry.sceneAssetId) ?? null) : null}
                            onClear={() => handleClearScene(index)}
                            onUploaded={(asset) => handleSceneUploaded(index, asset)}
                            helperText="当前现场图可直接替换或清空，不再从素材池里手动选择。"
                          />
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-1">
                          <label className="flex items-center gap-3 rounded-[1rem] border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/70">
                            <input
                              data-testid={`archive-shared-flag-${index}`}
                              type="checkbox"
                              checked={entry.hasSharedPhoto}
                              onChange={(event) => handleSharedToggle(index, event.target.checked)}
                            />
                            是否有集邮
                          </label>
                        </div>

                        {entry.hasSharedPhoto ? (
                          <div className="mt-4">
                            <InlineAssetUpload
                              kind="shared_photo"
                              dataTestId={`archive-shared-upload-${index}`}
                              currentAsset={entry.sharedPhotoAssetId ? (assetMap.get(entry.sharedPhotoAssetId) ?? null) : null}
                              onClear={() => handleClearShared(index)}
                              onUploaded={(asset) => handleSharedUploaded(index, asset)}
                              helperText="当前合照可直接替换或清空，不再从素材池里手动选择。"
                            />
                          </div>
                        ) : null}
                      </section>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs leading-6 text-white/45">
                保存我的档案只会更新当前编辑人的现场档案，不会覆盖共享活动信息。
              </p>
              <button
                type="button"
                onClick={handleSaveArchive}
                data-testid="save-archive"
                disabled={pending}
                className="rounded-full bg-[var(--color-accent)] px-5 py-3 text-sm uppercase tracking-[0.25em] text-black disabled:opacity-60"
              >
                {pending ? "保存中..." : "保存我的档案"}
              </button>
            </div>
          </>
        )}
          </AdminDialog>
        ) : (
          <section className="surface rounded-[1.8rem] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">Archive Workspace</p>
                  {isEventDirty ? (
                    <span className="rounded-full border border-[#c48b26]/45 px-3 py-1 text-[11px] text-[#5f3d00]">
                      活动信息未保存
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-3xl text-white">
                  {selectedEvent ? getEventDisplayName(selectedEvent) : "新建活动档案"}
                </h2>
                <p className="mt-3 text-sm leading-7 text-white/60">
                  新增和编辑活动、阵容与现场档案会在同一个弹窗中完成。
                </p>
              </div>
              <button
                type="button"
                onClick={() => (selectedEventId ? selectEvent(selectedEventId) : handleNewEvent())}
                className="ui-button-secondary px-5 py-2.5 text-sm"
              >
                {selectedEvent ? "编辑活动信息" : "新建活动档案"}
              </button>
            </div>
          </section>
        )}
      </section>
    </div>
    {isLineupDialogOpen && lineupDialogDraft ? (
      <AdminDialog
        title="添加达人"
        description={isMultiDayEvent ? "选择达人后勾选到场日期；每个日期的备注会分别保存。" : "选择达人并填写本次活动备注。"}
        onClose={() => {
          setIsLineupDialogOpen(false);
          setLineupDialogDraft(null);
        }}
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setIsLineupDialogOpen(false);
                setLineupDialogDraft(null);
              }}
              className="ui-button-secondary px-5 py-2.5 text-sm"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="lineup-dialog-submit"
              onClick={submitLineupDialog}
              className="ui-button-primary px-5 py-2.5 text-sm uppercase tracking-[0.18em]"
            >
              添加达人
            </button>
          </>
        }
      >
        <div data-testid="lineup-dialog" className="space-y-5">
          <div className="grid gap-4">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] ui-muted">达人</span>
              <select
                data-testid="lineup-dialog-talent"
                value={lineupDialogDraft.talentId}
                onChange={(event) => updateLineupDialogTalent(event.target.value)}
                className="ui-select text-sm"
              >
                {sortedTalents.map((talent) => (
                  <option key={talent.id} value={talent.id}>
                    {talent.nickname}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isMultiDayEvent ? (
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] ui-muted">到场日期与备注</p>
              {lineupDialogDraft.dates.map((dateDraft) => {
                const dateTaken = isLineupDateTaken(lineupDialogDraft.talentId, dateDraft.date);

                return (
                  <div
                    key={dateDraft.date}
                    className={`grid gap-3 rounded-[1rem] border border-[var(--line-soft)] bg-[rgba(248,251,255,0.78)] p-3 md:grid-cols-[auto_1fr] ${
                      dateTaken ? "opacity-45" : ""
                    }`}
                  >
                    <label className="flex items-center gap-3 text-sm ui-subtle">
                      <input
                        type="checkbox"
                        data-testid={`lineup-dialog-date-${dateDraft.date}`}
                        checked={dateDraft.selected && !dateTaken}
                        disabled={dateTaken}
                        onChange={(event) =>
                          updateLineupDialogDate(dateDraft.date, { selected: event.target.checked })
                        }
                      />
                      {formatDateKey(dateDraft.date)}
                      {dateTaken ? <span className="text-xs ui-muted">已录入</span> : null}
                    </label>
                    <input
                      data-testid={`lineup-dialog-note-${dateDraft.date}`}
                      value={dateDraft.note}
                      disabled={dateTaken}
                      onChange={(event) => updateLineupDialogDate(dateDraft.date, { note: event.target.value })}
                      placeholder="当日备注"
                      className="ui-input text-sm disabled:opacity-50"
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] ui-muted">备注</span>
              <textarea
                data-testid="lineup-dialog-note"
                value={lineupDialogDraft.note}
                onChange={(event) =>
                  setLineupDialogDraft((current) => (current ? { ...current, note: event.target.value } : current))
                }
                rows={3}
                placeholder="补充备注"
                className="ui-textarea text-sm"
              />
            </label>
          )}
        </div>
      </AdminDialog>
    ) : null}

    {isArchiveDialogOpen ? (
      <AdminDialog
        title="添加现场记录"
        description="一次可以添加多条记录；达人只能从当前活动已保存阵容中选择。"
        onClose={() => {
          setIsArchiveDialogOpen(false);
          setArchiveDialogDrafts([]);
        }}
        footer={
          <>
            <button
              type="button"
              onClick={addArchiveDialogEntry}
              data-testid="archive-dialog-add-row"
              className="ui-button-secondary mr-auto px-5 py-2.5 text-sm"
            >
              再加一条
            </button>
            <button
              type="button"
              onClick={() => {
                setIsArchiveDialogOpen(false);
                setArchiveDialogDrafts([]);
              }}
              className="ui-button-secondary px-5 py-2.5 text-sm"
            >
              取消
            </button>
            <button
              type="button"
              data-testid="archive-dialog-submit"
              onClick={submitArchiveDialog}
              className="ui-button-primary px-5 py-2.5 text-sm uppercase tracking-[0.18em]"
            >
              添加记录
            </button>
          </>
        }
      >
        <div data-testid="archive-dialog" className="space-y-4">
          {archiveDialogDrafts.map((entry, index) => {
            const entryDateOptions = getArchiveDateOptionsForTalent(entry.talentId);

            return (
              <section key={entry.id} className="surface-strong rounded-[1.2rem] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm uppercase tracking-[0.18em] ui-muted">记录 {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeArchiveDialogEntry(index)}
                    disabled={archiveDialogDrafts.length === 1}
                    className="ui-button-danger px-3 py-1.5 text-xs disabled:opacity-35"
                  >
                    删除
                  </button>
                </div>
                <div className={`grid gap-3 ${isMultiDayEvent ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                  <select
                    data-testid={`archive-dialog-talent-${index}`}
                    value={entry.talentId}
                    onChange={(event) => updateArchiveDialogTalent(index, event.target.value)}
                    className="ui-select text-sm"
                  >
                    {lineupTalentOptions.map((talent) => (
                      <option key={talent.id} value={talent.id}>
                        {talent.nickname}
                      </option>
                    ))}
                  </select>
                  {isMultiDayEvent ? (
                    <select
                      data-testid={`archive-dialog-date-${index}`}
                      value={entry.entryDate ?? ""}
                      onChange={(event) => updateArchiveDialogEntry(index, { entryDate: event.target.value || null })}
                      className="ui-select text-sm"
                    >
                      {entryDateOptions.map((date) => (
                        <option key={date} value={date}>
                          {formatDateKey(date)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <input
                    data-testid={`archive-dialog-cosplay-${index}`}
                    value={entry.cosplayTitle}
                    onChange={(event) => updateArchiveDialogEntry(index, { cosplayTitle: event.target.value })}
                    placeholder="角色 / 作品 / 游戏"
                    className="ui-input text-sm"
                  />
                </div>
              </section>
            );
          })}
        </div>
      </AdminDialog>
    ) : null}
    </>
  );
}
