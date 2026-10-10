-- =========================================================================
-- Migration 0024: Phase 3 Dispensing Unit (DU) Nozzle Capacity & Fuel Topology
-- =========================================================================

-- 1. Add nozzle_capacity column to dispensers table with check constraint (2, 4, 6)
-- Default is 6 so existing production dispensers remain functional.
ALTER TABLE "dispensers" ADD COLUMN "nozzle_capacity" INTEGER NOT NULL DEFAULT 6 CHECK ("nozzle_capacity" IN (2, 4, 6));

-- =========================================================================
-- 2. DB Triggers: Dispenser Capacity Reduction Guard
-- =========================================================================

CREATE TRIGGER IF NOT EXISTS "trg_dispensers_capacity_reduction_guard"
BEFORE UPDATE OF "nozzle_capacity" ON "dispensers"
BEGIN
    SELECT
        CASE
            WHEN EXISTS (
                SELECT 1 FROM "nozzles"
                WHERE "dispenser_id" = NEW."id"
                  AND "nozzle_number" > NEW."nozzle_capacity"
            )
            THEN RAISE(ABORT, 'DISPENSER_CAPACITY_BELOW_EXISTING_NOZZLES')
        END;
END;

-- =========================================================================
-- 4. DB Triggers: Nozzle Capacity & Mapping Integrity (INSERT)
-- =========================================================================

CREATE TRIGGER IF NOT EXISTS "trg_nozzles_insert_capacity_and_mapping"
BEFORE INSERT ON "nozzles"
BEGIN
    SELECT
        CASE
            -- Capacity checks
            WHEN NEW."nozzle_number" < 1
            THEN RAISE(ABORT, 'NOZZLE_CAPACITY_EXCEEDED')

            WHEN NEW."nozzle_number" > (
                SELECT "nozzle_capacity" FROM "dispensers" WHERE "id" = NEW."dispenser_id"
            )
            THEN RAISE(ABORT, 'NOZZLE_CAPACITY_EXCEEDED')

            -- Topology checks
            WHEN NOT EXISTS (
                SELECT 1 FROM "dispensers"
                WHERE "id" = NEW."dispenser_id" AND "outlet_id" = NEW."outlet_id"
            )
            THEN RAISE(ABORT, 'NOZZLE_DISPENSER_OUTLET_MISMATCH')

            WHEN NOT EXISTS (
                SELECT 1 FROM "tanks"
                WHERE "id" = NEW."tank_id" AND "outlet_id" = NEW."outlet_id"
            )
            THEN RAISE(ABORT, 'NOZZLE_TANK_OUTLET_MISMATCH')

            WHEN NOT EXISTS (
                SELECT 1 FROM "tanks"
                WHERE "id" = NEW."tank_id" AND "product_id" = NEW."product_id"
            )
            THEN RAISE(ABORT, 'NOZZLE_TANK_PRODUCT_MISMATCH')

            WHEN NOT EXISTS (
                SELECT 1 FROM "outlet_products"
                WHERE "outlet_id" = NEW."outlet_id" AND "product_id" = NEW."product_id"
            )
            THEN RAISE(ABORT, 'NOZZLE_OUTLET_PRODUCT_NOT_MAPPED')
        END;
END;

-- =========================================================================
-- 5. DB Triggers: Nozzle Capacity & Mapping Integrity (UPDATE)
-- =========================================================================

CREATE TRIGGER IF NOT EXISTS "trg_nozzles_update_capacity_and_mapping"
BEFORE UPDATE ON "nozzles"
BEGIN
    SELECT
        CASE
            -- Capacity checks
            WHEN NEW."nozzle_number" < 1
            THEN RAISE(ABORT, 'NOZZLE_CAPACITY_EXCEEDED')

            WHEN NEW."nozzle_number" > (
                SELECT "nozzle_capacity" FROM "dispensers" WHERE "id" = NEW."dispenser_id"
            )
            THEN RAISE(ABORT, 'NOZZLE_CAPACITY_EXCEEDED')

            -- Topology checks
            WHEN NOT EXISTS (
                SELECT 1 FROM "dispensers"
                WHERE "id" = NEW."dispenser_id" AND "outlet_id" = NEW."outlet_id"
            )
            THEN RAISE(ABORT, 'NOZZLE_DISPENSER_OUTLET_MISMATCH')

            WHEN NOT EXISTS (
                SELECT 1 FROM "tanks"
                WHERE "id" = NEW."tank_id" AND "outlet_id" = NEW."outlet_id"
            )
            THEN RAISE(ABORT, 'NOZZLE_TANK_OUTLET_MISMATCH')

            WHEN NOT EXISTS (
                SELECT 1 FROM "tanks"
                WHERE "id" = NEW."tank_id" AND "product_id" = NEW."product_id"
            )
            THEN RAISE(ABORT, 'NOZZLE_TANK_PRODUCT_MISMATCH')

            WHEN NOT EXISTS (
                SELECT 1 FROM "outlet_products"
                WHERE "outlet_id" = NEW."outlet_id" AND "product_id" = NEW."product_id"
            )
            THEN RAISE(ABORT, 'NOZZLE_OUTLET_PRODUCT_NOT_MAPPED')
        END;
END;
