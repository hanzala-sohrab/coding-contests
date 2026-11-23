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
  label        text NOT NULL UNIQUE,
  title        text NOT NULL,
  statement    text NOT NULL,
  time_limit   real NOT NULL,   -- seconds
  memory_limit int NOT NULL,    -- KB
  points       int NOT NULL DEFAULT 1
);

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
