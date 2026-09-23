CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"entity_label" text,
	"summary" text NOT NULL,
	"details" jsonb,
	"actor_user_id" uuid,
	"actor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_org_created_idx" ON "audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_org_action_idx" ON "audit_events" USING btree ("organization_id","action");--> statement-breakpoint
CREATE INDEX "audit_events_org_entity_idx" ON "audit_events" USING btree ("organization_id","entity_type");--> statement-breakpoint
CREATE INDEX "audit_events_org_actor_idx" ON "audit_events" USING btree ("organization_id","actor_user_id");--> statement-breakpoint
-- The audit trail is append-only. Reject edits and deletes at the database so
-- neither app code nor a console session can quietly rewrite history. Two
-- exceptions, both driven by foreign keys rather than by anyone editing the
-- log: ON DELETE SET NULL on actor_user_id (actor_name keeps who it was), and
-- the cascade when the organization itself is deleted — by the time that
-- cascade runs, the parent row is already gone.
CREATE FUNCTION "audit_events_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.actor_user_id IS NULL
     AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM "organizations" WHERE "id" = OLD.organization_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only (% blocked)', TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only" BEFORE UPDATE OR DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION "audit_events_immutable"();
