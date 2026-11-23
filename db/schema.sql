-- Idempotent: safe to run on every start.

CREATE TABLE IF NOT EXISTS users (
  id            serial PRIMARY KEY,
  username      text NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9_]{3,20}$'),
  password_hash text NOT NULL,
  is_admin      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

-- Single contest per deployment.
CREATE TABLE IF NOT EXISTS contest (
  id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  title           text NOT NULL,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  penalty_minutes int NOT NULL DEFAULT 20,
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS problems (
  id           serial PRIMARY KEY,
  slug         text NOT NULL UNIQUE,
  label        text NOT NULL,
  title        text NOT NULL,
  statement    text NOT NULL,
  time_limit   real NOT NULL,   -- seconds
  memory_limit int NOT NULL,    -- KB
  points       int NOT NULL DEFAULT 1
);
-- pool: 'contest' problems appear in the contest; 'game' problems only in Fastest Finger First.
ALTER TABLE problems ADD COLUMN IF NOT EXISTS pool text NOT NULL DEFAULT 'contest' CHECK (pool IN ('contest', 'game'));
ALTER TABLE problems DROP CONSTRAINT IF EXISTS problems_label_key;
CREATE UNIQUE INDEX IF NOT EXISTS problems_pool_label_idx ON problems (pool, label);

CREATE TABLE IF NOT EXISTS test_cases (
  id              serial PRIMARY KEY,
  problem_id      int NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  position        int NOT NULL,
  input           text NOT NULL,
  expected_output text NOT NULL,
  is_sample       boolean NOT NULL DEFAULT false,
  UNIQUE (problem_id, position)
);

-- verdict: pending | AC | WA | TLE | MLE | RE | CE | IE
CREATE TABLE IF NOT EXISTS submissions (
  id             serial PRIMARY KEY,
  user_id        int NOT NULL REFERENCES users(id),
  problem_id     int NOT NULL REFERENCES problems(id),
  language_id    int NOT NULL,
  source_code    text NOT NULL,
  verdict        text NOT NULL DEFAULT 'pending',
  failed_test    int,
  compile_output text,
  message        text,
  time           real,
  memory         int,
  created_at     timestamptz NOT NULL DEFAULT now(),
  judged_at      timestamptz
);
CREATE INDEX IF NOT EXISTS submissions_user_idx ON submissions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_pending_idx ON submissions (id) WHERE verdict = 'pending';

-- One row per test case run. Not tied to test_cases rows so that
-- re-syncing problems never deletes judging history.
CREATE TABLE IF NOT EXISTS submission_tests (
  submission_id  int NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  position       int NOT NULL,
  judge0_token   text,
  status_id      int,
  time           real,
  memory         int,
  compile_output text,
  PRIMARY KEY (submission_id, position)
);

-- Fastest Finger First -----------------------------------------------------

-- status: lobby -> playing -> finished
CREATE TABLE IF NOT EXISTS game_rooms (
  id            serial PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  host_id       int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished')),
  total_rounds  int NOT NULL CHECK (total_rounds BETWEEN 1 AND 50),
  round_seconds int NOT NULL CHECK (round_seconds BETWEEN 10 AND 3600),
  current_round int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);

CREATE TABLE IF NOT EXISTS game_players (
  room_id   int NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  user_id   int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- status: running -> won | expired | skipped
CREATE TABLE IF NOT EXISTS game_rounds (
  id                    serial PRIMARY KEY,
  room_id               int NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  number                int NOT NULL,
  problem_id            int NOT NULL REFERENCES problems(id),
  starts_at             timestamptz NOT NULL,
  ends_at               timestamptz NOT NULL,
  status                text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'won', 'expired', 'skipped')),
  winner_id             int REFERENCES users(id) ON DELETE SET NULL,
  winning_submission_id int,
  finished_at           timestamptz,
  UNIQUE (room_id, number)
);
CREATE INDEX IF NOT EXISTS game_rounds_running_idx ON game_rounds (id) WHERE status = 'running';

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS game_round_id int REFERENCES game_rounds(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS submissions_game_round_idx ON submissions (game_round_id, created_at) WHERE game_round_id IS NOT NULL;
