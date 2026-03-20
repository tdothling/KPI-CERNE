import React, { useState } from 'react';
import { Discipline, Status, ProjectPhase } from '../types';
import { DashboardFilterState } from '../hooks/useDashboardFilters';
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react';

const DISCIPLINE_COLORS: Record<string, string> = {
  [Discipline.ARCHITECTURE]: 'bg-[#8e1c3e] text-white',
  [Discipline.STRUCTURE]: 'bg-slate-500 text-white',
  [Discipline.FOUNDATION]: 'bg-slate-400 text-white',
  [Discipline.HYDRAULIC]: 'bg-cyan-500 text-white',
  [Discipline.ELECTRICAL]: 'bg-yellow-500 text-slate-900',
  [Discipline.DATA]: 'bg-violet-500 text-white',
  [Discipline.SPDA]: 'bg-red-500 text-white',
  [Discipline.HVAC]: 'bg-emerald-500 text-white',
  [Discipline.OTHER]: 'bg-pink-500 text-white',
};

const STATUS_COLORS: Record<string, string> = {
  [Status.IN_PROGRESS]: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-700',
  [Status.DONE]: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-700',
  [Status.WAITING_APPROVAL]: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-700',
  [Status.APPROVED]: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  [Status.REJECTED]: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border-rose-200 dark:border-rose-700',
  [Status.REVISED]: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-600',
};

interface DashboardFiltersProps {
  filters: DashboardFilterState;
  availableClients: string[];
  activeFilterCount: number;
  onToggleMulti: <T>(key: keyof DashboardFilterState, value: T) => void;
  onSetDateFrom: (v: string) => void;
  onSetDateTo: (v: string) => void;
  onClearAll: () => void;
}

export const DashboardFilters: React.FC<DashboardFiltersProps> = ({
  filters,
  availableClients,
  activeFilterCount,
  onToggleMulti,
  onSetDateFrom,
  onSetDateTo,
  onClearAll,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isActive = (key: keyof DashboardFilterState, value: unknown) =>
    (filters[key] as unknown[]).includes(value);

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm mb-6 overflow-hidden transition-all duration-200">
      {/* Header row */}
      <button
        onClick={() => setIsExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-brand-600 dark:text-brand-400" />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Filtros</span>
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-brand-600 text-white text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {activeFilterCount > 0 && (
            <button
              onClick={e => { e.stopPropagation(); onClearAll(); }}
              className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 font-medium transition-colors"
            >
              <X size={12} /> Limpar tudo
            </button>
          )}
          {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </div>
      </button>

      {/* Filter panels */}
      {isExpanded && (
        <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-4 space-y-4 animate-in fade-in duration-150">

          {/* Clients multi-select */}
          {availableClients.length > 1 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Cliente</p>
              <div className="flex flex-wrap gap-2">
                {availableClients.map(client => (
                  <button
                    key={client}
                    onClick={() => onToggleMulti('clients', client)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 ${
                      isActive('clients', client)
                        ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-brand-300'
                    }`}
                  >
                    {client}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Discipline chips */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Disciplina</p>
            <div className="flex flex-wrap gap-2">
              {Object.values(Discipline).map(disc => (
                <button
                  key={disc}
                  onClick={() => onToggleMulti('disciplines', disc)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
                    isActive('disciplines', disc)
                      ? `${DISCIPLINE_COLORS[disc]} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-800 ring-current shadow-sm`
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {disc}
                </button>
              ))}
            </div>
          </div>

          {/* Phase toggle */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Fase</p>
            <div className="flex gap-2">
              {Object.values(ProjectPhase).map(phase => (
                <button
                  key={phase}
                  onClick={() => onToggleMulti('phases', phase)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 ${
                    isActive('phases', phase)
                      ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-slate-400'
                  }`}
                >
                  {phase}
                </button>
              ))}
            </div>
          </div>

          {/* Status chips */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Status</p>
            <div className="flex flex-wrap gap-2">
              {Object.values(Status).map(status => (
                <button
                  key={status}
                  onClick={() => onToggleMulti('statuses', status)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-150 ${
                    isActive('statuses', status)
                      ? `${STATUS_COLORS[status]} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-800 ring-current shadow-sm`
                      : `${STATUS_COLORS[status]} opacity-50 hover:opacity-80`
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Início a partir de</p>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={e => onSetDateFrom(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
              />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Até</p>
              <input
                type="date"
                value={filters.dateTo}
                onChange={e => onSetDateTo(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
              />
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
