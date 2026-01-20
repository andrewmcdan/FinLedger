# FinLedger
[![Tests](https://github.com/andrewmcdan/FinLedger/actions/workflows/tests.yml/badge.svg)](https://github.com/andrewmcdan/FinLedger/actions/workflows/tests.yml)

FinLedger is a web-based accounting and financial management system with role-based access, full general-ledger workflow, and reporting, built as a semester-long team project for our Application Domain class at KSU.

## Requirements
- Node.js with npm
- PostgreSQL (or Docker)

## Environment
Copy `.env.example` to `.env` and adjust values as needed.

```bash
cp .env.example .env
```

## Run locally (without Docker)
Make sure PostgreSQL is running with credentials matching `.env`, then:

```bash
npm install
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
