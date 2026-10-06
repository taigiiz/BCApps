-- =============================================================================
-- 110_inv.sql
-- Items and inventory (v1: service / non-inventory items only; R2: one location,
-- perpetual moving weighted average, no negative stock - D-G5).
-- BC tables 204, 27, 5404, 94, 5813, 14, 313, 32, 5802, 339, 5823.
-- =============================================================================
\set ON_ERROR_STOP on
SET ROLE app_owner;

CREATE TABLE inv.unit_of_measure (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             uuid NOT NULL,
    company_id            uuid NOT NULL,
    code                  platform.code20 NOT NULL,        -- PCS, KG, L, HOUR
    description           text NOT NULL,
    ebarimt_measure_unit  text,                            -- measureUnit sent to eBarimt (e.g. "ш", "кг")
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid DEFAULT platform.current_user_id(),
    updated_at            timestamptz,
    updated_by            uuid,
    row_version           integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE inv.unit_of_measure IS 'Mirrors BC table 204 Unit of Measure (+ eBarimt measureUnit text).';

CREATE TABLE inv.inventory_posting_group (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL,
    company_id   uuid NOT NULL,
    code         platform.code20 NOT NULL,                -- GOODS, MATERIALS, FINISHED
    description  text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
COMMENT ON TABLE inv.inventory_posting_group IS 'Mirrors BC table 94 Inventory Posting Group.';

CREATE TABLE inv.location (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL,
    company_id   uuid NOT NULL,
    code         platform.code20 NOT NULL,
    name         text NOT NULL,
    address      text,
    is_default   boolean NOT NULL DEFAULT true,
    blocked      boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    created_by   uuid DEFAULT platform.current_user_id(),
    updated_at   timestamptz,
    updated_by   uuid,
    row_version  integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    UNIQUE (company_id, code),
    UNIQUE (company_id, id)
);
CREATE UNIQUE INDEX ux_location__default ON inv.location (company_id) WHERE is_default;
COMMENT ON TABLE inv.location IS 'Mirrors BC table 14 Location. R2: a single default location per company (multi-warehouse is R3).';

CREATE TABLE inv.inventory_posting_setup (
    id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                     uuid NOT NULL,
    company_id                    uuid NOT NULL,
    location_id                   uuid,                       -- NULL = any location
    inventory_posting_group_id    uuid NOT NULL,
    inventory_account_id          uuid NOT NULL,
    inventory_account_interim_id  uuid,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid DEFAULT platform.current_user_id(),
    updated_at                    timestamptz,
    updated_by                    uuid,
    row_version                   integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, location_id) REFERENCES inv.location (company_id, id),
    FOREIGN KEY (company_id, inventory_posting_group_id) REFERENCES inv.inventory_posting_group (company_id, id),
    FOREIGN KEY (company_id, inventory_account_id) REFERENCES gl.gl_account (company_id, id),
    FOREIGN KEY (company_id, inventory_account_interim_id) REFERENCES gl.gl_account (company_id, id),
    UNIQUE NULLS NOT DISTINCT (company_id, location_id, inventory_posting_group_id)
);
CREATE INDEX ix_inventory_posting_setup__group ON inv.inventory_posting_setup (company_id, inventory_posting_group_id);
CREATE INDEX ix_inventory_posting_setup__inv_acc ON inv.inventory_posting_setup (company_id, inventory_account_id);
CREATE INDEX ix_inventory_posting_setup__interim ON inv.inventory_posting_setup (company_id, inventory_account_interim_id);
COMMENT ON TABLE inv.inventory_posting_setup IS 'Mirrors BC table 5813 Inventory Posting Setup (location x inventory posting group -> inventory account).';

CREATE TABLE inv.inventory_setup (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL,
    company_id                  uuid NOT NULL,
    inventory_enabled           boolean NOT NULL DEFAULT false,      -- false in R1 (service / non-inventory only)
    default_costing_method      text NOT NULL DEFAULT 'AVERAGE' CHECK (default_costing_method IN ('AVERAGE','FIFO')),
    prevent_negative_inventory  boolean NOT NULL DEFAULT true,
    automatic_cost_posting      boolean NOT NULL DEFAULT true CHECK (automatic_cost_posting),
    item_nos_id                 uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid DEFAULT platform.current_user_id(),
    updated_at                  timestamptz,
    updated_by                  uuid,
    row_version                 integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, item_nos_id) REFERENCES platform.number_series (company_id, id),
    UNIQUE (company_id)
);
CREATE INDEX ix_inventory_setup__item_nos ON inv.inventory_setup (company_id, item_nos_id);
COMMENT ON TABLE inv.inventory_setup IS 'Mirrors BC table 313 Inventory Setup (costing switches; automatic cost posting always on).';

CREATE TABLE inv.item (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL,
    company_id                  uuid NOT NULL,
    no                          platform.code20 NOT NULL,
    description                 text NOT NULL CHECK (char_length(description) <= 200),
    description_en              text,
    search_description          text,
    item_type                   text NOT NULL DEFAULT 'SERVICE' CHECK (item_type IN ('INVENTORY','SERVICE','NON_INVENTORY')),
    base_unit_of_measure_id     uuid NOT NULL,
    costing_method              text NOT NULL DEFAULT 'AVERAGE' CHECK (costing_method IN ('AVERAGE','FIFO')),
    unit_price                  platform.unit_amount NOT NULL DEFAULT 0,
    price_includes_vat          boolean NOT NULL DEFAULT false,
    unit_cost                   platform.unit_amount NOT NULL DEFAULT 0,
    last_direct_cost            platform.unit_amount NOT NULL DEFAULT 0,
    classification_code         text CHECK (classification_code ~ '^[0-9]{7}$'),   -- БҮНА (eBarimt, exactly 7 digits)
    barcode                     text CHECK (char_length(barcode) <= 50),
    barcode_type                text NOT NULL DEFAULT 'UNDEFINED' CHECK (barcode_type IN ('GS1','ISBN','UNDEFINED')),
    tax_product_code            text,                                             -- eBarimt taxProductCode (VAT_FREE/ZERO/NOT_VAT)
    inventory_posting_group_id  uuid,
    gen_prod_posting_group_id   uuid NOT NULL,
    vat_prod_posting_group_id   uuid NOT NULL,
    city_tax_code_id            uuid,
    prevent_negative_inventory  text NOT NULL DEFAULT 'DEFAULT' CHECK (prevent_negative_inventory IN ('DEFAULT','NO','YES')),
    blocked                     boolean NOT NULL DEFAULT false,
    sales_blocked               boolean NOT NULL DEFAULT false,
    purchasing_blocked          boolean NOT NULL DEFAULT false,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid DEFAULT platform.current_user_id(),
    updated_at                  timestamptz,
    updated_by                  uuid,
    row_version                 integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, base_unit_of_measure_id) REFERENCES inv.unit_of_measure (company_id, id),
    FOREIGN KEY (company_id, inventory_posting_group_id) REFERENCES inv.inventory_posting_group (company_id, id),
    FOREIGN KEY (company_id, gen_prod_posting_group_id) REFERENCES party.gen_prod_posting_group (company_id, id),
    FOREIGN KEY (company_id, vat_prod_posting_group_id) REFERENCES tax.vat_prod_posting_group (company_id, id),
    FOREIGN KEY (company_id, city_tax_code_id) REFERENCES tax.city_tax_code (company_id, id),
    UNIQUE (company_id, no),
    UNIQUE (company_id, id),
    CHECK ((item_type = 'INVENTORY') = (inventory_posting_group_id IS NOT NULL))
);
CREATE INDEX ix_item__search ON inv.item (company_id, search_description);
CREATE INDEX ix_item__barcode ON inv.item (company_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX ix_item__uom ON inv.item (company_id, base_unit_of_measure_id);
CREATE INDEX ix_item__inv_group ON inv.item (company_id, inventory_posting_group_id);
CREATE INDEX ix_item__gen_prod ON inv.item (company_id, gen_prod_posting_group_id);
CREATE INDEX ix_item__vat_prod ON inv.item (company_id, vat_prod_posting_group_id);
CREATE INDEX ix_item__city_tax ON inv.item (company_id, city_tax_code_id);
COMMENT ON TABLE inv.item IS 'Mirrors BC table 27 Item (types INVENTORY / SERVICE / NON_INVENTORY; costing AVERAGE or FIFO; eBarimt classification and tax product codes).';

CREATE TABLE inv.item_unit_of_measure (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL,
    company_id           uuid NOT NULL,
    item_id              uuid NOT NULL,
    unit_of_measure_id   uuid NOT NULL,
    qty_per_unit_of_measure platform.quantity NOT NULL DEFAULT 1 CHECK (qty_per_unit_of_measure > 0),
    barcode              text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid DEFAULT platform.current_user_id(),
    updated_at           timestamptz,
    updated_by           uuid,
    row_version          integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, item_id) REFERENCES inv.item (company_id, id) ON DELETE CASCADE,
    FOREIGN KEY (company_id, unit_of_measure_id) REFERENCES inv.unit_of_measure (company_id, id),
    UNIQUE (company_id, item_id, unit_of_measure_id)
);
CREATE INDEX ix_item_unit_of_measure__uom ON inv.item_unit_of_measure (company_id, unit_of_measure_id);
COMMENT ON TABLE inv.item_unit_of_measure IS 'Mirrors BC table 5404 Item Unit of Measure (conversion to the base unit).';

-- -----------------------------------------------------------------------------
-- Inventory ledgers (append-only)
-- -----------------------------------------------------------------------------
CREATE TABLE inv.item_ledger_entry (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL,
    company_id               uuid NOT NULL,
    entry_no                 bigint NOT NULL CHECK (entry_no > 0),
    item_id                  uuid NOT NULL,
    location_id              uuid,
    posting_date             date NOT NULL,
    entry_type               text NOT NULL CHECK (entry_type IN ('PURCHASE','SALE','POSITIVE_ADJMT','NEGATIVE_ADJMT','TRANSFER')),
    document_type            text NOT NULL CHECK (document_type IN ('NONE','SALES_INVOICE','SALES_CREDIT_MEMO','PURCHASE_INVOICE',
                                                                    'PURCHASE_CREDIT_MEMO','INVENTORY_ADJUSTMENT','OPENING')),
    document_no              platform.document_no NOT NULL,
    document_line_no         integer,
    description              text,
    quantity                 platform.quantity NOT NULL CHECK (quantity <> 0),     -- base UoM, signed (inbound > 0)
    remaining_quantity       platform.quantity NOT NULL,                            -- whitelisted (application)
    invoiced_quantity        platform.quantity NOT NULL,
    unit_of_measure_code     platform.code20,
    qty_per_unit_of_measure  platform.quantity NOT NULL DEFAULT 1,
    open                     boolean NOT NULL,                                      -- whitelisted
    positive                 boolean NOT NULL,
    applies_to_entry         bigint,
    source_type              platform.source_type NOT NULL DEFAULT 'NONE',
    source_id                uuid,
    transaction_no           bigint,
    dimension_set_id         bigint NOT NULL DEFAULT 0,
    global_dim_1_value_id    uuid,
    global_dim_2_value_id    uuid,
    source_code              platform.code20 NOT NULL REFERENCES platform.source_code (code),
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, item_id) REFERENCES inv.item (company_id, id),
    FOREIGN KEY (company_id, location_id) REFERENCES inv.location (company_id, id),
    FOREIGN KEY (company_id, applies_to_entry) REFERENCES inv.item_ledger_entry (company_id, entry_no),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    UNIQUE (company_id, entry_no),
    UNIQUE (company_id, id),
    CHECK (positive = (quantity > 0)),
    CHECK ((positive AND remaining_quantity BETWEEN 0 AND quantity) OR (NOT positive AND remaining_quantity BETWEEN quantity AND 0))
);
CREATE INDEX ix_item_ledger_entry__item_date ON inv.item_ledger_entry (company_id, item_id, posting_date) INCLUDE (quantity);
CREATE INDEX ix_item_ledger_entry__open ON inv.item_ledger_entry (company_id, item_id, location_id, posting_date, entry_no) WHERE open;
CREATE INDEX ix_item_ledger_entry__location ON inv.item_ledger_entry (company_id, location_id);
CREATE INDEX ix_item_ledger_entry__applies_to ON inv.item_ledger_entry (company_id, applies_to_entry) WHERE applies_to_entry IS NOT NULL;
CREATE INDEX ix_item_ledger_entry__document ON inv.item_ledger_entry (company_id, document_no, posting_date);
CREATE INDEX ix_item_ledger_entry__transaction ON inv.item_ledger_entry (company_id, transaction_no);
CREATE INDEX ix_item_ledger_entry__dimension_set ON inv.item_ledger_entry (company_id, dimension_set_id);
COMMENT ON TABLE inv.item_ledger_entry IS 'Mirrors BC table 32 Item Ledger Entry (quantity ledger). Append-only except remaining_quantity/open.';

CREATE TABLE inv.value_entry (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   uuid NOT NULL,
    company_id                  uuid NOT NULL,
    entry_no                    bigint NOT NULL CHECK (entry_no > 0),
    item_ledger_entry_no        bigint NOT NULL,
    item_ledger_entry_type      text NOT NULL CHECK (item_ledger_entry_type IN ('PURCHASE','SALE','POSITIVE_ADJMT','NEGATIVE_ADJMT','TRANSFER')),
    entry_type                  text NOT NULL DEFAULT 'DIRECT_COST' CHECK (entry_type IN ('DIRECT_COST','REVALUATION','ROUNDING')),
    item_id                     uuid NOT NULL,
    location_id                 uuid,
    posting_date                date NOT NULL,
    valuation_date              date NOT NULL,
    document_type               text NOT NULL CHECK (document_type IN ('NONE','SALES_INVOICE','SALES_CREDIT_MEMO','PURCHASE_INVOICE',
                                                                    'PURCHASE_CREDIT_MEMO','INVENTORY_ADJUSTMENT','OPENING')),
    document_no                 platform.document_no NOT NULL,
    document_line_no            integer,
    valued_quantity             platform.quantity NOT NULL,
    item_ledger_entry_quantity  platform.quantity NOT NULL,
    invoiced_quantity           platform.quantity NOT NULL,
    cost_per_unit               platform.unit_amount NOT NULL,
    cost_amount_actual          platform.amount NOT NULL,
    cost_amount_expected        platform.amount NOT NULL DEFAULT 0 CHECK (cost_amount_expected = 0),   -- no expected cost (receipt = invoice)
    cost_amount_non_invtbl      platform.amount NOT NULL DEFAULT 0,
    cost_posted_to_gl           platform.amount NOT NULL DEFAULT 0,       -- whitelisted (recost job posts deltas)
    sales_amount_actual         platform.amount NOT NULL DEFAULT 0,
    purchase_amount_actual      platform.amount NOT NULL DEFAULT 0,
    discount_amount             platform.amount NOT NULL DEFAULT 0,
    adjustment                  boolean NOT NULL DEFAULT false,
    valued_by_average_cost      boolean NOT NULL DEFAULT false,
    applies_to_entry            bigint,
    gen_bus_posting_group       platform.code20,
    gen_prod_posting_group      platform.code20,
    inventory_posting_group     platform.code20,
    source_type                 platform.source_type NOT NULL DEFAULT 'NONE',
    source_id                   uuid,
    transaction_no              bigint,
    dimension_set_id            bigint NOT NULL DEFAULT 0,
    source_code                 platform.code20 NOT NULL REFERENCES platform.source_code (code),
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, item_ledger_entry_no) REFERENCES inv.item_ledger_entry (company_id, entry_no),
    FOREIGN KEY (company_id, item_id) REFERENCES inv.item (company_id, id),
    FOREIGN KEY (company_id, location_id) REFERENCES inv.location (company_id, id),
    FOREIGN KEY (company_id, applies_to_entry) REFERENCES inv.value_entry (company_id, entry_no),
    FOREIGN KEY (company_id, transaction_no) REFERENCES gl.gl_transaction (company_id, transaction_no),
    FOREIGN KEY (company_id, dimension_set_id) REFERENCES gl.dimension_set (company_id, dimension_set_id),
    UNIQUE (company_id, entry_no),
    UNIQUE (company_id, id)
);
CREATE INDEX ix_value_entry__ile ON inv.value_entry (company_id, item_ledger_entry_no);
CREATE INDEX ix_value_entry__item_date ON inv.value_entry (company_id, item_id, valuation_date) INCLUDE (cost_amount_actual, valued_quantity);
CREATE INDEX ix_value_entry__location ON inv.value_entry (company_id, location_id);
CREATE INDEX ix_value_entry__applies_to ON inv.value_entry (company_id, applies_to_entry) WHERE applies_to_entry IS NOT NULL;
CREATE INDEX ix_value_entry__transaction ON inv.value_entry (company_id, transaction_no);
CREATE INDEX ix_value_entry__dimension_set ON inv.value_entry (company_id, dimension_set_id);
CREATE INDEX ix_value_entry__not_posted ON inv.value_entry (company_id, posting_date) WHERE cost_posted_to_gl <> cost_amount_actual;
COMMENT ON TABLE inv.value_entry IS 'Mirrors BC table 5802 Value Entry (cost and sales value ledger). Append-only except cost_posted_to_gl.';

CREATE TABLE inv.item_application_entry (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL,
    company_id                 uuid NOT NULL,
    entry_no                   bigint NOT NULL CHECK (entry_no > 0),
    item_ledger_entry_no       bigint NOT NULL,
    inbound_item_entry_no      bigint NOT NULL,
    outbound_item_entry_no     bigint,
    quantity                   platform.quantity NOT NULL,
    posting_date               date NOT NULL,
    cost_application           boolean NOT NULL DEFAULT true,
    outbound_entry_is_updated  boolean NOT NULL DEFAULT false,           -- whitelisted
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid DEFAULT platform.current_user_id(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, item_ledger_entry_no) REFERENCES inv.item_ledger_entry (company_id, entry_no),
    FOREIGN KEY (company_id, inbound_item_entry_no) REFERENCES inv.item_ledger_entry (company_id, entry_no),
    FOREIGN KEY (company_id, outbound_item_entry_no) REFERENCES inv.item_ledger_entry (company_id, entry_no),
    UNIQUE (company_id, entry_no)
);
CREATE INDEX ix_item_application_entry__ile ON inv.item_application_entry (company_id, item_ledger_entry_no);
CREATE INDEX ix_item_application_entry__inbound ON inv.item_application_entry (company_id, inbound_item_entry_no);
CREATE INDEX ix_item_application_entry__outbound ON inv.item_application_entry (company_id, outbound_item_entry_no) WHERE outbound_item_entry_no IS NOT NULL;
COMMENT ON TABLE inv.item_application_entry IS 'Mirrors BC table 339 Item Application Entry (which inbound supplied which outbound). Append-only.';

CREATE TABLE inv.gl_item_ledger_relation (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL,
    company_id       uuid NOT NULL,
    gl_entry_no      bigint NOT NULL,
    value_entry_no   bigint NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, gl_entry_no) REFERENCES gl.gl_entry (company_id, entry_no),
    FOREIGN KEY (company_id, value_entry_no) REFERENCES inv.value_entry (company_id, entry_no),
    UNIQUE (company_id, gl_entry_no, value_entry_no)
);
CREATE INDEX ix_gl_item_ledger_relation__value ON inv.gl_item_ledger_relation (company_id, value_entry_no);
COMMENT ON TABLE inv.gl_item_ledger_relation IS 'Mirrors BC table 5823 G/L - Item Ledger Relation (value entry <-> G/L entry). Append-only.';

CREATE TABLE inv.item_cost_state (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id              uuid NOT NULL,
    company_id             uuid NOT NULL,
    item_id                uuid NOT NULL,
    location_id            uuid,
    quantity_on_hand       platform.quantity NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    value_on_hand          platform.amount NOT NULL DEFAULT 0,
    average_unit_cost      platform.unit_amount NOT NULL DEFAULT 0,
    last_item_ledger_entry_no bigint,
    last_posting_date      date,
    needs_recost           boolean NOT NULL DEFAULT false,
    recost_from_date       date,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    updated_by             uuid,
    row_version            integer NOT NULL DEFAULT 1,
    FOREIGN KEY (tenant_id, company_id) REFERENCES platform.company (tenant_id, id),
    FOREIGN KEY (company_id, item_id) REFERENCES inv.item (company_id, id),
    FOREIGN KEY (company_id, location_id) REFERENCES inv.location (company_id, id),
    UNIQUE NULLS NOT DISTINCT (company_id, item_id, location_id),
    CHECK (quantity_on_hand > 0 OR value_on_hand = 0)
);
CREATE INDEX ix_item_cost_state__location ON inv.item_cost_state (company_id, location_id);
COMMENT ON TABLE inv.item_cost_state IS 'Running moving-average state per item (qty, value) updated in the posting transaction; replaces BC Avg. Cost Adjmt. Entry Point (T5804) + Adjust Cost batch. Projection: rebuildable from value_entry.';

-- Foreign keys from earlier files
ALTER TABLE sales.sales_line
    ADD FOREIGN KEY (company_id, item_id) REFERENCES inv.item (company_id, id),
    ADD FOREIGN KEY (company_id, location_id) REFERENCES inv.location (company_id, id);
ALTER TABLE sales.sales_invoice_line ADD FOREIGN KEY (company_id, item_id) REFERENCES inv.item (company_id, id);
ALTER TABLE sales.sales_cr_memo_line ADD FOREIGN KEY (company_id, item_id) REFERENCES inv.item (company_id, id);
ALTER TABLE purchase.purchase_line
    ADD FOREIGN KEY (company_id, item_id) REFERENCES inv.item (company_id, id),
    ADD FOREIGN KEY (company_id, location_id) REFERENCES inv.location (company_id, id);
ALTER TABLE purchase.purch_inv_line ADD FOREIGN KEY (company_id, item_id) REFERENCES inv.item (company_id, id);
ALTER TABLE purchase.purch_cr_memo_line ADD FOREIGN KEY (company_id, item_id) REFERENCES inv.item (company_id, id);
