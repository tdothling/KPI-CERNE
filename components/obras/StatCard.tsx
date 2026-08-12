import React from 'react';

// Card de indicador que também é filtro da listagem — mesmo padrão visual dos
// KPIs clicáveis do Catálogo/Carteira (ícone à esquerda, valor + rótulo à direita).

export type StatTone = 'slate' | 'blue' | 'rose' | 'amber' | 'emerald';

const TONE_STYLES: Record<StatTone, { active: string; iconActive: string; value: string }> = {
  slate: {
    active:
      'border-slate-400 bg-slate-100 dark:bg-slate-700/60 dark:border-slate-400 ring-1 ring-slate-300 dark:ring-slate-500',
    iconActive: 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200',
    value: 'text-slate-800 dark:text-slate-100',
  },
  blue: {
    active:
      'border-blue-400 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-500 ring-1 ring-blue-300 dark:ring-blue-600',
    iconActive: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    value: 'text-blue-700 dark:text-blue-400',
  },
  rose: {
    active:
      'border-rose-400 bg-rose-50 dark:bg-rose-900/30 dark:border-rose-500 ring-1 ring-rose-300 dark:ring-rose-600',
    iconActive: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
    value: 'text-rose-700 dark:text-rose-400',
  },
  amber: {
    active:
      'border-amber-400 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-500 ring-1 ring-amber-300 dark:ring-amber-600',
    iconActive: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    value: 'text-amber-700 dark:text-amber-400',
  },
  emerald: {
    active:
      'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-500 ring-1 ring-emerald-300 dark:ring-emerald-600',
    iconActive: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    value: 'text-emerald-700 dark:text-emerald-400',
  },
};

export function StatCard({
  tone,
  icon,
  label,
  value,
  active,
  alert,
  onClick,
}: {
  key?: string; // sem @types/react instalado, o TS não injeta o atributo especial "key" automaticamente
  tone: StatTone;
  icon: React.ReactNode;
  label: string;
  value: number;
  active: boolean;
  /** Destaca o valor mesmo sem o card estar selecionado (usado em "Em risco"). */
  alert?: boolean;
  onClick: () => void;
}) {
  const s = TONE_STYLES[tone];
  const highlight = active || (alert && value > 0);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all duration-150 hover:shadow-md active:scale-[0.98] ${
        active
          ? s.active
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      <span
        className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          highlight
            ? s.iconActive
            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
        }`}
      >
        {icon}
      </span>
      <span className="flex flex-col min-w-0">
        <span
          className={`text-xl font-bold leading-none tabular-nums ${
            highlight ? s.value : 'text-slate-800 dark:text-slate-100'
          }`}
        >
          {value}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-tight text-slate-400 dark:text-slate-500 truncate mt-1">
          {label}
        </span>
      </span>
    </button>
  );
}
