-- Vendors and vendor_products catalog tables
-- Generated from source SQL files for app initialization

-- ============================================================
-- TABLE 1: vendors
-- Pharmaceutical manufacturer vendor registry with contact
-- and contract information
-- ============================================================

CREATE TABLE vendors (
    vendor_id           VARCHAR(10)     PRIMARY KEY,          -- e.g. VND-0001
    company_name        VARCHAR(150)    NOT NULL,
    vendor_type         VARCHAR(80),                          -- e.g. API Supplier, Excipient Supplier
    qualification_status VARCHAR(30)    DEFAULT 'Qualified',  -- Qualified, Provisional, Under Review, Suspended

    -- Contact Information
    primary_contact_name    VARCHAR(100),
    primary_contact_title   VARCHAR(80),
    primary_contact_email   VARCHAR(150),
    primary_contact_phone   VARCHAR(30),
    secondary_contact_name  VARCHAR(100),
    secondary_contact_email VARCHAR(150),

    -- Address
    street_address      VARCHAR(200),
    city                VARCHAR(80),
    state_province      VARCHAR(80),
    postal_code         VARCHAR(20),
    country             VARCHAR(60),
    region              VARCHAR(40),                          -- Americas, Europe, APAC

    -- Regulatory & Quality
    duns_number         VARCHAR(20),
    gmp_certified       BOOLEAN         DEFAULT TRUE,
    gmp_certificate_expiry DATE,
    iso_certification   VARCHAR(60),                         -- e.g. ISO 9001:2015
    fda_registration_number VARCHAR(30),
    ema_registration_number VARCHAR(30),
    audit_last_date     DATE,
    audit_next_due_date DATE,
    audit_score         NUMERIC(4,1),                        -- 0.0 - 100.0

    -- Contract Information
    contract_id         VARCHAR(20)     UNIQUE,
    contract_start_date DATE,
    contract_end_date   DATE,
    contract_duration_years NUMERIC(3,1),
    contract_type       VARCHAR(50),                         -- Master Supply Agreement, Spot Purchase, Framework
    contract_value_usd  NUMERIC(15,2),
    annual_spend_usd    NUMERIC(15,2),
    payment_terms_days  INT,                                 -- Net 30, Net 60, etc.
    currency            VARCHAR(10)     DEFAULT 'USD',
    auto_renewal        BOOLEAN         DEFAULT FALSE,
    renewal_notice_days INT,
    incoterms           VARCHAR(20),                         -- EXW, FOB, CIF, DDP
    preferred_vendor    BOOLEAN         DEFAULT FALSE,
    sole_source         BOOLEAN         DEFAULT FALSE,

    -- Financial & Risk
    credit_limit_usd    NUMERIC(15,2),
    vendor_risk_rating  VARCHAR(20),                         -- Low, Medium, High, Critical
    insurance_expiry    DATE,
    liability_coverage_usd NUMERIC(15,2),

    -- Metadata
    onboarding_date     DATE,
    notes               TEXT,
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW()
);

-- Index for common lookups
CREATE INDEX idx_vendors_company_name    ON vendors (company_name);
CREATE INDEX idx_vendors_country         ON vendors (country);
CREATE INDEX idx_vendors_status          ON vendors (qualification_status);
CREATE INDEX idx_vendors_contract_end    ON vendors (contract_end_date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_vendors_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vendors_updated_at
BEFORE UPDATE ON vendors
FOR EACH ROW EXECUTE FUNCTION update_vendors_timestamp();


-- ============================================================
-- TABLE 2: vendor_products
-- Product/materials catalog linked to vendors via vendor_id
-- One vendor can supply 1–5 products; 427 seed rows across 150 vendors
-- Generated: 2026-03-31
-- ============================================================

CREATE TABLE IF NOT EXISTS vendor_products (
    product_id              VARCHAR(15)     PRIMARY KEY,       -- e.g. PRD-0001
    vendor_id               VARCHAR(10)     NOT NULL
        REFERENCES vendors(vendor_id) ON DELETE RESTRICT,

    -- Product Identification
    product_name            VARCHAR(200)    NOT NULL,
    catalog_number          VARCHAR(60),
    cas_number              VARCHAR(20),
    iupac_name              TEXT,
    product_type            VARCHAR(80),
    product_category        VARCHAR(80),
    pharmacopeia_grade      VARCHAR(60),
    purity_percent          NUMERIC(5,2),
    molecular_formula       VARCHAR(100),
    molecular_weight_g_mol  NUMERIC(10,4),
    physical_form           VARCHAR(40),
    appearance              VARCHAR(100),

    -- Description & Use
    description             TEXT,
    intended_use            TEXT,
    therapeutic_area        VARCHAR(100),
    storage_conditions      VARCHAR(150),
    shelf_life_months       INT,
    hazard_classification   VARCHAR(80),

    -- Pricing
    unit_of_measure         VARCHAR(30),
    minimum_order_quantity  NUMERIC(12,3),
    price_per_unit_usd      NUMERIC(12,4),
    bulk_price_per_unit_usd NUMERIC(12,4),
    bulk_threshold_qty      NUMERIC(12,3),
    currency                VARCHAR(10)     DEFAULT 'USD',
    price_effective_date    DATE,
    price_expiry_date       DATE,
    last_purchased_price    NUMERIC(12,4),
    last_purchased_date     DATE,

    -- Regulatory & Quality
    regulatory_status       VARCHAR(60),
    dea_schedule            VARCHAR(30),
    gmp_manufactured        BOOLEAN         DEFAULT TRUE,
    coa_available           BOOLEAN         DEFAULT TRUE,
    msds_available          BOOLEAN         DEFAULT TRUE,
    dmf_number              VARCHAR(30),
    cep_number              VARCHAR(30),
    controlled_substance    BOOLEAN         DEFAULT FALSE,
    reach_compliant         BOOLEAN         DEFAULT TRUE,
    rohs_compliant          BOOLEAN         DEFAULT TRUE,

    -- Shipping & Lead Time
    lead_time_days          INT,
    standard_lead_time_days INT,
    expedite_available      BOOLEAN         DEFAULT FALSE,
    expedite_lead_time_days INT,
    expedite_surcharge_pct  NUMERIC(5,2),
    ships_from_country      VARCHAR(60),
    temperature_requirement VARCHAR(40),
    shipping_class          VARCHAR(30),
    un_number               VARCHAR(15),
    packaging_options       VARCHAR(200),

    -- Inventory / Availability
    availability_status     VARCHAR(30)     DEFAULT 'In Stock',
    safety_stock_kg         NUMERIC(10,3),
    reorder_point_kg        NUMERIC(10,3),
    annual_usage_kg         NUMERIC(10,3),

    -- Metadata
    notes                   TEXT,
    created_at              TIMESTAMPTZ     DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vp_vendor_id        ON vendor_products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vp_product_name     ON vendor_products(product_name);
CREATE INDEX IF NOT EXISTS idx_vp_cas_number       ON vendor_products(cas_number);
CREATE INDEX IF NOT EXISTS idx_vp_product_type     ON vendor_products(product_type);
CREATE INDEX IF NOT EXISTS idx_vp_availability     ON vendor_products(availability_status);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_vendor_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vendor_products_updated_at
BEFORE UPDATE ON vendor_products
FOR EACH ROW EXECUTE FUNCTION update_vendor_products_updated_at();

