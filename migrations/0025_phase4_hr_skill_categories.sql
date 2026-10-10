-- =========================================================================
-- Migration 0025: Phase 4 HR Designation Skill Categories
-- =========================================================================

-- 1. Add skill_category column to hr_designations table with check constraint (HIGHLY_SKILLED, SKILLED, SEMI_SKILLED, UNSKILLED)
-- Default is NULL so existing production designations remain unclassified.
ALTER TABLE "hr_designations" ADD COLUMN "skill_category" TEXT NULL CHECK ("skill_category" IS NULL OR "skill_category" IN ('HIGHLY_SKILLED', 'SKILLED', 'SEMI_SKILLED', 'UNSKILLED'));

-- 2. Create index for outlet and skill category
CREATE INDEX IF NOT EXISTS "idx_hr_designations_outlet_skill_category" ON "hr_designations"("outlet_id", "skill_category");
