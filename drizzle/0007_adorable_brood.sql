CREATE TABLE "douyin_sync_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"talent_id" uuid,
	"status" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "douyin_sync_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"requested_count" integer DEFAULT 0 NOT NULL,
	"succeeded_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "talent_douyin_profiles" (
	"talent_id" uuid PRIMARY KEY NOT NULL,
	"profile_url" text NOT NULL,
	"sec_user_id" text,
	"signature_raw" text DEFAULT '' NOT NULL,
	"itinerary_text" text DEFAULT '' NOT NULL,
	"follower_count" integer,
	"fetched_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error_code" text,
	"link_extraction_status" text DEFAULT 'unavailable' NOT NULL,
	"manual_sync_available_at" timestamp with time zone,
	"parser_version" text DEFAULT '1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talent_douyin_related_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"talent_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"sec_user_id" text NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talent_douyin_schedule_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"talent_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"raw_text" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"city" text NOT NULL,
	"event_name" text DEFAULT '' NOT NULL,
	"event_id" uuid,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"consecutive_missing_count" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"parser_version" text DEFAULT '1' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "douyin_sync_results" ADD CONSTRAINT "douyin_sync_results_run_id_douyin_sync_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."douyin_sync_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "douyin_sync_results" ADD CONSTRAINT "douyin_sync_results_talent_id_talents_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_douyin_profiles" ADD CONSTRAINT "talent_douyin_profiles_talent_id_talents_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_douyin_related_accounts" ADD CONSTRAINT "talent_douyin_related_accounts_talent_id_talents_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_douyin_schedule_entries" ADD CONSTRAINT "talent_douyin_schedule_entries_talent_id_talents_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "talent_douyin_schedule_entries" ADD CONSTRAINT "talent_douyin_schedule_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "douyin_sync_results_run_idx" ON "douyin_sync_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "douyin_sync_results_talent_idx" ON "douyin_sync_results" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "douyin_sync_results_created_at_idx" ON "douyin_sync_results" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "douyin_sync_runs_started_at_idx" ON "douyin_sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "douyin_sync_runs_status_idx" ON "douyin_sync_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "talent_douyin_profiles_sec_user_id_idx" ON "talent_douyin_profiles" USING btree ("sec_user_id");--> statement-breakpoint
CREATE INDEX "talent_douyin_profiles_last_success_idx" ON "talent_douyin_profiles" USING btree ("last_success_at");--> statement-breakpoint
CREATE INDEX "talent_douyin_related_accounts_talent_idx" ON "talent_douyin_related_accounts" USING btree ("talent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "talent_douyin_related_accounts_unique_idx" ON "talent_douyin_related_accounts" USING btree ("talent_id","sec_user_id");--> statement-breakpoint
CREATE INDEX "talent_douyin_schedule_entries_talent_idx" ON "talent_douyin_schedule_entries" USING btree ("talent_id");--> statement-breakpoint
CREATE INDEX "talent_douyin_schedule_entries_event_idx" ON "talent_douyin_schedule_entries" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "talent_douyin_schedule_entries_state_date_idx" ON "talent_douyin_schedule_entries" USING btree ("state","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "talent_douyin_schedule_entries_fingerprint_idx" ON "talent_douyin_schedule_entries" USING btree ("talent_id","fingerprint");--> statement-breakpoint
CREATE INDEX "events_origin_idx" ON "events" USING btree ("origin");