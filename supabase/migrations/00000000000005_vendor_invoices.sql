-- Denormalized invoice file metadata per Kognitos run (for vendor UI + proxied download).

CREATE TABLE vendor_invoices (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kognitos_run_id     text NOT NULL
        REFERENCES kognitos_runs (id) ON DELETE CASCADE,
    vendor_id           varchar(10) NOT NULL
        REFERENCES vendors (vendor_id) ON DELETE CASCADE,
    input_key           text NOT NULL,
    kognitos_file_id    text NOT NULL,
    file_name           text,
    mime_type           text,
    invoice_number      text,
    invoice_date_text   text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kognitos_run_id, input_key)
);

CREATE INDEX idx_vendor_invoices_vendor_id_created
    ON vendor_invoices (vendor_id, created_at DESC);

ALTER TABLE vendor_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read vendor_invoices"
    ON vendor_invoices FOR SELECT USING (true);
