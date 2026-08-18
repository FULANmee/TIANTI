export type EditorSlug = "lin" | "yu";
export type EventStatus = "future" | "past";
export type DerivedEventStatus = "future" | "past" | "undated";
export type ParticipationStatus = "confirmed" | "pending";
export type EventOrigin = "manual" | "douyin_sync" | "douyin_merged";
export type DouyinLinkExtractionStatus = "structured" | "rendered" | "unavailable";
export type DouyinScheduleEntryState = "active" | "removed_future" | "retained_past" | "suppressed";
export type DouyinSyncTrigger = "cron" | "manual_all" | "manual_talent";
export type DouyinSyncStatus = "running" | "completed" | "completed_with_errors" | "failed";
export type AssetKind =
  | "talent_cover"
  | "talent_representation"
  | "event_scene"
  | "shared_photo";

export type AssetCleanupRunStatus = "running" | "completed" | "completed_with_errors" | "failed";

export interface EditorProfile {
  id: string;
  slug: EditorSlug;
  name: string;
  title: string;
  bio: string;
  accent: string;
  intro: string;
}

export interface EditorAccount extends EditorProfile {
  email: string;
  passwordHash: string;
}

export interface Asset {
  id: string;
  kind: AssetKind;
  title: string;
  alt: string;
  url: string;
  objectKey?: string | null;
  width: number;
  height: number;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  displayAspectWidth?: number;
  displayAspectHeight?: number;
  createdAt?: string;
}

export interface TalentLink {
  id: string;
  label: string;
  url: string;
}

export interface TalentRepresentation {
  id: string;
  title: string;
  assetId?: string | null;
}

export interface Talent {
  id: string;
  slug?: string | null;
  nickname: string;
  bio: string;
  aliases: string[];
  searchKeywords: string[];
  coverAssetId?: string | null;
  links: TalentLink[];
  representations: TalentRepresentation[];
  updatedAt: string;
}

export interface Event {
  id: string;
  slug?: string | null;
  name: string;
  aliases: string[];
  searchKeywords: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  city: string;
  venue: string;
  status: EventStatus;
  note: string;
  updatedAt: string;
  origin?: EventOrigin;
}

export interface EventMergeRuleMember {
  id: string;
  sourceEntryId: string;
  talentId: string;
  city: string;
  normalizedName: string;
  startsAt: string;
  endsAt: string;
  lastSeenAt: string;
}

export interface EventMergeRule {
  id: string;
  targetEventId: string;
  createdAt: string;
  updatedAt: string;
  members: EventMergeRuleMember[];
}

export interface EventLineup {
  id: string;
  eventId: string;
  talentId: string;
  status: ParticipationStatus;
  source: string;
  note: string;
  lineupDate?: string | null;
}

export interface LadderTier {
  id: string;
  name: string;
  order: number;
  talentIds: string[];
}

export interface EditorLadder {
  id: string;
  editorId: string;
  title: string;
  subtitle: string;
  tiers: LadderTier[];
}

export interface ArchiveEntry {
  id: string;
  talentId: string;
  entryDate?: string | null;
  sceneAssetId?: string | null;
  sharedPhotoAssetId?: string | null;
  cosplayTitle: string;
  hasSharedPhoto: boolean;
  beautyTier?: number | null;
}

export interface EditorArchive {
  id: string;
  editorId: string;
  eventId: string;
  note: string;
  updatedAt: string;
  entries: ArchiveEntry[];
}

export interface SessionRecord {
  id: string;
  editorId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface TalentDouyinProfile {
  talentId: string;
  profileUrl: string;
  secUserId?: string | null;
  signatureRaw: string;
  itineraryText: string;
  followerCount?: number | null;
  fetchedAt?: string | null;
  lastSuccessAt?: string | null;
  lastErrorCode?: string | null;
  linkExtractionStatus: DouyinLinkExtractionStatus;
  manualSyncAvailableAt?: string | null;
  parserVersion: string;
}

export interface AssetObjectDeletionJob {
  objectKey: string;
  assetId: string;
  attempts: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetCleanupRun {
  id: string;
  status: AssetCleanupRunStatus;
  startedAt: string;
  finishedAt?: string | null;
  scannedAssetCount: number;
  eligibleAssetCount: number;
  deletedAssetCount: number;
  errorCount: number;
}

export interface TalentDouyinRelatedAccount {
  id: string;
  talentId: string;
  nickname: string;
  secUserId: string;
  url: string;
  sortOrder: number;
}

export interface TalentDouyinScheduleEntry {
  id: string;
  talentId: string;
  fingerprint: string;
  rawText: string;
  startsAt: string;
  endsAt: string;
  city: string;
  eventName: string;
  eventId?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  consecutiveMissingCount: number;
  state: DouyinScheduleEntryState;
  parserVersion: string;
}

export interface DouyinSyncRun {
  id: string;
  trigger: DouyinSyncTrigger;
  status: DouyinSyncStatus;
  requestedCount: number;
  succeededCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt?: string | null;
}

export interface DouyinSyncResult {
  id: string;
  runId: string;
  talentId?: string | null;
  status: "succeeded" | "skipped" | "failed";
  code: string;
  message: string;
  createdAt: string;
}

export interface TalentDouyinAdminStatus {
  talentId: string;
  profileUrl: string;
  signature: string;
  itineraryText: string;
  followerCount: number | null;
  fetchedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  manualSyncAvailableAt: string | null;
  activeScheduleCount: number;
}

export interface ContentState {
  editors: EditorProfile[];
  assets: Asset[];
  talents: Talent[];
  events: Event[];
  eventMergeRules: EventMergeRule[];
  lineups: EventLineup[];
  ladders: EditorLadder[];
  archives: EditorArchive[];
  sessions: SessionRecord[];
  douyinProfiles: TalentDouyinProfile[];
  douyinRelatedAccounts: TalentDouyinRelatedAccount[];
  douyinScheduleEntries: TalentDouyinScheduleEntry[];
  douyinSyncRuns: DouyinSyncRun[];
  douyinSyncResults: DouyinSyncResult[];
  assetObjectDeletionJobs: AssetObjectDeletionJob[];
  assetCleanupRuns: AssetCleanupRun[];
}

export interface RepositoryState extends Omit<ContentState, "editors"> {
  editors: EditorAccount[];
}

export interface TalentSummary {
  id: string;
  slug?: string | null;
  nickname: string;
  bio: string;
  bioPreviewLine: string | null;
  aliases: string[];
  cover: Asset | null;
  recentHint: string | null;
  futureLocationHint: string | null;
  hasFutureEvent: boolean;
  archiveCount: number;
  relevanceScore?: number;
}

export interface RelatedTalentSummary {
  talent: TalentSummary;
  reason: string;
}

export interface EventLineupDisplayItem {
  lineup: EventLineup;
  talent: Talent;
  cover: Asset | null;
}

export interface EventLineupGroup {
  date: string | null;
  label: string | null;
  items: EventLineupDisplayItem[];
}

export interface ArchiveEntryDisplayItem {
  entry: ArchiveEntry;
  talent: Talent;
  sceneAsset?: Asset | null;
  sharedPhotoAsset?: Asset | null;
}

export interface ArchiveEntryGroup {
  date: string | null;
  label: string | null;
  items: ArchiveEntryDisplayItem[];
}

export interface EventSummary {
  event: Event;
  temporalStatus: DerivedEventStatus;
  lineups: EventLineupDisplayItem[];
  lineupGroups: EventLineupGroup[];
  lineupSize: number;
  relevanceScore?: number;
}

export interface RelatedEventSummary {
  event: EventSummary;
  reason: string;
}

export interface TalentEventTimelineItem {
  event: Event;
  temporalStatus: DerivedEventStatus;
  detailText: string | null;
}

export interface TalentFieldRecordItem {
  id: string;
  event: Event;
  recordDate: string | null;
  roleSummary: string;
  locationSummary: string;
  asset: Asset | null;
}

export interface TalentDetail {
  talent: Talent;
  cover: Asset | null;
  representationAssets: Array<TalentRepresentation & { asset: Asset | null }>;
  fieldRecords: TalentFieldRecordItem[];
  futureEvents: TalentEventTimelineItem[];
  pastEvents: TalentEventTimelineItem[];
  relatedTalents: RelatedTalentSummary[];
  relatedEvents: RelatedEventSummary[];
  douyinProfile: {
    followerCount: number | null;
    itineraryBlocks: string[];
  } | null;
  editorSummaries: Array<{
    editor: EditorProfile;
    tierName: string | null;
    seenCount: number;
    sharedPhotoCount: number;
    averageBeautyTier: number | null;
  }>;
  beautyTierSeries: Array<{
    editor: EditorProfile;
    points: Array<{ id: string; date: string; eventName: string; beautyTier: number }>;
  }>;
}

export interface EventDetail {
  event: Event;
  lineups: EventLineupDisplayItem[];
  lineupGroups: EventLineupGroup[];
  archives: Array<{
    editor: EditorProfile;
    archive: EditorArchive;
    entries: ArchiveEntryDisplayItem[];
    entryGroups: ArchiveEntryGroup[];
  }>;
  relatedEvents: RelatedEventSummary[];
  relatedTalents: RelatedTalentSummary[];
}

export interface SiteSearchResult {
  talents: TalentSummary[];
  events: EventSummary[];
}

export interface DiscoverySection<T> {
  title: string;
  href: string;
  description: string;
  items: T[];
}

export interface HomepageDiscovery {
  stats: {
    recentTalentCount: number;
    recentEventCount: number;
  };
  featuredTalents: TalentSummary[];
  futureEvents: EventSummary[];
  recentTalents: TalentSummary[];
  editorSpotlights: Array<{
    editor: EditorProfile;
    href: string;
    summary: string;
  }>;
  ladderSpotlights: Array<{
    ladder: EditorLadder;
    topTier: LadderTier;
    href: string;
  }>;
}

export interface AutomaticLadderTier {
  id: string;
  name: string;
  talents: Array<{ talent: Talent; cover: Asset | null; value: number | null; valueLabel: string }>;
}

export interface AutomaticLadderPage {
  mode: "followers" | `average-${EditorSlug}`;
  title: string;
  subtitle: string;
  editor?: EditorProfile;
  tiers: AutomaticLadderTier[];
}

export interface LocationItineraryEntry {
  rawText: string;
  date: string | null;
  endDate: string | null;
  province: string | null;
  city: string | null;
  isPast: boolean;
}

export interface LocationItineraryTalent {
  talent: TalentSummary;
  entries: LocationItineraryEntry[];
}

export interface LocationItineraryIndex {
  provinces: Array<{ name: string; label: string; cities: Array<{ name: string; label: string }> }>;
  talents: LocationItineraryTalent[];
}

export interface DashboardSummary {
  recentTalents: Talent[];
  recentEvents: Event[];
  upcomingEvents: Event[];
  myRecentArchives: EditorArchive[];
}
