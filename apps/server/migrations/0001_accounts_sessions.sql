CREATE TABLE "accounts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "display_name" varchar(64) NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "accounts_status" CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'BANNED'))
);
--> statement-breakpoint
CREATE TABLE "account_identities" (
  "id" uuid PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "provider" varchar(32) NOT NULL,
  "provider_subject" varchar(128) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "account_identities_provider_subject_unique" UNIQUE("provider", "provider_subject")
);
--> statement-breakpoint
CREATE INDEX "account_identities_account_idx" ON "account_identities" USING btree ("account_id");
--> statement-breakpoint
CREATE TABLE "sessions" (
  "token_hash" char(64) PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "sessions_token_hash_format" CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");
--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");
