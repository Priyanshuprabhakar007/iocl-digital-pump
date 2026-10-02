import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';
import { Document } from '../../../shared/types';
import { formatFileSize, formatDisplayDate } from './municipalTaxUi';
import { FileText, Upload, Check, FolderGit2, AlertCircle, Loader2, X } from 'lucide-react';

interface MunicipalTaxDocumentPickerProps {
  outletId: string;
  selectedDocId: string | null;
  onSelectDocId: (id: string | null) => void;
  label: string;
  required?: boolean;
  helpText?: string;
}

export const MunicipalTaxDocumentPicker: React.FC<MunicipalTaxDocumentPickerProps> = ({
  outletId,
  selectedDocId,
  onSelectDocId,
  label,
  required = false,
  helpText,
}) => {
  const { hasPermission } = useAuth();
  const canReadDocs = hasPermission(PERMISSIONS.DOCUMENTS_READ);
  const canWriteDocs = hasPermission(PERMISSIONS.DOCUMENTS_WRITE);

  const [mode, setMode] = useState<'vault' | 'upload'>(canWriteDocs ? 'upload' : 'vault');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch outlet documents if allowed
  useEffect(() => {
    if (canReadDocs && outletId) {
      const fetchDocs = async () => {
        setLoadingDocs(true);
        try {
          const res = await apiFetch<Document[]>('/api/v1/documents');
          if (res.success && res.data) {
            const outletDocs = res.data.filter(d => d.outletId === outletId);
            setDocuments(outletDocs);
          }
        } catch {
          // ignore error
        } finally {
          setLoadingDocs(false);
        }
      };
      fetchDocs();
    }
  }, [canReadDocs, outletId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg'];
      if (!validTypes.includes(file.type)) {
        setUploadError('Only PDF, PNG, and JPEG files are supported.');
        setSelectedFile(null);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setUploadError('File size exceeds the 5 MB limit.');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !outletId) return;
    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('outletId', outletId);

    try {
      const res = await apiFetch<Document>('/api/v1/documents', {
        method: 'POST',
        body: formData,
      });

      if (res.success && res.data) {
        setUploadSuccess(`Uploaded "${selectedFile.name}" successfully.`);
        onSelectDocId(res.data.id);
        setDocuments(prev => [res.data!, ...prev]);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        setUploadError(res.error?.message || 'Failed to upload document.');
      }
    } catch (err: any) {
      setUploadError(err.message || 'An error occurred during upload.');
    } finally {
      setUploading(false);
    }
  };

  const selectedDoc = documents.find(d => d.id === selectedDocId);

  // If no permissions at all
  if (!canReadDocs && !canWriteDocs && !selectedDocId) {
    if (required) {
      return (
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            {label} <span className="text-orange-400">*</span>
          </label>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              A payment receipt document is required, but your current role does not have Document Vault access.
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label} (Optional)
        </label>
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-400">
          Document Vault access is not available for your role. You may create this due without an assessment attachment.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
          {label} {required ? <span className="text-orange-400">*</span> : <span className="text-slate-500 text-[11px] font-normal normal-case">(Optional)</span>}
        </label>
        {canReadDocs && canWriteDocs && (
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => { setMode('upload'); setUploadError(null); }}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                mode === 'upload' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Upload New
            </button>
            <button
              type="button"
              onClick={() => { setMode('vault'); setUploadError(null); }}
              className={`px-2.5 py-1 rounded font-medium transition-all ${
                mode === 'vault' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Select from Vault
            </button>
          </div>
        )}
      </div>

      {helpText && (
        <p className="text-[11px] text-slate-400">{helpText}</p>
      )}

      {/* Selected Document Pill */}
      {selectedDocId && (
        <div className="flex items-center justify-between p-2.5 bg-slate-800/80 border border-slate-700/60 rounded-xl text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-orange-400 shrink-0" />
            <div className="truncate">
              <span className="font-medium text-slate-200">
                {selectedDoc ? selectedDoc.name : `Doc ID: ${selectedDocId}`}
              </span>
              {selectedDoc && (
                <span className="text-slate-400 text-[10px] ml-2">
                  ({formatFileSize(selectedDoc.sizeBytes)} • {formatDisplayDate(selectedDoc.createdAt)})
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSelectDocId(null)}
            className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
            title="Remove document selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Mode */}
      {mode === 'upload' && canWriteDocs && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              id={`municipal-doc-upload-${label.replace(/\s+/g, '-').toLowerCase()}`}
            />
            <label
              htmlFor={`municipal-doc-upload-${label.replace(/\s+/g, '-').toLowerCase()}`}
              className="cursor-pointer flex-1 flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-slate-700 hover:border-orange-500/50 bg-slate-900/50 rounded-xl text-xs text-slate-300 transition-colors"
            >
              <Upload className="w-4 h-4 text-orange-400" />
              <span>{selectedFile ? selectedFile.name : 'Choose PDF, PNG, or JPG (max 5 MB)'}</span>
            </label>

            {selectedFile && (
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>{uploading ? 'Uploading...' : 'Upload'}</span>
              </button>
            )}
          </div>

          {uploadSuccess && (
            <p className="text-xs text-emerald-400">{uploadSuccess}</p>
          )}
          {uploadError && (
            <p className="text-xs text-rose-400">{uploadError}</p>
          )}
        </div>
      )}

      {/* Vault Mode */}
      {mode === 'vault' && canReadDocs && (
        <div className="space-y-2">
          {loadingDocs ? (
            <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
              <span>Loading Vault documents...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl text-xs text-slate-400 text-center">
              No documents found in vault for this outlet.
            </div>
          ) : (
            <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-800 bg-slate-900/50 p-1.5 rounded-xl">
              {documents.map(doc => {
                const isSelected = selectedDocId === doc.id;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => onSelectDocId(doc.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-colors text-left ${
                      isSelected
                        ? 'bg-orange-500/15 border border-orange-500/30 text-orange-200'
                        : 'hover:bg-slate-800/80 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FolderGit2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-orange-400' : 'text-slate-500'}`} />
                      <span className="truncate font-medium">{doc.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0 ml-2">
                      {formatFileSize(doc.sizeBytes)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
