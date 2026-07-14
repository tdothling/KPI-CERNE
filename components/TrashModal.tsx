import React, { useMemo, useState } from 'react';
import { TrashEntry } from '../types';
import { Trash2, X, RotateCcw, AlertTriangle } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Nome da aba de origem de cada coleção (para o usuário se localizar)
const COLL_LABEL: Record<string, string> = {
  projects: 'Projetos',
  supplyOrders: 'Suprimentos',
  references: 'Catálogo',
  conjuntos: 'Carteira',
  pranchas: 'Carteira',
  clients: 'Obras',
};

const COLL_BADGE: Record<string, string> = {
  projects: 'bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
  supplyOrders: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  references: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  conjuntos: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  pranchas: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  clients: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

interface TrashGroup {
  opId: string;
  deletedAt: string;
  deletedBy: string;
  client: string;
  entries: TrashEntry[];
}

interface TrashModalProps {
  items: TrashEntry[];
  onRestore: (trashIds: string[]) => Promise<{ restored: string[]; skipped: string[] }>;
  onPurge: (trashIds: string[]) => Promise<void>;
  onClose: () => void;
  readOnly?: boolean;
}

export const TrashModal: React.FC<TrashModalProps> = ({ items, onRestore, onPurge, onClose, readOnly = false }) => {
  const [busyOp, setBusyOp] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Exclusões da mesma ação (mesmo opId) aparecem como um grupo único
  const groups = useMemo<TrashGroup[]>(() => {
    const map = new Map<string, TrashGroup>();
    items.forEach(item => {
      const key = item.opId || item.id;
      if (!map.has(key)) {
        map.set(key, { opId: key, deletedAt: item.deletedAt, deletedBy: item.deletedBy, client: item.client, entries: [] });
      }
      map.get(key)!.entries.push(item);
    });
    return Array.from(map.values()).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  }, [items]);

  const fmtWhen = (iso: string) => {
    const d = iso ? parseISO(iso) : null;
    return d && isValid(d) ? format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—';
  };

  const handleRestore = async (group: TrashGroup) => {
    setBusyOp(group.opId);
    setFeedback(null);
    try {
      const result = await onRestore(group.entries.map(e => e.id));
      const parts: string[] = [];
      if (result.restored.length) parts.push(`${result.restored.length} item(ns) restaurado(s)`);
      if (result.skipped.length) parts.push(`${result.skipped.length} já existia(m) e foram mantidos na lixeira`);
      setFeedback(parts.join('; ') || 'Nada a restaurar.');
    } catch (e) {
      console.error('Erro ao restaurar da lixeira:', e);
      setFeedback('Erro ao restaurar. Verifique sua conexão e tente novamente.');
    } finally {
      setBusyOp(null);
    }
  };

  const handlePurge = async (group: TrashGroup) => {
    const what = group.entries.length === 1 ? `"${group.entries[0].label}"` : `${group.entries.length} itens`;
    if (!confirm(`Excluir DEFINITIVAMENTE ${what} da lixeira?\n\nEssa ação não pode ser desfeita.`)) return;
    setBusyOp(group.opId);
    setFeedback(null);
    try {
      await onPurge(group.entries.map(e => e.id));
    } catch (e) {
      console.error('Erro ao excluir da lixeira:', e);
      setFeedback('Erro ao excluir definitivamente. Tente novamente.');
    } finally {
      setBusyOp(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-3xl w-full p-6 border dark:border-slate-700 max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Trash2 className="text-brand-600 dark:text-brand-400" size={20} />
            Lixeira
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" aria-label="Fechar Lixeira">
            <X size={24} />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Tudo que é excluído em qualquer aba fica guardado aqui e pode ser restaurado com um clique.
          Exclusões feitas numa mesma ação (ex.: um conjunto com suas pranchas) são restauradas juntas.
        </p>

        {feedback && (
          <div className="mb-3 text-xs font-semibold text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-900/30 rounded-lg px-3 py-2">
            {feedback}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">
          {groups.length === 0 ? (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm">
              <Trash2 size={32} className="mx-auto mb-3 opacity-40" />
              A lixeira está vazia. Novas exclusões aparecerão aqui.
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map(group => (
                <div key={group.opId} className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-900/20">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-bold text-slate-700 dark:text-slate-200">{fmtWhen(group.deletedAt)}</span>
                      {' · '}por <span className="font-semibold">{group.deletedBy || 'desconhecido'}</span>
                      {group.client && <>{' · '}obra <span className="font-semibold">{group.client}</span></>}
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRestore(group)}
                          disabled={busyOp !== null}
                          className="flex items-center gap-1.5 bg-brand-700 hover:bg-brand-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                        >
                          <RotateCcw size={12} />
                          {busyOp === group.opId ? 'Restaurando...' : `Restaurar${group.entries.length > 1 ? ` (${group.entries.length})` : ''}`}
                        </button>
                        <button
                          onClick={() => handlePurge(group)}
                          disabled={busyOp !== null}
                          className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-rose-200 dark:border-rose-900/40 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-40"
                          title="Excluir definitivamente"
                        >
                          <AlertTriangle size={12} />
                          Excluir de vez
                        </button>
                      </div>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {group.entries.map(entry => (
                      <li key={entry.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight ${COLL_BADGE[entry.coll] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                          {COLL_LABEL[entry.coll] || entry.coll}
                        </span>
                        <span className="font-medium truncate">{entry.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
          <span className="text-[10px] text-slate-400 dark:text-slate-500">
            {items.length} item(ns) na lixeira (últimos 500 exibidos)
          </span>
          <button onClick={onClose} className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
