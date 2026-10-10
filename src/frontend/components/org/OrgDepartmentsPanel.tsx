import React, { useState } from 'react';
import { Search, Plus, Edit2, Building2, Calendar, FileText } from 'lucide-react';
import { Department } from '../../../shared/types';
import {
  filterDepartments,
  getOrgStatusBadgeClass,
  getOrgStatusLabel,
  formatOrgDate,
} from './orgUi';

interface OrgDepartmentsPanelProps {
  departments: Department[];
  isLoading: boolean;
  canWriteGlobal: boolean;
  onAddClick: () => void;
  onEditClick: (dept: Department) => void;
}

export const OrgDepartmentsPanel: React.FC<OrgDepartmentsPanelProps> = ({
  departments,
  isLoading,
  canWriteGlobal,
  onAddClick,
  onEditClick,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filtered = filterDepartments(departments, searchQuery, statusFilter);

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <div className="flex flex-1 items-center gap-2.5">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code, name, description..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-orange-500 transition"
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        {canWriteGlobal && (
          <button
            onClick={onAddClick}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-medium transition shadow-md shadow-orange-600/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Department</span>
          </button>
        )}
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center">
          <div className="w-8 h-8 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400">Loading departments catalog...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center">
          <Building2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h4 className="text-sm font-semibold text-slate-300 mb-1">
            {departments.length === 0 ? 'No departments configured' : 'No matching departments'}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {departments.length === 0
              ? 'Organization master departments have not been created yet.'
              : 'Try adjusting your search criteria or status filter.'}
          </p>
          {departments.length === 0 && canWriteGlobal && (
            <button
              onClick={onAddClick}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-medium transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Department</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Department Name</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Updated Date</th>
                  {canWriteGlobal && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filtered.map((dept) => (
                  <tr key={dept.id} className="hover:bg-slate-800/30 transition group">
                    <td className="py-3 px-4 font-mono font-medium text-orange-400">
                      {dept.code}
                    </td>
                    <td className="py-3 px-4 font-medium text-white">
                      {dept.name}
                    </td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate" title={dept.description || ''}>
                      {dept.description || <span className="text-slate-600 italic">No description</span>}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getOrgStatusBadgeClass(dept.status)}`}>
                        {getOrgStatusLabel(dept.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {formatOrgDate(dept.updatedAt)}
                    </td>
                    {canWriteGlobal && (
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onEditClick(dept)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition text-xs"
                        >
                          <Edit2 className="w-3 h-3 text-slate-400" />
                          <span>Edit</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="py-2.5 px-4 bg-slate-950/40 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
            <span>Showing {filtered.length} of {departments.length} departments</span>
          </div>
        </div>
      )}
    </div>
  );
};
