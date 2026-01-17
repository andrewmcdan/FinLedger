# docker/postgres

PostgreSQL container config and init scripts for local/dev deployments.

SQL files in this folder are executed in filename order by `scripts/init-db.js`.
Template placeholders like `{{ADMIN_USERNAME}}` are replaced using environment variables.
