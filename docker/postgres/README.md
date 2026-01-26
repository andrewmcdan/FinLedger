# docker/postgres

PostgreSQL container config and init scripts for local/dev deployments.

SQL files in this folder are executed in filename order by `scripts/init-db.js`.
Template placeholders like `{{ADMIN_USERNAME}}` are replaced using environment variables.

## DB-Structure

### public.accounts
- id: bigint
- account_name: text
- account_number: bigint
- account_description: text
- normal_side: text
- account_category: text
- account_subcategory: text
- initial_balance: numeric
- total_debits: numeric
- total_credits: numeric
- balance: numeric
- created_at: timestamp with time zone
- user_id: bigint
- account_order: integer
- statement_type: text
- comment: text

### public.app_logs
- id: bigint
- user_id: bigint
- level: text
- message: text
- context: text
- source: text
- created_at: timestamp with time zone

### public.audit_logs
- id: bigint
- event_type: text
- user_id: bigint
- entity_type: text
- entity_id: bigint
- changes: text
- metadata: text
- created_at: timestamp with time zone

### public.documents
- id: bigint
- user_id: bigint
- title: text
- file_name: uuid
- file_extension: text
- meta_data: jsonb
- upload_at: timestamp with time zone

### public.logged_in_users
- id: bigint
- user_id: bigint
- token: text
- login_at: timestamp with time zone
- logout_at: timestamp with time zone

### public.password_expiry_email_tracking
- id: bigint
- user_id: bigint
- email_sent_at: timestamp with time zone
- email_sent_date: date
- password_expires_at: timestamp with time zone

### public.password_history
- id: bigint
- user_id: bigint
- password_hash: text
- changed_at: timestamp with time zone

### public.schema_migrations
- id: bigint
- filename: text
- applied_at: timestamp with time zone

### public.users
- id: bigint
- username: text
- email: text
- first_name: text
- last_name: text
- address: text
- date_of_birth: date
- role: text
- status: text
- profile_image_url: text
- password_hash: text
- password_changed_at: timestamp with time zone
- password_expires_at: timestamp with time zone
- failed_login_attempts: integer
- last_login_at: timestamp with time zone
- suspension_start_at: timestamp with time zone
- suspension_end_at: timestamp with time zone
- created_at: timestamp with time zone
- updated_at: timestamp with time zone
- security_question_1: text
- security_answer_hash_1: text
- security_question_2: text
- security_answer_hash_2: text
- security_question_3: text
- security_answer_hash_3: text
- reset_token: text
- reset_token_expires_at: timestamp with time zone
- user_icon_path: uuid
- temp_password: boolean
