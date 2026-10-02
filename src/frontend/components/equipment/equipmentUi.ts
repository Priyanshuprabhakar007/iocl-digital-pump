import {
  EquipmentType,
  EquipmentTarget,
  EquipmentAssetType,
  EquipmentAssetStatus,
  EquipmentTicketPriority,
  EquipmentFailureCategory,
  EquipmentTicketStatus,
  EquipmentBreakdownEventType,
} from '../../../shared/types';

/**
 * Formats seconds into human-readable downtime string (e.g. 90 -> '1m 30s', 3600 -> '1h', 5400 -> '1h 30m')
 */
export function formatDowntime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
    return '—';
  }
  if (seconds === 0) {
    return '0m';
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 && days === 0 && hours === 0) {
    parts.push(`${remainingSeconds}s`);
  }

  return parts.length > 0 ? parts.join(' ') : '0m';
}

/**
 * Human-readable label for equipment types
 */
export function formatEquipmentType(type: EquipmentType | string | null | undefined): string {
  switch (type) {
    case 'DISPENSER':
      return 'Fuel Dispenser';
    case 'ATG':
      return 'Auto Tank Gauge (ATG)';
    case 'AIR_COMPRESSOR':
      return 'Air Compressor';
    case 'CNG_COMPRESSOR':
      return 'CNG Compressor';
    case 'DG_SET':
      return 'DG Power Generator';
    case 'OTHER':
      return 'Auxiliary Equipment';
    default:
      return type || 'Unknown';
  }
}

/**
 * Human-readable label for ticket status
 */
export function formatTicketStatus(status: EquipmentTicketStatus | string | null | undefined): string {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'ASSIGNED':
      return 'Assigned';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'RESOLVED':
      return 'Resolved — Awaiting Sign-off';
    case 'CLOSED':
      return 'Closed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status || 'Unknown';
  }
}

/**
 * Human-readable label for failure category
 */
export function formatFailureCategory(category: EquipmentFailureCategory | string | null | undefined): string {
  switch (category) {
    case 'ELECTRICAL':
      return 'Electrical & Power Supply';
    case 'MECHANICAL':
      return 'Mechanical & Hydraulics';
    case 'ELECTRONICS':
      return 'Electronics & Display';
    case 'COMMUNICATION':
      return 'POS / Network Communication';
    case 'CALIBRATION':
      return 'Meter Calibration / Drift';
    case 'PRESSURE':
      return 'Pressure / Flow Drop';
    case 'LEAKAGE':
      return 'Fuel / Fluid Leakage';
    case 'POWER':
      return 'Main Line Power Outage';
    case 'SOFTWARE':
      return 'Firmware / Automation Error';
    case 'OTHER':
      return 'Other / Uncategorized';
    default:
      return category || 'Unknown';
  }
}

/**
 * Human-readable label for ticket priority
 */
export function formatPriority(priority: EquipmentTicketPriority | string | null | undefined): string {
  switch (priority) {
    case 'LOW':
      return 'Low Priority';
    case 'MEDIUM':
      return 'Medium Priority';
    case 'HIGH':
      return 'High Priority';
    case 'CRITICAL':
      return 'Critical / Emergency';
    default:
      return priority || 'Unknown';
  }
}

/**
 * Human-readable label for event types
 */
export function formatEventType(eventType: EquipmentBreakdownEventType | string | null | undefined): string {
  switch (eventType) {
    case 'CREATED':
      return 'Breakdown Reported';
    case 'ASSIGNED':
      return 'Technician Assigned';
    case 'REASSIGNED':
      return 'Technician Reassigned';
    case 'WORK_STARTED':
      return 'Repair Work Started';
    case 'RESOLVED':
      return 'Breakdown Resolved';
    case 'SIGNED_OFF':
      return 'Signed Off & Closed';
    case 'CANCELLED':
      return 'Ticket Cancelled';
    default:
      return eventType || 'Event Logged';
  }
}

/**
 * Tailwind badge styling for ticket priorities
 */
export function getPriorityBadgeClass(priority: EquipmentTicketPriority | string | null | undefined): string {
  switch (priority) {
    case 'LOW':
      return 'bg-slate-800 text-slate-300 border border-slate-700';
    case 'MEDIUM':
      return 'bg-blue-950/80 text-blue-300 border border-blue-800/60';
    case 'HIGH':
      return 'bg-amber-950/80 text-amber-300 border border-amber-800/60';
    case 'CRITICAL':
      return 'bg-rose-950/90 text-rose-300 border border-rose-800/80 animate-pulse';
    default:
      return 'bg-slate-800 text-slate-300 border border-slate-700';
  }
}

/**
 * Tailwind badge styling for ticket statuses
 */
export function getStatusBadgeClass(status: EquipmentTicketStatus | string | null | undefined): string {
  switch (status) {
    case 'OPEN':
      return 'bg-rose-950/80 text-rose-300 border border-rose-800/70';
    case 'ASSIGNED':
      return 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/70';
    case 'IN_PROGRESS':
      return 'bg-blue-950/80 text-blue-300 border border-blue-800/70';
    case 'RESOLVED':
      return 'bg-amber-950/80 text-amber-300 border border-amber-800/70';
    case 'CLOSED':
      return 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/70';
    case 'CANCELLED':
      return 'bg-slate-800 text-slate-400 border border-slate-700';
    default:
      return 'bg-slate-800 text-slate-300 border border-slate-700';
  }
}

/**
 * Tailwind badge styling for asset status
 */
export function getAssetStatusBadgeClass(status: EquipmentAssetStatus | string | null | undefined): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60';
    case 'MAINTENANCE':
      return 'bg-amber-950/80 text-amber-300 border border-amber-800/60';
    case 'INACTIVE':
      return 'bg-slate-800 text-slate-400 border border-slate-700';
    case 'DECOMMISSIONED':
      return 'bg-rose-950/70 text-rose-400 border border-rose-900/50';
    default:
      return 'bg-slate-800 text-slate-300 border border-slate-700';
  }
}

export interface AvailableTicketActions {
  canAssign: boolean;
  canReassign: boolean;
  canStart: boolean;
  canResolve: boolean;
  canSignoff: boolean;
  canCancel: boolean;
}

/**
 * Evaluates available actions based strictly on backend state machine and permissions
 */
export function getAvailableTicketActions(
  status: EquipmentTicketStatus | string,
  permissions: { canManage: boolean; canSignoff: boolean }
): AvailableTicketActions {
  const { canManage, canSignoff } = permissions;

  return {
    canAssign: canManage && status === 'OPEN',
    canReassign: canManage && status === 'ASSIGNED',
    canStart: canManage && status === 'ASSIGNED',
    canResolve: canManage && status === 'IN_PROGRESS',
    canSignoff: canSignoff && status === 'RESOLVED',
    canCancel: canManage && (status === 'OPEN' || status === 'ASSIGNED'),
  };
}

/**
 * Targets eligible for breakdown reporting: only ACTIVE and MAINTENANCE targets are permitted by backend
 */
export function isTargetEligibleForTicket(targetOrStatus: EquipmentTarget | EquipmentAssetStatus | string): boolean {
  const status = typeof targetOrStatus === 'object' && targetOrStatus !== null ? targetOrStatus.status : targetOrStatus;
  return status === 'ACTIVE' || status === 'MAINTENANCE';
}

/**
 * Maps known backend error codes to helpful user messages
 */
export function getEquipmentErrorMessage(errorOrCode: any): string {
  if (!errorOrCode) return 'An unexpected error occurred. Please try again.';

  let code = '';
  let fallbackMsg = '';

  if (typeof errorOrCode === 'string') {
    code = errorOrCode;
  } else if (typeof errorOrCode === 'object') {
    code = errorOrCode.code || errorOrCode.error?.code || '';
    fallbackMsg = errorOrCode.message || errorOrCode.error?.message || '';
  }

  switch (code) {
    case 'EQUIPMENT_ASSET_CODE_EXISTS':
      return 'An equipment asset with this code already exists at this outlet.';
    case 'EQUIPMENT_ASSET_SERIAL_EXISTS':
      return 'An equipment asset with this serial number already exists at this outlet.';
    case 'EQUIPMENT_ASSET_NOT_FOUND':
      return 'The specified equipment asset was not found.';
    case 'EQUIPMENT_TICKET_NOT_FOUND':
      return 'The requested breakdown ticket was not found.';
    case 'EQUIPMENT_TARGET_NOT_FOUND':
      return 'The selected equipment or dispenser target does not exist.';
    case 'EQUIPMENT_TARGET_INACTIVE':
      return 'Cannot log breakdown ticket for an inactive or decommissioned target.';
    case 'INVALID_EQUIPMENT_TICKET_TRANSITION':
    case 'EQUIPMENT_TICKET_STATE_CHANGED':
      return 'This ticket changed while you were viewing it. The latest state has been reloaded.';
    case 'EQUIPMENT_TICKET_TERMINAL':
      return 'This ticket is in a terminal state (Closed/Cancelled) and cannot be modified.';
    case 'EQUIPMENT_TICKET_IMMUTABLE_FIELDS':
      return 'Target equipment, outlet, and breakdown timestamps are immutable once created.';
    case 'EQUIPMENT_EVENT_IMMUTABLE':
      return 'Audit event records are immutable and cannot be altered.';
    case 'INVALID_RESOLUTION_TIMESTAMP':
      return 'Resolution timestamp cannot be in the future or prior to the breakdown time.';
    case 'DOWNTIME_OVERFLOW':
      return 'Calculated downtime duration exceeds allowable range.';
    case 'FORBIDDEN':
      return 'You do not have permission to perform this equipment operation.';
    case 'VALIDATION_ERROR':
      return 'Please check the required fields and verify all input values.';
    default:
      return fallbackMsg || code || 'An unexpected error occurred. Please try again.';
  }
}

