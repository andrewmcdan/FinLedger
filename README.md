# FinLedger
[![Tests](https://github.com/andrewmcdan/FinLedger/actions/workflows/tests.yml/badge.svg)](https://github.com/andrewmcdan/FinLedger/actions/workflows/tests.yml)

FinLedger is a web-based accounting and financial management system with role-based access, full general-ledger workflow, and reporting, built as a semester-long team project for our Application Domain class at KSU.

## Requirements
- Node.js with npm
- PostgreSQL (or Docker)

## Environment
Copy `.env.example` to `.env` and `.env.test`, then adjust values as needed. Use `.env` for local/dev and `.env.test` for the test database.

```bash
cp .env.example .env
cp .env.example .env.test
```

## Run locally (without Docker)
Make sure PostgreSQL is running with credentials matching `.env`, then:

```bash
npm install
npm run db-init
npm run dev
```

Visit `http://localhost:3050` (or the port set in `.env`).

## Run with Docker
This starts the app and PostgreSQL using Docker Compose:

```bash
docker compose up --build
```

Visit `http://localhost:3050` (or the port set in `.env`).

## Testing
Run the built-in Node.js test runner:

```bash
npm test
```

Tests live in `tests/`. Add new test files there as the project grows.
The `test` script uses `.env.test` (which enables the test DB via `DB_TESTING_ENABLED=true`).

To initialize the test database:

```bash
npm run db-init:test
```

## Development
To run the app in development mode with auto-reloading:

```bash
npm install
npm run db-init
npm run dev
```

If you want to use the postgresql database in a Docker container during development, run:

```bash
docker compose up db
```
Then ensure your `.env` file points to the Docker container's database settings.
