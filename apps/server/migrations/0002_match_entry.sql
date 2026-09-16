CREATE TABLE caravan_matchmaking_queue (
  account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz NOT NULL,
  CONSTRAINT caravan_matchmaking_queue_lease_after_joined
    CHECK (lease_expires_at > joined_at)
);

CREATE INDEX caravan_matchmaking_queue_order_idx
  ON caravan_matchmaking_queue (joined_at, account_id);

CREATE INDEX caravan_matchmaking_queue_lease_idx
  ON caravan_matchmaking_queue (lease_expires_at);

CREATE TABLE caravan_private_challenges (
  id uuid PRIMARY KEY,
  inviter_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  invite_token_hash bytea NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'PENDING',
  resolved_by_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  match_id uuid REFERENCES caravan_matches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  CONSTRAINT caravan_private_challenges_status_check
    CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED')),
  CONSTRAINT caravan_private_challenges_expiry_check
    CHECK (expires_at > created_at),
  CONSTRAINT caravan_private_challenges_resolution_check
    CHECK (
      (status = 'PENDING' AND resolved_at IS NULL AND resolved_by_account_id IS NULL AND match_id IS NULL)
      OR (status = 'ACCEPTED' AND resolved_at IS NOT NULL AND resolved_by_account_id IS NOT NULL AND match_id IS NOT NULL)
      OR (status = 'DECLINED' AND resolved_at IS NOT NULL AND resolved_by_account_id IS NOT NULL AND match_id IS NULL)
      OR (status IN ('CANCELLED', 'EXPIRED') AND resolved_at IS NOT NULL AND match_id IS NULL)
    )
);

CREATE INDEX caravan_private_challenges_inviter_status_idx
  ON caravan_private_challenges (inviter_account_id, status, created_at DESC);

CREATE INDEX caravan_private_challenges_expiry_idx
  ON caravan_private_challenges (expires_at)
  WHERE status = 'PENDING';
