import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Conjunto, Prancha, PranchaStatus } from '../../domain/portfolio';

// Prancha avulsa: entregável extra fora do gabarito (ex.: detalhe específico de
// uma base). Nasce "A Fazer" com codificação manual — mesma regra das demais.
export function AddPranchaModal({
  conjunto,
  onClose,
  onConfirm,
}: {
  conjunto: Conjunto;
  onClose: () => void;
  onConfirm: (p: Omit<Prancha, 'id'>) => void;
}) {
  const [papel, setPapel] = useState('');
  const [codigo, setCodigo] = useState('');
  const [observacao, setObservacao] = useState('');

  const save = () => {
    if (!papel.trim()) {
      alert('Informe o papel da prancha (ex.: Folha 105, Detalhe de Fundação).');
      return;
    }
    onConfirm({
      conjuntoId: conjunto.id,
      papel: papel.trim(),
      codigoCompleto: codigo.trim(),
      status: PranchaStatus.A_FAZER,
      revisao: 0,
      ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Plus size={18} className="text-brand-600 dark:text-brand-400" /> Prancha Avulsa
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Adiciona uma prancha extra ao conjunto da base{' '}
          <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
            {conjunto.base}
          </span>
          , fora do gabarito da referência. Ela nasce em "A Fazer" e segue o mesmo ciclo das demais.
        </p>

        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
          Papel *
        </label>
        <input
          value={papel}
          onChange={(e) => setPapel(e.target.value)}
          placeholder="Ex: Folha 105, Detalhe de Fundação"
          autoFocus
          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-4"
        />

        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
          Código Completo (manual, opcional)
        </label>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder={
            conjunto.codigoRodovia
              ? `Ex: ${conjunto.codigoRodovia}-...`
              : 'Ex: ELO-040RJ-104+000-BSO-EXE-DE-P1-105'
          }
          className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-4"
        />

        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
          Observações
        </label>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className="w-full h-16 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-5 resize-none"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-sm"
          >
            Adicionar Prancha
          </button>
        </div>
      </div>
    </div>
  );
}
