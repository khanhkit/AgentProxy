-- Opaque CLIProxyAPI auth_index from X-CPA-TRACE-ID.
-- Human-readable labels are resolved outside the DB persistence layer.
-- NULL means attribution was unavailable or not yet wired by runtime code.
ALTER TABLE usage_history ADD COLUMN cpa_auth_index TEXT;
