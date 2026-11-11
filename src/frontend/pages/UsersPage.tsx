import './adminModern.css';
import { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { User, RoleCode } from '../../shared/types';
import { PERMISSIONS, ROLES } from '../../shared/constants';
import { SectionSearchBar } from '../components/common/SectionSearchBar';
import { filterUsersForSearch } from '../utils/sectionSearchHelpers';
import { Users, UserPlus, Shield, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

export const UsersPage = () => {
  const { hasPermission, userCtx } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const [form, setForm] = useState({
    empCode: '',
    name: '',
    email: '',
    phone: '',
    password: '',
    roleCodes: [ROLES.FIELD_OFFICER] as RoleCode[],
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
  });

  const fetchUsers = async () => {
    setLoading(true);
    const res = await apiFetch<any[]>('/api/v1/users');
    if (res.success && res.data) {
      setUsers(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return filterUsersForSearch(users, searchQuery);
  }, [users, searchQuery]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingUser) return;
    setCreatingUser(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (res.success) {
        setModalOpen(false);
        fetchUsers();
      } else {
        setErrorMsg(res.error?.message || 'Failed to create user');
      }
    } finally {
      setCreatingUser(false);
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    if (togglingUserId) return;
    setTogglingUserId(userId);
    try {
      const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const res = await apiFetch(`/api/v1/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.success) {
        fetchUsers();
      }
    } finally {
      setTogglingUserId(null);
    }
  };

  return (
    <div className="admin-modern space-y-6 pb-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-extrabold text-[#17365D]">Scoped User Directory</h1>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Enterprise IOCL Personnel • Scoped by: <span className="font-mono text-[#B8530D] font-bold">{userCtx?.primaryScope}</span>
          </p>
        </div>
        {hasPermission(PERMISSIONS.USERS_CREATE) && (
          <button
            onClick={() => {
              setErrorMsg(null);
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-[#17365D] text-xs font-bold rounded-lg shadow-lg shadow-orange-500/20 flex items-center gap-2 self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Provision New User</span>
          </button>
        )}
      </div>

      {/* Search Bar */}
      <SectionSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search employee name, code, email, role or scope..."
        resultCount={filteredUsers.length}
        totalCount={users.length}
      />

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#64748B] font-mono animate-pulse">
          Loading user directory...
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-[#E2E8F0] rounded-2xl p-8 bg-white/50 space-y-2">
          <p className="text-sm font-semibold text-[#475569]">No matching users within your authorized scope.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-sm">
          <div className="text-xs text-[#64748B] px-4 py-2 bg-[#F1F5F9]/40 border-b border-[#E2E8F0] font-mono flex items-center justify-between">
            <span>Showing {filteredUsers.length} of {users.length} users within your authorized scope</span>
          </div>
          <div className="admin-table-scroll overflow-x-auto" role="region" aria-label="Scrollable administration table" tabIndex={0}>
            <table className="admin-data-table w-full text-left text-xs">
              <thead className="bg-[#F1F5F9]/80 text-[#64748B] font-mono uppercase text-[10px] tracking-wider border-b border-[#D7E0EA]/80">
                <tr>
                  <th className="p-4">Employee</th>
                  <th className="p-4">Roles</th>
                  <th className="p-4">Primary Scope</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-[#334155]">
                {filteredUsers.map((u) => {
                  const userScope = u.scopes?.[0]?.scopeLevel || 'UNASSIGNED';
                  return (
                    <tr key={u.id} className="hover:bg-[#F1F5F9]/40 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-[#17365D]">{u.name}</div>
                        <div className="text-[11px] text-[#64748B] font-mono">
                          {u.empCode} • {u.email}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {u.roles?.map((r: string) => (
                            <span key={r} className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-800 border border-blue-500/30">
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 font-mono font-bold text-[#B8530D]">
                        {userScope}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 w-max ${
                          u.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30' : 'bg-red-500/10 text-red-700 border border-red-500/30'
                        }`}>
                          {u.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          <span>{u.status}</span>
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {hasPermission(PERMISSIONS.USERS_UPDATE) && (
                          <button
                            onClick={() => handleToggleStatus(u.id, u.status)}
                            className="px-2.5 py-1 bg-[#F1F5F9] hover:bg-[#E8EEF5] text-[#475569] hover:text-[#17365D] rounded border border-[#D7E0EA] text-[11px] font-mono"
                          >
                            Toggle Status
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Provision User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#F8FAFC]/55 backdrop-blur-sm">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-[#17365D]">Provision IOCL User</h2>
            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#475569] font-semibold mb-1">Emp Code</label>
                  <input
                    type="text"
                    required
                    placeholder="IOCL-FO-002"
                    value={form.empCode}
                    onChange={e => setForm({ ...form, empCode: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#475569] font-semibold mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Sanjay Kumar"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[#475569] font-semibold mb-1">Official Email</label>
                <input
                  type="email"
                  required
                  placeholder="sanjay@iocl.in"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D] font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#475569] font-semibold mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    placeholder="9830098300"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[#475569] font-semibold mb-1">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D] font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[#475569] font-semibold mb-1">Assign System Role</label>
                <select
                  value={form.roleCodes[0]}
                  onChange={e => setForm({ ...form, roleCodes: [e.target.value as RoleCode] })}
                  className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D] font-mono"
                >
                  <option value={ROLES.ADMIN}>ADMIN (Global)</option>
                  <option value={ROLES.STATE_OFFICE}>STATE_OFFICE</option>
                  <option value={ROLES.DIVISIONAL_OFFICE}>DIVISIONAL_OFFICE</option>
                  <option value={ROLES.FIELD_OFFICER}>FIELD_OFFICER</option>
                  <option value={ROLES.DEALER}>DEALER</option>
                  <option value={ROLES.CSP}>CSP</option>
                </select>
              </div>
              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={creatingUser}
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-[#F1F5F9] text-[#475569] rounded-lg font-semibold hover:bg-[#E8EEF5] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold shadow-md disabled:opacity-50"
                >
                  {creatingUser ? 'Provisioning...' : 'Provision User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
