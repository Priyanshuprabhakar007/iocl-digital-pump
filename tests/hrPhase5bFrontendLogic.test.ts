import { describe, it, expect } from 'vitest';
import {
  buildHrAttendanceQueryParams,
  buildHrNozzleAssignmentQueryParams,
  formatHrAttendanceStatus,
  formatHrNozzleStatus,
  formatGeofenceInside,
  formatDistanceMetres,
  formatGpsAccuracy,
  getEligibleScheduledRosters,
  getEligibleActiveNozzles,
  formatGeolocationError,
  getHrErrorMessage,
  getResetHrFilters,
  getHrTabResetTargets,
} from '../src/frontend/components/hr/hrUi';

describe('Phase 5B Frontend Logic & Formatting Suite', () => {
  it('supports attendance, geofence, and nozzle-assignment tabs without duplicate nozzleAssignment', () => {
    const tab: Parameters<typeof getHrTabResetTargets>[0] = 'nozzle-assignment';
    const targets = getHrTabResetTargets(tab);
    expect(targets.closeNozzleAssignmentUi).toBe(false);

    const targetsStaff = getHrTabResetTargets('staff');
    expect(targetsStaff.closeNozzleAssignmentUi).toBe(true);
  });

  it('builds attendance query params correctly', () => {
    const q1 = buildHrAttendanceQueryParams({ date: '2026-04-05', status: 'CHECKED_IN' });
    expect(q1).toContain('date=2026-04-05');
    expect(q1).toContain('status=CHECKED_IN');

    const qEmpty = buildHrAttendanceQueryParams({});
    expect(qEmpty).toBe('');
  });

  it('builds nozzle assignment query params correctly', () => {
    const q1 = buildHrNozzleAssignmentQueryParams({ staffId: 'staff_1', status: 'ASSIGNED' });
    expect(q1).toContain('staffId=staff_1');
    expect(q1).toContain('status=ASSIGNED');

    const qEmpty = buildHrNozzleAssignmentQueryParams({});
    expect(qEmpty).toBe('');
  });

  it('formats attendance status correctly', () => {
    expect(formatHrAttendanceStatus('CHECKED_IN').label).toBe('Checked In');
    expect(formatHrAttendanceStatus('CHECKED_OUT').label).toBe('Checked Out');
    expect(formatHrAttendanceStatus('CANCELLED').label).toBe('Cancelled');
    expect(formatHrAttendanceStatus('UNKNOWN').label).toBe('UNKNOWN');
  });

  it('formats nozzle assignment status correctly', () => {
    expect(formatHrNozzleStatus('ASSIGNED').label).toBe('Assigned');
    expect(formatHrNozzleStatus('CANCELLED').label).toBe('Cancelled');
  });

  it('formats geofence inside/outside correctly', () => {
    expect(formatGeofenceInside(true).label).toBe('Inside Geofence');
    expect(formatGeofenceInside(1).label).toBe('Inside Geofence');
    expect(formatGeofenceInside(false).label).toBe('Outside Geofence');
    expect(formatGeofenceInside(0).label).toBe('Outside Geofence');
  });

  it('formats distance in metres and kilometres correctly', () => {
    expect(formatDistanceMetres(45)).toBe('45 m');
    expect(formatDistanceMetres(1500)).toBe('1.50 km');
    expect(formatDistanceMetres(null)).toBe('— m');
  });

  it('formats GPS accuracy correctly', () => {
    expect(formatGpsAccuracy(12.4)).toBe('±12 m accuracy');
    expect(formatGpsAccuracy(null)).toBe('— m accuracy');
  });

  it('filters eligible scheduled rosters and active nozzles', () => {
    const rosters: any[] = [
      { id: 'r1', status: 'SCHEDULED' },
      { id: 'r2', status: 'CANCELLED' },
      { id: 'r3', status: 'SCHEDULED' },
    ];
    const eligibleRosters = getEligibleScheduledRosters(rosters);
    expect(eligibleRosters.length).toBe(2);
    expect(eligibleRosters.every(r => r.status === 'SCHEDULED')).toBe(true);

    const nozzles: any[] = [
      { id: 'n1', status: 'ACTIVE' },
      { id: 'n2', status: 'INACTIVE' },
      { id: 'n3', status: 'ACTIVE' },
    ];
    const eligibleNozzles = getEligibleActiveNozzles(nozzles);
    expect(eligibleNozzles.length).toBe(2);
    expect(eligibleNozzles.every(n => n.status === 'ACTIVE')).toBe(true);
  });

  it('maps geolocation errors correctly', () => {
    expect(formatGeolocationError({ code: 1 })).toContain('permission was denied');
    expect(formatGeolocationError({ code: 2 })).toContain('could not be determined');
    expect(formatGeolocationError({ code: 3 })).toContain('timed out');
    expect(formatGeolocationError('Custom error')).toBe('Custom error');
  });

  it('maps Phase 5B backend error codes correctly', () => {
    expect(getHrErrorMessage('HR_GEOFENCE_POLICY_NOT_FOUND')).toBe('Geofence policy not configured.');
    expect(getHrErrorMessage('HR_OUTLET_LOCATION_NOT_CONFIGURED')).toBe('Outlet location has not been configured.');
    expect(getHrErrorMessage('HR_GPS_ACCURACY_TOO_LOW')).toBe('GPS accuracy is too low. Move to an open area and try again.');
    expect(getHrErrorMessage('HR_OUTSIDE_GEOFENCE')).toBe('You are outside the permitted attendance area.');
    expect(getHrErrorMessage('HR_ATTENDANCE_CHECKOUT_INVALID')).toBe('Checkout time must be strictly after check-in time.');
    expect(getHrErrorMessage('HR_NOZZLE_ALREADY_ASSIGNED')).toBe('This nozzle is already assigned for the selected shift and date.');
    expect(getHrErrorMessage('SQLITE_CONSTRAINT: bad')).toBe('An unexpected server error occurred.');
  });

  it('resets HR filters properly', () => {
    const filters = getResetHrFilters();
    expect(filters.attendance).toBeDefined();
    expect(filters.nozzleAssignment).toBeDefined();
    expect(filters.attendance.date).toBe('');
    expect(filters.nozzleAssignment.status).toBe('');
  });
});
