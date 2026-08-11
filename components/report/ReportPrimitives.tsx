/**
 * Peças visuais do relatório A4.
 *
 * Nenhum componente daqui usa variantes `dark:` — o relatório é sempre claro,
 * porque em papel o navegador descarta as cores de fundo escuras e o texto
 * branco sairia invisível.
 */
import React from 'react';
import { REPORT_COLORS } from './reportLayout';

/** Cartão do relatório. `report-block` impede que ele seja partido entre folhas. */
export function ReportCard({
  title,
  hint,
  children,
  className = '',
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`report-block rounded-lg border border-slate-300 p-3.5 ${className}`}>
      {title && (
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">{title}</h3>
      )}
      {hint && <p className="mt-0.5 text-[9px] leading-snug text-slate-500">{hint}</p>}
      {(title || hint) && <div className="h-2.5" />}
      {children}
    </div>
  );
}

/** Título de seção do relatório. */
export function ReportSection({ label }: { label: string }) {
  return (
    <div className="report-block mb-3 mt-5 flex items-center gap-2.5">
      <span
        className="h-4 w-1 rounded-full"
        style={{ backgroundColor: REPORT_COLORS.brandLight }}
      />
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-800">{label}</h2>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

/** Um dos números da leitura executiva. */
export function ReportStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="report-block rounded-lg border border-slate-300 px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold leading-none" style={accent ? { color: accent } : {}}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[9px] leading-snug text-slate-500">{sub}</p>}
    </div>
  );
}

/**
 * Medidor de indicador contra a meta: número grande, barra preenchida até o
 * valor e um traço marcando onde fica a meta.
 */
export function ReportGauge({
  label,
  value,
  meta,
  sample,
  hint,
}: {
  label: string;
  value: number | null;
  meta: number;
  sample: string;
  hint: string;
}) {
  const atingiu = value !== null && value >= meta;
  const cor =
    value === null ? REPORT_COLORS.muted : atingiu ? REPORT_COLORS.good : REPORT_COLORS.bad;

  return (
    <div className="report-block flex-1 rounded-lg border border-slate-300 p-3.5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-700">{label}</h3>
        <span className="text-[9px] text-slate-500">meta ≥ {meta}%</span>
      </div>
      <p className="mt-1 text-3xl font-bold leading-none" style={{ color: cor }}>
        {value === null ? '—' : `${value}%`}
      </p>

      <div className="relative mt-2.5 h-2 w-full rounded-full bg-slate-200">
        {value !== null && (
          <div
            className="absolute left-0 top-0 h-2 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: cor }}
          />
        )}
        {/* Marca da meta */}
        <div
          className="absolute -top-0.5 h-3 w-0.5 bg-slate-700"
          style={{ left: `calc(${meta}% - 1px)` }}
        />
      </div>

      <p className="mt-1.5 text-[9px] text-slate-500">{sample}</p>
      <p className="mt-0.5 text-[9px] leading-snug text-slate-400">{hint}</p>
    </div>
  );
}

/** Linha de rótulo/valor usada no bloco de escopo da capa. */
export function ReportField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-1.5 text-[10px] leading-relaxed">
      <span className="shrink-0 font-semibold text-slate-500">{label}:</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}
