import "server-only";

import {
  getDashboardSummary,
  getEditors,
  getEditorArchiveForEvent,
  getEventDetail,
  getHomepageCollections,
  getLadderByEditor,
  getLadders,
  getTalentDetail,
  listEventSummaries,
  listTalents,
  searchSite,
  type EventFilters,
  type TalentFilters
} from "@/modules/domain/queries";
import { getContentRepository } from "@/modules/repository";

export async function getContentState() {
  return getContentRepository().getState();
}

export async function getDouyinAdminStatuses() {
  const state = await getContentState();
  return state.douyinProfiles.map((profile) => ({
    talentId: profile.talentId,
    lastSuccessAt: profile.lastSuccessAt ?? null,
    lastErrorCode: profile.lastErrorCode ?? null,
    manualSyncAvailableAt: profile.manualSyncAvailableAt ?? null
  }));
}

export async function getSiteEditors() {
  return getEditors(await getContentState());
}

export async function getHomepageData() {
  return getHomepageCollections(await getContentState());
}

export async function getTalentIndex(filters?: TalentFilters) {
  return listTalents(await getContentState(), filters);
}

export async function getTalentPage(slug: string) {
  return getTalentDetail(await getContentState(), slug);
}

export async function getEventIndex(filters?: EventFilters) {
  return listEventSummaries(await getContentState(), filters);
}

export async function getEventPage(slug: string) {
  return getEventDetail(await getContentState(), slug);
}

export async function getLadderIndex() {
  return getLadders(await getContentState());
}

export async function getLadderPage(editorSlug: string) {
  return getLadderByEditor(await getContentState(), editorSlug);
}

export async function getSearchPage(query: string) {
  return searchSite(await getContentState(), query);
}

export async function getScopedSearchPage(query: string, scope: "all" | "talents" | "events") {
  return searchSite(await getContentState(), query, scope);
}

export async function getAdminDashboard(editorId: string) {
  return getDashboardSummary(await getContentState(), editorId);
}

export async function getArchiveEditorEvent(editorId: string, eventId: string) {
  return getEditorArchiveForEvent(await getContentState(), editorId, eventId);
}
