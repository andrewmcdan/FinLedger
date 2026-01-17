# docker/app

Dockerfile and supporting files for the Node.js application container.

## entrypoint.sh
Entrypoint script that runs the init-db.js script to initialize the database before starting the application. It retries the initialization multiple times if it fails, based on the configuration in the environment variables DB_INIT_MAX_ATTEMPTS and DB_INIT_SLEEP_SECONDS.