import type {
  Asset,
  AssetCleanupRun,
  AssetObjectDeletionJob,
  ContentState,
  EditorAccount,
  EditorProfile,
  EditorArchive,
  EditorLadder,
  Event,
  EventMergeRule,
  EventLineup,
  DouyinSyncResult,
  DouyinSyncRun,
  SessionRecord,
  Talent,
  TalentDouyinProfile,
  TalentDouyinFollowerSnapshot,
  TalentDouyinRelatedAccount,
  TalentDouyinScheduleEntry
} from "@/modules/domain/types";

export interface EventMergePersistenceInput {
  targetEvent: Event;
  deletedEventIds: string[];
  lineups: EventLineup[];
  archives: ContentState["archives"];
  scheduleEntryIds: string[];
  mergeRules: EventMergeRule[];
  deletedMergeRuleIds: string[];
}

export interface DouyinSyncPersistenceInput {
  profiles: TalentDouyinProfile[];
  followerSnapshots: TalentDouyinFollowerSnapshot[];
  relatedAccounts: TalentDouyinRelatedAccount[];
  scheduleEntries: TalentDouyinScheduleEntry[];
  upsertEvents: Event[];
  sourceLineups: EventLineup[];
  eventMergeRules: EventMergeRule[];
  deleteSyncEventIds: string[];
  syncRun: DouyinSyncRun;
  syncResults: DouyinSyncResult[];
}

export interface ContentRepository {
  getState(): Promise<ContentState>;
  findEditorByEmail(email: string): Promise<EditorAccount | null>;
  updateEditorName(editorId: string, name: string): Promise<EditorProfile>;
  createSession(session: SessionRecord): Promise<void>;
  getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  createAsset(asset: Asset): Promise<Asset>;
  updateAssetFraming(id: string, framing: Pick<Asset, "cropX" | "cropY" | "cropWidth" | "cropHeight" | "displayAspectWidth" | "displayAspectHeight">): Promise<Asset>;
  deleteAssetIfUnreferenced(id: string, objectKey?: string | null): Promise<boolean>;
  listAssetObjectDeletionJobs(limit: number): Promise<AssetObjectDeletionJob[]>;
  completeAssetObjectDeletionJob(objectKey: string): Promise<void>;
  failAssetObjectDeletionJob(objectKey: string, message: string): Promise<void>;
  saveAssetCleanupRun(run: AssetCleanupRun): Promise<void>;
  upsertTalent(talent: Talent): Promise<Talent>;
  deleteTalent(id: string): Promise<void>;
  upsertEvent(event: Event): Promise<Event>;
  mergeEvents(input: EventMergePersistenceInput): Promise<void>;
  replaceEventLineup(eventId: string, state: ContentState["lineups"]): Promise<void>;
  saveDouyinSyncState(input: DouyinSyncPersistenceInput): Promise<void>;
  tryStartDouyinSyncRun(run: DouyinSyncRun, staleBefore: string): Promise<boolean>;
  finishDouyinSyncRun(run: DouyinSyncRun, results: DouyinSyncResult[]): Promise<void>;
  suppressDouyinScheduleEntries(entryIds: string[]): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  saveLadder(ladder: EditorLadder): Promise<EditorLadder>;
  saveArchive(archive: EditorArchive): Promise<EditorArchive>;
}
