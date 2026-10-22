PRAGMA foreign_keys = OFF;

-- 3. Populate Global Masters from Existing Outlet-Scoped Masters
INSERT OR IGNORE INTO "global_hr_designations" (
    "id", "code", "name", "skill_category", "status", "notes", "created_by", "created_at", "updated_at"
)
SELECT
    MIN("id"),
    "code",
    "name",
    "skill_category",
    "status",
    "notes",
    "created_by",
    "created_at",
    "updated_at"
FROM "hr_designations"
GROUP BY UPPER(TRIM("code"));

INSERT OR IGNORE INTO "global_shift_templates" (
    "id", "code", "name", "start_time", "end_time", "sequence", "status", "created_by", "created_at", "updated_at"
)
SELECT
    MIN("id"),
    "code",
    "name",
    "start_time",
    "end_time",
    "sequence",
    "status",
    "created_by",
    "created_at",
    "updated_at"
FROM "shift_templates"
GROUP BY UPPER(TRIM("code"));
