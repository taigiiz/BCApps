-- =============================================================================
-- tests/catalog_checks.sql - structural conventions of the schema (run after apply).
-- Every query must return zero rows; the final DO block raises if any check fails.
-- =============================================================================
\set ON_ERROR_STOP on

CREATE TEMP VIEW chk_fk_without_index AS
SELECT format('%s -> %s (%s)', c.conrelid::regclass, c.confrelid::regclass,
              (SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum)) AS problem
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = (SELECT relnamespace FROM pg_class WHERE oid = c.conrelid)
 WHERE c.contype = 'f'
   AND n.nspname IN ('platform','gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt','ebarimt','integration','audit')
   -- exemptions: tenant consistency FK to platform.company; FKs into global catalogs (no tenant_id column)
   AND c.confrelid <> 'platform.company'::regclass
   AND EXISTS (SELECT 1 FROM pg_attribute ta WHERE ta.attrelid = c.confrelid AND ta.attname = 'tenant_id' AND NOT ta.attisdropped)
   AND NOT EXISTS (
        SELECT 1 FROM pg_index i
         WHERE i.indrelid = c.conrelid
           AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
           AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] <@ c.conkey);

CREATE TEMP VIEW chk_table_without_comment AS
SELECT format('%I.%I', n.nspname, c.relname) AS problem
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('r','p','v')
   AND n.nspname IN ('platform','gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt','ebarimt','integration','audit')
   AND obj_description(c.oid, 'pg_class') IS NULL;

CREATE TEMP VIEW chk_row_version_columns AS
SELECT format('%I.%I lacks updated_at/updated_by', table_schema, table_name) AS problem
  FROM information_schema.columns rv
 WHERE rv.column_name = 'row_version'
   AND rv.table_schema IN ('platform','gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt','ebarimt','integration','audit')
   AND (SELECT count(*) FROM information_schema.columns x
         WHERE x.table_schema = rv.table_schema AND x.table_name = rv.table_name
           AND x.column_name IN ('updated_at','updated_by')) < 2;

CREATE TEMP VIEW chk_company_table_conventions AS
SELECT format('%I.%I: %s', t.table_schema, t.table_name, m.missing) AS problem
  FROM information_schema.tables t
  CROSS JOIN LATERAL (
       SELECT string_agg(req, ',') AS missing
         FROM unnest(ARRAY['tenant_id','created_at']) req
        WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
                           WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.column_name = req)) m
 WHERE t.table_type = 'BASE TABLE' AND m.missing IS NOT NULL
   AND t.table_schema IN ('gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt','ebarimt')
   AND EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.column_name = 'company_id');

CREATE TEMP VIEW chk_float_columns AS
SELECT format('%I.%I.%I is %s', table_schema, table_name, column_name, data_type) AS problem
  FROM information_schema.columns
 WHERE data_type IN ('real','double precision','money')
   AND table_schema IN ('platform','gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt','ebarimt','integration','audit');

CREATE TEMP VIEW chk_uuid_pk AS
SELECT format('%I.%I', n.nspname, c.relname) AS problem
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind = 'r'
   AND n.nspname IN ('gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt','ebarimt')
   AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id')
   AND NOT EXISTS (SELECT 1 FROM pg_constraint p JOIN pg_attribute a ON a.attrelid = p.conrelid AND a.attnum = p.conkey[1]
                    WHERE p.conrelid = c.oid AND p.contype = 'p' AND cardinality(p.conkey) = 1
                      AND a.attname = 'id' AND a.atttypid = 'uuid'::regtype);

SELECT 'fk_without_index' AS check_name, problem FROM chk_fk_without_index
UNION ALL SELECT 'table_without_comment', problem FROM chk_table_without_comment
UNION ALL SELECT 'row_version_columns', problem FROM chk_row_version_columns
UNION ALL SELECT 'company_table_conventions', problem FROM chk_company_table_conventions
UNION ALL SELECT 'float_columns', problem FROM chk_float_columns
UNION ALL SELECT 'uuid_pk', problem FROM chk_uuid_pk;

SELECT n.nspname AS schema, count(*) AS tables
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind = 'r'
   AND n.nspname IN ('platform','gl','tax','party','sales','purchase','bank','fx','fa','inv','rpt','ebarimt','integration','audit')
 GROUP BY ROLLUP (n.nspname) ORDER BY n.nspname NULLS LAST;

DO $$
DECLARE
    v integer;
BEGIN
    SELECT (SELECT count(*) FROM chk_fk_without_index) + (SELECT count(*) FROM chk_table_without_comment)
         + (SELECT count(*) FROM chk_row_version_columns) + (SELECT count(*) FROM chk_company_table_conventions)
         + (SELECT count(*) FROM chk_float_columns) + (SELECT count(*) FROM chk_uuid_pk)
      INTO v;
    IF v > 0 THEN
        RAISE EXCEPTION 'catalog checks failed: % problem(s)', v;
    END IF;
    RAISE NOTICE 'catalog checks passed';
END
$$;
