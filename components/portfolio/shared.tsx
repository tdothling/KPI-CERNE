import React, { useState } from 'react';
import { X, Clock, History, PencilLine } from 'lucide-react';
import { parseISO, isValid } from 'date-fns';
import { Period, Revision, RevisionReason } from '../../types';
import { PranchaStatus, RefStatus } from '../../domain/portfolio';
import { formatDateDisplay, calculateBusinessDaysWithHolidays } from '../../utils';

// --- Tempo de execução em dias úteis (Referências E Pranchas) ---
// Início → conclusão da execução; se o item ainda está na etapa de execução
// (`emExecucao`), mede até hoje — contador "correndo".

export interface ExecDays { days: number; running: boolean }

export const execDaysOf = (
    item: { startDate?: string; startPeriod?: Period; endDate?: string; endPeriod?: Period },
    emExecucao: boolean,
    holidays: string[]
): ExecDays | null => {
    if (!item.startDate) return null;
    const start = parseISO(item.startDate);
    if (!isValid(start)) return null;
    if (item.endDate) {
        const end = parseISO(item.endDate);
        if (!isValid(end) || end < start) return null;
        return { days: calculateBusinessDaysWithHolidays(start, end, holidays, item.startPeriod || 'MANHA', item.endPeriod || 'TARDE'), running: false };
    }
    if (!emExecucao) return null;
    const today = new Date();
    if (today < start) return null;
    return { days: calculateBusinessDaysWithHolidays(start, today, holidays, item.startPeriod || 'MANHA', 'TARDE'), running: true };
};

// --- Card de resumo / filtro rápido (mesmo visual da aba Projetos) ---

export type CardColor = 'slate' | 'blue' | 'amber' | 'emerald' | 'rose' | 'red' | 'violet' | 'cyan';

const CARD_STYLES: Record<CardColor, { active: string; iconActive: string; iconIdle: string; value: string }> = {
    slate:   { active: 'border-slate-400 bg-slate-100 dark:bg-slate-700/60 dark:border-slate-400 ring-1 ring-slate-300 dark:ring-slate-500', iconActive: 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-slate-800 dark:text-slate-100' },
    blue:    { active: 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-500 ring-1 ring-blue-300 dark:ring-blue-600', iconActive: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-blue-700 dark:text-blue-400' },
    amber:   { active: 'border-amber-400 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-500 ring-1 ring-amber-300 dark:ring-amber-600', iconActive: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-amber-700 dark:text-amber-400' },
    emerald: { active: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-500 ring-1 ring-emerald-300 dark:ring-emerald-600', iconActive: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-emerald-700 dark:text-emerald-400' },
    rose:    { active: 'border-rose-400 bg-rose-50 dark:bg-rose-900/30 dark:border-rose-500 ring-1 ring-rose-300 dark:ring-rose-600', iconActive: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-rose-700 dark:text-rose-400' },
    red:     { active: 'border-red-500 bg-red-50 dark:bg-red-900/30 dark:border-red-500 ring-1 ring-red-300 dark:ring-red-600', iconActive: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-red-600 dark:text-red-400' },
    violet:  { active: 'border-violet-400 bg-violet-50 dark:bg-violet-900/30 dark:border-violet-500 ring-1 ring-violet-300 dark:ring-violet-600', iconActive: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-violet-700 dark:text-violet-400' },
    cyan:    { active: 'border-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 dark:border-cyan-500 ring-1 ring-cyan-300 dark:ring-cyan-600', iconActive: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-cyan-700 dark:text-cyan-400' },
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
    // Ciclo preliminar encerrado pela instanciação (trabalho segue nas pranchas)
    [RefStatus.SUPERSEDED]: 'text-cyan-700 bg-cyan-100 border-cyan-300 dark:bg-cyan-900/40 dark:border-cyan-700 dark:text-cyan-400',
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
    withReason?: boolean;   // exibe o seletor de Motivo da Revisão (mesma lista da aba Projetos)
    onConfirm: (date: string, period: Period, comment: string, reason: RevisionReason) => void;
}

const TONE_BTN: Record<NonNullable<DateActionRequest['tone']>, string> = {
    brand: 'bg-brand-700 hover:bg-brand-800',
    emerald: 'bg-emerald-600 hover:bg-emerald-700',
    rose: 'bg-rose-600 hover:bg-rose-700',
    blue: 'bg-blue-600 hover:bg-blue-700',
    violet: 'bg-violet-600 hover:bg-violet-700',
};

// --- Editor de linha do tempo (todas as datas de input viram editáveis) ---
// Reutilizado nos modais de Referência e Prancha. Cada data traz seu período
// (Manhã/Tarde). Deixar uma data em branco a APAGA no salvamento (correção).

export interface TimelineDates {
    startDate?: string; startPeriod?: Period;
    endDate?: string; endPeriod?: Period;
    sendDate?: string; sendPeriod?: Period;
    feedbackDate?: string; feedbackPeriod?: Period;
}

// Quais campos de data expor e com que rótulo (a ordem segue o ciclo).
export interface TimelineFieldSpec {
    dateKey: keyof TimelineDates;
    periodKey: keyof TimelineDates;
    label: string;
}

export const REF_TIMELINE_FIELDS: TimelineFieldSpec[] = [
    { dateKey: 'startDate', periodKey: 'startPeriod', label: 'Início da Execução' },
    { dateKey: 'endDate', periodKey: 'endPeriod', label: 'Conclusão da Execução' },
    { dateKey: 'sendDate', periodKey: 'sendPeriod', label: 'Envio ao Cliente' },
    { dateKey: 'feedbackDate', periodKey: 'feedbackPeriod', label: 'Feedback (aprov./reprov.)' },
];

export const PRANCHA_TIMELINE_FIELDS: TimelineFieldSpec[] = [
    { dateKey: 'startDate', periodKey: 'startPeriod', label: 'Início da Execução' },
    { dateKey: 'endDate', periodKey: 'endPeriod', label: 'Conclusão (fim da execução)' },
    { dateKey: 'sendDate', periodKey: 'sendPeriod', label: 'Envio ao Cliente' },
    { dateKey: 'feedbackDate', periodKey: 'feedbackPeriod', label: 'Feedback (aprov./reprov.)' },
];

export function TimelineDatesEditor({ fields, value, onChange, note }: {
    fields: TimelineFieldSpec[];
    value: TimelineDates;
    onChange: (patch: Partial<TimelineDates>) => void;
    note?: string;
}) {
    return (
        <div className="bg-slate-50/60 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
                <Clock size={13} className="text-violet-500" />
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Linha do Tempo (correção)</label>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
                {note || 'Ajuste qualquer data do processo. Os dias úteis com o cliente são recalculados a partir de envio e feedback. Deixe em branco para limpar.'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fields.map(f => (
                    <div key={f.dateKey as string}>
                        <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{f.label}</span>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                value={(value[f.dateKey] as string) || ''}
                                onChange={e => onChange({ [f.dateKey]: e.target.value })}
                                className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2"
                            />
                            <select
                                value={(value[f.periodKey] as Period) || 'MANHA'}
                                onChange={e => onChange({ [f.periodKey]: e.target.value as Period })}
                                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-xs rounded-lg p-2"
                            >
                                <option value="MANHA">Manhã</option>
                                <option value="TARDE">Tarde</option>
                            </select>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function DateActionModal({ request, onClose }: { request: DateActionRequest; onClose: () => void }) {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [period, setPeriod] = useState<Period>(new Date().getHours() < 12 ? 'MANHA' : 'TARDE');
    const [comment, setComment] = useState('');
    const [reason, setReason] = useState<RevisionReason>(RevisionReason.CLIENT_REQUEST);

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

                {request.withReason && (
                    <>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Motivo da Revisão</label>
                        <select
                            value={reason}
                            onChange={e => setReason(e.target.value as RevisionReason)}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-4"
                        >
                            {Object.values(RevisionReason).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </>
                )}

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
                        onClick={() => { if (date) { request.onConfirm(date, period, comment, reason); onClose(); } }}
                        className={`px-4 py-2 text-sm text-white rounded-lg font-semibold shadow-sm ${TONE_BTN[request.tone || 'brand']}`}
                    >
                        {request.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Histórico de Revisões (Referências E Pranchas — mesmo formato da aba Projetos) ---
// Cada entrada nasce quando uma revisão é ABERTA (reprovado → retrabalho). Motivo e
// comentário são editáveis depois, para corrigir classificações sem mexer no ciclo.

export function RevisionHistoryModal({ title, revisions, readOnly, onSave, onClose }: {
    title: string;
    revisions: Revision[];
    readOnly?: boolean;
    onSave: (updated: Revision[]) => void;
    onClose: () => void;
}) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState<{ reason: RevisionReason; comment: string }>({ reason: RevisionReason.CLIENT_REQUEST, comment: '' });

    const startEdit = (rev: Revision) => {
        setEditingId(rev.id);
        setDraft({ reason: rev.reason, comment: rev.comment });
    };
    const saveEdit = () => {
        if (!editingId) return;
        onSave(revisions.map(r => r.id === editingId ? { ...r, reason: draft.reason, comment: draft.comment } : r));
        setEditingId(null);
    };

    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border dark:border-slate-700 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
                <div className="flex justify-between items-center mb-1">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <History size={18} className="text-amber-500" /> Histórico de Revisões
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar">
                        <X size={20} />
                    </button>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mb-4 truncate">{title}</p>

                <div className="overflow-y-auto space-y-2 pr-1">
                    {revisions.length === 0 && (
                        <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-6">Nenhuma revisão registrada.</p>
                    )}
                    {[...revisions].reverse().map((rev, i) => {
                        const numero = revisions.length - i; // mais recente primeiro
                        const isEditing = editingId === rev.id;
                        return (
                            <div key={rev.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/60 dark:bg-slate-900/40">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded">R{String(numero).padStart(2, '0')}</span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{formatDateDisplay(rev.date)}</span>
                                    {!isEditing && (
                                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{rev.reason}</span>
                                    )}
                                    {!readOnly && !isEditing && (
                                        <button onClick={() => startEdit(rev)} className="ml-auto text-slate-400 hover:text-brand-600 dark:hover:text-brand-400" title="Editar motivo/comentário" aria-label="Editar revisão">
                                            <PencilLine size={13} />
                                        </button>
                                    )}
                                </div>
                                {isEditing ? (
                                    <div className="mt-2 space-y-2">
                                        <select
                                            value={draft.reason}
                                            onChange={e => setDraft(d => ({ ...d, reason: e.target.value as RevisionReason }))}
                                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2"
                                        >
                                            {Object.values(RevisionReason).map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                        <textarea
                                            value={draft.comment}
                                            onChange={e => setDraft(d => ({ ...d, comment: e.target.value }))}
                                            placeholder="Comentário (opcional)"
                                            className="w-full h-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2 resize-none"
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium">Cancelar</button>
                                            <button onClick={saveEdit} className="px-3 py-1.5 text-xs text-white bg-brand-700 hover:bg-brand-800 rounded-lg font-semibold">Salvar</button>
                                        </div>
                                    </div>
                                ) : (
                                    rev.comment && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 whitespace-pre-wrap">{rev.comment}</p>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex justify-end mt-4">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium">Fechar</button>
                </div>
            </div>
        </div>
    );
}
