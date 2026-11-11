import './adminModern.css';
import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { UserScopeAssignment, User, State, Division, SalesArea, RetailOutlet } from '../../shared/types';
import { PERMISSIONS, SCOPE_LEVELS, ScopeLevel } from '../../shared/constants';
import { SectionSearchBar } from '../components/common/SectionSearchBar';
import { filterScopesForSearch } from '../utils/sectionSearchHelpers';
import { MapPin, Plus, Trash2, AlertCircle, CheckCircle2, Building2 } from 'lucide-react';
import { buildScopeAssignmentPayload } from './scopesUiHelper';

export const ScopesPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [scopes, setScopes] = useState<UserScopeAssignment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [salesAreas, setSalesAreas] = useState<SalesArea[]>([]);
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form
  const [selectedUserId, setSelectedUserId] = useState('');
  const [scopeLevel, setScopeLevel] = useState<ScopeLevel>('STATE');
  const [stateId, setStateId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [salesAreaId, setSalesAreaId] = useState('');
  const [outletId, setOutletId] = useState('');

  const fetchAllData = async () => {
    setLoading(true);
    const [scopesRes, usersRes, statesRes, divRes, saRes, outletRes] = await Promise.all([
      apiFetch<UserScopeAssignment[]>('/api/v1/scopes'),
      apiFetch<User[]>('/api/v1/users'),
      apiFetch<State[]>('/api/v1/hierarchy/states'),
      apiFetch<Division[]>('/api/v1/hierarchy/divisions'),
      apiFetch<SalesArea[]>('/api/v1/hierarchy/sales-areas'),
      apiFetch<RetailOutlet[]>('/api/v1/outlets'),
    ]);
    if (scopesRes.data) setScopes(scopesRes.data);
    if (usersRes.data) setUsers(usersRes.data);
    if (statesRes.data) setStates(statesRes.data);
    if (divRes.data) setDivisions(divRes.data);
    if (saRes.data) setSalesAreas(saRes.data);
    if (outletRes.data) setOutlets(outletRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const filteredScopes = useMemo(() => {
    return filterScopesForSearch(scopes, searchQuery, users, states, divisions, salesAreas, outlets);
  }, [scopes, searchQuery, users, states, divisions, salesAreas, outlets]);

  const handleCreateScope = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const validation = buildScopeAssignmentPayload({
      userId: selectedUserId,
      scopeLevel,
      stateId,
      divisionId,
      salesAreaId,
      outletId,
    });
    if (!validation.valid) {
      setErrorMsg(validation.errorMessage || 'Invalid scope configuration');
      return;
    }
    const res = await apiFetch<UserScopeAssignment>('/api/v1/scopes', {
      method: 'POST',
      body: JSON.stringify(validation.payload),
    });
    if (res.success) {
      setModalOpen(false);
      fetchAllData();
    } else {
      setErrorMsg(res.error?.message || 'Failed to assign scope');
    }
  };

  const handleDeleteScope = async (scopeId: string) => {
    const res = await apiFetch(`/api/v1/scopes/${scopeId}`, { method: 'DELETE' });
    if (res.success) {
      fetchAllData();
    }
  };

  const filteredDivisions = stateId ? divisions.filter(d => d.stateId === stateId) : divisions;
  const filteredSalesAreas = divisionId ? salesAreas.filter(sa => sa.divisionId === divisionId) : salesAreas;
  const filteredOutlets = salesAreaId ? outlets.filter(o => o.salesAreaId === salesAreaId) : outlets;

  return (
    <div className="admin-modern space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="w-6 h-6 text-[#B8530D]" />
            <h1 className="text-xl font-extrabold text-[#17365D]">Organizational Scope Assignments</h1>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Map system users to administrative and operational organizational boundaries.
          </p>
        </div>
        {hasPermission(PERMISSIONS.SCOPES_ASSIGN) && (
          <button
            onClick={() => {
              setErrorMsg(null);
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-[#17365D] text-xs font-bold rounded-lg shadow-lg shadow-orange-500/20 flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Assign Scope</span>
          </button>
        )}
      </div>

      {/* Search Bar */}
      <SectionSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search user, employee code, scope or organizational unit..."
        resultCount={filteredScopes.length}
        totalCount={scopes.length}
      />

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#64748B] font-mono animate-pulse">
          Loading scope assignments...
        </div>
      ) : filteredScopes.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-[#E2E8F0] rounded-2xl p-8 bg-white/50 space-y-2">
          <p className="text-sm font-semibold text-[#475569]">No matching scope assignments within your authorized organizational boundary.</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden shadow-sm">
          <div className="admin-table-scroll overflow-x-auto" role="region" aria-label="Scrollable administration table" tabIndex={0}>
            <table className="admin-data-table w-full text-left text-xs">
              <thead className="bg-[#F1F5F9]/80 text-[#64748B] font-mono uppercase text-[10px] tracking-wider border-b border-[#D7E0EA]/80">
                <tr>
                  <th className="p-4">User</th>
                  <th className="p-4">Scope Level</th>
                  <th className="p-4">Target Entity Boundary</th>
                  <th className="p-4">Created By</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-[#334155]">
                {filteredScopes.map((s) => (
                  <tr key={s.id} className="hover:bg-[#F1F5F9]/40 transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-[#17365D]">{s.userName}</div>
                      <div className="text-[11px] text-[#64748B] font-mono">{s.userId}</div>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded text-[10px] font-mono font-bold bg-orange-500/10 text-[#B8530D] border border-orange-500/30">
                        {s.scopeLevel}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-[#475569]">
                      {s.scopeLevel === 'GLOBAL' && <span className="text-purple-400 font-semibold">ALL-INDIA GLOBAL ACCESS</span>}
                      {s.scopeLevel === 'STATE' && <span>State: <strong className="text-[#17365D]">{s.stateName || s.stateId}</strong></span>}
                      {s.scopeLevel === 'DIVISION' && <span>Division: <strong className="text-[#17365D]">{s.divisionName || s.divisionId}</strong></span>}
                      {s.scopeLevel === 'SALES_AREA' && <span>Sales Area: <strong className="text-[#17365D]">{s.salesAreaName || s.salesAreaId}</strong></span>}
                      {s.scopeLevel === 'OUTLET' && <span>Outlet: <strong className="text-[#17365D]">{s.outletName || s.outletId}</strong></span>}
                    </td>
                    <td className="p-4 font-mono text-[11px] text-[#64748B]">
                      {s.createdBy}
                    </td>
                    <td className="p-4 text-right">
                      {hasPermission(PERMISSIONS.SCOPES_ASSIGN) && (
                        <button
                          onClick={() => handleDeleteScope(s.id)}
                          className="p-1.5 text-[#64748B] hover:text-red-700 hover:bg-red-500/10 rounded transition-colors"
                          title="Revoke Scope"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign Scope Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#F8FAFC]/55 backdrop-blur-sm">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-[#17365D]">Assign User Scope</h2>
            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            <form onSubmit={handleCreateScope} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#475569] font-semibold mb-1">Select User</label>
                <select
                  required
                  value={selectedUserId}
                  onChange={e => {
                    setSelectedUserId(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D] font-mono"
                >
                  <option value="">-- Choose User --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.empCode})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[#475569] font-semibold mb-1">Scope Level</label>
                <select
                  value={scopeLevel}
                  onChange={e => {
                    setScopeLevel(e.target.value as ScopeLevel);
                    setErrorMsg(null);
                  }}
                  className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D] font-mono"
                >
                  <option value="GLOBAL">GLOBAL (All India)</option>
                  <option value="STATE">STATE (State Office Boundary)</option>
                  <option value="DIVISION">DIVISION (Divisional Office Boundary)</option>
                  <option value="SALES_AREA">SALES_AREA (Sales Area Boundary)</option>
                  <option value="OUTLET">OUTLET (Single Outlet Boundary)</option>
                </select>
              </div>
              {scopeLevel !== 'GLOBAL' && (
                <div>
                  <label className="block text-[#475569] font-semibold mb-1">State Office</label>
                  <select
                    value={stateId}
                    onChange={e => {
                      setStateId(e.target.value);
                      setDivisionId('');
                      setSalesAreaId('');
                      setOutletId('');
                      setErrorMsg(null);
                    }}
                    className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D] font-mono"
                  >
                    <option value="">-- Select State --</option>
                    {states.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
              )}
              {(scopeLevel === 'DIVISION' || scopeLevel === 'SALES_AREA' || scopeLevel === 'OUTLET') && (
                <div>
                  <label className="block text-[#475569] font-semibold mb-1">Divisional Office</label>
                  <select
                    value={divisionId}
                    onChange={e => {
                      setDivisionId(e.target.value);
                      setSalesAreaId('');
                      setOutletId('');
                      setErrorMsg(null);
                    }}
                    className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D] font-mono"
                  >
                    <option value="">-- Select Division --</option>
                    {filteredDivisions.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                  </select>
                </div>
              )}
              {(scopeLevel === 'SALES_AREA' || scopeLevel === 'OUTLET') && (
                <div>
                  <label className="block text-[#475569] font-semibold mb-1">Sales Area</label>
                  <select
                    value={salesAreaId}
                    onChange={e => {
                      setSalesAreaId(e.target.value);
                      setOutletId('');
                      setErrorMsg(null);
                    }}
                    className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D] font-mono"
                  >
                    <option value="">-- Select Sales Area --</option>
                    {filteredSalesAreas.map(sa => <option key={sa.id} value={sa.id}>{sa.name} ({sa.code})</option>)}
                  </select>
                </div>
              )}
              {scopeLevel === 'OUTLET' && (
                <div>
                  <label className="block text-[#475569] font-semibold mb-1">Retail Outlet</label>
                  <select
                    value={outletId}
                    onChange={e => {
                      setOutletId(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full px-3 py-2 bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg text-[#17365D] font-mono"
                  >
                    <option value="">-- Select Outlet --</option>
                    {filteredOutlets.map(o => <option key={o.id} value={o.id}>{o.name} ({o.roCode})</option>)}
                  </select>
                </div>
              )}
              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-[#F1F5F9] text-[#475569] rounded-lg font-semibold hover:bg-[#E8EEF5]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold shadow-md"
                >
                  Confirm Scope
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
