import { describe, it, expect } from 'vitest';
import {
  formatDowntime,
  formatEquipmentType,
  formatTicketStatus,
  formatFailureCategory,
  getAvailableTicketActions,
  isTargetEligibleForTicket,
  getEquipmentErrorMessage
} from '../src/frontend/components/equipment/equipmentUi';
import { EquipmentTarget, EquipmentTicketStatus } from '../src/shared/types';

describe('equipmentUi - Pure Frontend Logic', () => {
  describe('formatDowntime', () => {
    it('handles null, undefined, 0, or negative values', () => {
      expect(formatDowntime(null)).toBe('—');
      expect(formatDowntime(undefined)).toBe('—');
      expect(formatDowntime(0)).toBe('0m');
      expect(formatDowntime(-5)).toBe('—');
    });

    it('formats seconds only correctly', () => {
      expect(formatDowntime(45)).toBe('45s');
    });

    it('formats minutes and seconds correctly', () => {
      expect(formatDowntime(90)).toBe('1m 30s');
      expect(formatDowntime(120)).toBe('2m');
    });

    it('formats hours and minutes correctly', () => {
      expect(formatDowntime(3600)).toBe('1h');
      expect(formatDowntime(5400)).toBe('1h 30m');
      expect(formatDowntime(3660)).toBe('1h 1m');
    });

    it('formats days, hours and minutes correctly', () => {
      expect(formatDowntime(86400)).toBe('1d');
      expect(formatDowntime(90000)).toBe('1d 1h');
      expect(formatDowntime(90060)).toBe('1d 1h 1m');
    });
  });

  describe('formatEquipmentType', () => {
    it('formats recognized types to human-readable strings', () => {
      expect(formatEquipmentType('DISPENSER')).toBe('Fuel Dispenser');
      expect(formatEquipmentType('ATG')).toBe('Auto Tank Gauge (ATG)');
      expect(formatEquipmentType('AIR_COMPRESSOR')).toBe('Air Compressor');
      expect(formatEquipmentType('CNG_COMPRESSOR')).toBe('CNG Compressor');
      expect(formatEquipmentType('DG_SET')).toBe('DG Power Generator');
      expect(formatEquipmentType('OTHER')).toBe('Auxiliary Equipment');
    });

    it('handles empty or unrecognized fallback', () => {
      expect(formatEquipmentType('')).toBe('Unknown');
      expect(formatEquipmentType('CUSTOM_PUMP')).toBe('CUSTOM_PUMP');
    });
  });

  describe('formatTicketStatus', () => {
    it('formats ticket status labels accurately', () => {
      expect(formatTicketStatus('OPEN')).toBe('Open');
      expect(formatTicketStatus('ASSIGNED')).toBe('Assigned');
      expect(formatTicketStatus('IN_PROGRESS')).toBe('In Progress');
      expect(formatTicketStatus('RESOLVED')).toBe('Resolved — Awaiting Sign-off');
      expect(formatTicketStatus('CLOSED')).toBe('Closed');
      expect(formatTicketStatus('CANCELLED')).toBe('Cancelled');
    });
  });

  describe('formatFailureCategory', () => {
    it('formats failure category labels accurately', () => {
      expect(formatFailureCategory('ELECTRICAL')).toBe('Electrical & Power Supply');
      expect(formatFailureCategory('MECHANICAL')).toBe('Mechanical & Hydraulics');
      expect(formatFailureCategory('ELECTRONICS')).toBe('Electronics & Display');
      expect(formatFailureCategory('COMMUNICATION')).toBe('POS / Network Communication');
      expect(formatFailureCategory('CALIBRATION')).toBe('Meter Calibration / Drift');
      expect(formatFailureCategory('PRESSURE')).toBe('Pressure / Flow Drop');
      expect(formatFailureCategory('LEAKAGE')).toBe('Fuel / Fluid Leakage');
      expect(formatFailureCategory('POWER')).toBe('Main Line Power Outage');
      expect(formatFailureCategory('SOFTWARE')).toBe('Firmware / Automation Error');
      expect(formatFailureCategory('OTHER')).toBe('Other / Uncategorized');
    });
  });

  describe('getAvailableTicketActions - Action Matrix', () => {
    it('returns assign and cancel for OPEN status with canManage', () => {
      const actions = getAvailableTicketActions('OPEN', {
        canManage: true,
        canSignoff: false
      });
      expect(actions).toEqual({
        canAssign: true,
        canReassign: false,
        canStart: false,
        canResolve: false,
        canSignoff: false,
        canCancel: true,
      });
    });

    it('returns reassign, start, and cancel for ASSIGNED status with canManage', () => {
      const actions = getAvailableTicketActions('ASSIGNED', {
        canManage: true,
        canSignoff: false
      });
      expect(actions).toEqual({
        canAssign: false,
        canReassign: true,
        canStart: true,
        canResolve: false,
        canSignoff: false,
        canCancel: true,
      });
    });

    it('returns resolve for IN_PROGRESS status with canManage', () => {
      const actions = getAvailableTicketActions('IN_PROGRESS', {
        canManage: true,
        canSignoff: false
      });
      expect(actions).toEqual({
        canAssign: false,
        canReassign: false,
        canStart: false,
        canResolve: true,
        canSignoff: false,
        canCancel: false,
      });
    });

    it('returns signoff for RESOLVED status with canSignoff', () => {
      const actions = getAvailableTicketActions('RESOLVED', {
        canManage: false,
        canSignoff: true
      });
      expect(actions).toEqual({
        canAssign: false,
        canReassign: false,
        canStart: false,
        canResolve: false,
        canSignoff: true,
        canCancel: false,
      });
    });

    it('returns no actions for CLOSED and CANCELLED statuses even with all permissions', () => {
      const closedActions = getAvailableTicketActions('CLOSED', {
        canManage: true,
        canSignoff: true
      });
      expect(closedActions).toEqual({
        canAssign: false,
        canReassign: false,
        canStart: false,
        canResolve: false,
        canSignoff: false,
        canCancel: false,
      });

      const cancelledActions = getAvailableTicketActions('CANCELLED', {
        canManage: true,
        canSignoff: true
      });
      expect(cancelledActions).toEqual({
        canAssign: false,
        canReassign: false,
        canStart: false,
        canResolve: false,
        canSignoff: false,
        canCancel: false,
      });
    });

    it('suppresses actions if user lacks required permissions', () => {
      // Without canManage, OPEN has no actions
      expect(
        getAvailableTicketActions('OPEN', { canManage: false, canSignoff: true })
      ).toEqual({
        canAssign: false,
        canReassign: false,
        canStart: false,
        canResolve: false,
        canSignoff: false,
        canCancel: false,
      });

      // Without canManage, ASSIGNED has no actions
      expect(
        getAvailableTicketActions('ASSIGNED', { canManage: false, canSignoff: true })
      ).toEqual({
        canAssign: false,
        canReassign: false,
        canStart: false,
        canResolve: false,
        canSignoff: false,
        canCancel: false,
      });

      // Without canManage, IN_PROGRESS has no actions
      expect(
        getAvailableTicketActions('IN_PROGRESS', { canManage: false, canSignoff: true })
      ).toEqual({
        canAssign: false,
        canReassign: false,
        canStart: false,
        canResolve: false,
        canSignoff: false,
        canCancel: false,
      });

      // Without canSignoff, RESOLVED has no actions even if canManage is true
      expect(
        getAvailableTicketActions('RESOLVED', { canManage: true, canSignoff: false })
      ).toEqual({
        canAssign: false,
        canReassign: false,
        canStart: false,
        canResolve: false,
        canSignoff: false,
        canCancel: false,
      });
    });
  });

  describe('isTargetEligibleForTicket', () => {
    it('allows ACTIVE and MAINTENANCE targets', () => {
      const activeTarget: EquipmentTarget = {
        targetType: 'DISPENSER',
        targetId: 'disp-1',
        label: 'Dispenser 1',
        equipmentType: 'DISPENSER',
        status: 'ACTIVE'
      };
      const maintenanceTarget: EquipmentTarget = {
        targetType: 'ASSET',
        targetId: 'eq-1',
        label: 'Compressor 1',
        equipmentType: 'AIR_COMPRESSOR',
        status: 'MAINTENANCE'
      };

      expect(isTargetEligibleForTicket(activeTarget)).toBe(true);
      expect(isTargetEligibleForTicket(maintenanceTarget)).toBe(true);
      expect(isTargetEligibleForTicket('ACTIVE')).toBe(true);
      expect(isTargetEligibleForTicket('MAINTENANCE')).toBe(true);
    });

    it('rejects INACTIVE and DECOMMISSIONED targets', () => {
      const inactiveTarget: EquipmentTarget = {
        targetType: 'DISPENSER',
        targetId: 'disp-2',
        label: 'Dispenser 2',
        equipmentType: 'DISPENSER',
        status: 'INACTIVE'
      };
      const decommissionedTarget: EquipmentTarget = {
        targetType: 'ASSET',
        targetId: 'eq-2',
        label: 'Old DG Set',
        equipmentType: 'DG_SET',
        status: 'DECOMMISSIONED'
      };

      expect(isTargetEligibleForTicket(inactiveTarget)).toBe(false);
      expect(isTargetEligibleForTicket(decommissionedTarget)).toBe(false);
      expect(isTargetEligibleForTicket('INACTIVE')).toBe(false);
      expect(isTargetEligibleForTicket('DECOMMISSIONED')).toBe(false);
    });
  });

  describe('getEquipmentErrorMessage', () => {
    it('maps known error codes to user-friendly messages', () => {
      expect(getEquipmentErrorMessage({ code: 'EQUIPMENT_ASSET_CODE_EXISTS' })).toBe(
        'An equipment asset with this code already exists at this outlet.'
      );
      expect(getEquipmentErrorMessage({ code: 'EQUIPMENT_ASSET_SERIAL_EXISTS' })).toBe(
        'An equipment asset with this serial number already exists at this outlet.'
      );
      expect(getEquipmentErrorMessage({ code: 'INVALID_EQUIPMENT_TICKET_TRANSITION' })).toBe(
        'This ticket changed while you were viewing it. The latest state has been reloaded.'
      );
      expect(getEquipmentErrorMessage({ code: 'EQUIPMENT_TARGET_INACTIVE' })).toBe(
        'Cannot log breakdown ticket for an inactive or decommissioned target.'
      );
    });

    it('extracts nested error messages or falls back gracefully', () => {
      expect(getEquipmentErrorMessage({ error: { message: 'Custom server error' } })).toBe(
        'Custom server error'
      );
      expect(getEquipmentErrorMessage(new Error('JavaScript exception'))).toBe(
        'JavaScript exception'
      );
      expect(getEquipmentErrorMessage({})).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });
  });
});
