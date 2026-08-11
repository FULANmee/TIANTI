CREATE TABLE "asset_cleanup_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"scanned_asset_count" integer DEFAULT 0 NOT NULL,
	"eligible_asset_count" integer DEFAULT 0 NOT NULL,
	"deleted_asset_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_object_deletion_jobs" (
	"object_key" text PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "talent_tags" CASCADE;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "crop_x" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "crop_y" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "crop_width" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "crop_height" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "display_aspect_width" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "display_aspect_height" integer DEFAULT 4 NOT NULL;--> statement-breakpoint
UPDATE "assets"
SET "display_aspect_width" = CASE WHEN "width" >= "height" THEN 4 ELSE 3 END,
    "display_aspect_height" = CASE WHEN "width" >= "height" THEN 3 ELSE 4 END;--> statement-breakpoint
ALTER TABLE "talent_douyin_profiles" ADD COLUMN "latest_work_url" text;--> statement-breakpoint
ALTER TABLE "talent_douyin_profiles" ADD COLUMN "latest_work_caption" text;--> statement-breakpoint
ALTER TABLE "talent_douyin_profiles" ADD COLUMN "latest_work_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "talents" ADD COLUMN "mcn_source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
CREATE INDEX "asset_cleanup_runs_started_at_idx" ON "asset_cleanup_runs" USING btree ("started_at");
