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
  password_expires_at,
  security_question_1,
  security_answer_hash_1,
  security_question_2,
  security_answer_hash_2,
  security_question_3,
  security_answer_hash_3
) VALUES (
  '{{ADMIN_USERNAME}}',
  '{{ADMIN_EMAIL}}',
  '{{ADMIN_FIRST_NAME}}',
  '{{ADMIN_LAST_NAME}}',
  'administrator',
  'active',
  crypt('{{ADMIN_PASSWORD}}', gen_salt('bf')),
  now(),
  now() + interval '{{PASSWORD_EXPIRATION_DAYS}} days',
  'What is your favorite color?',
  crypt('blue', gen_salt('bf')),
  'What city were you born in?',
  crypt('springfield', gen_salt('bf')),
  'What is your pet’s name?',
  crypt('fluffy', gen_salt('bf'))
)
ON CONFLICT DO NOTHING;
