import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../services/api';
import { PERMISSIONS } from '../../../shared/constants';
import { Document } from '../../../shared/types';
import {
  formatFileSize,
  formatDisplayDate,
  getHrDocumentUploadErrorMessage,
  validateHrUploadFile,
  isHrDocumentCompatibleWithMode,
} from './hrUi';
import {
  FileText,
  Upload,
  X,
  AlertCircle,
  Loader2,
  Lock,
  Image as ImageIcon,
  RefreshCw,
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
  const [lastFailedFile, setLastFailedFile] = useState<File | null>(null);

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
          const outletDocs = res.data.filter(
            d => d.outletId === outletId && isHrDocumentCompatibleWithMode(d, mode)
          );

          setVaultDocs(prev => {
            const merged = [...prev];
            for (const doc of outletDocs) {
              if (!merged.some(existing => existing.id === doc.id)) {
                merged.push(doc);
              }
            }
            return merged;
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setVaultDocs(prev => prev);
        }
      })
      .finally(() => {
        if (isMounted) setLoadingDocs(false);
      });

    return () => {
      isMounted = false;
    };
  }, [outletId, canReadDocs, mode]);

  const uploadFileToVault = async (file: File) => {
    setLastFailedFile(file);

    if (!outletId || !outletId.trim()) {
      setUploadError('Please select a valid retail outlet before uploading documents.');
      return;
    }

    const validation = validateHrUploadFile(file, mode);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid file selected for upload.');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('outletId', outletId);

      // Do not manually set Content-Type for multipart uploads; apiFetch lets browser set boundary
      const res = await apiFetch<Document>('/api/v1/documents', {
        method: 'POST',
        body: formData,
      });

      if (res.success && res.data?.id) {
        if (!isHrDocumentCompatibleWithMode(res.data, mode)) {
          setUploadError(
            mode === 'photo'
              ? 'Only PNG and JPEG photos are allowed.'
              : 'Only PDF, PNG, and JPEG documents are allowed.'
          );
          return;
        }

        const uploadedDoc = res.data;
        setLastFailedFile(null);
        setUploadError(null);
        setVaultDocs(prev => [uploadedDoc, ...prev.filter(d => d.id !== uploadedDoc.id)]);
        onSelectDocument(uploadedDoc.id);
      } else {
        const errMsg = getHrDocumentUploadErrorMessage(res.error);
        setUploadError(errMsg);
      }
    } catch (err: any) {
      const errMsg = getHrDocumentUploadErrorMessage(err);
      setUploadError(errMsg);
    } finally {
      setUploading(false);
    }
  };

  // Handle direct file upload to Document Vault
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input immediately so selecting the same file again triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = '';

    await uploadFileToVault(file);
  };

  const handleRetryUpload = async () => {
    if (uploading) return;
    setUploadError(null);
    if (lastFailedFile && validateHrUploadFile(lastFailedFile, mode).valid) {
      await uploadFileToVault(lastFailedFile);
    } else {
      fileInputRef.current?.click();
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
              accept={
                mode === 'photo'
                  ? '.png,.jpg,.jpeg,image/png,image/jpeg'
                  : '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'
              }
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

      {/* Error Display Directly Beneath Upload Control with Retry Option */}
      {uploadError && (
        <div
          role="alert"
          className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start justify-between gap-2 text-xs text-rose-400"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{uploadError}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {canWriteDocs && (
              <button
                type="button"
                onClick={handleRetryUpload}
                disabled={uploading}
                className="px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-[11px] font-bold text-rose-200 flex items-center gap-1 transition disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setUploadError(null)}
              className="p-1 text-rose-400/70 hover:text-rose-300 transition"
              title="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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
