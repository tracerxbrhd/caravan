CREATE TABLE "caravan_rematch_requests" (
  "source_match_id" uuid PRIMARY KEY NOT NULL REFERENCES "caravan_matches"("id") ON DELETE CASCADE,
  "requester_account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "status" text NOT NULL,
  "match_id" uuid REFERENCES "caravan_matches"("id"),
  "created_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "resolved_at" timestamp with time zone,
  CONSTRAINT "caravan_rematch_requests_status" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED')),
  CONSTRAINT "caravan_rematch_requests_expiry" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "caravan_rematch_requests_match_consistency" CHECK (
    ("status" = 'ACCEPTED' AND "match_id" IS NOT NULL)
    OR
    ("status" <> 'ACCEPTED' AND "match_id" IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX "caravan_rematch_requests_requester_idx"
  ON "caravan_rematch_requests" USING btree ("requester_account_id");
--> statement-breakpoint
CREATE INDEX "caravan_rematch_requests_status_expiry_idx"
  ON "caravan_rematch_requests" USING btree ("status", "expires_at");
