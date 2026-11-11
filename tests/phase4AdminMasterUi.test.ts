import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const names = [
  'UsersPage', 'RbacPage', 'ScopesPage', 'HierarchyPage',
  'OrganizationMastersPage', 'OutletsPage', 'ProductsPage',
  'PumpInfrastructurePage', 'AuditPage', 'DocumentsPage',
] as const;

const read = (name: string) =>
  fs.readFileSync(`src/frontend/pages/${name}.tsx`, 'utf8');

describe('Phase 4 — Admin and Master Data enterprise-light presentation', () => {
  it('styles all ten pages with the scoped theme without replacing workflows', () => {
    for (const name of names) {
      const source = read(name);
      expect(source).toContain("import './adminModern.css'");
      expect(source).toContain('admin-modern space-y-6 pb-10');
      expect(source).toContain('apiFetch');
    }
    const css = fs.readFileSync('src/frontend/pages/adminModern.css', 'utf8');
    expect(css).toContain('.admin-modern');
    expect(css).toContain('.admin-modern .admin-data-table');
    expect(css).toContain('min-height: 40px');
    expect(css).toContain(':focus-visible');
  });

  it('preserves user and hierarchy permission-aware operations', () => {
    for (const name of ['UsersPage', 'ScopesPage', 'HierarchyPage', 'OrganizationMastersPage']) {
      const source = read(name);
      expect(source).toContain('useAuth');
      expect(source).toContain('hasPermission');
    }
    // RBAC uses its own global-admin scope guard rather than hasPermission.
    expect(read('RbacPage')).toContain('isGlobalAdmin');
  });

  it('retains outlet, product and pump master management functionality', () => {
    for (const name of ['OutletsPage', 'ProductsPage', 'PumpInfrastructurePage']) {
      const source = read(name);
      expect(source).toContain('hasPermission');
      expect(source).toContain('apiFetch');
    }
  });

  it('preserves audit log retrieval and document access logic', () => {
    const audit = read('AuditPage');
    const documents = read('DocumentsPage');
    expect(audit).toContain('/api/v1/audit-logs');
    expect(audit).toContain('selectedLog');
    expect(documents).toContain('apiFetchBlob');
    expect(documents).toContain('PERMISSIONS');
  });

  it('keeps table scrolling keyboard accessible', () => {
    for (const name of ['UsersPage', 'RbacPage', 'ScopesPage', 'AuditPage', 'DocumentsPage']) {
      const source = read(name);
      expect(source).toContain('admin-table-scroll');
      expect(source).toContain('tabIndex={0}');
    }
  });
});
