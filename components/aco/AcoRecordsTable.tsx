import React from 'react';
import { Edit2, History, Trash2, AlertTriangle } from 'lucide-react';
import { RecordDeviation, windBandOf } from '../../domain/steel';
import { formatCurrencyBR, formatDateDisplay, formatNumberBR } from '../../utils';
import { WIND_BAND_BADGE_CLASS } from './acoShared';

interface AcoRecordsTableProps {
  devs: RecordDeviation[]; // já calculados (deviations), no molde de kind selecionado
  onEdit: (id: string) => void;
  onHistory: (id: string) => void;
  onDelete: (id: string) => void;
}

// Tabela de desvio e outliers — ordenada pelo desvio percentual, do mais acima do
// esperado para o mais abaixo. É o que embasa a conversa com o fornecedor.
export const AcoRecordsTable: React.FC<AcoRecordsTableProps> = ({
  devs,
  onEdit,
  onHistory,
  onDelete,
}) => {
  const sorted = [...devs].sort((a, b) => b.desvioPct - a.desvioPct);

  if (sorted.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-slate-400 text-sm italic">
        Sem registros com área cadastrada para este tipo de estrutura.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase text-xs border-b border-slate-200 dark:border-slate-700">
          <tr>
            <th className="px-4 py-3">Obra / Local</th>
            <th className="px-4 py-3 text-center">Vento</th>
            <th className="px-4 py-3 text-right">Real (kg/m²)</th>
            <th className="px-4 py-3 text-right">Esperado (kg/m²)</th>
            <th className="px-4 py-3 text-right">Desvio</th>
            <th className="px-4 py-3 text-right">Kg Excedente</th>
            <th className="px-4 py-3 text-right">R$ Excedente</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {sorted.map((d) => {
            const band = windBandOf(d.record.windSpeed);
            return (
              <tr
                key={d.record.id}
                className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${d.isOutlier ? 'bg-rose-50/40 dark:bg-rose-900/10' : ''}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {d.isOutlier && (
                      <AlertTriangle size={13} className="text-rose-500 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {d.record.client}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {d.record.base} · {formatDateDisplay(d.record.fabricationStartDate)}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${WIND_BAND_BADGE_CLASS[band.key]}`}
                  >
                    {formatNumberBR(d.record.windSpeed, 1)} m/s
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                  {formatNumberBR(d.real, 2)}
                </td>
                <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatNumberBR(d.esperado, 2)}
                  {d.esperadoSource === 'band' && (
                    <span className="ml-1 text-[10px] text-slate-400" title="Sem amostra suficiente para curva — usando mediana da faixa">
                      (faixa)
                    </span>
                  )}
                </td>
                <td
                  className={`px-4 py-3 text-right font-bold tabular-nums ${
                    d.desvioPct > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {d.desvioPct > 0 ? '+' : ''}
                  {formatNumberBR(d.desvioPct * 100, 1)}%
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${
                    d.kgExcedente > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {d.kgExcedente > 0 ? '+' : ''}
                  {formatNumberBR(d.kgExcedente, 0)} kg
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums ${
                    d.custoExcedente > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {d.custoExcedente > 0 ? '+' : ''}
                  {formatCurrencyBR(d.custoExcedente)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      onClick={() => onHistory(d.record.id)}
                      title="Histórico de revisões"
                      aria-label="Histórico de revisões"
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    >
                      <History size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(d.record.id)}
                      title="Editar"
                      aria-label="Editar"
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(d.record.id)}
                      title="Excluir"
                      aria-label="Excluir"
                      className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
