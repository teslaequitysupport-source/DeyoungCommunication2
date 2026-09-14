CREATE TYPE "public"."support_status" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."support_topic" AS ENUM('ACCOUNT', 'BILLING_CREDITS', 'STUDIO_RENDERS', 'CONSENT_PRIVACY', 'REPORT_PROBLEM', 'OTHER');--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"topic" "support_topic" NOT NULL,
	"message" text NOT NULL,
	"status" "support_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_tickets_status_created_idx" ON "support_tickets" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_email_idx" ON "support_tickets" USING btree ("email");