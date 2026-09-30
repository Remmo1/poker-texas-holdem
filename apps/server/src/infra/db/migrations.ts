export interface Migration {
  readonly name: string;
  readonly sql: string;
}

export const migrations: readonly Migration[] = [
  {
    name: '001_init',
    sql: `
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('user', 'table', 'house')),
  owner_id uuid,
  balance bigint NOT NULL DEFAULT 0,
  CHECK (owner_type = 'house' OR balance >= 0),
  UNIQUE (owner_type, owner_id)
);
CREATE UNIQUE INDEX accounts_single_house_idx ON accounts ((1)) WHERE owner_type = 'house';
INSERT INTO accounts (owner_type) VALUES ('house');

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  hand_id uuid,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id bigserial PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES ledger_transactions (id),
  account_id uuid NOT NULL REFERENCES accounts (id),
  amount bigint NOT NULL
);
CREATE INDEX ledger_entries_transaction_idx ON ledger_entries (transaction_id);
CREATE INDEX ledger_entries_account_idx ON ledger_entries (account_id);

CREATE TABLE tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  config jsonb NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE table_seats (
  table_id uuid NOT NULL REFERENCES tables (id),
  seat_index smallint NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id),
  stack bigint NOT NULL CHECK (stack >= 0),
  PRIMARY KEY (table_id, seat_index),
  UNIQUE (table_id, user_id)
);

CREATE TABLE hands (
  id uuid PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES tables (id),
  hand_no bigint NOT NULL,
  deck_commit char(64) NOT NULL,
  deck_reveal jsonb,
  deck_salt text,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'complete', 'void')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  UNIQUE (table_id, hand_no)
);

CREATE TABLE hand_events (
  hand_id uuid NOT NULL REFERENCES hands (id),
  seq int NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hand_id, seq)
);

CREATE TABLE hand_players (
  hand_id uuid NOT NULL REFERENCES hands (id),
  user_id uuid NOT NULL REFERENCES users (id),
  seat_index smallint NOT NULL,
  start_stack bigint NOT NULL,
  end_stack bigint,
  hole_cards text,
  PRIMARY KEY (hand_id, user_id)
);

CREATE TABLE outbox (
  id bigserial PRIMARY KEY,
  aggregate_id uuid NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL;
`,
  },
];
