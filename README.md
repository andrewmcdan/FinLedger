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
npm run start
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
npm run dev
```

Running the "dev" script will trigger `db-init` first to ensure the database is set up.

If you want to use the postgresql database in a Docker container during development, run:

```bash
docker compose up db
```
Then ensure your `.env` file points to the Docker container's database settings.

## Attribution

- Built with [Express.js](https://expressjs.com/)
- Database with [PostgreSQL](https://www.postgresql.org/)

Other package licenses can be found in [attribution.md](attribution.md). Full license information is in [licenses.txt](licenses.txt).

The attribution.md file is generated using [script/format_license_info.py](script/format_license_info.py). The script depends on the output of nlf (https://www.npmjs.com/package/nlf) which can be installed via npm:

```bash
npm install -g nlf
```

and run with 

```bash
python3 ./scripts/format_license_info.py licenses.txt -o attribution.md --project "FinLedger"
```

## License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.