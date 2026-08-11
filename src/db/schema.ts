import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const editors = pgTable(
  "editors",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    title: text("title").notNull(),
    bio: text("bio").notNull(),
    accent: text("accent").notNull(),
    intro: text("intro").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    slugIdx: uniqueIndex("editors_slug_idx").on(table.slug),
    emailIdx: uniqueIndex("editors_email_idx").on(table.email)
  })
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  editorId: uuid("editor_id")
    .notNull()
    .references(() => editors.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  alt: text("alt").notNull(),
  url: text("url").notNull(),
  objectKey: text("object_key"),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  cropX: doublePrecision("crop_x").notNull().default(0),
  cropY: doublePrecision("crop_y").notNull().default(0),
  cropWidth: doublePrecision("crop_width").notNull().default(1),
  cropHeight: doublePrecision("crop_height").notNull().default(1),
  displayAspectWidth: integer("display_aspect_width").notNull().default(3),
  displayAspectHeight: integer("display_aspect_height").notNull().default(4),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const talents = pgTable(
  "talents",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug"),
    nickname: text("nickname").notNull(),
    bio: text("bio").notNull(),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    searchKeywords: text("search_keywords")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    coverAssetId: uuid("cover_asset_id").references(() => assets.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    slugIdx: uniqueIndex("talents_slug_idx").on(table.slug)
  })
);

export const talentLinks = pgTable("talent_links", {
  id: uuid("id").primaryKey(),
  talentId: uuid("talent_id")
    .notNull()
    .references(() => talents.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const talentAssets = pgTable("talent_assets", {
  id: uuid("id").primaryKey(),
  talentId: uuid("talent_id")
    .notNull()
    .references(() => talents.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey(),
    slug: text("slug"),
    name: text("name").notNull(),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    searchKeywords: text("search_keywords")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    city: text("city").notNull(),
    venue: text("venue").notNull(),
    status: text("status").notNull(),
    note: text("note").notNull(),
    origin: text("origin").notNull().default("manual"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    slugIdx: uniqueIndex("events_slug_idx").on(table.slug),
    originIdx: index("events_origin_idx").on(table.origin)
  })
);

export const eventLineup = pgTable("event_lineup", {
  id: uuid("id").primaryKey(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  talentId: uuid("talent_id")
    .notNull()
    .references(() => talents.id, { onDelete: "cascade" }),
  lineupDate: timestamp("lineup_date", { withTimezone: true }),
  status: text("status").notNull(),
  source: text("source").notNull(),
  note: text("note").notNull()
});

export const eventMergeRules = pgTable(
  "event_merge_rules",
  {
    id: uuid("id").primaryKey(),
    targetEventId: uuid("target_event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => ({
    targetEventIdx: uniqueIndex("event_merge_rules_target_event_idx").on(table.targetEventId)
  })
);

export const eventMergeRuleMembers = pgTable(
  "event_merge_rule_members",
  {
    id: uuid("id").primaryKey(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => eventMergeRules.id, { onDelete: "cascade" }),
    sourceEntryId: text("source_entry_id").notNull(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talents.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    normalizedName: text("normalized_name").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    ruleIdx: index("event_merge_rule_members_rule_idx").on(table.ruleId),
    sourceEntryIdx: index("event_merge_rule_members_source_entry_idx").on(table.sourceEntryId),
    identityIdx: index("event_merge_rule_members_identity_idx").on(
      table.talentId,
      table.city,
      table.normalizedName
    )
  })
);

export const talentDouyinProfiles = pgTable(
  "talent_douyin_profiles",
  {
    talentId: uuid("talent_id")
      .primaryKey()
      .references(() => talents.id, { onDelete: "cascade" }),
    profileUrl: text("profile_url").notNull(),
    secUserId: text("sec_user_id"),
    signatureRaw: text("signature_raw").notNull().default(""),
    itineraryText: text("itinerary_text").notNull().default(""),
    followerCount: integer("follower_count"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    linkExtractionStatus: text("link_extraction_status").notNull().default("unavailable"),
    manualSyncAvailableAt: timestamp("manual_sync_available_at", { withTimezone: true }),
    parserVersion: text("parser_version").notNull().default("1")
  },
  (table) => ({
    secUserIdIdx: uniqueIndex("talent_douyin_profiles_sec_user_id_idx").on(table.secUserId),
    lastSuccessIdx: index("talent_douyin_profiles_last_success_idx").on(table.lastSuccessAt)
  })
);

export const assetObjectDeletionJobs = pgTable("asset_object_deletion_jobs", {
  objectKey: text("object_key").primaryKey(),
  assetId: uuid("asset_id").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const assetCleanupRuns = pgTable(
  "asset_cleanup_runs",
  {
    id: uuid("id").primaryKey(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    scannedAssetCount: integer("scanned_asset_count").notNull().default(0),
    eligibleAssetCount: integer("eligible_asset_count").notNull().default(0),
    deletedAssetCount: integer("deleted_asset_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0)
  },
  (table) => ({ startedAtIdx: index("asset_cleanup_runs_started_at_idx").on(table.startedAt) })
);

export const talentDouyinRelatedAccounts = pgTable(
  "talent_douyin_related_accounts",
  {
    id: uuid("id").primaryKey(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talents.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    secUserId: text("sec_user_id").notNull(),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").notNull().default(0)
  },
  (table) => ({
    talentIdx: index("talent_douyin_related_accounts_talent_idx").on(table.talentId),
    talentAccountIdx: uniqueIndex("talent_douyin_related_accounts_unique_idx").on(
      table.talentId,
      table.secUserId
    )
  })
);

export const talentDouyinScheduleEntries = pgTable(
  "talent_douyin_schedule_entries",
  {
    id: uuid("id").primaryKey(),
    talentId: uuid("talent_id")
      .notNull()
      .references(() => talents.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    rawText: text("raw_text").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    city: text("city").notNull(),
    eventName: text("event_name").notNull().default(""),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    consecutiveMissingCount: integer("consecutive_missing_count").notNull().default(0),
    state: text("state").notNull().default("active"),
    parserVersion: text("parser_version").notNull().default("1")
  },
  (table) => ({
    talentIdx: index("talent_douyin_schedule_entries_talent_idx").on(table.talentId),
    eventIdx: index("talent_douyin_schedule_entries_event_idx").on(table.eventId),
    stateDateIdx: index("talent_douyin_schedule_entries_state_date_idx").on(
      table.state,
      table.endsAt
    ),
    talentFingerprintIdx: uniqueIndex("talent_douyin_schedule_entries_fingerprint_idx").on(
      table.talentId,
      table.fingerprint
    )
  })
);

export const douyinSyncRuns = pgTable(
  "douyin_sync_runs",
  {
    id: uuid("id").primaryKey(),
    trigger: text("trigger").notNull(),
    status: text("status").notNull(),
    requestedCount: integer("requested_count").notNull().default(0),
    succeededCount: integer("succeeded_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true })
  },
  (table) => ({
    startedAtIdx: index("douyin_sync_runs_started_at_idx").on(table.startedAt),
    statusIdx: index("douyin_sync_runs_status_idx").on(table.status),
    runningIdx: uniqueIndex("douyin_sync_runs_running_idx")
      .on(table.status)
      .where(sql`${table.status} = 'running'`)
  })
);

export const douyinSyncResults = pgTable(
  "douyin_sync_results",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => douyinSyncRuns.id, { onDelete: "cascade" }),
    talentId: uuid("talent_id").references(() => talents.id, { onDelete: "set null" }),
    status: text("status").notNull(),
    code: text("code").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    runIdx: index("douyin_sync_results_run_idx").on(table.runId),
    talentIdx: index("douyin_sync_results_talent_idx").on(table.talentId),
    createdAtIdx: index("douyin_sync_results_created_at_idx").on(table.createdAt)
  })
);

export const ladders = pgTable("ladders", {
  id: uuid("id").primaryKey(),
  editorId: uuid("editor_id")
    .notNull()
    .references(() => editors.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull()
});

export const ladderTiers = pgTable("ladder_tiers", {
  id: uuid("id").primaryKey(),
  ladderId: uuid("ladder_id")
    .notNull()
    .references(() => ladders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const ladderEntries = pgTable("ladder_entries", {
  id: uuid("id").primaryKey(),
  tierId: uuid("tier_id")
    .notNull()
    .references(() => ladderTiers.id, { onDelete: "cascade" }),
  talentId: uuid("talent_id")
    .notNull()
    .references(() => talents.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const editorArchives = pgTable("editor_archives", {
  id: uuid("id").primaryKey(),
  editorId: uuid("editor_id")
    .notNull()
    .references(() => editors.id, { onDelete: "cascade" }),
  eventId: uuid("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const archiveEntries = pgTable("archive_entries", {
  id: uuid("id").primaryKey(),
  archiveId: uuid("archive_id")
    .notNull()
    .references(() => editorArchives.id, { onDelete: "cascade" }),
  talentId: uuid("talent_id")
    .notNull()
    .references(() => talents.id, { onDelete: "cascade" }),
  entryDate: timestamp("entry_date", { withTimezone: true }),
  sceneAssetId: uuid("scene_asset_id").references(() => assets.id, { onDelete: "cascade" }),
  sharedPhotoAssetId: uuid("shared_photo_asset_id").references(() => assets.id, {
    onDelete: "set null"
  }),
  cosplayTitle: text("cosplay_title").notNull(),
  hasSharedPhoto: boolean("has_shared_photo").notNull().default(false)
});
