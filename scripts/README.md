# scripts

Maintenance scripts for tasks like migrations and local setup.

## TODO's
1. Replace the db init script with a proper migrations workflow when the schema grows.

## Available scripts
- `init-db.js`: Runs SQL files found in `docker/postgres` to initialize and seed the database.
  - Uses `DATABASE_URL` environment variable if set, otherwise it uses `POSTGRES_*`/`PG*` vars to connect.
  - Template values: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL` (optional),
    `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`.
- `reset-db.js`: Drops non-system database tables and clears user file folders.
- `accounts-seed.js`: Seeds accounts from a hardcoded list in `scripts/accounts-seed.js`.
  - Edit `SEEDED_ACCOUNTS` in the script when account seed data changes.
  - Run via npm: `npm run accounts-seed`
  - Dry run: `npm run accounts-seed -- --dry-run`
  - Replace existing matching accounts: `npm run accounts-seed -- --replace-existing`
- `build-user-manual-pdf.js`: Compiles markdown files in `docs/User Manual` into a single PDF.
  - Default output: `docs/User Manual/FinLedger_User_Manual.pdf`
  - Run via npm: `npm run manual:pdf`
