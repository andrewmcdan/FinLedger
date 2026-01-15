# FinLedger
FinLedger is a web-based accounting and financial management system with role-based access, full general-ledger workflow, and reporting, built as a semester-long team project for our Application Domain class at KSU.

# Setup
This project uses Node.js and requires that it be installed including NPM. 

It also uses PostgreSQL for the database, so if you are not using the docker version, you'll need to configure the .env file with your database credentials.

```bash
npm install

npm run dev
```

### Or With Docker

This will start the application and the PostgreSQL database using Docker.

```bash
docker-compose up --build
```

Then access at http://localhost:${PORT}  (port default is 3050).