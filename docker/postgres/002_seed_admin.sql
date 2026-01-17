-- Seed a default administrator account using template values.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (
  username,
  email,
  first_name,
  last_name,
  role,
  status,
  password_hash,
  password_changed_at,
  password_expires_at
) VALUES (
  '{{ADMIN_USERNAME}}',
  '{{ADMIN_EMAIL}}',
  '{{ADMIN_FIRST_NAME}}',
  '{{ADMIN_LAST_NAME}}',
  'administrator',
  'active',
  crypt('{{ADMIN_PASSWORD}}', gen_salt('bf')),
  now(),
  now() + interval '365 days'
)
ON CONFLICT DO NOTHING;
