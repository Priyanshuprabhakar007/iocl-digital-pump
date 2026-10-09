import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck,
  Check,
  User as UserIcon,
  Search,
  AlertCircle,
  Loader2,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { UserPermissionsDetails } from '../../shared/types';
import {
  computeUserPermissionCellState,
  getUserPermissionRestriction,
} from './rbacUiHelper';

export const RbacPage: React.FC = () => {
  const { userCtx } = useAuth();
  const isGlobalAdmin = userCtx?.isGlobalAdmin ?? false;

  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // User permission management states
  const [userList, setUserList] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [showInactiveUsers, setShowInactiveUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUserDetails, setSelectedUserDetails] = useState<UserPermissionsDetails | null>(null);
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);

  // Single-row saving state for immediate non-blocking toggle
  const [savingPermCodes, setSavingPermCodes] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Initial load: roles, role-permissions, and accessible users (for global admins)
  useEffect(() => {
    const fetchRbac = async () => {
      setLoading(true);
      const [rolesRes, permsRes] = await Promise.all([
        apiFetch<any[]>('/api/v1/roles'),
        apiFetch<any[]>('/api/v1/roles/permissions'),
      ]);

      if (rolesRes.data) setRoles(rolesRes.data);
      if (permsRes.data) setPermissions(permsRes.data);

      setLoading(false);
    };

    fetchRbac();
  }, []);

  // Load user list if user is a global administrator
  useEffect(() => {
    if (!isGlobalAdmin) return;

    const fetchUsers = async () => {
      setLoadingUsers(true);
      const res = await apiFetch<any[]>('/api/v1/users');
      if (res.success && Array.isArray(res.data)) {
        // Sort users alphabetically by name
        const sorted = [...res.data].sort((a, b) =>
          (a.name || '').localeCompare(b.name || '')
        );
        setUserList(sorted);
      }
      setLoadingUsers(false);
    };

    fetchUsers();
  }, [isGlobalAdmin]);

  // Load details and overrides whenever selectedUserId changes
  useEffect(() => {
    if (!selectedUserId || !isGlobalAdmin) {
      setSelectedUserDetails(null);
      return;
    }

    let isCurrent = true;
    const fetchSelectedUserPermissions = async () => {
      setLoadingUserDetails(true);
      setFeedback(null);

      const res = await apiFetch<UserPermissionsDetails>(
        `/api/v1/users/${selectedUserId}/permissions`
      );

      if (isCurrent) {
        if (res.success && res.data) {
          setSelectedUserDetails(res.data);
        } else {
          setSelectedUserDetails(null);
          setFeedback({
            type: 'error',
            message: res.error?.message || 'Failed to load user permissions.',
          });
        }
        setLoadingUserDetails(false);
      }
    };

    fetchSelectedUserPermissions();

    return () => {
      isCurrent = false;
    };
  }, [selectedUserId, isGlobalAdmin]);

  // Filtered user list for dropdown search
  const filteredUsers = useMemo(() => {
    return userList.filter((u) => {
      if (!showInactiveUsers && u.status !== 'ACTIVE') {
        return false;
      }
      if (!userSearch.trim()) return true;
      const q = userSearch.toLowerCase();
      const name = (u.name || '').toLowerCase();
      const code = (u.empCode || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const rolesStr = (u.roles || []).join(' ').toLowerCase();
      return (
        name.includes(q) ||
        code.includes(q) ||
        email.includes(q) ||
        rolesStr.includes(q)
      );
    });
  }, [userList, userSearch, showInactiveUsers]);

  // Selected user info
  const selectedUserMeta = useMemo(() => {
    if (!selectedUserId) return null;
    return userList.find((u) => u.id === selectedUserId) || null;
  }, [userList, selectedUserId]);

  // Check restriction for selected user
  const restriction = useMemo(() => {
    return getUserPermissionRestriction({
      currentUserId: userCtx?.user?.id,
      selectedUserId,
      selectedUserRoles: selectedUserDetails?.roleCodes || selectedUserMeta?.roles || [],
    });
  }, [userCtx?.user?.id, selectedUserId, selectedUserDetails, selectedUserMeta]);

  // Primary scope label derivation
  const selectedUserScopeLabel = useMemo(() => {
    if (!selectedUserDetails?.scopes || selectedUserDetails.scopes.length === 0) {
      if (selectedUserMeta?.scopes && selectedUserMeta.scopes.length > 0) {
        return selectedUserMeta.scopes[0].scopeLevel;
      }
      return 'None';
    }
    const levels = selectedUserDetails.scopes.map((s) => s.scopeLevel);
    if (levels.includes('GLOBAL')) return 'GLOBAL';
    if (levels.includes('STATE')) return 'STATE';
    if (levels.includes('DIVISION')) return 'DIVISION';
    if (levels.includes('SALES_AREA')) return 'SALES_AREA';
    if (levels.includes('OUTLET')) return 'OUTLET';
    return levels[0] || 'OUTLET';
  }, [selectedUserDetails, selectedUserMeta]);

  // Toggle permission handler
  const handleTogglePermission = async (permissionCode: string, targetEnabled: boolean) => {
    if (!selectedUserId || restriction.isDisabled || savingPermCodes.has(permissionCode)) {
      return;
    }

    setSavingPermCodes((prev) => new Set(prev).add(permissionCode));
    setFeedback(null);

    const res = await apiFetch<any>(
      `/api/v1/users/${selectedUserId}/permissions/${encodeURIComponent(permissionCode)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: targetEnabled }),
      }
    );

    setSavingPermCodes((prev) => {
      const next = new Set(prev);
      next.delete(permissionCode);
      return next;
    });

    if (res.success && res.data) {
      // Immediately update local effective permission codes and overrides
      setSelectedUserDetails((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          effectivePermissionCodes: res.data.effectivePermissionCodes,
          overrides: res.data.overrides,
        };
      });

      setFeedback({
        type: 'success',
        message: `Updated "${permissionCode}" to ${targetEnabled ? 'ENABLED' : 'DISABLED'} for ${selectedUserDetails?.user.name || 'user'}.`,
      });
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message || 'Unable to update user permission.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-extrabold text-white">RBAC Matrix & Granular Permissions</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Role defines WHAT actions a user can execute. Scope defines WHERE they can execute it.
          </p>
        </div>
      </div>

      {/* Global Admin: Manage User Permissions Section */}
      {isGlobalAdmin && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-purple-400" />
              <h2 className="text-sm font-bold text-white tracking-wide">
                Manage User Permissions
              </h2>
            </div>
            {selectedUserId && (
              <button
                onClick={() => {
                  setSelectedUserId('');
                  setSelectedUserDetails(null);
                  setFeedback(null);
                }}
                className="text-[11px] text-slate-400 hover:text-white hover:underline transition-colors"
              >
                Clear User Selection
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* User Selector Dropdown & Filter */}
            <div className="lg:col-span-5 space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Select User to View & Customize Access:
              </label>
              <div className="space-y-2">
                <div className="relative">
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    disabled={loadingUsers}
                    className="w-full pl-3 pr-8 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 cursor-pointer disabled:opacity-50"
                  >
                    <option value="">-- Choose a user to inspect and customize access --</option>
                    {filteredUsers.map((u) => {
                      const roleStr = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles.join(', ') : 'No Role';
                      return (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.empCode}) • {roleStr} {u.status !== 'ACTIVE' ? `[${u.status}]` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Filter Search Input */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Filter by name, code, email, role..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-lg text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showInactiveUsers}
                      onChange={(e) => setShowInactiveUsers(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-purple-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>Include Inactive</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Selected User Metadata Card */}
            {selectedUserId && (
              <div className="lg:col-span-7 bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                {loadingUserDetails ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-4 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    <span>Loading permissions for selected user...</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white">
                          {selectedUserDetails?.user.name || selectedUserMeta?.name || 'User'}
                        </span>
                        <span className="ml-2 font-mono text-[11px] text-purple-400">
                          {selectedUserDetails?.user.empCode || selectedUserMeta?.empCode}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                          (selectedUserDetails?.user.status || selectedUserMeta?.status) === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {selectedUserDetails?.user.status || selectedUserMeta?.status || 'ACTIVE'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1 border-t border-slate-800/80">
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Email</span>
                        <span className="text-slate-300 truncate block">
                          {selectedUserDetails?.user.email || selectedUserMeta?.email || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Role(s)</span>
                        <span className="text-slate-200 font-semibold truncate block">
                          {(selectedUserDetails?.roleCodes || selectedUserMeta?.roles || []).join(', ') || 'None'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Primary Scope</span>
                        <span className="text-slate-200 font-mono truncate block">
                          {selectedUserScopeLabel}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[10px] uppercase font-bold">Overrides</span>
                        <span className="text-amber-400 font-mono font-bold block">
                          {selectedUserDetails?.overrides?.length ?? 0} active
                        </span>
                      </div>
                    </div>

                    {/* Restriction Alert (Self-edit or Admin target) */}
                    {restriction.isDisabled && restriction.message && (
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs mt-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>{restriction.message}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Feedback Toast Banner */}
          {feedback && (
            <div
              className={`flex items-center justify-between p-3 rounded-xl text-xs border ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                )}
                <span>{feedback.message}</span>
              </div>
              <button
                onClick={() => setFeedback(null)}
                className="text-slate-400 hover:text-white text-xs ml-3"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/* RBAC Matrix Table */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 font-mono animate-pulse">
          Loading system RBAC configuration...
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/80 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-700/80">
                <tr>
                  <th className="p-4">Permission Code</th>
                  <th className="p-4">Description</th>
                  {roles.map((r) => (
                    <th key={r.id} className="p-4 text-center font-bold text-white whitespace-nowrap">
                      {r.code}
                    </th>
                  ))}

                  {/* Selected User Access Column Header */}
                  {selectedUserId && (
                    <th className="p-4 text-center bg-purple-950/40 text-purple-200 border-l border-purple-800/60 min-w-[200px]">
                      <div className="font-bold text-xs uppercase tracking-wide text-purple-300">
                        USER ACCESS
                      </div>
                      <div className="text-[10px] font-normal text-purple-200/80 truncate max-w-[180px] mx-auto mt-0.5">
                        {selectedUserDetails?.user.name || selectedUserMeta?.name || 'Selected User'}
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {permissions.map((p) => {
                  // User permission cell calculations
                  const cellState = selectedUserId && selectedUserDetails
                    ? computeUserPermissionCellState({
                        permissionCode: p.code,
                        inheritedPermissionCodes: selectedUserDetails.inheritedPermissionCodes,
                        overrides: selectedUserDetails.overrides,
                        effectivePermissionCodes: selectedUserDetails.effectivePermissionCodes,
                        roleCodes: selectedUserDetails.roleCodes,
                      })
                    : null;

                  const isRowSaving = savingPermCodes.has(p.code);

                  return (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-4 font-mono font-bold text-orange-400 whitespace-nowrap">
                        {p.code}
                      </td>
                      <td className="p-4 text-slate-300">
                        {p.description}
                      </td>

                      {/* Read-only Role Columns */}
                      {roles.map((r) => {
                        const hasPerm =
                          r.code === 'ADMIN' ||
                          r.permissions?.some((pItem: any) => pItem.code === p.code);

                        return (
                          <td key={r.id} className="p-4 text-center">
                            {hasPerm ? (
                              <div
                                className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto"
                                title={`Granted to role ${r.code}`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            ) : (
                              <div
                                className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-600 flex items-center justify-center mx-auto"
                                title={`Not granted to role ${r.code}`}
                              >
                                -
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Clickable Selected User Column */}
                      {selectedUserId && (
                        <td className="p-4 text-center bg-purple-500/5 border-l border-purple-900/40">
                          {loadingUserDetails ? (
                            <div className="w-6 h-6 rounded-full bg-slate-800 animate-pulse mx-auto" />
                          ) : isRowSaving ? (
                            <div className="w-6 h-6 flex items-center justify-center mx-auto">
                              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                            </div>
                          ) : cellState ? (
                            <div className="flex flex-col items-center justify-center gap-1">
                              {cellState.isEnabled ? (
                                <button
                                  type="button"
                                  disabled={restriction.isDisabled}
                                  onClick={() => handleTogglePermission(p.code, false)}
                                  title={restriction.isDisabled ? (restriction.message || '') : cellState.tooltip}
                                  className={`group flex items-center gap-1.5 transition-transform ${
                                    restriction.isDisabled ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'
                                  }`}
                                >
                                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500/30 group-hover:border-emerald-400 transition-colors">
                                    <Check className="w-3.5 h-3.5" />
                                  </div>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={restriction.isDisabled}
                                  onClick={() => handleTogglePermission(p.code, true)}
                                  title={restriction.isDisabled ? (restriction.message || '') : cellState.tooltip}
                                  className={`group flex items-center gap-1.5 transition-transform ${
                                    restriction.isDisabled ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105 cursor-pointer'
                                  }`}
                                >
                                  <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-600 flex items-center justify-center group-hover:border-slate-500 group-hover:bg-slate-700/50 transition-colors">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-slate-400" />
                                  </div>
                                </button>
                              )}

                              {/* Subtle Override Indicator Badge */}
                              {cellState.badgeText && (
                                <span
                                  className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border select-none ${
                                    cellState.overrideEffect === 'ALLOW'
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                  }`}
                                  title={cellState.tooltip}
                                >
                                  {cellState.badgeText}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
