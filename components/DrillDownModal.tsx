import React, { useMemo } from 'react';
import { X, FileText, CheckCircle2, XCircle, Clock, Download } from 'lucide-react';
import { ProjectFile, Status, Discipline } from '../types';
import { format, parseISO, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { calculateBusinessDaysWithHolidays } from '../utils';
import { getStatusColor } from '../utils';

export interface DrillDownPayload {
  label: string;        // e.g. "Arquitetura (Exec)"
  discipline: Discipline;
  phase?: string;
  filterKey: 'ftt' | 'volume' | 'execution'; // which chart was clicked
}

interface DrillDownModalProps {
  payload: DrillDownPayload;
  projects: ProjectFile[];
  holidays: string[];
  onClose: () => void;
}

const DISCIPLINE_BG: Record<string, string> = {
  [Discipline.ARCHITECTURE]: 'bg-[#8e1c3e]',
  [Discipline.STRUCTURE]: 'bg-slate-500',
  [Discipline.FOUNDATION]: 'bg-slate-400',
  [Discipline.HYDRAULIC]: 'bg-cyan-500',
  [Discipline.ELECTRICAL]: 'bg-yellow-500',
  [Discipline.DATA]: 'bg-violet-500',
  [Discipline.SPDA]: 'bg-red-500',
  [Discipline.HVAC]: 'bg-emerald-500',
  [Discipline.OTHER]: 'bg-pink-500',
};

function exportCSV(rows: ProjectFile[], label: string) {
  const headers = ['Arquivo', 'Cliente', 'Status', 'Início', 'Fim', 'Fase'];
  const lines = rows.map(p => [
    `"${p.filename}"`,
    `"${p.client}"`,
    `"${p.status}"`,
    p.startDate ? format(parseISO(p.startDate), 'dd/MM/yyyy') : '-',
    p.endDate ? format(parseISO(p.endDate), 'dd/MM/yyyy') : '-',
    p.phase ?? 'Executivo',
  ].join(';'));
  const csv = [headers.join(';'), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DrillDown_${label.replace(/[^a-z0-9]/gi, '_')}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const DrillDownModal: React.FC<DrillDownModalProps> = ({ payload, projects, holidays, onClose }) => {
  // Filter projects matching the clicked bar
  const rows = useMemo(() => {
    const disc = payload.discipline;
    const phase = payload.phase;
    return projects.filter(p => {
      if (p.discipline !== disc) return false;
      if (phase) {
        const pPhase = p.phase ?? 'Executivo';
        const shortPhase = pPhase === 'Preliminar' ? 'Prel' : 'Exec';
        if (shortPhase !== phase) return false;
      }
      return true;
    });
  }, [projects, payload]);

  // Mini KPIs
  const miniStats = useMemo(() => {
    const approved = rows.filter(p => p.status === Status.APPROVED || p.status === Status.DONE || p.status === Status.WAITING_APPROVAL);
    const withRevision = rows.filter(p => p.revisions?.length > 0 || p.status === Status.REJECTED);
    const withDuration = rows.filter(p => p.startDate && p.endDate);
    const totalDuration = withDuration.reduce((acc, p) => {
      return acc + calculateBusinessDaysWithHolidays(parseISO(p.startDate), parseISO(p.endDate), holidays, p.startPeriod, p.endPeriod || 'TARDE');
    }, 0);
    return {
      total: rows.length,
      approvedDirect: rows.length - withRevision.length,
      iapr: rows.length > 0 ? Math.round(((rows.length - withRevision.length) / rows.length) * 100) : 0,
      avgDuration: withDuration.length > 0 ? (totalDuration / withDuration.length).toFixed(1) : '—',
    };
  }, [rows, holidays]);

  // Close on Escape
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const statusLabel = (p: ProjectFile) => {
    if (p.status === Status.APPROVED) return { icon: <CheckCircle2 size={12} className="text-emerald-500" />, text: 'Aprovado' };
    if (p.status === Status.REJECTED) return { icon: <XCircle size={12} className="text-rose-500" />, text: 'Reprovado' };
    if (p.status === Status.WAITING_APPROVAL) return { icon: <Clock size={12} className="text-amber-500" />, text: 'Aguardando' };
    if (p.status === Status.DONE) return { icon: <CheckCircle2 size={12} className="text-violet-500" />, text: 'Concluído' };
    return { icon: <Clock size={12} className="text-blue-500" />, text: 'Em Andamento' };
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 w-full md:max-w-3xl md:rounded-xl rounded-t-2xl shadow-2xl border dark:border-slate-700 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${DISCIPLINE_BG[payload.discipline] || 'bg-slate-400'}`} />
            <h3 className="font-bold text-slate-800 dark:text-white text-base">{payload.label}</h3>
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">{rows.length} arquivos</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCSV(rows, payload.label)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg transition-colors font-medium"
            >
              <Download size={13} /> CSV
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Mini KPIs */}
        <div className="grid grid-cols-3 gap-px bg-slate-100 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-700 shrink-0">
          {[
            { label: 'Total', value: miniStats.total },
            { label: 'IAPR', value: `${miniStats.iapr}%` },
            { label: 'Média (dias)', value: miniStats.avgDuration },
          ].map(kpi => (
            <div key={kpi.label} className="flex flex-col items-center py-3 bg-white dark:bg-slate-800">
              <span className="text-lg font-bold text-slate-800 dark:text-white">{kpi.value}</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest">{kpi.label}</span>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-auto flex-1">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm italic">
              <FileText size={20} className="mr-2" /> Nenhum arquivo encontrado para este filtro.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700/80 backdrop-blur-sm z-10">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">Arquivo</th>
                  <th className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide hidden md:table-cell">Cliente</th>
                  <th className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide hidden sm:table-cell">Início</th>
                  <th className="px-4 py-2.5 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide hidden sm:table-cell">IAPR</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => {
                  const { icon, text } = statusLabel(p);
                  const hasRevision = p.revisions?.length > 0 || p.status === Status.REJECTED;
                  return (
                    <tr key={p.id} className={`border-t border-slate-50 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-800/50'}`}>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-700 dark:text-slate-200 truncate block max-w-[200px]" title={p.filename}>{p.filename}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 hidden md:table-cell truncate max-w-[120px]">{p.client}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${getStatusColor(p.status)}`}>
                          {icon} {text}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                        {p.startDate && isValid(parseISO(p.startDate)) ? format(parseISO(p.startDate), 'dd/MM/yy', { locale: ptBR }) : '—'}
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        {hasRevision
                          ? <span className="text-rose-500 font-bold">✗</span>
                          : <span className="text-emerald-500 font-bold">✓</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
