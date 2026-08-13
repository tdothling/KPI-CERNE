/**
 * Pré-visualização do relatório A4 e ações de envio.
 *
 * O documento é renderizado num portal para #report-portal (fora do #root) para
 * que a regra de impressão em index.css consiga esconder a aplicação inteira e
 * mandar só o relatório para o papel — sem depender dos utilitários `print:`
 * espalhados pelas telas.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check, Mail, Printer, Sparkles, X } from 'lucide-react';
import { DashboardFilterState } from '../../hooks/useDashboardFilters';
import { DashboardStats } from '../dashboardShared';
import { ReportView, describePeriodo } from './ReportView';
import { buildEmailBody, buildMailtoUrl, ReportSummaryInput } from './emailSummary';
import { buildNarrativePayload, generateNarrative, NarrativeState } from './aiNarrative';

interface ReportModalProps {
  stats: DashboardStats;
  filters: DashboardFilterState;
  /** Quantidade de arquivos que passaram pelos filtros do Dashboard. */
  totalProjects: number;
  onClose: () => void;
}

export function ReportModal({ stats, filters, totalProjects, onClose }: ReportModalProps) {
  // Congela o horário de geração: o relatório e o email precisam citar o mesmo instante
  const [generatedAt] = useState(() => new Date());
  const [copiado, setCopiado] = useState(false);

  const summaryInput: ReportSummaryInput = useMemo(
    () => ({
      stats,
      filters,
      totalProjects,
      generatedAt,
      periodoLabel: describePeriodo(filters),
    }),
    [stats, filters, totalProjects, generatedAt],
  );

  const [narrative, setNarrative] = useState<NarrativeState>({ status: 'idle' });

  const runNarrativeGeneration = useCallback(async () => {
    setNarrative({ status: 'loading' });
    try {
      const text = await generateNarrative(buildNarrativePayload(summaryInput));
      setNarrative({ status: 'done', text });
    } catch (e) {
      setNarrative({
        status: 'error',
        message: e instanceof Error ? e.message : 'Não foi possível gerar a análise.',
      });
    }
  }, [summaryInput]);

  // Enquanto o relatório está aberto, Ctrl+P e o botão imprimem o relatório, não a tela
  useEffect(() => {
    document.body.classList.add('report-printing');
    return () => document.body.classList.remove('report-printing');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCopiarResumo = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildEmailBody(summaryInput));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Navegador sem permissão de área de transferência: o mailto continua funcionando
      window.alert('Não foi possível copiar. Use o botão "Preparar email" para abrir o texto.');
    }
  }, [summaryInput]);

  const target = typeof document !== 'undefined' ? document.getElementById('report-portal') : null;
  if (!target) return null;

  return createPortal(
    <div className="report-shell fixed inset-0 z-[60] overflow-auto bg-slate-900/70 backdrop-blur-sm">
      <div className="report-toolbar sticky top-0 z-10 border-b border-slate-700 bg-slate-900/95 px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white">Relatório de Indicadores</h2>
            <p className="text-[11px] text-slate-400">
              Pré-visualização em A4 — o PDF sai exatamente assim
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
            >
              <Printer size={16} />
              Salvar em PDF
            </button>
            <a
              href={buildMailtoUrl(summaryInput)}
              className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
            >
              <Mail size={16} />
              Preparar email
            </a>
            <button
              onClick={handleCopiarResumo}
              className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
            >
              {copiado ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
              {copiado ? 'Copiado' : 'Copiar resumo'}
            </button>
            <button
              onClick={runNarrativeGeneration}
              disabled={narrative.status === 'loading'}
              className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles size={16} />
              {narrative.status === 'loading'
                ? 'Gerando análise…'
                : narrative.status === 'idle'
                  ? 'Gerar análise com IA'
                  : 'Regenerar análise'}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label="Fechar relatório"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="mx-auto mt-2.5 max-w-4xl rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-[11px] leading-relaxed text-slate-300">
          <strong className="text-slate-100">Para enviar por email:</strong>{' '}
          <span className="text-slate-400">1)</span> clique em <strong>Salvar em PDF</strong> e
          escolha o destino <em>&ldquo;Salvar como PDF&rdquo;</em> na janela de impressão;{' '}
          <span className="text-slate-400">2)</span> clique em <strong>Preparar email</strong> — seu
          Outlook abre com assunto e resumo já preenchidos;{' '}
          <span className="text-slate-400">3)</span> anexe o PDF salvo e escolha os destinatários.
        </div>

        {narrative.status === 'error' && (
          <div className="mx-auto mt-2 max-w-4xl rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
            Não foi possível gerar a análise executiva com IA agora ({narrative.message}). O
            relatório segue completo sem ela — use <strong>Regenerar análise</strong> para tentar de
            novo.
          </div>
        )}
      </div>

      {/* Moldura cinza só na tela; na impressão o documento vira o fluxo da página */}
      <div className="report-frame flex justify-center overflow-x-auto p-6">
        <div className="report-page rounded-lg bg-white p-6 shadow-2xl">
          <ReportView
            stats={stats}
            filters={filters}
            totalProjects={totalProjects}
            generatedAt={generatedAt}
            narrative={narrative}
          />
        </div>
      </div>
    </div>,
    target,
  );
}
