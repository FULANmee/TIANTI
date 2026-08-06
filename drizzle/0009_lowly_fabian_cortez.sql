CREATE TABLE "event_merge_rule_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rule_id" uuid NOT NULL,
	"source_entry_id" text NOT NULL,
	"talent_id" uuid NOT NULL,
	"city" text NOT NULL,
	"normalized_name" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_merge_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"target_event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_merge_rule_members" ADD CONSTRAINT "event_merge_rule_members_rule_id_event_merge_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."event_merge_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_merge_rule_members" ADD CONSTRAINT "event_merge_rule_members_talent_id_talents_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_merge_rules" ADD CONSTRAINT "event_merge_rules_target_event_id_events_id_fk" FOREIGN KEY ("target_event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_merge_rule_members_rule_idx" ON "event_merge_rule_members" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "event_merge_rule_members_source_entry_idx" ON "event_merge_rule_members" USING btree ("source_entry_id");--> statement-breakpoint
CREATE INDEX "event_merge_rule_members_identity_idx" ON "event_merge_rule_members" USING btree ("talent_id","city","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "event_merge_rules_target_event_idx" ON "event_merge_rules" USING btree ("target_event_id");