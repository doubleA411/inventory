ALTER TABLE "organizations" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "address_line" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "state_code" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "pincode" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "gst_registered" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "gstin" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "default_tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "default_sac" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "letterhead_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "letterhead_margin_top" numeric DEFAULT '170' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "letterhead_margin_bottom" numeric DEFAULT '120' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "signature_url" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "bank_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "bank_account" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "bank_ifsc" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "bank_upi" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "invoice_prefix" text DEFAULT 'INV' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "quote_prefix" text DEFAULT 'QUO' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "default_terms" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "default_notes" text;