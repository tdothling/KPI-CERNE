import { useState } from 'react';
import { Plus, X, MapPin } from 'lucide-react';
import { slugify } from '../../domain/portfolio';
import { inputCls } from './shared';

// Rodovia: bases nomeadas com dedupe tolerante a grafia
export function BasesEditor({
  bases,
  onChange,
}: {
  bases: string[];
  onChange: (bases: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    // Mesma normalização usada no ID do conjunto: "KM 104+000" e "km 104+000" são a MESMA base
    if (bases.some((b) => slugify(b) === slugify(value))) {
      alert(`A base "${value}" já está registrada (grafia equivalente).`);
      return;
    }
    onChange([...bases, value]);
    setDraft('');
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Ex: 104+000 (Enter para adicionar)"
          className={inputCls + ' font-mono'}
        />
        <button
          type="button"
          onClick={add}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-2 bg-brand-700 hover:bg-brand-800 text-white text-xs font-bold rounded-lg transition-colors"
        >
          <Plus size={13} /> Adicionar
        </button>
      </div>
      {bases.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {bases.map((b) => (
            <span
              key={b}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200"
            >
              <MapPin size={10} className="text-brand-600 dark:text-brand-400" /> {b}
              <button
                type="button"
                onClick={() => onChange(bases.filter((x) => x !== b))}
                className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 hover:text-rose-600"
                title={`Remover ${b}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
