import React, { useMemo } from 'react';
import { Weight, Wallet, Gauge, TrendingDown, AlertTriangle } from 'lucide-react';
import {
  RecordDeviation,
  SteelKind,
  SteelRecord,
  overallCostPerM2Median,
  overallIntensityMedian,
  totalCost,
  totalKg,
} from '../../domain/steel';
import { formatCurrencyBR, formatNumberBR } from '../../utils';

interface AcoKpiStripProps {
  records: SteelRecord[]; // já filtrados (obra/vento/período)
  kind: SteelKind;
  devs: RecordDeviation[]; // deviations(records, kind, fit) — calculado no AcoPage
}

// Faixa de indicadores do módulo de Consumo de Aço. Puro cálculo em memória, sem
// recharts, no mesmo molde de components/supply/SupplyKpiStrip.tsx.
export const AcoKpiStrip: React.FC<AcoKpiStripProps> = ({ records, kind, devs }) => {
  const stats = useMemo(() => {
    const kgTotal = records.reduce((s, r) => s + totalKg(r), 0);
    const costTotal = records.reduce((s, r) => s + totalCost(r), 0);
    const medianKgM2 = overallIntensityMedian(records, kind);
    const medianCostM2 = overallCostPerM2Median(records, kind);
    const outliers = devs.filter((d) => d.isOutlier).length;
    return { kgTotal, costTotal, medianKgM2, medianCostM2, outliers };
  }, [records, kind, devs]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      <KpiCard
        icon={<Weight size={18} />}
        iconClass="bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400"
        label="Aço Registrado"
        value={`${formatNumberBR(stats.kgTotal / 1000, 1)} t`}
        hint={`${records.length} local(is) no filtro atual`}
      />
      <KpiCard
        icon={<Wallet size={18} />}
        iconClass="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
        label="Custo Total"
        value={formatCurrencyBR(stats.costTotal)}
        hint="Soma de todos os materiais"
      />
      <KpiCard
        icon={<TrendingDown size={18} />}
        iconClass="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
        label="Kg/m² Mediano"
        value={stats.medianKgM2 > 0 ? `${formatNumberBR(stats.medianKgM2, 2)} kg/m²` : '-'}
        hint="Eficiência física — não muda com o preço"
      />
      <KpiCard
        icon={<Gauge size={18} />}
        iconClass="bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
        label="R$/m² Mediano"
        value={stats.medianCostM2 > 0 ? formatCurrencyBR(stats.medianCostM2) : '-'}
        hint="Gasto — mistura consumo e preço de mercado"
      />
      <KpiCard
        icon={<AlertTriangle size={18} />}
        iconClass={
          stats.outliers > 0
            ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
            : 'bg-slate-50 dark:bg-slate-700/50 text-slate-400'
        }
        label="Fora da Tendência"
        value={String(stats.outliers)}
        valueClass={stats.outliers > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
        hint="Desvio relevante vs. esperado para o vento"
      />
    </div>
  );
};

function KpiCard({
  icon,
  iconClass,
  label,
  value,
  hint,
  valueClass,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${iconClass}`}>{icon}</div>
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight leading-tight">
          {label}
        </span>
      </div>
      <span className={`text-2xl font-bold ${valueClass || 'text-slate-800 dark:text-slate-100'}`}>
        {value}
      </span>
      {hint && (
        <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 leading-tight">
          {hint}
        </span>
      )}
    </div>
  );
}
