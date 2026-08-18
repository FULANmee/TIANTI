ALTER TABLE "archive_entries" ADD COLUMN "beauty_tier" integer;--> statement-breakpoint
ALTER TABLE "archive_entries" ADD CONSTRAINT "archive_entries_beauty_tier_check" CHECK ("beauty_tier" IS NULL OR ("beauty_tier" >= 0 AND "beauty_tier" <= 5));--> statement-breakpoint
UPDATE "events" SET "origin" = 'manual' WHERE "origin" = 'douyin_merged';--> statement-breakpoint
UPDATE "talent_douyin_schedule_entries" SET "event_id" = NULL WHERE "event_id" IS NOT NULL;--> statement-breakpoint
DELETE FROM "event_lineup"
USING "events"
WHERE "event_lineup"."event_id" = "events"."id"
  AND "event_lineup"."source" LIKE 'douyin:%'
  AND COALESCE("events"."ends_at", "events"."starts_at") >= CURRENT_DATE;--> statement-breakpoint
DELETE FROM "events"
WHERE "origin" = 'douyin_sync'
  AND COALESCE("ends_at", "starts_at") >= CURRENT_DATE
  AND NOT EXISTS (SELECT 1 FROM "event_lineup" WHERE "event_lineup"."event_id" = "events"."id")
  AND NOT EXISTS (SELECT 1 FROM "editor_archives" WHERE "editor_archives"."event_id" = "events"."id");
