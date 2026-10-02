import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../../shared/constants';
import { Document } from '../../../shared/types';
import { formatFileSize, formatDisplayDate } from './utilityUi';
import { FileText, Upload, Check, FolderGit2, AlertCircle, Loader2, X } from 'lucide-react';

interface UtilityDocumentPickerProps {
  outletId: string;
  selectedDocId: string | null;
  onSelectDocId: (id: string) => void;
  label: string;
  required?: boolean;
  helpText?: string;
}

export const UtilityDocumentPicker: React.FC<UtilityDocumentPickerProps> = ({
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
        // add to local list
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
    return (
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label} {required && <span className="text-orange-400">*</span>}
        </label>
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            A bill/receipt document is required, but your current role does not have Document Vault access.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
          {label} {required && <span className="text-orange-400">*</span>}
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

      {helpText && <p className="text-xs text-slate-400">{helpText}</p>}

      {/* Selected Document Indicator */}
      {selectedDocId && (
        <div className="flex items-center justify-between p-2.5 bg-slate-900/90 border border-emerald-500/30 rounded-xl text-xs">
          <div className="flex items-center gap-2 text-emerald-300 font-medium truncate">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">
              {selectedDoc ? selectedDoc.name : `Selected Document ID: ${selectedDocId}`}
            </span>
            {selectedDoc && (
              <span className="text-slate-400 text-[11px] shrink-0 font-normal">
                ({formatFileSize(selectedDoc.sizeBytes)})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelectDocId('')}
            className="text-slate-400 hover:text-rose-400 p-1 rounded transition-colors"
            title="Remove attachment"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Upload Mode */}
      {mode === 'upload' && canWriteDocs && (
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileChange}
              disabled={uploading}
              className="text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-orange-400 hover:file:bg-slate-700 cursor-pointer w-full"
            />
            {selectedFile && (
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-sm shadow-orange-500/20"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    Upload
                  </>
                )}
              </button>
            )}
          </div>
          <div className="text-[11px] text-slate-500">
            Allowed: PDF, PNG, JPEG (Max: 5 MB). File will be uploaded directly to Document Vault.
          </div>
          {uploadError && (
            <div className="text-xs text-rose-400 flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
          {uploadSuccess && (
            <div className="text-xs text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{uploadSuccess}</span>
            </div>
          )}
        </div>
      )}

      {/* Vault Select Mode */}
      {mode === 'vault' && canReadDocs && (
        <div className="space-y-2">
          {loadingDocs ? (
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
              Loading outlet documents...
            </div>
          ) : documents.length === 0 ? (
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
              No documents found for this retail outlet. Please upload a new document copy.
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
              {documents.map(doc => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onSelectDocId(doc.id)}
                  className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-all ${
                    selectedDocId === doc.id
                      ? 'bg-orange-500/15 border border-orange-500/30 text-orange-300 font-medium'
                      : 'hover:bg-slate-800 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{doc.name}</span>
                    <span className="text-[11px] text-slate-500 shrink-0 font-normal">
                      ({formatFileSize(doc.sizeBytes)})
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 shrink-0">
                    {formatDisplayDate(doc.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
