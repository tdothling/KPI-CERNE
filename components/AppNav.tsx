import React from 'react';
import { CheckSquare, Square } from 'lucide-react';

// --- Sub-componentes do Header (Redesign) ---

export function NavTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-full px-4 flex-shrink-0 flex items-center gap-2 text-xs font-bold transition-all relative ${
        active
          ? 'text-brand-700 dark:text-brand-400'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600 dark:bg-brand-500 rounded-t-full"></div>
      )}
    </button>
  );
}

export function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-1 text-[11px] font-bold transition-all hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
        active ? 'text-brand-700 dark:text-brand-400' : 'text-slate-600 dark:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

export function ActionMenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
    >
      <span className="text-slate-400">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

export function FilterDropdown({
  title,
  onClear,
  items,
  selectedItems,
  onToggle,
}: {
  title: string;
  onClear: () => void;
  items: string[];
  selectedItems: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <div className="w-64 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-2 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
      <div className="px-3 pb-2 mb-2 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
          {title}
        </span>
        <button
          onClick={onClear}
          className="text-[10px] text-brand-600 dark:text-brand-400 font-bold hover:underline"
        >
          Limpar
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto custom-scrollbar px-1">
        {items.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-slate-400 text-center italic">
            Nenhum item disponível
          </div>
        ) : (
          items.map((item) => {
            const isSelected = selectedItems.includes(item);
            return (
              <button
                key={item}
                onClick={() => onToggle(item)}
                className={`w-full text-left px-3 py-2 text-[11px] flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors ${
                  isSelected
                    ? 'text-brand-700 dark:text-brand-300 font-bold bg-brand-50/50 dark:bg-brand-900/20'
                    : 'text-slate-700 dark:text-slate-200'
                }`}
              >
                {isSelected ? (
                  <CheckSquare size={14} className="text-brand-600 dark:text-brand-400" />
                ) : (
                  <Square size={14} className="text-slate-300 dark:text-slate-500" />
                )}
                <span className="truncate">{item}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
