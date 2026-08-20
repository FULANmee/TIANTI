"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Save, Search, Trash2 } from "lucide-react";
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
import { compareByPinyin, matchesPinyinSearch } from "@/lib/pinyin";
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
  beautyTier: number;
  sceneAssetId: string;
  sharedPhotoAssetId: string;
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
  cosplayTitle = "",
  beautyTier = 0
): EditorArchive["entries"][number] {
  return {
    id: crypto.randomUUID(),
    talentId,
    entryDate: entryDate || null,
    sceneAssetId,
    sharedPhotoAssetId: null,
    cosplayTitle,
    hasSharedPhoto: false,
    beautyTier
  };
}

function createArchiveEntryDraft(talentId = "", entryDate = ""): AddArchiveEntryDraft {
  return {
    id: crypto.randomUUID(),
    talentId,
    entryDate: entryDate || null,
    cosplayTitle: "",
    beautyTier: 0,
    sceneAssetId: "",
    sharedPhotoAssetId: ""
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
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingArchive, setSavingArchive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [liveAssets, setLiveAssets] = useState(assets);
  const [cleanupCandidateAssetIds, setCleanupCandidateAssetIds] = useState<string[]>([]);
  const [liveEvents, setLiveEvents] = useState(initialEvents);
  const [liveLineups, setLiveLineups] = useState(lineups);
  const [liveArchives, setLiveArchives] = useState(archives);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId);
  const [isEventEditorOpen, setIsEventEditorOpen] = useState(() => Boolean(initialEventId));
  const [isLineupDialogOpen, setIsLineupDialogOpen] = useState(false);
  const [talentSelectionQuery, setTalentSelectionQuery] = useState("");
  const [lineupDialogDraft, setLineupDialogDraft] = useState<AddLineupDraft | null>(null);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [archiveDialogDrafts, setArchiveDialogDrafts] = useState<AddArchiveEntryDraft[]>([]);
  const [expandedSharedArchiveIndex, setExpandedSharedArchiveIndex] = useState<number | null>(null);
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

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const syncPageOverflow = () => {
      document.documentElement.style.overflow = desktop.matches ? "hidden" : previousHtmlOverflow;
      document.body.style.overflow = desktop.matches ? "hidden" : previousBodyOverflow;
    };
    syncPageOverflow();
    desktop.addEventListener("change", syncPageOverflow);
    return () => {
      desktop.removeEventListener("change", syncPageOverflow);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

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
  const filteredTalentOptions = useMemo(
    () => sortedTalents.filter((talent) => matchesPinyinSearch([talent.nickname, ...talent.aliases, ...talent.searchKeywords], talentSelectionQuery)),
    [sortedTalents, talentSelectionQuery]
  );
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
  const editableLineupTalentIds = useMemo(
    () => [...new Set(editableLineups.map((lineup) => lineup.talentId).filter(Boolean))],
    [editableLineups]
  );
  const editableLineupTalentIdSet = useMemo(() => new Set(editableLineupTalentIds), [editableLineupTalentIds]);
  const lineupTalentOptions = useMemo(
    () =>
      editableLineupTalentIds
        .map((talentId) => talentMap.get(talentId))
        .filter((talent): talent is Talent => Boolean(talent)),
    [editableLineupTalentIds, talentMap]
  );
  const defaultArchiveTalentId = useMemo(() => {
    const usedTalentIds = new Set(archiveDraft.entries.map((entry) => entry.talentId));
    return editableLineupTalentIds.find((talentId) => !usedTalentIds.has(talentId)) ?? editableLineupTalentIds[0] ?? "";
  }, [archiveDraft.entries, editableLineupTalentIds]);
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

  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setIsEventEditorOpen(false);
  }, []);

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
      if (window.matchMedia("(max-width: 1023px)").matches) window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="admin-editor-workspace"]')?.scrollIntoView({ block: "start" }));
      return;
    }
    if (!canLeaveCurrentWork()) return;
    resetDrafts(eventId);
    setMessage(null);
    setIsEventEditorOpen(true);
    if (window.matchMedia("(max-width: 1023px)").matches) window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="admin-editor-workspace"]')?.scrollIntoView({ block: "start" }));
  }

  function inspectEvent(eventId: string) {
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
    if (window.matchMedia("(max-width: 1023px)").matches) window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="admin-editor-workspace"]')?.scrollIntoView({ block: "start" }));
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
    return {
      talentId,
      note: "",
      dates: dateRows
    };
  }

  function openLineupDialog() {
    if (sortedTalents.length === 0) {
      setMessage("请先在达人库里添加达人。");
      return;
    }
    setTalentSelectionQuery("");
    setLineupDialogDraft(createLineupDialogDraft());
    setIsLineupDialogOpen(true);
    setMessage(null);
  }

  function updateLineupTalentQuery(nextQuery: string) {
    const nextOptions = sortedTalents.filter((talent) =>
      matchesPinyinSearch([talent.nickname, ...talent.aliases, ...talent.searchKeywords], nextQuery)
    );

    setTalentSelectionQuery(nextQuery);
    setLineupDialogDraft((current) => {
      if (!current || nextOptions.some((talent) => talent.id === current.talentId)) return current;
      return createLineupDialogDraft(nextOptions[0]?.id ?? "");
    });
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
    return [...(editableLineupDateKeysByTalentId.get(talentId) ?? new Set<string>())].filter(Boolean);
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
      .map((entry) => ({
        ...createArchiveEntry(entry.talentId, entry.entryDate ?? "", entry.sceneAssetId, entry.cosplayTitle, entry.beautyTier),
        hasSharedPhoto: Boolean(entry.sharedPhotoAssetId),
        sharedPhotoAssetId: entry.sharedPhotoAssetId || null
      }));

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

  async function handleSaveAll() {
    const validationError = validateEventDraft(eventDraft, editableLineups);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    const shouldSaveArchive = Boolean(
      eventDraft.id && (archiveDraft.id || archiveDraft.entries.length > 0 || isArchiveDirty)
    );
    if (shouldSaveArchive) {
      const archiveValidationError = validateArchiveDraft(
        archiveDraft,
        isMultiDayEvent,
        validArchiveDateKeys,
        editableLineupTalentIdSet,
        editableLineupDateKeysByTalentId
      );
      if (archiveValidationError) {
        setMessage(archiveValidationError);
        return;
      }
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

    setSavingEvent(true);
    setSavingArchive(shouldSaveArchive);
    startTransition(async () => {
      try {
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

        let nextArchives = liveArchives;
        if (shouldSaveArchive) {
          const archiveResponse = await fetch("/api/admin/archives", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: archiveDraft.id || undefined,
              eventId: nextEventId,
              cleanupCandidateAssetIds,
              entries: archiveDraft.entries
            })
          });
          const archiveData = (await archiveResponse.json().catch(() => null)) as
            | { error?: string; archive?: EditorArchive }
            | null;
          if (!archiveResponse.ok || !archiveData?.archive) {
            setLiveEvents(nextEvents);
            setLiveLineups(nextLineups);
            setSelectedEventId(nextEventId);
            setEventDraft(createEventDraft(data.event));
            setMessage(`活动与阵容已保存，但现场档案保存失败：${archiveData?.error ?? "请稍后重试"}`);
            return;
          }
          nextArchives = liveArchives.some((archive) => archive.eventId === nextEventId)
            ? liveArchives.map((archive) => (archive.eventId === nextEventId ? archiveData.archive! : archive))
            : [...liveArchives, archiveData.archive];
        }

        setLiveEvents(nextEvents);
        setLiveLineups(nextLineups);
        setLiveArchives(nextArchives);
        resetDrafts(nextEventId, nextEvents, nextLineups, nextArchives);
        setIsEventEditorOpen(true);
        setCleanupCandidateAssetIds([]);
        setMessage(
          shouldSaveArchive
            ? `活动「${data.event.name}」的活动信息、阵容和现场档案已保存。`
            : `活动「${data.event.name}」已保存。`
        );
      } finally {
        setSavingEvent(false);
        setSavingArchive(false);
      }
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
      setIsEventEditorOpen(nextEvents.length > 0);
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
        setIsEventEditorOpen(Boolean(nextSelectedEventId));
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
    const missingTalentIds = editableLineupTalentIds.filter((talentId) => !existingTalentIds.has(talentId));

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
    <div className="admin-workspace grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <aside className={`surface min-h-0 flex-col overflow-hidden rounded-[var(--radius-panel)] ${isEventEditorOpen ? "hidden lg:flex" : "flex"}`}>
        <div className="space-y-3 border-b border-[var(--line-soft)] p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="ui-kicker">对象索引</p><h1 className="mt-1 text-xl font-semibold">活动</h1></div><button type="button" data-testid="new-event-button" onClick={handleNewEvent} className="ui-button-primary text-sm"><Plus aria-hidden="true" className="size-4" />新建活动</button></div>
        <label className="ui-field-label"><span className="flex items-center gap-2"><Search aria-hidden="true" className="size-3.5" />搜索活动</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入活动、城市或场馆" className="ui-input text-sm" /></label>
        <div className="mt-4 flex flex-wrap gap-3 text-xs ui-muted">
          <button
            type="button"
            data-testid="event-select-all"
            onClick={toggleAllFilteredEvents}
            className="ui-button-secondary min-h-9 px-3 py-1 text-xs"
          >
            {areAllFilteredEventsSelected ? "取消全选当前结果" : "全选当前结果"}
          </button>
          <span className="rounded-full border border-[var(--line-soft)] px-3 py-2">
            已选 {selectedEventIds.length} / {liveEvents.length}
          </span>
          {hasUnsavedChanges ? (
            <span className="rounded-full border border-[#c48b26]/45 px-3 py-2 text-[#5f3d00]">
              当前编辑未保存
            </span>
          ) : null}
        </div>
        {selectedEventIds.length > 0 ? <div className="mt-4 rounded-[0.9rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] p-4">
          <p className="text-xs font-semibold tracking-[0.12em] ui-muted">批量模式</p>
          <div className="mt-3 grid gap-3">
            <button
              type="button"
              data-testid="bulk-delete-events"
              onClick={handleBulkEventAction}
              disabled={pending || selectedEventIds.length === 0}
              className="ui-button-danger text-sm"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              批量删除活动
            </button>
          </div>
        </div> : null}
        </div>
        <div className="admin-scroll-region flex-1 space-y-1 overflow-y-auto p-2" data-testid="event-index">
          {filteredEvents.map((event) => {
            const isChecked = selectedEventIds.includes(event.id);
            const eventDateLabel = event.startsAt ? formatDateKey(event.startsAt.slice(0, 10)) : null;

            return (
              <div
                key={event.id}
                className={`flex items-start gap-3 rounded-[0.8rem] px-3 py-2 transition ${
                  selectedEventId === event.id ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--surface-tint)]"
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`选择 ${getEventDisplayName(event)}`}
                  checked={isChecked}
                  onChange={(nextEvent) => toggleSelectedEvent(event.id, nextEvent.target.checked)}
                  className="mt-1 size-4 accent-[var(--color-accent)]"
                />
                <button type="button" onClick={() => inspectEvent(event.id)} aria-pressed={selectedEventId === event.id} className="flex-1 rounded-md text-left">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">{getEventDisplayName(event)}</p>
                  <p className="mt-1 text-xs ui-muted">
                    {[event.city || "城市待定", eventDateLabel].filter(Boolean).join(" · ")}
                  </p>
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <section className={`${isEventEditorOpen ? "flex" : "hidden lg:flex"} min-h-0 min-w-0 flex-col gap-5`}>
        {message ? <div className="shrink-0"><StatusNotice variant="warning">{message}</StatusNotice></div> : null}
        {isEventEditorOpen ? (
          <AdminDialog
            title={selectedEvent ? `编辑 ${getEventDisplayName(selectedEvent)}` : "新建活动档案"}
            description="活动信息、公开阵容与现场档案在同一个右侧工作面连续维护。"
            onClose={closeEventEditor}
            size="xl"
            presentation="workspace"
            footer={
              <>
                <span className="mr-auto text-xs leading-6 ui-muted">一次保存活动信息、公开阵容与现场档案。</span>
                <button type="button" onClick={handleSaveAll} disabled={pending || savingEvent || savingArchive} data-testid="save-activity" className="ui-button-primary text-sm"><Save aria-hidden="true" className="size-4" />{savingEvent || savingArchive ? "保存中..." : "保存活动档案"}</button>
              </>
            }
            closable={false}
          >
            <section className="space-y-5">
          <div className="mb-6 flex items-center justify-between gap-4 rounded-[0.9rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] p-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold">基本信息与阵容</p>
              {isEventDirty ? <span className="rounded-full bg-[var(--color-warning-soft)] px-3 py-1 text-xs text-[var(--color-warning)]">尚未保存</span> : <span className="text-xs ui-muted">已保存</span>}
            </div>
            {selectedEvent ? (
              <button
                type="button"
                onClick={handleDeleteEvent}
                aria-label="删除活动"
                className="ui-button-danger text-sm"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">删除活动</span>
              </button>
            ) : null}
          </div>

          <div className="space-y-5">
            <div className="grid gap-4">
              <label className="ui-field-label"><span>活动名称 <span className="text-[var(--color-danger)]">*</span></span><input
                name="name"
                value={eventDraft.name}
                onChange={(event) => setEventDraft((current) => ({ ...current, name: event.target.value }))}
                className="ui-input"
              /></label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="ui-field-label"><span>开始日期</span><input
                name="startsAt"
                type="date"
                value={eventDraft.startsAt}
                onChange={(event) => setEventDraft((current) => ({ ...current, startsAt: event.target.value }))}
                className="ui-input"
              /></label>
              <label className="ui-field-label"><span>结束日期</span><input
                name="endsAt"
                type="date"
                value={eventDraft.endsAt}
                onChange={(event) => setEventDraft((current) => ({ ...current, endsAt: event.target.value }))}
                className="ui-input"
              /></label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="ui-field-label"><span>城市</span><input
                name="city"
                value={eventDraft.city}
                onChange={(event) => setEventDraft((current) => ({ ...current, city: event.target.value }))}
                className="ui-input"
              /></label>
              <label className="ui-field-label"><span>场馆</span><input
                name="venue"
                value={eventDraft.venue}
                onChange={(event) => setEventDraft((current) => ({ ...current, venue: event.target.value }))}
                className="ui-input"
              /></label>
            </div>
            <label className="ui-field-label"><span>活动说明或备注</span><textarea
              name="note"
              value={eventDraft.note}
              onChange={(event) => setEventDraft((current) => ({ ...current, note: event.target.value }))}
                rows={1}
              data-testid="event-note"
                className="ui-textarea admin-auto-textarea"
            /></label>
            <div className="space-y-4 rounded-[0.9rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg text-[var(--foreground)]">达人阵容</h3>
                  <p className="mt-2 text-xs leading-6 ui-muted">
                    {isMultiDayEvent
                      ? "当前活动跨多天，阵容会按日期分组；每条达人阵容都需要选择所属日期。"
                      : "单日活动保持轻量录入体验，阵容不额外按日期拆分。"}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="add-lineup"
                  onClick={openLineupDialog}
                  className="ui-button-secondary text-sm"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  添加达人
                </button>
              </div>

              {editableLineups.length === 0 ? (
                <div className="rounded-[0.9rem] border border-dashed border-[var(--line-strong)] px-4 py-5 text-sm ui-muted">
                  还没有阵容达人，可以先添加一位。
                </div>
              ) : null}

              <div className="space-y-4">
                {editableLineupGroups.map((group) => (
                  <div key={group.key} className="space-y-3">
                    {group.label ? (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-accent)]">{group.label}</p>
                        <span className="text-xs ui-muted">{group.items.length} 位达人</span>
                      </div>
                    ) : null}

                    {group.items.length === 0 ? (
                      <div className="rounded-[0.9rem] border border-dashed border-[var(--line-strong)] px-4 py-5 text-sm ui-muted">
                        本日还没有阵容达人。
                      </div>
                    ) : null}

                    {group.items.map(({ lineup, index }) => {
                      const gridClass = isMultiDayEvent
                        ? "xl:grid-cols-[minmax(9rem,1fr)_9rem_minmax(10rem,1fr)_auto]"
                        : "md:grid-cols-[minmax(9rem,1fr)_minmax(10rem,1fr)_auto]";

                      return (
                        <div
                          key={lineup.id}
                          data-testid="lineup-item"
                          className={`grid gap-3 rounded-[0.9rem] border border-[var(--line-soft)] p-4 ${gridClass}`}
                        >
                          <select
                            data-testid={`lineup-talent-${index}`}
                            value={lineup.talentId}
                            onChange={(event) => updateLineup(index, { talentId: event.target.value })}
                            className="ui-select text-sm"
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
                              className="ui-select text-sm"
                            >
                              <option value="">选择日期</option>
                              {lineupDateOptions.map((date) => (
                                <option key={date} value={date}>
                                  {formatDateKey(date)}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <textarea
                            data-testid={`lineup-note-${index}`}
                            value={lineup.note}
                            onChange={(event) => updateLineup(index, { note: event.target.value })}
                            rows={1}
                            placeholder="补充备注"
                            className="ui-input admin-auto-textarea text-sm"
                          />
                          <button type="button" aria-label={`删除阵容 ${index + 1}`} onClick={() => setEditableLineups((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="ui-button-danger px-3"><Trash2 aria-hidden="true" className="size-4" /></button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs leading-6 ui-muted">
                保存活动信息后不会刷新整页，当前活动和档案草稿都会继续保留。
              </p>
            </div>
          </div>
            </section>
        {!canEditArchive ? (
          <section className="surface rounded-[var(--radius-panel)] px-6 py-10 text-center ui-subtle">
            先保存活动基础信息，再开始录入我的现场档案。
          </section>
        ) : (
          <>
            <section id="archive-editor-section" className="surface rounded-[1.2rem] p-6">
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
                  <h3 className="mt-3 text-2xl text-[var(--foreground)]">我的现场档案</h3>
                  <p className="mt-3 text-sm leading-7 ui-subtle">
                    现场档案现在也支持按日期分组；图片位只保留当前图、上传新图和清空当前图。
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    data-testid="import-lineup-entries"
                    onClick={importLineupEntries}
                    className="ui-button-secondary text-sm"
                  >
                    从当前阵容导入
                  </button>
                  <button
                    type="button"
                    data-testid="add-archive-entry"
                    onClick={addArchiveEntry}
                    className="ui-button-secondary text-sm"
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    添加现场记录
                  </button>
                </div>
              </div>
            </section>

            {archiveDraft.entries.length === 0 ? (
              <section className="surface rounded-[var(--radius-panel)] px-6 py-10 text-center ui-subtle">
                还没有现场记录。可以先从当前阵容导入，或者手动新增一条。
              </section>
            ) : (
              <div className="space-y-5">
                {editableArchiveGroups.map((group) => (
                  <div key={group.key} className="space-y-3">
                    {group.label ? (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-accent)]">{group.label}</p>
                        <span className="text-xs ui-muted">{group.items.length} 条记录</span>
                      </div>
                    ) : null}

                    {group.items.map(({ entry, index }) => {
                      const entryDateOptions = getArchiveDateOptionsForTalent(entry.talentId);

                      return (
                      <section key={entry.id} data-testid="archive-entry" className="surface rounded-[1.8rem] p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm tracking-[0.08em] ui-muted">记录 {index + 1}</p>
                          <div className="flex flex-wrap gap-3">
                            <button
                              type="button"
                              data-testid={`archive-copy-${index}`}
                              onClick={() => duplicateArchiveEntry(index)}
                              className="ui-button-secondary text-sm"
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
                            className="ui-select text-sm"
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
                              className="ui-select text-sm"
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
                            className="ui-input text-sm"
                          />
                          <label className="space-y-2 text-sm ui-subtle">
                            <span className="block">颜值梯度</span>
                            <select
                              data-testid={`archive-beauty-tier-${index}`}
                              value={entry.beautyTier ?? ""}
                              onChange={(event) => updateArchiveEntry(index, { beautyTier: Number(event.target.value) })}
                              className="ui-select text-sm"
                            >
                              {[0, 1, 2, 3, 4, 5].map((tier) => <option key={tier} value={tier}>T{tier}</option>)}
                            </select>
                          </label>
                        </div>

                        <div className="archive-image-grid mt-4 grid gap-4 md:grid-cols-2">
                          <InlineAssetUpload
                            kind="event_scene"
                            expandInParentGrid
                            dataTestId={`archive-scene-upload-${index}`}
                            currentAsset={entry.sceneAssetId ? (assetMap.get(entry.sceneAssetId) ?? null) : null}
                            onClear={() => handleClearScene(index)}
                            onUploaded={(asset) => handleSceneUploaded(index, asset)}
                            helperText="当前现场图可直接替换或清空，不再从素材池里手动选择。"
                          />
                          <div className={`space-y-3 ${expandedSharedArchiveIndex === index ? "md:col-span-2" : ""}`}><label className="flex items-center gap-3 rounded-[0.8rem] border border-[var(--line-soft)] bg-[var(--surface-tint)] px-3 py-3 text-sm ui-subtle">
                            <input
                              data-testid={`archive-shared-flag-${index}`}
                              type="checkbox"
                              checked={entry.hasSharedPhoto}
                              onChange={(event) => handleSharedToggle(index, event.target.checked)}
                            />
                            是否有集邮
                          </label>
                          {entry.hasSharedPhoto ? (
                            <InlineAssetUpload
                              kind="shared_photo"
                              onEditingChange={(editing) => setExpandedSharedArchiveIndex((current) => editing ? index : current === index ? null : current)}
                              dataTestId={`archive-shared-upload-${index}`}
                              currentAsset={entry.sharedPhotoAssetId ? (assetMap.get(entry.sharedPhotoAssetId) ?? null) : null}
                              onClear={() => handleClearShared(index)}
                              onUploaded={(asset) => handleSharedUploaded(index, asset)}
                              helperText="当前合照可直接替换或清空，不再从素材池里手动选择。"
                            />
                          ) : null}</div>
                        </div>
                      </section>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs leading-6 ui-muted">
                保存我的档案只会更新当前编辑人的现场档案，不会覆盖共享活动信息。
              </p>
            </div>
          </>
        )}
          </AdminDialog>
        ) : (
          <section className="surface rounded-[1.8rem] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="ui-kicker">活动档案</p>
                  {isEventDirty ? (
                    <span className="rounded-full border border-[#c48b26]/45 px-3 py-1 text-[11px] text-[#5f3d00]">
                      活动信息未保存
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-3xl text-[var(--foreground)]">
                  {selectedEvent ? getEventDisplayName(selectedEvent) : "新建活动档案"}
                </h2>
                <p className="mt-3 text-sm leading-7 ui-subtle">{selectedEvent ? `${selectedEvent.city || "城市待定"} · ${selectedEvent.startsAt ? formatDateKey(selectedEvent.startsAt.slice(0, 10)) : "日期待定"} · ${liveLineups.filter((lineup) => lineup.eventId === selectedEvent.id).length} 位阵容 · ${liveArchives.find((archive) => archive.eventId === selectedEvent.id)?.entries.length ?? 0} 条现场记录` : "从左侧选择活动后开始维护。"}</p>
              </div>
              <button
                type="button"
                onClick={() => (selectedEventId ? selectEvent(selectedEventId) : handleNewEvent())}
                className="ui-button-primary text-sm"
              >
                <Pencil aria-hidden="true" className="size-4" />
                {selectedEvent ? "编辑活动档案" : "新建活动档案"}
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
          <label className="ui-field-label"><span className="flex items-center gap-2"><Search aria-hidden="true" className="size-3.5" />搜索达人</span><input value={talentSelectionQuery} onChange={(event) => updateLineupTalentQuery(event.target.value)} placeholder="中文、拼音或首字母" className="ui-input text-sm" /></label>
          <div className="grid gap-4">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] ui-muted">达人</span>
              <select
                data-testid="lineup-dialog-talent"
                value={lineupDialogDraft.talentId}
                onChange={(event) => updateLineupDialogTalent(event.target.value)}
                className="ui-select text-sm"
              >
                {filteredTalentOptions.map((talent) => (
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
        size="xl"
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
          <label className="ui-field-label"><span className="flex items-center gap-2"><Search aria-hidden="true" className="size-3.5" />搜索达人</span><input value={talentSelectionQuery} onChange={(event) => setTalentSelectionQuery(event.target.value)} placeholder="中文、拼音或首字母" className="ui-input text-sm" /></label>
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
                    {lineupTalentOptions.filter((talent) => matchesPinyinSearch([talent.nickname, ...talent.aliases, ...talent.searchKeywords], talentSelectionQuery)).map((talent) => (
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
                <div className="archive-image-grid mt-4 grid gap-4 md:grid-cols-2">
                  <InlineAssetUpload expandInParentGrid kind="event_scene" dataTestId={`archive-dialog-scene-${index}`} currentAsset={entry.sceneAssetId ? (assetMap.get(entry.sceneAssetId) ?? null) : null} onClear={() => updateArchiveDialogEntry(index, { sceneAssetId: "" })} onUploaded={(asset) => updateArchiveDialogEntry(index, { sceneAssetId: asset.id })} helperText="现场照片" />
                  <InlineAssetUpload expandInParentGrid kind="shared_photo" dataTestId={`archive-dialog-shared-${index}`} currentAsset={entry.sharedPhotoAssetId ? (assetMap.get(entry.sharedPhotoAssetId) ?? null) : null} onClear={() => updateArchiveDialogEntry(index, { sharedPhotoAssetId: "" })} onUploaded={(asset) => updateArchiveDialogEntry(index, { sharedPhotoAssetId: asset.id })} helperText="集邮照片" />
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
