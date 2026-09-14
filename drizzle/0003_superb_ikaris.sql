CREATE TYPE "public"."report_action" AS ENUM('NONE', 'WARNING', 'SUSPENSION', 'BAN', 'CONTENT_REMOVAL');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('IMPERSONATION', 'HARASSMENT', 'ILLEGAL_CONTENT', 'UNAUTHORIZED_LIKENESS', 'UNAUTHORIZED_VOICE', 'SEXUAL_ABUSE_DEEPFAKE', 'SCAM', 'FRAUD', 'COPYRIGHT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
ALTER TYPE "public"."user_status" ADD VALUE 'BANNED';--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" text,
	"reason" "report_reason" NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_user_id" text,
	"details" text,
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"decision_action" "report_action",
	"decision_notes" text,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_status_created_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_user_idx" ON "reports" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_id");