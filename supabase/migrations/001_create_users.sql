-- 001_create_users.sql
-- simple example migration for CI testing

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add index for email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
