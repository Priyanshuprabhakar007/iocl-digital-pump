import React, { useState } from 'react';
import { Search, Plus, Edit2, Eye, UserCheck, Phone, Mail, Building } from 'lucide-react';
import { Officer, Department } from '../../../shared/types';
import {
  filterOfficers,
  getOfficerStatusBadgeClass,
  getOfficerStatusLabel,
} from './orgUi';

interface OrgOfficersPanelProps {
  officers: Officer[];
  departments: Department[];
  isLoading: boolean;
  canWriteGlobal: boolean;
  onAddClick: () => void;
  onEditClick: (officer: Officer) => void;
  onViewDetails: (officer: Officer) => void;
}

export const OrgOfficersPanel: React.FC<OrgOfficersPanelProps> = ({
  officers,
  departments,
  isLoading,
  canWriteGlobal,
  onAddClick,
  onEditClick,
  onViewDetails,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filtered = filterOfficers(officers, searchQuery, deptFilter, statusFilter);

  // Map dept id to name
  const deptMap = new Map(departments.map(d => [d.id, d.name]));

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, name, designation, contact..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-orange-500 transition"
          >
            <option value="ALL">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-orange-500 transition"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="TRANSFERRED">Transferred</option>
            <option value="RETIRED">Retired</option>
          </select>
        </div>

        {canWriteGlobal && (
          <button
            onClick={onAddClick}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-medium transition shadow-md shadow-orange-600/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Officer</span>
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Loading officer directory...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
          <UserCheck className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h4 className="text-sm font-semibold text-slate-300 mb-1">
            {officers.length === 0 ? 'No officers registered' : 'No matching officers found'}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {officers.length === 0
              ? 'IOCL officer profiles have not been created yet.'
              : 'Try clearing your filters or searching with different criteria.'}
          </p>
          {officers.length === 0 && canWriteGlobal && (
            <button
              onClick={onAddClick}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-medium transition"
            >
              <Plus className="w-4 h-4" />
              <span>Register First Officer</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Emp Code</th>
                  <th className="py-3 px-4">Officer Name</th>
                  <th className="py-3 px-4">Designation</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Contact Info</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filtered.map((officer) => (
                  <tr key={officer.id} className="hover:bg-slate-800/30 transition group">
                    <td className="py-3 px-4 font-mono font-medium text-orange-400">
                      {officer.employeeCode}
                    </td>
                    <td className="py-3 px-4 font-medium text-white">
                      {officer.fullName}
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      {officer.designationTitle}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {deptMap.get(officer.departmentId) || officer.departmentName || officer.departmentId}
                    </td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      <div className="space-y-0.5">
                        {officer.phone && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-300">
                            <Phone className="w-3 h-3 text-slate-500" />
                            <span>{officer.phone}</span>
                          </div>
                        )}
                        {officer.email && (
                          <div className="flex items-center gap-1 text-[11px] text-slate-400">
                            <Mail className="w-3 h-3 text-slate-500" />
                            <span>{officer.email}</span>
                          </div>
                        )}
                        {!officer.phone && !officer.email && (
                          <span className="text-slate-600 italic text-[11px]">No contact info</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getOfficerStatusBadgeClass(officer.status)}`}>
                        {getOfficerStatusLabel(officer.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onViewDetails(officer)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition text-xs"
                          title="View officer profile and posting history"
                        >
                          <Eye className="w-3 h-3 text-orange-400" />
                          <span>View Details</span>
                        </button>
                        {canWriteGlobal && (
                          <button
                            onClick={() => onEditClick(officer)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition text-xs"
                            title="Edit officer profile"
                          >
                            <Edit2 className="w-3 h-3 text-slate-400" />
                            <span>Edit</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="py-2.5 px-4 bg-slate-950/40 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
            <span>Showing {filtered.length} of {officers.length} officers</span>
          </div>
        </div>
      )}
    </div>
  );
};
