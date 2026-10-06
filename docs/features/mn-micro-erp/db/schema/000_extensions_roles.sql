-- =============================================================================
-- 000_extensions_roles.sql
-- Extensions, group roles and module schemas.
--
-- MUST run as a bootstrap superuser (or a role with CREATEROLE + extension rights),
-- because it creates cluster-wide roles and extensions. All later files run as
-- `SET ROLE app_owner`, so every object is owned by app_owner (FORCE RLS applies to it).
--
-- Role model (DECISIONS D-B3, 02-architecture.md section 7.5):
--   app_owner       NOLOGIN, NOBYPASSRLS. Owns every schema/object. Migrator logins are members.
--   app_user        NOLOGIN, NOBYPASSRLS. DML on business tables; ledgers/posted docs SELECT + INSERT only.
--   app_readonly    NOLOGIN, NOBYPASSRLS. SELECT only (support, BI, report replicas). Still subject to RLS.
--   app_worker      NOLOGIN, NOBYPASSRLS. Member of app_user + writes to global reference data
--                   (Mongolbank rates, eBarimt code caches, PosAPI instance status).
--   app_rls_bypass  NOLOGIN, BYPASSRLS. Owns ONLY the cross-tenant SECURITY DEFINER functions
--                   (outbox claim, active-company list). Nobody logs in as it.
-- Login roles of 18-dev-setup.md (erp_migrator, erp_app, erp_worker, erp_ops_ro) are mapped onto these
-- group roles below when they exist; production login roles are created by ops.
-- =============================================================================
\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- digest() for dimension-set hashes and request hashes
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- EXCLUDE constraints: no overlapping periods / rate validity

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_owner') THEN
        CREATE ROLE app_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_readonly') THEN
        CREATE ROLE app_readonly NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker') THEN
        CREATE ROLE app_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls_bypass') THEN
        CREATE ROLE app_rls_bypass NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
    END IF;
END
$$;

-- app_owner may hand function ownership to app_rls_bypass (ALTER FUNCTION ... OWNER TO).
-- Role attributes (BYPASSRLS) are never inherited through membership.
GRANT app_rls_bypass TO app_owner;
GRANT app_user TO app_worker;

-- Optional mapping of the local/CI login roles (starter/db/init/01-roles.sql).
DO $$
DECLARE
    m record;
BEGIN
    FOR m IN SELECT * FROM (VALUES ('erp_owner', 'app_owner'), ('erp_migrator', 'app_owner'),
                                   ('erp_app', 'app_user'), ('erp_worker', 'app_worker'),
                                   ('erp_ops_ro', 'app_readonly')) AS v(login_role, group_role)
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = m.login_role) THEN
            EXECUTE format('GRANT %I TO %I', m.group_role, m.login_role);
        END IF;
    END LOOP;
END
$$;

-- Database-level hardening.
DO $$
BEGIN
    EXECUTE format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database());
    EXECUTE format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO app_owner, app_user, app_readonly', current_database());
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END
$$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Module schemas (DECISIONS D-B3). One schema per module of the modular monolith.
CREATE SCHEMA IF NOT EXISTS platform    AUTHORIZATION app_owner;  -- tenants, companies, users, permissions, numbering
CREATE SCHEMA IF NOT EXISTS gl          AUTHORIZATION app_owner;  -- general ledger, journals, periods, dimensions
CREATE SCHEMA IF NOT EXISTS tax         AUTHORIZATION app_owner;  -- VAT, city tax, statutory parameters
CREATE SCHEMA IF NOT EXISTS party       AUTHORIZATION app_owner;  -- customers, vendors, posting groups, terms
CREATE SCHEMA IF NOT EXISTS sales       AUTHORIZATION app_owner;  -- sales documents, receivables subledger
CREATE SCHEMA IF NOT EXISTS purchase    AUTHORIZATION app_owner;  -- purchase documents, payables subledger
CREATE SCHEMA IF NOT EXISTS bank        AUTHORIZATION app_owner;  -- bank/cash accounts, statements, reconciliation
CREATE SCHEMA IF NOT EXISTS fx          AUTHORIZATION app_owner;  -- currencies, exchange rates, revaluation (R2)
CREATE SCHEMA IF NOT EXISTS fa          AUTHORIZATION app_owner;  -- fixed assets (R2)
CREATE SCHEMA IF NOT EXISTS inv         AUTHORIZATION app_owner;  -- items, inventory ledgers (R2)
CREATE SCHEMA IF NOT EXISTS rpt         AUTHORIZATION app_owner;  -- financial report definitions, statement lines
CREATE SCHEMA IF NOT EXISTS ebarimt     AUTHORIZATION app_owner;  -- eBarimt PosAPI 3.0 anti-corruption layer
CREATE SCHEMA IF NOT EXISTS integration AUTHORIZATION app_owner;  -- outbox, inbox, idempotency, jobs
CREATE SCHEMA IF NOT EXISTS audit       AUTHORIZATION app_owner;  -- change log, posting log, navigation

DO $$
DECLARE
    s text;
BEGIN
    FOREACH s IN ARRAY ARRAY['platform','gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt',
                             'ebarimt','integration','audit']
    LOOP
        EXECUTE format('ALTER SCHEMA %I OWNER TO app_owner', s);
        EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC', s);
        EXECUTE format('GRANT USAGE ON SCHEMA %I TO app_user, app_readonly, app_rls_bypass', s);
    END LOOP;
END
$$;

-- app_rls_bypass needs CREATE on the schemas holding its functions so that ownership can be transferred.
GRANT CREATE ON SCHEMA integration, platform, audit TO app_rls_bypass;

-- Extensions live in public; the app roles call digest()/gen_random_uuid() from there.
GRANT USAGE ON SCHEMA public TO app_owner, app_user, app_readonly, app_rls_bypass;
