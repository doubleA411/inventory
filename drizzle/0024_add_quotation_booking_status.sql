ALTER TABLE "quotations" ADD COLUMN "advance_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "advance_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "taken_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "taken_by" uuid;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_taken_by_users_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;