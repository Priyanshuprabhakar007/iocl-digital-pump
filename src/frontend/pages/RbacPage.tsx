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
} from 'lucide-react';
import { UserPermissionsDetails } from '../../shared/types';
import { SectionSearchBar } from '../components/common/SectionSearchBar';
import { filterPermissionsForSearch } from '../utils/sectionSearchHelpers';
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
  const [permissionSearch, setPermissionSearch] = useState('');
  const [showInactiveUsers, setShowInactiveUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUserDetails, setSelectedUserDetails] = useState<UserPermissionsDetails | null>(null);
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);

  // Single-row saving state for immediate non-blocking toggle
  const [savingPermCodes, setSavingPermCodes] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  useEffect(() => {
    if (!isGlobalAdmin) return;
    const fetchUsers = async () => {
      setLoadingUsers(true);
      const res = await apiFetch<any[]>('/api/v1/users');
      if (res.success && Array.isArray(res.data)) {
        const sorted = [...res.data].sort((a, b) =>
          (a.name || '').localeCompare(b.name || '')
        );
        setUserList(sorted);
      }
      setLoadingUsers(false);
    };
    fetchUsers();
  }, [isGlobalAdmin]);

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

  const filteredUsers = useMemo(() => {
    return userList.filter((u) => {
      if (!showInactiveUsers && u.status !== 'ACTIVE') {
        return false;
      }
      if (!userSearch.trim()) return true;
      const q = userSearch.toLowerCase();
      return (
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.empCode && u.empCode.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q))
      );
    });
  }, [userList, userSearch, showInactiveUsers]);

  const selectedUserMeta = useMemo(() => {
    return userList.find((u) => u.id === selectedUserId);
  }, [userList, selectedUserId]);

  const restriction = useMemo(() => {
    return getUserPermissionRestriction({
      selectedUserRoles: selectedUserDetails?.roleCodes || selectedUserMeta?.roles || [],
      currentUserId: userCtx?.user?.id,
    });
  }, [selectedUserDetails, selectedUserMeta]);

  const filteredPermissions = useMemo(() => {
    return filterPermissionsForSearch(permissions, permissionSearch, roles);
  }, [permissions, permissionSearch, roles]);

  const handleTogglePermission = async (permissionCode: string, targetEnabled: boolean) => {
    if (!selectedUserId || restriction.isDisabled) return;
    setSavingPermCodes((prev) => new Set(prev).add(permissionCode));
    setFeedback(null);

    const endpoint = targetEnabled
      ? `/api/v1/users/${selectedUserId}/permissions/grant`
      : `/api/v1/users/${selectedUserId}/permissions/revoke`;

    const res = await apiFetch<UserPermissionsDetails>(endpoint, {
      method: 'POST',
      body: JSON.stringify({ permissionCode }),
    });

    if (res.success && res.data) {
      setSelectedUserDetails((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          effectivePermissionCodes: res.data!.effectivePermissionCodes,
          overrides: res.data!.overrides,
        };
      });
      setFeedback({
        type: 'success',
        message: `Updated "${permissionCode}" to ${targetEnabled ? 'ENABLED' : 'DISABLED'} for ${selectedUserDetails?.user?.name || 'user'}.`,
      });
    } else {
      setFeedback({
        type: 'error',
        message: res.error?.message || 'Unable to update user permission.',
      });
    }

    setSavingPermCodes((prev) => {
      const next = new Set(prev);
      next.delete(permissionCode);
      return next;
    });
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
              <span className="font-bold text-sm text-white">User Permission Inspection & Overrides</span>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactiveUsers}
                onChange={(e) => setShowInactiveUsers(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-purple-500 focus:ring-purple-500"
              />
              <span>Show Inactive Users</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">Search User Accounts</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Filter by name, emp code, or email..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1">Select Personnel</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
              >
                <option value="">-- Choose User for Permission Override --</option>
                {filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.empCode}) — {u.status} [{u.scopes?.[0]?.scopeLevel || 'UNASSIGNED'}]
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Restriction Notice */}
          {selectedUserId && restriction.isDisabled && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{restriction.message}</span>
            </div>
          )}

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

      {/* Search Bar for Permissions */}
      <SectionSearchBar
        value={permissionSearch}
        onChange={setPermissionSearch}
        placeholder="Search permission code, description or role..."
        resultCount={filteredPermissions.length}
        totalCount={permissions.length}
      />

      {/* RBAC Matrix Table */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 font-mono animate-pulse">
          Loading system RBAC configuration...
        </div>
      ) : filteredPermissions.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-slate-800 rounded-2xl p-8 bg-slate-900/50">
          <p className="text-sm font-semibold text-slate-300">No matching permissions or roles found.</p>
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
                        {selectedUserDetails?.user?.name || selectedUserMeta?.name || 'Selected User'}
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {filteredPermissions.map((p) => {
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
              </tbody></table></div></div>)}</div>);};
