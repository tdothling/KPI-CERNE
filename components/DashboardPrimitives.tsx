import React from 'react';

export const SectionHeader: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-3 mt-8 mb-4 print:mt-4">
    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 shrink-0">
      {label}
    </h3>
    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
  </div>
);

export const KpiTile: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
  icon: React.ReactNode;
  onClick?: () => void;
}> = ({ label, value, sub, accent, icon, onClick }) => (
  <div
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={
      onClick
        ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick();
            }
          }
        : undefined
    }
    className={`bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-0.5 print:shadow-none print:border-slate-300 ${onClick ? 'cursor-pointer hover:border-brand-300 dark:hover:border-brand-500 hover:shadow-md transition-all' : ''}`}
  >
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <span className="text-slate-300 dark:text-slate-600">{icon}</span>
    </div>
    <span
      className={`text-2xl font-bold leading-none ${accent || 'text-slate-800 dark:text-white'}`}
    >
      {value}
    </span>
    {sub && <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{sub}</span>}
  </div>
);

export const metaAccent = (pct: number, meta: number) =>
  pct >= meta ? 'text-emerald-500' : pct >= meta - 15 ? 'text-amber-500' : 'text-rose-500';
