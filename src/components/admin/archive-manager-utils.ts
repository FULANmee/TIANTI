import { toDateInputValue } from "@/lib/date";
import type { EditorArchive, Event, EventLineup } from "@/modules/domain/types";

export interface EditableEvent {
  id?: string;
  name: string;
  startsAt: string;
  endsAt: string;
  city: string;
  venue: string;
  note: string;
}

export interface EditableLineup {
  id: string;
  talentId: string;
  lineupDate: string;
  status: "confirmed" | "pending";
  source: string;
  note: string;
}

export function createEmptyEventDraft(): EditableEvent {
  return {
    name: "",
    startsAt: "",
    endsAt: "",
    city: "",
    venue: "",
    note: ""
  };
}

export function createEventDraft(event?: Event | null): EditableEvent {
  if (!event) {
    return createEmptyEventDraft();
  }

  return {
    id: event.id,
    name: event.name,
    startsAt: toDateInputValue(event.startsAt),
    endsAt: toDateInputValue(event.endsAt),
    city: event.city,
    venue: event.venue,
    note: event.note
  };
}

export function createLineupDrafts(event: Event | null, lineups: EventLineup[]): EditableLineup[] {
  if (!event) {
    return [];
  }

  return lineups
    .filter((lineup) => lineup.eventId === event.id)
    .map((lineup) => ({
      id: lineup.id,
      talentId: lineup.talentId,
      lineupDate: toDateInputValue(lineup.lineupDate ?? event.startsAt ?? event.endsAt ?? null),
      status: "confirmed",
      source: "",
      note: lineup.note
    }));
}

export function createArchiveDraft(eventId: string | null, archives: EditorArchive[]): EditorArchive {
  if (!eventId) {
    return {
      id: "",
      editorId: "",
      eventId: "",
      updatedAt: "",
      entries: []
    };
  }

  const archive = archives.find((item) => item.eventId === eventId);
  if (!archive) {
    return {
      id: "",
      editorId: "",
      eventId,
      updatedAt: "",
      entries: []
    };
  }

  return {
    ...archive,
    entries: archive.entries.map((entry) => ({
      ...entry,
      entryDate: entry.entryDate ? toDateInputValue(entry.entryDate) || null : null
    }))
  };
}

export function normalizeEventDraft(value: EditableEvent) {
  return {
    id: value.id ?? "",
    name: value.name.trim(),
    startsAt: value.startsAt,
    endsAt: value.endsAt,
    city: value.city.trim(),
    venue: value.venue.trim(),
    note: value.note.trim()
  };
}

export function normalizeLineupDrafts(value: EditableLineup[]) {
  return value.map((lineup) => ({
    id: lineup.id,
    talentId: lineup.talentId,
    lineupDate: lineup.lineupDate,
    status: "confirmed",
    source: "",
    note: lineup.note.trim()
  }));
}

export function normalizeArchiveDraft(value: EditorArchive) {
  return {
    id: value.id ?? "",
    editorId: value.editorId ?? "",
    eventId: value.eventId ?? "",
    entries: value.entries.map((entry) => ({
      id: entry.id,
      talentId: entry.talentId,
      entryDate: entry.entryDate ?? null,
      sceneAssetId: entry.sceneAssetId,
      sharedPhotoAssetId: entry.sharedPhotoAssetId ?? null,
      cosplayTitle: entry.cosplayTitle.trim(),
      hasSharedPhoto: entry.hasSharedPhoto
    }))
  };
}
