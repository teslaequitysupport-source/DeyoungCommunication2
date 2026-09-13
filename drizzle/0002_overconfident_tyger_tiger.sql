ALTER TABLE "workers" ADD COLUMN "idle_since_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workers" ADD COLUMN "wake_requested_at" timestamp with time zone;