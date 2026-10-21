import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getLocalDateInputValue, getLocalMonthInputValue, getLocalDateTimeInputValue } from '../src/shared/utils/dateUtils';
import { PERMISSIONS } from '../src/shared/constants';

describe('Cross-Platform Hardening & Regression Suite', () => {
  describe('1. Reports Sidebar Permission Contract', () => {
    it('uses PERMISSIONS.REPORTS_READ for Monthly Reports navigation in Sidebar', () => {
      const sidebarContent = fs.readFileSync(path.join(process.cwd(), 'src/frontend/components/layout/Sidebar.tsx'), 'utf-8');
      expect(sidebarContent).toContain("id: 'reports'");
      expect(sidebarContent).toContain("perm: PERMISSIONS.REPORTS_READ");
      expect(sidebarContent).not.toContain("perm: PERMISSIONS.EQUIPMENT_READ,\n    }");
    });
  });

  describe('2. Local Business Date & Time Helpers', () => {
    it('getLocalDateInputValue returns YYYY-MM-DD in local time without UTC offset regression', () => {
      const d = new Date(2026, 9, 21, 2, 30); // Oct 21, 2026 02:30 AM local time
      expect(getLocalDateInputValue(d)).toBe('2026-10-21');
    });

    it('getLocalMonthInputValue returns YYYY-MM in local time', () => {
      const d = new Date(2026, 9, 21, 2, 30);
      expect(getLocalMonthInputValue(d)).toBe('2026-10');
    });

    it('getLocalDateTimeInputValue returns YYYY-MM-DDTHH:mm in local time', () => {
      const d = new Date(2026, 9, 21, 2, 30);
      expect(getLocalDateTimeInputValue(d)).toBe('2026-10-21T02:30');
    });
  });

  describe('3. Production Bundle Security Audits', () => {
    it('production build bundle excludes hardcoded Password@123', () => {
      const distDir = path.join(process.cwd(), 'dist/assets');
      if (fs.existsSync(distDir)) {
        const files = fs.readdirSync(distDir);
        for (const file of files) {
          if (file.endsWith('.js')) {
            const content = fs.readFileSync(path.join(distDir, file), 'utf-8');
            expect(content).not.toContain('Password@123');
          }
        }
      }
    });

    it('UsersPage password field placeholder does not contain Password@123', () => {
      const usersPageContent = fs.readFileSync(path.join(process.cwd(), 'src/frontend/pages/UsersPage.tsx'), 'utf-8');
      expect(usersPageContent).not.toContain('placeholder="Password@123"');
    });

    it('sessionStorage bearer token persistence is removed from api.ts', () => {
      const apiContent = fs.readFileSync(path.join(process.cwd(), 'src/frontend/services/api.ts'), 'utf-8');
      expect(apiContent).not.toContain("sessionStorage.setItem('iocl_auth_token'");
      expect(apiContent).not.toContain("sessionStorage.getItem('iocl_auth_token'");
    });
  });

  describe('4. Active Outlet Context & Selector', () => {
    it('ActiveOutletContext file exists and exports ActiveOutletProvider and GlobalOutletSelector', () => {
      const activeOutletContent = fs.readFileSync(path.join(process.cwd(), 'src/frontend/context/ActiveOutletContext.tsx'), 'utf-8');
      expect(activeOutletContent).toContain('export const ActiveOutletProvider');
      expect(activeOutletContent).toContain('export const GlobalOutletSelector');
      expect(activeOutletContent).toContain('iocl_active_outlet_id');
    });
  });

  describe('5. Branding Compliance Audit', () => {
    it('User-facing title in index.html is IOCL Digital Outlet Manager', () => {
      const htmlContent = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf-8');
      expect(htmlContent).toContain('<title>IOCL Digital Outlet Manager</title>');
    });

    it('Header branding text is IOCL Digital Outlet Manager', () => {
      const headerContent = fs.readFileSync(path.join(process.cwd(), 'src/frontend/components/layout/Header.tsx'), 'utf-8');
      expect(headerContent).toContain('Digital Outlet Manager');
    });
  });
});
