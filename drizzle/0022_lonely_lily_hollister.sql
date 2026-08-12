CREATE TYPE "public"."purchase_list_status" AS ENUM('draft', 'sent');--> statement-breakpoint
CREATE TABLE "purchase_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_list_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(20, 6) DEFAULT '1' NOT NULL,
	"unit" text
);
--> statement-breakpoint
CREATE TABLE "purchase_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"number" text NOT NULL,
	"seq" integer NOT NULL,
	"fy" text NOT NULL,
	"vendor_id" uuid,
	"list_date" date DEFAULT now() NOT NULL,
	"status" "purchase_list_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_lists_org_number_uq" UNIQUE("organization_id","number")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "purchase_list_prefix" text DEFAULT 'PL' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_list_items" ADD CONSTRAINT "purchase_list_items_purchase_list_id_purchase_lists_id_fk" FOREIGN KEY ("purchase_list_id") REFERENCES "public"."purchase_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_list_items" ADD CONSTRAINT "purchase_list_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lists" ADD CONSTRAINT "purchase_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lists" ADD CONSTRAINT "purchase_lists_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lists" ADD CONSTRAINT "purchase_lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_lists_org_idx" ON "purchase_lists" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "purchase_lists_vendor_idx" ON "purchase_lists" USING btree ("vendor_id");