CREATE TABLE "caravan_matches" (
  "id" uuid PRIMARY KEY NOT NULL,
  "state_version" bigint NOT NULL,
  "status" text NOT NULL,
  "snapshot_schema_version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "caravan_matches_state_version_nonnegative" CHECK ("state_version" >= 0),
  CONSTRAINT "caravan_matches_state_version_safe" CHECK ("state_version" <= 9007199254740991),
  CONSTRAINT "caravan_matches_status" CHECK ("status" IN ('ACTIVE', 'FINISHED')),
  CONSTRAINT "caravan_matches_snapshot_schema_version" CHECK ("snapshot_schema_version" > 0),
  CONSTRAINT "caravan_matches_snapshot_object" CHECK (jsonb_typeof("snapshot") = 'object')
);
--> statement-breakpoint
CREATE INDEX "caravan_matches_status_idx" ON "caravan_matches" USING btree ("status");
