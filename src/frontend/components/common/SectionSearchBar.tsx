import React from 'react';
import { Search, X } from 'lucide-react';

interface SectionSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultCount?: number;
  totalCount?: number;
  className?: string;
  'aria-label'?: string;
}

export const SectionSearchBar: React.FC<SectionSearchBarProps> = ({
  value,
  onChange,
  placeholder = 'Search within accessible records...',
  resultCount,
  totalCount,
  className = '',
  'aria-label': ariaLabel = 'Section search',
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onChange('');
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="relative flex items-center">
        <div className="absolute left-3.5 text-slate-400 pointer-events-none flex items-center">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={false}
          aria-label={ariaLabel}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all shadow-inner"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            title="Clear search (Esc)"
            aria-label="Clear search"
            className="absolute right-3 text-slate-400 hover:text-slate-200 p-1 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {(resultCount !== undefined || totalCount !== undefined) && (
        <div className="text-xs text-slate-400 px-1 flex items-center justify-between">
          <span>
            {value.trim() !== '' && resultCount !== undefined && totalCount !== undefined
              ? `Showing ${resultCount} of ${totalCount} accessible records`
              : resultCount !== undefined
              ? `Showing ${resultCount} accessible record(s)`
              : ''}
          </span>
        </div>
      )}
    </div>
  );
};
