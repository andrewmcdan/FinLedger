# docker/postgres

PostgreSQL container config and init scripts for local/dev deployments.

SQL files in this folder are executed in filename order by `scripts/init-db.js`.
Template placeholders like `{{ADMIN_USERNAME}}` are replaced using environment variables.

## DB-Structure

### public.account_audits
- id: bigint
- account_id: bigint (ref public.accounts.id)
- audit_timestamp: timestamp with time zone
- previous_debit: numeric
- previous_credit: numeric
- previous_balance: numeric
- new_debit: numeric
- new_credit: numeric
- new_balance: numeric
- changed_by: bigint (ref public.users.id)

### public.account_categories
- id: integer
- name: character varying
- description: text
- created_at: timestamp without time zone
- updated_at: timestamp without time zone
- account_number_prefix: character varying

### public.account_metadata_edits
- id: bigint
- account_id: bigint (ref public.accounts.id)
- edit_timestamp: timestamp with time zone
- field_name: text
- previous_value: text
- new_value: text
- changed_by: bigint (ref public.users.id)

### public.account_subcategories
- id: integer
- account_category_id: integer (ref public.account_categories.id)
- name: character varying
- description: text
- created_at: timestamp without time zone
- updated_at: timestamp without time zone
- order_index: integer

### public.accounts
- id: bigint
- account_name: text
- account_number: bigint
- account_description: text
- normal_side: text
- initial_balance: numeric
- total_debits: numeric
- total_credits: numeric
- balance: numeric
- created_at: timestamp with time zone
- user_id: bigint (ref public.users.id)
- account_order: integer
- statement_type: text
- comment: text
- status: text
- account_category_id: bigint (ref public.account_categories.id)
- account_subcategory_id: bigint (ref public.account_subcategories.id)

### public.adjustment_lines
- id: integer
- adjustment_metadata_id: integer (ref public.adjustment_metadata.id)
- account_id: integer (ref public.accounts.id)
- dc: text
- amount: numeric
- line_description: text
- created_at: timestamp without time zone
- created_by: integer (ref public.users.id)

### public.adjustment_metadata
- id: integer
- journal_entry_id: integer (ref public.journal_entries.id)
- adjustment_reason: text
- period_end_date: timestamp without time zone
- created_at: timestamp without time zone
- created_by: integer (ref public.users.id)
- notes: text

### public.app_logs
- id: bigint
- user_id: bigint (ref public.users.id)
- level: text
- message: text
- context: text
- source: text
- created_at: timestamp with time zone

### public.audit_logs
- id: bigint
- event_type: text
- user_id: bigint (ref public.users.id)
- entity_type: text
- entity_id: bigint
- changes: text
- metadata: text
- created_at: timestamp with time zone

### public.documents
- id: bigint
- user_id: bigint (ref public.users.id)
- title: text
- file_name: uuid
- file_extension: text
- meta_data: jsonb
- upload_at: timestamp with time zone

### public.journal_entries
- id: integer
- journal_type: text
- entry_date: timestamp without time zone
- description: text
- status: text
- total_debits: numeric
- total_credits: numeric
- created_by: integer (ref public.users.id)
- created_at: timestamp without time zone
- updated_by: integer (ref public.users.id)
- updated_at: timestamp without time zone
- approved_by: integer (ref public.users.id)
- approved_at: timestamp without time zone
- posted_at: timestamp without time zone

### public.journal_entry_lines
- id: integer
- journal_entry_id: integer (ref public.journal_entries.id)
- line_no: integer
- account_id: integer (ref public.accounts.id)
- dc: text
- amount: numeric
- line_description: text
- source_document_id: integer (ref public.documents.id)
- created_at: timestamp without time zone
- created_by: integer (ref public.users.id)
- updated_at: timestamp without time zone
- updated_by: integer (ref public.users.id)

### public.ledger_entries
- id: integer
- account_id: integer (ref public.accounts.id)
- entry_date: timestamp without time zone
- dc: text
- amount: numeric
- description: text
- journal_entry_line_id: integer (ref public.journal_entry_lines.id)
- journal_entry_id: integer (ref public.journal_entries.id)
- pr_journal_ref: text
- created_at: timestamp without time zone
- created_by: integer (ref public.users.id)
- updated_at: timestamp without time zone
- updated_by: integer (ref public.users.id)
- posted_at: timestamp without time zone
- posted_by: integer (ref public.users.id)

### public.logged_in_users
- id: bigint
- user_id: bigint (ref public.users.id)
- token: text
- login_at: timestamp with time zone
- logout_at: timestamp with time zone

### public.password_expiry_email_tracking
- id: bigint
- user_id: bigint (ref public.users.id)
- email_sent_at: timestamp with time zone
- email_sent_date: date
- password_expires_at: timestamp with time zone

### public.password_history
- id: bigint
- user_id: bigint (ref public.users.id)
- password_hash: text
- changed_at: timestamp with time zone

### public.schema_migrations
- id: bigint
- filename: text
- applied_at: timestamp with time zone

### public.statement_runs
- id: integer
- statement_type: text
- company_name: text
- title_line: text
- data_line_type: text
- date_value: timestamp without time zone
- created_at: timestamp without time zone
- created_by: integer (ref public.users.id)

### public.trial_balance_lines
- id: integer
- trial_balance_run_id: integer (ref public.trial_balance_runs.id)
- account_id: integer (ref public.accounts.id)
- debit_balance: numeric
- credit_balance: numeric
- liquidity_order_used: integer

### public.trial_balance_runs
- id: integer
- run_type: text
- as_of_date: timestamp without time zone
- created_at: timestamp without time zone
- created_by: integer (ref public.users.id)
- total_debits: numeric
- total_credits: numeric

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
- user_icon_path: text
- temp_password: boolean
