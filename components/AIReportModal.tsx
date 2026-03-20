import React, { useState } from 'react';
import { X, Sparkles, Copy, Check, AlertCircle } from 'lucide-react';

interface AIReportModalProps {
  reportMarkdown: string | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onGenerate: () => void;
}

// Minimal markdown renderer (bold, headers, bullets — no external dep needed)
function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split('\n');
  return lines.map((line, i) => {
    if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-bold text-slate-800 dark:text-white mt-4 mb-1">{line.slice(4)}</h3>;
    if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold text-slate-800 dark:text-white mt-5 mb-2 border-b border-slate-100 dark:border-slate-700 pb-1">{line.slice(3)}</h2>;
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const text = line.slice(2);
      return <li key={i} className="ml-4 list-disc text-slate-600 dark:text-slate-300">{renderInline(text)}</li>;
    }
    if (line.trim() === '') return <div key={i} className="h-2" />;
    return <p key={i} className="text-slate-600 dark:text-slate-300 leading-relaxed">{renderInline(line)}</p>;
  });
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-slate-800 dark:text-white">{part.slice(2, -2)}</strong>
      : part
  );
}

export const AIReportModal: React.FC<AIReportModalProps> = ({ reportMarkdown, isLoading, error, onClose, onGenerate }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!reportMarkdown) return;
    navigator.clipboard.writeText(reportMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Close on Escape
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 z-[70] flex items-end md:items-center justify-center p-0 md:p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 w-full md:max-w-2xl md:rounded-xl rounded-t-2xl shadow-2xl border dark:border-slate-700 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700 shrink-0 bg-gradient-to-r from-brand-50 to-white dark:from-brand-900/20 dark:to-slate-800">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-brand-600 dark:text-brand-400" />
            <h3 className="font-bold text-slate-800 dark:text-white">Relatório Executivo — IA</h3>
          </div>
          <div className="flex items-center gap-2">
            {reportMarkdown && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg transition-colors font-medium"
              >
                {copied ? <><Check size={12} className="text-emerald-500" /> Copiado!</> : <><Copy size={12} /> Copiar</>}
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
              <X size={18} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-4 border-brand-100 dark:border-brand-900/40" />
                <div className="w-12 h-12 rounded-full border-4 border-t-brand-600 dark:border-t-brand-400 animate-spin absolute inset-0" />
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">Analisando KPIs com Gemini...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex items-start gap-3 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl">
              <AlertCircle size={16} className="text-rose-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-400">Erro ao gerar relatório</p>
                <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">{error}</p>
              </div>
            </div>
          )}

          {!isLoading && !error && !reportMarkdown && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
                <Sparkles size={28} className="text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">Análise Executiva com IA</p>
                <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs">
                  Clique em "Gerar" para analisar os KPIs atuais e receber um relatório com insights e recomendações.
                </p>
              </div>
              <button
                onClick={onGenerate}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-all"
              >
                <Sparkles size={15} /> Gerar Relatório
              </button>
            </div>
          )}

          {!isLoading && reportMarkdown && (
            <div className="text-sm space-y-1">
              {renderMarkdown(reportMarkdown)}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-700 mt-4">
                <button
                  onClick={onGenerate}
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium"
                >
                  ↻ Regenerar relatório
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
