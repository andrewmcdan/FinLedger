# FinLedger
FinLedger is a web-based accounting and financial management system with role-based access, full general-ledger workflow, and reporting, built as a semester-long team project for our Application Domain class at KSU.

## Requirements
- Node.js with npm
- PostgreSQL (or Docker)

## Environment
Copy `.env.example` to `.env` and adjust values as needed.

```bash
cp .env.example .env
```

Current variables used by local and Docker setups:
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`
- `PORT`
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`

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

## Notes
- The backend currently serves a placeholder response at `/`. The frontend shell lives in `public/` and can be wired up with `express.static` when ready.
