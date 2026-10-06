-- =============================================================================
-- db/init/01-roles.sql  -  LOCAL DEVELOPMENT AND CI ONLY
-- =============================================================================
-- Executed once by the postgres image (/docker-entrypoint-initdb.d) when the data
-- volume is empty, and by CI before migrations. Runs as the bootstrap superuser.
--
-- Production roles are created by ops with secrets from the secret store
-- (see 18-dev-setup.md section 7.3). The passwords below are NOT secrets: they only
-- work on a developer laptop / ephemeral CI container.
--
-- Role model (02-architecture.md section 7.5; forced RLS, non-owner app roles):
--   erp_owner             NOLOGIN  owns every schema/object; Erp.Migrator does SET ROLE erp_owner.
--                                  NOBYPASSRLS on purpose: FORCE RLS must apply to the owner too
--                                  (migrations, seeds and purges set app.tenant_id per tenant).
--   erp_migrator          LOGIN    member of erp_owner; used only by Erp.Migrator (DDL, seeds)
--   erp_app               LOGIN    Erp.Api: NOT owner, NO BYPASSRLS, no DDL
--   erp_worker            LOGIN    Erp.Worker: like erp_app + job tables / reference-data writes
--   erp_dispatch_definer  NOLOGIN  owner of the SECURITY DEFINER outbox-claim / company-list functions;
--                                  the ONLY role with BYPASSRLS (checked by `Erp.Migrator verify`)
--   erp_ops_ro            LOGIN    support: read-only ops.* views (no PII), still subject to RLS
--   (erp_backup for pgBackRest exists in staging/production only)
-- Grants on schemas/tables are made by migrations (core.fn_apply_tenant_rls, core.fn_make_append_only).
-- =============================================================================

\set ON_ERROR_STOP on

CREATE ROLE erp_owner            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE erp_migrator         LOGIN   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
    PASSWORD 'erp_migrator_local' IN ROLE erp_owner;
CREATE ROLE erp_app              LOGIN   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
    PASSWORD 'erp_app_local' CONNECTION LIMIT 200;
CREATE ROLE erp_worker           LOGIN   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
    PASSWORD 'erp_worker_local' CONNECTION LIMIT 50;
CREATE ROLE erp_dispatch_definer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
CREATE ROLE erp_ops_ro           LOGIN   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
    PASSWORD 'erp_ops_ro_local' CONNECTION LIMIT 10;

-- Main local database and a second one for running golden/integration tests against an existing server.
-- Default collation is code-point order (C.UTF-8): stable across OS/glibc upgrades, so indexes never need
-- rebuilding. Mongolian alphabetical sorting is done explicitly: ORDER BY name COLLATE "mn-x-icu".
CREATE DATABASE erp      OWNER erp_owner ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0;
CREATE DATABASE erp_test OWNER erp_owner ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0;

ALTER DATABASE erp      SET timezone TO 'UTC';
ALTER DATABASE erp_test SET timezone TO 'UTC';

-- Database-level hardening; schema-level grants and default privileges come from db/migrations.
\connect erp
REVOKE ALL ON DATABASE erp FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE erp TO erp_app, erp_worker, erp_ops_ro;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

\connect erp_test
REVOKE ALL ON DATABASE erp_test FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE erp_test TO erp_app, erp_worker, erp_ops_ro;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
