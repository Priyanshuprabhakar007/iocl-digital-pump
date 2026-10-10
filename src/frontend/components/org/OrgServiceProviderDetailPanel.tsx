import React from 'react';
import {
  ArrowLeft,
  Edit2,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  CreditCard,
  User,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { ServiceProvider, OutletServiceProviderAssignment } from '../../../shared/types';
import {
  getOrgStatusBadgeClass,
  getOrgStatusLabel,
  formatOrgDate,
  formatAssignmentPeriod,
  getServiceTypeBadgeClass,
  getServiceTypeLabel,
} from './orgUi';

interface OrgServiceProviderDetailPanelProps {
  provider: ServiceProvider;
  assignments?: OutletServiceProviderAssignment[];
  canWriteGlobal: boolean;
  onBack: () => void;
  onEdit: (provider: ServiceProvider) => void;
}

export const OrgServiceProviderDetailPanel: React.FC<OrgServiceProviderDetailPanelProps> = ({
  provider,
  assignments = [],
  canWriteGlobal,
  onBack,
  onEdit,
}) => {
  return (
    <div className="space-y-6">
      {/* Navigation & Actions */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Service Providers</span>
        </button>

        {canWriteGlobal && (
          <button
            onClick={() => onEdit(provider)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium border border-slate-700 transition"
          >
            <Edit2 className="w-3.5 h-3.5 text-orange-400" />
            <span>Edit Service Provider</span>
          </button>
        )}
      </div>

      {/* Main Profile Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-700 flex items-center justify-center text-orange-400 font-bold text-sm tracking-wider shadow-inner">
              <Building2 className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-base font-bold text-white tracking-tight">
                  {provider.providerName}
                </h3>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getOrgStatusBadgeClass(
                    provider.status
                  )}`}
                >
                  {getOrgStatusLabel(provider.status)}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Code: {provider.providerCode}
              </p>
            </div>
          </div>

          <div className="text-right sm:block">
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider block">
              Registered Date
            </span>
            <span className="font-mono text-xs font-bold text-slate-200">
              {formatOrgDate(provider.createdAt)}
            </span>
          </div>
        </div>

        {/* Detailed Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-5 text-xs">
          {/* Key Personnel */}
          <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/40">
            <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Contact & Personnel</span>
            </h5>
            <div className="space-y-2">
              <div>
                <span className="text-slate-500 text-[11px] block">Proprietor / Director</span>
                <span className="text-white font-medium">
                  {provider.proprietorOrAuthorizedPerson || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Liaison Contact Person</span>
                <span className="text-white font-medium">{provider.contactPerson || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Phone / Mobile</span>
                <span className="text-slate-300 font-mono">
                  {provider.phone || '—'}
                  {provider.alternatePhone && ` / ${provider.alternatePhone}`}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Email</span>
                <span className="text-slate-300 font-mono">{provider.email || '—'}</span>
              </div>
            </div>
          </div>

          {/* Tax Identification */}
          <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/40">
            <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-slate-500" />
              <span>Statutory & Tax Identifiers</span>
            </h5>
            <div className="space-y-2">
              <div>
                <span className="text-slate-500 text-[11px] block">GSTIN Registration</span>
                <span className="text-white font-mono font-medium">
                  {provider.gstin || 'Not registered'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Income Tax PAN</span>
                <span className="text-white font-mono font-medium">
                  {provider.pan || 'Not registered'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[11px] block">Assignment Eligibility</span>
                <span
                  className={
                    provider.status === 'ACTIVE'
                      ? 'text-emerald-400 font-medium inline-flex items-center gap-1 text-[11px]'
                      : 'text-amber-400 font-medium inline-flex items-center gap-1 text-[11px]'
                  }
                >
                  {provider.status === 'ACTIVE' ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Authorized for new outlet contracts</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Inactive - locked from new outlet deployments</span>
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Address & Headquarters */}
          <div className="space-y-3 bg-slate-950/40 p-4 rounded-xl border border-slate-800/40">
            <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span>Office Address</span>
            </h5>
            <div className="space-y-1.5 text-slate-300">
              <p className="leading-relaxed">
                {provider.address || 'Address details not recorded'}
              </p>
              <div className="pt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                {provider.city && <span>City: {provider.city}</span>}
                {provider.district && <span>District: {provider.district}</span>}
                {provider.stateText && <span>State: {provider.stateText}</span>}
                {provider.pincode && <span className="font-mono">PIN: {provider.pincode}</span>}
              </div>
            </div>
          </div>
        </div>

        {provider.notes && (
          <div className="mt-4 pt-3 border-t border-slate-800/60 text-xs">
            <span className="text-[11px] text-slate-500 block mb-0.5">Vendor Remarks</span>
            <p className="text-slate-300 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/40">
              {provider.notes}
            </p>
          </div>
        )}
      </div>

      {/* Outlet Assignments Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
            Active & Historical Outlet Deployments
          </h4>
          <span className="text-[11px] font-mono text-slate-400">
            Total Deployments: {assignments.length}
          </span>
        </div>

        {assignments.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center">
            <Building2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <h5 className="text-xs font-semibold text-slate-300 mb-1">
              No outlet assignments recorded
            </h5>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
              This service provider has not been assigned to any retail outlet contracts yet.
            </p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
                    <th className="py-3 px-4">Outlet</th>
                    <th className="py-3 px-4">Service Type</th>
                    <th className="py-3 px-4">Contract #</th>
                    <th className="py-3 px-4">Tenure Period</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-xs">
                  {assignments.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 text-white font-medium">
                        {a.outletName || a.outletId}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getServiceTypeBadgeClass(
                            a.serviceType
                          )}`}
                        >
                          {getServiceTypeLabel(a.serviceType)}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                        {a.contractNumber || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                        {formatAssignmentPeriod(a.effectiveFrom, a.effectiveTo)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getOrgStatusBadgeClass(
                            a.status
                          )}`}
                        >
                          {getOrgStatusLabel(a.status)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px] max-w-xs truncate">
                        {a.notes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
