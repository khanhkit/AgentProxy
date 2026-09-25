-- Track when a connection's synced model catalog was last written.
-- NULL means never synced and therefore non-authoritative.
ALTER TABLE provider_connections ADD COLUMN synced_models_at TEXT;
