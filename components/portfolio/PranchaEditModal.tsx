import { useState } from 'react';
import { X } from 'lucide-react';
import { Prancha, inferPranchaStatusFromDates } from '../../domain/portfolio';
import { TimelineDatesEditor, TimelineDates, PRANCHA_TIMELINE_FIELDS } from './shared';

// A codificação é manual (varia por órgão regulamentador): este modal é o ponto
// de ajuste fino do código de cada prancha.
export function PranchaEditModal({
  prancha,
  onClose,
  onSave,
}: {
  prancha: Prancha;
  onClose: () => void;
  onSave: (changes: Partial<Prancha>) => void;
}) {
  const [papel, setPapel] = useState(prancha.papel);
  const [codigo, setCodigo] = useState(prancha.codigoCompleto);
  const [observacao, setObservacao] = useState(prancha.observacao || '');
  const [dates, setDates] = useState<TimelineDates>({
    startDate: prancha.startDate || '',
    startPeriod: prancha.startPeriod || 'MANHA',
    endDate: prancha.endDate || '',
    endPeriod: prancha.endPeriod || 'TARDE',
    sendDate: prancha.sendDate || '',
    sendPeriod: prancha.sendPeriod || 'MANHA',
    feedbackDate: prancha.feedbackDate || '',
    feedbackPeriod: prancha.feedbackPeriod || 'TARDE',
  });

  const save = () => {
    if (!papel.trim()) {
      alert('O papel não pode ficar vazio.');
      return;
    }
    if (dates.startDate && dates.endDate && dates.endDate < dates.startDate) {
      alert('A conclusão da execução não pode ser anterior ao início.');
      return;
    }
    if (dates.sendDate && dates.feedbackDate && dates.feedbackDate < dates.sendDate) {
      alert('O feedback não pode ser anterior ao envio.');
      return;
    }
    // Datas enviadas sempre (inclusive '') para permitir apagar; o período só
    // acompanha quando há data. blockedDays é recalculado no handler.
    const datePayload: Record<string, any> = {};
    PRANCHA_TIMELINE_FIELDS.forEach((f) => {
      const date = dates[f.dateKey] as string | undefined;
      datePayload[f.dateKey] = date || '';
      if (date) datePayload[f.periodKey] = dates[f.periodKey];
    });

    // Lógica do fluxo: se alguma data mudou, o status é derivado da linha do tempo
    // (apagar datas retroage o status; preencher avança).
    const dateChanged = ['startDate', 'endDate', 'sendDate', 'feedbackDate'].some(
      (k) => ((dates[k as keyof TimelineDates] as string) || '') !== ((prancha as any)[k] || ''),
    );
    const statusPatch = dateChanged
      ? {
          status: inferPranchaStatusFromDates(
            {
              startDate: dates.startDate,
              endDate: dates.endDate,
              sendDate: dates.sendDate,
              feedbackDate: dates.feedbackDate,
            },
            prancha.status,
          ),
        }
      : {};

    onSave({
      papel: papel.trim(),
      codigoCompleto: codigo.trim(),
      observacao: observacao.trim() || undefined,
      ...datePayload,
      ...statusPatch,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">Editar Prancha</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
          Papel (do gabarito)
        </label>
        <input
          value={papel}
          onChange={(e) => setPapel(e.target.value)}
          className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-4"
        />

        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
          Código Completo (manual)
        </label>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Ex: ELO-040RJ-104+000-BSO-EXE-DE-P1-101"
          className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-4"
        />

        <div className="mb-4">
          <TimelineDatesEditor
            fields={PRANCHA_TIMELINE_FIELDS}
            value={dates}
            onChange={(patch) => setDates((prev) => ({ ...prev, ...patch }))}
            note="O status segue a linha do tempo: apagar datas retroage o status (ex.: Concluída → Em Andamento/A Fazer) e preencher avança. Aprovada/Reprovada preservam a decisão. Os dias com o cliente recalculam de envio e feedback."
          />
        </div>

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
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
