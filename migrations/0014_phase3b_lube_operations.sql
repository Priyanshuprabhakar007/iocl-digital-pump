-- Phase 3B-1: Lube & Auxiliary Inventory Core Backend

-- 1. Lube SKU Master
CREATE TABLE lube_skus (
    id TEXT PRIMARY KEY,
    outlet_id TEXT NOT NULL,
    sku_code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    stock_unit TEXT NOT NULL,
    reorder_threshold_subunits INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    FOREIGN KEY (outlet_id) REFERENCES retail_outlets(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE(outlet_id, sku_code),
    CHECK (stock_unit IN ('LITRE', 'PACK')),
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CHECK (reorder_threshold_subunits >= 0)
);

CREATE INDEX idx_lube_skus_outlet_id ON lube_skus(outlet_id);
CREATE INDEX idx_lube_skus_outlet_code ON lube_skus(outlet_id, sku_code);

-- 2. Lube SKU Selling Prices
CREATE TABLE lube_sku_prices (
    id TEXT PRIMARY KEY,
    outlet_id TEXT NOT NULL,
    lube_sku_id TEXT NOT NULL,
    price_paise_per_unit INTEGER NOT NULL,
    effective_from TEXT NOT NULL,
    effective_to TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    FOREIGN KEY (outlet_id) REFERENCES retail_outlets(id),
    FOREIGN KEY (lube_sku_id) REFERENCES lube_skus(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    CHECK (price_paise_per_unit > 0),
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX idx_lube_sku_prices_sku_outlet ON lube_sku_prices(outlet_id, lube_sku_id, status);

-- 3. Lube Stock Transaction Ledger (Non-Sale Movements)
CREATE TABLE lube_stock_transactions (
    id TEXT PRIMARY KEY,
    outlet_id TEXT NOT NULL,
    lube_sku_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    quantity_subunits INTEGER NOT NULL,
    occurred_at TEXT NOT NULL,
    reference_number TEXT,
    notes TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (outlet_id) REFERENCES retail_outlets(id),
    FOREIGN KEY (lube_sku_id) REFERENCES lube_skus(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    CHECK (transaction_type IN ('OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')),
    CHECK (quantity_subunits > 0),
    CHECK (
        (transaction_type NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')) OR
        (notes IS NOT NULL AND trim(notes) != '')
    )
);

CREATE INDEX idx_lube_tx_sku_outlet ON lube_stock_transactions(outlet_id, lube_sku_id);
CREATE INDEX idx_lube_tx_occurred_at ON lube_stock_transactions(occurred_at);

-- 4. Lube Shift Sales (Authoritative Shift Sales with Snapshots)
CREATE TABLE lube_shift_sales (
    id TEXT PRIMARY KEY,
    operational_shift_id TEXT NOT NULL,
    outlet_id TEXT NOT NULL,
    lube_sku_id TEXT NOT NULL,
    sku_code TEXT NOT NULL,
    sku_name TEXT NOT NULL,
    category TEXT NOT NULL,
    stock_unit TEXT NOT NULL,
    quantity_subunits INTEGER NOT NULL,
    unit_price_paise INTEGER NOT NULL,
    revenue_paise INTEGER NOT NULL,
    sold_at TEXT NOT NULL,
    recorded_by_user_id TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (operational_shift_id) REFERENCES operational_shifts(id),
    FOREIGN KEY (outlet_id) REFERENCES retail_outlets(id),
    FOREIGN KEY (lube_sku_id) REFERENCES lube_skus(id),
    FOREIGN KEY (recorded_by_user_id) REFERENCES users(id),
    CHECK (quantity_subunits > 0),
    CHECK (unit_price_paise > 0),
    CHECK (revenue_paise >= 0),
    CHECK (stock_unit IN ('LITRE', 'PACK'))
);

CREATE INDEX idx_lube_sales_shift ON lube_shift_sales(operational_shift_id);
CREATE INDEX idx_lube_sales_sku ON lube_shift_sales(lube_sku_id);
CREATE INDEX idx_lube_sales_outlet ON lube_shift_sales(outlet_id);

-- 5. SQL-Authoritative Outbound Stock Triggers
-- Prevent ADJUSTMENT_OUT from exceeding current stock
CREATE TRIGGER check_lube_stock_on_tx_insert
BEFORE INSERT ON lube_stock_transactions
FOR EACH ROW
WHEN NEW.transaction_type = 'ADJUSTMENT_OUT'
BEGIN
    SELECT CASE
        WHEN (
            (
                COALESCE((
                    SELECT SUM(CASE 
                        WHEN transaction_type IN ('OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN') THEN quantity_subunits
                        WHEN transaction_type = 'ADJUSTMENT_OUT' THEN -quantity_subunits
                        ELSE 0
                    END)
                    FROM lube_stock_transactions
                    WHERE lube_sku_id = NEW.lube_sku_id
                ), 0)
                -
                COALESCE((
                    SELECT SUM(quantity_subunits)
                    FROM lube_shift_sales
                    WHERE lube_sku_id = NEW.lube_sku_id
                ), 0)
            ) < NEW.quantity_subunits
        )
        THEN RAISE(ABORT, 'INSUFFICIENT_LUBE_STOCK')
    END;
END;

-- Prevent Sale CREATE from exceeding current stock or modifying closed shifts
CREATE TRIGGER check_lube_stock_on_sale_insert
BEFORE INSERT ON lube_shift_sales
FOR EACH ROW
BEGIN
    -- 1. Operational shift must exist and be OPEN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM operational_shifts
            WHERE id = NEW.operational_shift_id AND status = 'OPEN'
        ) THEN RAISE(ABORT, 'SHIFT_CLOSED')
    END;

    -- 2. Shift outlet must match sale outlet
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM operational_shifts
            WHERE id = NEW.operational_shift_id AND outlet_id = NEW.outlet_id
        ) THEN RAISE(ABORT, 'OUTLET_MISMATCH')
    END;

    -- 3. SKU must exist and belong to the same outlet
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM lube_skus
            WHERE id = NEW.lube_sku_id AND outlet_id = NEW.outlet_id
        ) THEN RAISE(ABORT, 'LUBE_SKU_NOT_FOUND')
    END;

    -- 4. SKU must be ACTIVE for new sales
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM lube_skus
            WHERE id = NEW.lube_sku_id AND status = 'ACTIVE'
        ) THEN RAISE(ABORT, 'LUBE_SKU_INACTIVE')
    END;

    -- 5. Stock sufficiency check
    SELECT CASE
        WHEN (
            (
                COALESCE((
                    SELECT SUM(CASE 
                        WHEN transaction_type IN ('OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN') THEN quantity_subunits
                        WHEN transaction_type = 'ADJUSTMENT_OUT' THEN -quantity_subunits
                        ELSE 0
                    END)
                    FROM lube_stock_transactions
                    WHERE lube_sku_id = NEW.lube_sku_id
                ), 0)
                -
                COALESCE((
                    SELECT SUM(quantity_subunits)
                    FROM lube_shift_sales
                    WHERE lube_sku_id = NEW.lube_sku_id
                ), 0)
            ) < NEW.quantity_subunits
        )
        THEN RAISE(ABORT, 'INSUFFICIENT_LUBE_STOCK')
    END;
END;

-- Prevent Sale UPDATE from exceeding current stock or modifying non-open shifts
CREATE TRIGGER check_lube_stock_on_sale_update
BEFORE UPDATE ON lube_shift_sales
FOR EACH ROW
BEGIN
    -- 1. Operational shift must still be OPEN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM operational_shifts
            WHERE id = OLD.operational_shift_id AND status = 'OPEN'
        ) THEN RAISE(ABORT, 'SHIFT_CLOSED')
    END;

    -- 2. Stock sufficiency check if quantity changed
    SELECT CASE
        WHEN (NEW.quantity_subunits != OLD.quantity_subunits) AND (
            (
                COALESCE((
                    SELECT SUM(CASE 
                        WHEN transaction_type IN ('OPENING_BALANCE', 'RECEIPT', 'ADJUSTMENT_IN') THEN quantity_subunits
                        WHEN transaction_type = 'ADJUSTMENT_OUT' THEN -quantity_subunits
                        ELSE 0
                    END)
                    FROM lube_stock_transactions
                    WHERE lube_sku_id = NEW.lube_sku_id
                ), 0)
                -
                COALESCE((
                    SELECT SUM(quantity_subunits)
                    FROM lube_shift_sales
                    WHERE lube_sku_id = NEW.lube_sku_id AND id != OLD.id
                ), 0)
            ) < NEW.quantity_subunits
        )
        THEN RAISE(ABORT, 'INSUFFICIENT_LUBE_STOCK')
    END;
END;

-- Prevent Sale DELETE on non-open shifts
CREATE TRIGGER check_lube_stock_on_sale_delete
BEFORE DELETE ON lube_shift_sales
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM operational_shifts
            WHERE id = OLD.operational_shift_id AND status = 'OPEN'
        ) THEN RAISE(ABORT, 'SHIFT_CLOSED')
    END;
END;

-- 6. Permissions
INSERT OR IGNORE INTO permissions (id, code, name, description) VALUES 
('perm-lube-read', 'lube_operations.read', 'Read Lube Operations', 'Allows viewing lube inventory, stock ledger, prices, and shift sales'),
('perm-lube-inv-write', 'lube_inventory.write', 'Write Lube Inventory', 'Allows managing lube SKU catalog, stock receipts, and inventory adjustments'),
('perm-lube-sales-write', 'lube_sales.write', 'Write Lube Shift Sales', 'Allows recording and updating shift lube sales'),
('perm-lube-prices-write', 'lube_prices.write', 'Write Lube Prices', 'Allows creating and managing lube selling price masters');

-- 7. Role Permissions Default Mappings
-- ADMIN gets all 4
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) 
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.code = 'ADMIN' AND p.code IN ('lube_operations.read', 'lube_inventory.write', 'lube_sales.write', 'lube_prices.write');

-- STATE_OFFICE, DIVISIONAL_OFFICE, BUSINESS_MANAGER, FIELD_OFFICER get read
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) 
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.code IN ('STATE_OFFICE', 'DIVISIONAL_OFFICE', 'BUSINESS_MANAGER', 'FIELD_OFFICER') AND p.code = 'lube_operations.read';

-- DEALER and CSP get read, inventory write, sales write (NOT prices write)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id) 
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.code IN ('DEALER', 'CSP') AND p.code IN ('lube_operations.read', 'lube_inventory.write', 'lube_sales.write');
