-- =============================================================================
-- db/init/01-roles.sql  -  LOCAL DEVELOPMENT AND CI ONLY
-- =============================================================================
-- Executed once by the postgres image (/docker-entrypoint-initdb.d) when the data
-- volume is empty, and by CI before migrations. Runs as the bootstrap superuser.
-- Next step: Erp.Migrator `migrate` applies the canonical db/schema/*.sql in name order. Its FIRST run applies
-- 000_extensions_roles.sql (group roles, extensions, module schemas) and therefore connects as the bootstrap
-- superuser (postgres); later runs connect as erp_migrator (18-dev-setup.md section 3.3, ADR-0014).
--
-- Production roles are created by ops with secrets from the secret store
-- (see 18-dev-setup.md section 7.3). The passwords below are NOT secrets: they only
-- work on a developer laptop / ephemeral CI container.
--
-- Role model (canonical db/schema/000_extensions_roles.sql, 02-architecture.md section 7.5,
-- DECISIONS D-K6). Privileges live on NOLOGIN *group* roles created by the 000 file:
--   app_owner       owns every schema/object (every schema file runs SET ROLE app_owner), NOBYPASSRLS
--   app_user        DML on business tables, ledgers SELECT + INSERT only, NOBYPASSRLS
--   app_worker      app_user + writes to global reference data, NOBYPASSRLS
--   app_readonly    SELECT only (BI / report replica), NOBYPASSRLS
--   app_ops         only integration.fn_ops_health() (no business-table SELECT), NOBYPASSRLS
--   app_rls_bypass  BYPASSRLS, NOLOGIN; owns ONLY the cross-tenant SECURITY DEFINER functions
-- This file creates the *login* roles; the 000 file (first migrate) grants them their group role:
--   erp_owner     NOLOGIN  owner of the databases                    -> app_owner
--   erp_migrator  LOGIN    Erp.Migrator (SET ROLE app_owner)          -> app_owner
--   erp_app       LOGIN    Erp.Api                                    -> app_user
--   erp_worker    LOGIN    Erp.Worker                                 -> app_worker
--   erp_ops_ro    LOGIN    support / ops                              -> app_ops
--   (erp_backup for pgBackRest exists in staging/production only)
-- NO login role has BYPASSRLS; FORCE RLS applies to the owner too (migrations, seeds and
-- purges set app.tenant_id per tenant via platform.fn_set_context). `Erp.Migrator verify`
-- and the self-check at the end of 900_rls.sql enforce this.
-- =============================================================================

\set ON_ERROR_STOP on

CREATE ROLE erp_owner            NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE erp_migrator         LOGIN   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
    PASSWORD 'erp_migrator_local' IN ROLE erp_owner;
CREATE ROLE erp_app              LOGIN   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
    PASSWORD 'erp_app_local' CONNECTION LIMIT 200;
CREATE ROLE erp_worker           LOGIN   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
    PASSWORD 'erp_worker_local' CONNECTION LIMIT 50;
CREATE ROLE erp_ops_ro           LOGIN   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
    PASSWORD 'erp_ops_ro_local' CONNECTION LIMIT 10;

-- Main local database and a second one for running golden/integration tests against an existing server.
-- Default collation is code-point order (C.UTF-8): stable across OS/glibc upgrades, so indexes never need
-- rebuilding. Mongolian alphabetical sorting is done explicitly: ORDER BY name COLLATE "mn-x-icu".
CREATE DATABASE erp      OWNER erp_owner ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0;
CREATE DATABASE erp_test OWNER erp_owner ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0;

-- Database-level hardening (REVOKE ALL FROM PUBLIC, CONNECT for the app_* group roles, timezone UTC,
-- REVOKE CREATE ON SCHEMA public) is done by db/schema/000_extensions_roles.sql (first Erp.Migrator run).
\connect erp
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
