import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../services/api';
import { PERMISSIONS } from '../../../shared/constants';
import { Document } from '../../../shared/types';
import { formatFileSize, formatDisplayDate, getHrErrorMessage } from './hrUi';
import {
  FileText,
  Upload,
  X,
  AlertCircle,
  Loader2,
  Lock,
  Image as ImageIcon,
} from 'lucide-react';

export interface HrDocumentPickerProps {
  outletId: string;
  selectedDocumentId?: string | null;
  onSelectDocument: (docId: string | null) => void;
  label?: string;
  required?: boolean;
  helperText?: string;
  mode?: 'document' | 'photo';
}

export const HrDocumentPicker: React.FC<HrDocumentPickerProps> = ({
  outletId,
  selectedDocumentId = null,
  onSelectDocument,
  label = 'Document Attachment',
  required = false,
  helperText,
  mode = 'document',
}) => {
  const { hasPermission } = useAuth();
  const canReadDocs = hasPermission(PERMISSIONS.DOCUMENTS_READ);
  const canWriteDocs = hasPermission(PERMISSIONS.DOCUMENTS_WRITE);

  const [vaultDocs, setVaultDocs] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch outlet documents if user has read permission
  useEffect(() => {
    if (!canReadDocs || !outletId) {
      setVaultDocs([]);
      return;
    }

    let isMounted = true;
    setLoadingDocs(true);

    apiFetch<Document[]>('/api/v1/documents')
      .then(res => {
        if (isMounted && res.success && Array.isArray(res.data)) {
          // Filter to current outlet documents
          let outletDocs = res.data.filter(d => d.outletId === outletId);

          // If photo mode, filter to image documents
          if (mode === 'photo') {
            outletDocs = outletDocs.filter(d => {
              const mime = d.mimeType?.toLowerCase() || '';
              const name = d.name?.toLowerCase() || '';
              return (
                mime === 'image/png' ||
                mime === 'image/jpeg' ||
                mime === 'image/jpg' ||
                name.endsWith('.png') ||
                name.endsWith('.jpg') ||
                name.endsWith('.jpeg')
              );
            });
          }

          setVaultDocs(outletDocs);
        }
      })
      .catch(() => {
        if (isMounted) setVaultDocs([]);
      })
      .finally(() => {
        if (isMounted) setLoadingDocs(false);
      });

    return () => {
      isMounted = false;
    };
  }, [outletId, canReadDocs, mode]);

  // Handle direct file upload to Document Vault
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input immediately
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Allowed types check
    if (mode === 'photo') {
      const allowedPhotoTypes = ['image/png', 'image/jpeg', 'image/jpg'];
      if (!allowedPhotoTypes.includes(file.type)) {
        setUploadError('Only PNG and JPEG photos are allowed.');
        return;
      }
    } else {
      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        setUploadError('Only PDF, PNG, and JPEG documents are allowed.');
        return;
      }
    }

    // 5MB limit
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File size exceeds the 5MB maximum limit.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('outletId', outletId);

      const res = await apiFetch<Document>('/api/v1/documents', {
        method: 'POST',
        body: formData,
      });

      if (res.success && res.data?.id) {
        setVaultDocs(prev => [res.data!, ...prev]);
        onSelectDocument(res.data.id);
      } else {
        const errMsg =
          getHrErrorMessage(res.error) ||
          (typeof res.error === 'object' ? res.error?.message : res.error) ||
          'Failed to upload document to vault.';
        setUploadError(errMsg);
      }
    } catch (err: any) {
      const errMsg =
        getHrErrorMessage(err) ||
        (typeof err === 'object' ? err?.message : err) ||
        'Error communicating with document vault.';
      setUploadError(errMsg);
    } finally {
      setUploading(false);
    }
  };

  const selectedDoc = vaultDocs.find(d => d.id === selectedDocumentId);

  // If user has neither read nor write permission on documents
  if (!canReadDocs && !canWriteDocs) {
    return (
      <div className="space-y-1">
        <label className="block text-xs font-semibold text-slate-300">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
        <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center gap-2.5 text-xs text-slate-400">
          <Lock className="w-4 h-4 text-slate-500 shrink-0" />
          <span>
            {required
              ? 'A document is required for this action, but Document Vault access is not available for your current role.'
              : 'Document Vault access is not available for your role. This optional attachment may be left blank.'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-slate-300">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
        {uploading && (
          <span className="text-[11px] text-orange-400 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Uploading to vault...
          </span>
        )}
      </div>

      {uploadError && (
        <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2 text-xs text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Selector and Upload Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* Document Vault Dropdown */}
        <div className="sm:col-span-2">
          <select
            value={selectedDocumentId || ''}
            onChange={e => onSelectDocument(e.target.value || null)}
            disabled={loadingDocs || !canReadDocs}
            className="w-full px-3 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 disabled:opacity-50"
          >
            <option value="">
              {mode === 'photo'
                ? '-- Select Photo from Document Vault --'
                : '-- Select Document from Document Vault --'}
            </option>
            {vaultDocs.map(doc => (
              <option key={doc.id} value={doc.id}>
                {doc.name} ({formatFileSize(doc.sizeBytes)})
              </option>
            ))}
          </select>
        </div>

        {/* Upload Button */}
        {canWriteDocs && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept={mode === 'photo' ? '.png,.jpg,.jpeg' : '.pdf,.png,.jpg,.jpeg'}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5 text-orange-400" />
              <span>Upload New</span>
            </button>
          </div>
        )}
      </div>

      {/* Selected Document Details Card */}
      {selectedDoc && (
        <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="p-1.5 rounded-lg bg-orange-500/10 text-orange-400 shrink-0">
              {mode === 'photo' ? (
                <ImageIcon className="w-4 h-4" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
            </div>
            <div className="truncate">
              <div className="font-semibold text-slate-200 truncate">{selectedDoc.name}</div>
              <div className="text-[10px] text-slate-400">
                {formatFileSize(selectedDoc.sizeBytes)} • Uploaded{' '}
                {formatDisplayDate(selectedDoc.createdAt)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectDocument(null)}
            className="p-1 text-slate-400 hover:text-rose-400 transition ml-2 shrink-0"
            title="Remove attachment"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {helperText && !selectedDoc && (
        <p className="text-[11px] text-slate-500">{helperText}</p>
      )}
    </div>
  );
};
