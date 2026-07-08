import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Period } from '../../types';
import { PranchaStatus, RefStatus } from '../../domain/portfolio';

// --- Card de resumo / filtro rápido (mesmo visual da aba Projetos) ---

export type CardColor = 'slate' | 'blue' | 'amber' | 'emerald' | 'rose' | 'red' | 'violet';

const CARD_STYLES: Record<CardColor, { active: string; iconActive: string; iconIdle: string; value: string }> = {
    slate:   { active: 'border-slate-400 bg-slate-100 dark:bg-slate-700/60 dark:border-slate-400 ring-1 ring-slate-300 dark:ring-slate-500', iconActive: 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-slate-800 dark:text-slate-100' },
    blue:    { active: 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-500 ring-1 ring-blue-300 dark:ring-blue-600', iconActive: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-blue-700 dark:text-blue-400' },
    amber:   { active: 'border-amber-400 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-500 ring-1 ring-amber-300 dark:ring-amber-600', iconActive: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-amber-700 dark:text-amber-400' },
    emerald: { active: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-500 ring-1 ring-emerald-300 dark:ring-emerald-600', iconActive: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-emerald-700 dark:text-emerald-400' },
    rose:    { active: 'border-rose-400 bg-rose-50 dark:bg-rose-900/30 dark:border-rose-500 ring-1 ring-rose-300 dark:ring-rose-600', iconActive: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-rose-700 dark:text-rose-400' },
    red:     { active: 'border-red-500 bg-red-50 dark:bg-red-900/30 dark:border-red-500 ring-1 ring-red-300 dark:ring-red-600', iconActive: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-red-600 dark:text-red-400' },
    violet:  { active: 'border-violet-400 bg-violet-50 dark:bg-violet-900/30 dark:border-violet-500 ring-1 ring-violet-300 dark:ring-violet-600', iconActive: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-violet-700 dark:text-violet-400' },
};

export function KpiCard({ color, icon, label, value, active, onClick }: { color: CardColor; icon: React.ReactNode; label: string; value: number; active: boolean; onClick: () => void }) {
    const s = CARD_STYLES[color];
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-all duration-150 hover:shadow-sm active:scale-[0.98] ${active ? s.active : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'}`}
        >
            <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${active ? s.iconActive : s.iconIdle}`}>{icon}</span>
            <span className="flex flex-col min-w-0">
                <span className={`text-lg font-bold leading-none ${active ? s.value : 'text-slate-700 dark:text-slate-200'}`}>{value}</span>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-tight truncate">{label}</span>
            </span>
        </button>
    );
}

// --- Badges de status (um estilo por CICLO, para nunca parecerem a mesma coluna) ---

export const REF_STATUS_STYLE: Record<RefStatus, string> = {
    [RefStatus.RASCUNHO]: 'text-slate-600 bg-slate-100 border-slate-300 dark:bg-slate-700/60 dark:border-slate-600 dark:text-slate-300',
    [RefStatus.EM_ELABORACAO]: 'text-amber-700 bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-400',
    [RefStatus.ELABORADO]: 'text-violet-700 bg-violet-100 border-violet-300 dark:bg-violet-900/40 dark:border-violet-700 dark:text-violet-400',
    [RefStatus.ENVIADO]: 'text-blue-700 bg-blue-100 border-blue-300 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-400',
    [RefStatus.APROVADO]: 'text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-400',
    [RefStatus.REPROVADO]: 'text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-400',
};

export const PRANCHA_STATUS_STYLE: Record<PranchaStatus, string> = {
    [PranchaStatus.A_FAZER]: 'text-slate-500 bg-slate-100 border-slate-300 dark:bg-slate-700/60 dark:border-slate-600 dark:text-slate-400',
    [PranchaStatus.EM_ANDAMENTO]: 'text-brand-700 bg-brand-50 border-brand-200 dark:bg-brand-900/40 dark:border-brand-800 dark:text-brand-400',
    [PranchaStatus.CONCLUIDO]: 'text-violet-700 bg-violet-100 border-violet-300 dark:bg-violet-900/40 dark:border-violet-700 dark:text-violet-400',
    [PranchaStatus.ENVIADO]: 'text-blue-700 bg-blue-100 border-blue-300 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-400',
    [PranchaStatus.APROVADO]: 'text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-400',
    [PranchaStatus.REPROVADO]: 'text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-400',
};

export function StatusBadge({ label, className }: { label: string; className: string }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${className}`}>
            {label}
        </span>
    );
}

// --- Modal genérico de ação com data/período (Enviar, Aprovar, Concluir...) ---

export interface DateActionRequest {
    title: string;
    description?: string;
    confirmLabel: string;
    tone?: 'brand' | 'emerald' | 'rose' | 'blue' | 'violet';
    withComment?: boolean;
    onConfirm: (date: string, period: Period, comment: string) => void;
}

const TONE_BTN: Record<NonNullable<DateActionRequest['tone']>, string> = {
    brand: 'bg-brand-700 hover:bg-brand-800',
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
    rose: 'bg-rose-600 hover:bg-rose-700',
    blue: 'bg-blue-600 hover:bg-blue-700',
    violet: 'bg-violet-600 hover:bg-violet-700',
};

export function DateActionModal({ request, onClose }: { request: DateActionRequest; onClose: () => void }) {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [period, setPeriod] = useState<Period>(new Date().getHours() < 12 ? 'MANHA' : 'TARDE');
    const [comment, setComment] = useState('');

    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">{request.title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar">
                        <X size={20} />
                    </button>
                </div>
                {request.description && <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{request.description}</p>}

                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data</label>
                <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-4"
                />

                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Período</label>
                <div className="grid grid-cols-2 gap-2 mb-4">
                    {(['MANHA', 'TARDE'] as Period[]).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`py-2 rounded-lg text-xs font-bold border transition-colors ${period === p ? 'bg-brand-50 dark:bg-brand-900/30 border-brand-400 text-brand-700 dark:text-brand-300' : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-slate-300'}`}
                        >
                            {p === 'MANHA' ? 'Manhã' : 'Tarde'}
                        </button>
                    ))}
                </div>

                {request.withComment && (
                    <>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Comentário</label>
                        <textarea
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            className="w-full h-20 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-4 resize-none"
                        />
                    </>
                )}

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium">Cancelar</button>
                    <button
                        onClick={() => { if (date) { request.onConfirm(date, period, comment); onClose(); } }}
                        className={`px-4 py-2 text-sm text-white rounded-lg font-semibold shadow-sm ${TONE_BTN[request.tone || 'brand']}`}
                    >
                        {request.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
