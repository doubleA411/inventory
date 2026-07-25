ALTER TABLE "organizations" ADD COLUMN "doc_heading_color" text DEFAULT '#1f2937' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "doc_body_color" text DEFAULT '#4b5563' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "doc_font_size" integer DEFAULT 12 NOT NULL;