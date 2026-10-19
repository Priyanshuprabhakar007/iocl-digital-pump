-- Migration 0029: DG / Report permission persistence
-- Data-only migration: inserts permissions and role_permissions idempotently

INSERT OR IGNORE INTO permissions (id, code, name, description) VALUES
  ('perm-dg-r', 'dg_log.read', 'Read DG Operations', 'View DG set daily logs and reports'),
  ('perm-dg-w', 'dg_log.write', 'Write DG Operations', 'Record and update DG set daily logs'),
  ('perm-rep-r', 'reports.read', 'Read Reports', 'View monthly operations and performance reports'),
  ('perm-rep-g', 'reports.generate', 'Generate Reports', 'Generate and export operations reports');

-- Role Permission Mappings

-- STATE_OFFICE: dg_log.read, reports.read, reports.generate
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'STATE_OFFICE' AND p.code IN ('dg_log.read', 'reports.read', 'reports.generate');

-- DIVISIONAL_OFFICE: dg_log.read, reports.read, reports.generate
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'DIVISIONAL_OFFICE' AND p.code IN ('dg_log.read', 'reports.read', 'reports.generate');

-- BUSINESS_MANAGER: dg_log.read, reports.read, reports.generate
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'BUSINESS_MANAGER' AND p.code IN ('dg_log.read', 'reports.read', 'reports.generate');

-- FIELD_OFFICER: dg_log.read, reports.read, reports.generate
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'FIELD_OFFICER' AND p.code IN ('dg_log.read', 'reports.read', 'reports.generate');

-- DEALER: dg_log.read, dg_log.write, reports.read, reports.generate
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'DEALER' AND p.code IN ('dg_log.read', 'dg_log.write', 'reports.read', 'reports.generate');

-- CSP: dg_log.read, dg_log.write, reports.read
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'CSP' AND p.code IN ('dg_log.read', 'dg_log.write', 'reports.read');
