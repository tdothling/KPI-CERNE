import React, { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { KIND_LABEL, MaterialBreakdown } from '../../domain/steel';
import { formatCurrencyBR, formatNumberBR } from '../../utils';

interface AcoMaterialBreakdownProps {
  data: MaterialBreakdown[]; // materialBreakdown(filteredRecords) — já calculado no AcoPage
}

// Quebra "Aço Registrado" e "Custo Total" do KPI strip por material — cada um com seu
// próprio preço de mercado, então o peso de cada insumo fica escondido dentro de um total
// só se não forem segregados. Ordenado por custo, do maior para o menor.
export const AcoMaterialBreakdown: React.FC<AcoMaterialBreakdownProps> = ({ data }) => {
  const { rows, kgTotal, costTotal } = useMemo(() => {
    const kgTotal = data.reduce((s, d) => s + d.kg, 0);
    const costTotal = data.reduce((s, d) => s + d.cost, 0);
    const rows = [...data].sort((a, b) => b.cost - a.cost);
    return { rows, kgTotal, costTotal };
  }, [data]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center gap-2">
          <Layers size={15} className="text-brand-600 dark:text-brand-400" /> Consumo por Material
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Peso de cada insumo no total registrado — preços diferentes, participação diferente
        </p>
      </div>
      {kgTotal === 0 ? (
        <div className="h-24 flex items-center justify-center text-slate-400 text-sm italic">
          Sem material registrado no filtro atual.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase text-xs border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-2.5">Material</th>
                <th className="px-4 py-2.5 text-right">Kg</th>
                <th className="px-4 py-2.5 text-left">% do Aço</th>
                <th className="px-4 py-2.5 text-right">Custo</th>
                <th className="px-4 py-2.5 text-left">% do Custo</th>
                <th className="px-4 py-2.5 text-right">R$/Kg Médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {rows.map((row) => {
                const kgPct = kgTotal > 0 ? row.kg / kgTotal : 0;
                const costPct = costTotal > 0 ? row.cost / costTotal : 0;
                const isEmpty = row.kg === 0;
                return (
                  <tr
                    key={row.material}
                    className={isEmpty ? 'text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-200'}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold">{row.material}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        {KIND_LABEL[row.kind]}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatNumberBR(row.kg, 0)} kg
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                          <div
                            className="h-full bg-brand-500 dark:bg-brand-400 rounded-full"
                            style={{ width: `${Math.round(kgPct * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums">{formatNumberBR(kgPct * 100, 0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {formatCurrencyBR(row.cost)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                          <div
                            className="h-full bg-violet-500 dark:bg-violet-400 rounded-full"
                            style={{ width: `${Math.round(costPct * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums">{formatNumberBR(costPct * 100, 0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEmpty ? '-' : formatCurrencyBR(row.pricePerKgAvg)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-200">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatNumberBR(kgTotal, 0)} kg</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrencyBR(costTotal)}</td>
                <td className="px-4 py-3" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};
