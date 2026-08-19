CREATE TABLE "talent_douyin_follower_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"talent_id" uuid NOT NULL,
	"follower_count" integer NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "talent_douyin_follower_snapshots" ADD CONSTRAINT "talent_douyin_follower_snapshots_talent_id_talents_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "talent_douyin_follower_snapshots_talent_fetched_idx" ON "talent_douyin_follower_snapshots" USING btree ("talent_id","fetched_at");--> statement-breakpoint
INSERT INTO "talent_douyin_follower_snapshots" ("id", "talent_id", "follower_count", "fetched_at")
SELECT gen_random_uuid(), "talent_id", "follower_count", COALESCE("last_success_at", "fetched_at", NOW())
FROM "talent_douyin_profiles"
WHERE "follower_count" IS NOT NULL;--> statement-breakpoint
DELETE FROM "talent_links"
WHERE lower(trim("label")) NOT IN ('抖音', '抖音主页', 'douyin');--> statement-breakpoint
ALTER TABLE "editor_archives" DROP COLUMN "note";--> statement-breakpoint
ALTER TABLE "archive_entries" ADD CONSTRAINT "archive_entries_beauty_tier_check" CHECK ("archive_entries"."beauty_tier" is null or ("archive_entries"."beauty_tier" >= 0 and "archive_entries"."beauty_tier" <= 5));
