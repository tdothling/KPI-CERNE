import React, { useState } from 'react';
import { Discipline, ProjectPhase, Period } from '../types';
import { ClipboardCheck, Trash2, X, Wand2, Loader2 } from 'lucide-react';

export interface StagingRow {
    tempId: string;
    filename: string;
    discipline: Discipline;
    phase: ProjectPhase;
    startDate: string;
    startPeriod: Period;
}

interface ImportReviewModalProps {
    rows: StagingRow[];
    client: string;
    base: string;
    saving: boolean;
    onChangeRows: (rows: StagingRow[]) => void;
    onConfirm: () => void;
    onCancel: () => void;
}

// Etapa de conferência do cadastro: o usuário revisa e ajusta cada linha
// (disciplina, fase, data) antes de gravar qualquer registro no banco.
export const ImportReviewModal: React.FC<ImportReviewModalProps> = ({ rows, client, base, saving, onChangeRows, onConfirm, onCancel }) => {
    const [bulkDiscipline, setBulkDiscipline] = useState<'' | Discipline>('');
    const [bulkPhase, setBulkPhase] = useState<'' | ProjectPhase>('');
    const [bulkDate, setBulkDate] = useState('');

    const updateRow = (tempId: string, field: keyof StagingRow, value: string) => {
        onChangeRows(rows.map(r => r.tempId === tempId ? { ...r, [field]: value } : r));
    };

    const removeRow = (tempId: string) => {
        onChangeRows(rows.filter(r => r.tempId !== tempId));
    };

    const applyBulk = () => {
        if (!bulkDiscipline && !bulkPhase && !bulkDate) return;
        onChangeRows(rows.map(r => ({
            ...r,
            ...(bulkDiscipline ? { discipline: bulkDiscipline } : {}),
            ...(bulkPhase ? { phase: bulkPhase } : {}),
            ...(bulkDate ? { startDate: bulkDate } : {}),
        })));
    };

    const hasInvalidRow = rows.some(r => !r.filename.trim());
    const canConfirm = rows.length > 0 && !hasInvalidRow && !saving;

    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-5xl w-full border dark:border-slate-700 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-start p-6 border-b border-slate-100 dark:border-slate-700">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <ClipboardCheck size={22} className="text-brand-600 dark:text-brand-400" />
                            Conferir Cadastro ({rows.length} {rows.length === 1 ? 'projeto' : 'projetos'})
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Cliente: <span className="font-semibold text-slate-700 dark:text-slate-200">{client}</span>
                            {base && <> · Base: <span className="font-semibold text-slate-700 dark:text-slate-200">{base}</span></>}
                            <span className="block text-xs mt-0.5">Nada foi salvo ainda — revise as linhas e confirme.</span>
                        </p>
                    </div>
                    <button onClick={onCancel} disabled={saving} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" aria-label="Fechar"><X size={24} /></button>
                </div>

                {/* Aplicar a todos */}
                <div className="px-6 py-3 bg-slate-50 dark:bg-slate-700/30 border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-end gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mr-1">
                        <Wand2 size={14} className="text-brand-500" /> Aplicar a todos
                    </div>
                    <div>
                        <label className="block text-[10px] text-slate-500 uppercase mb-0.5">Disciplina</label>
                        <select value={bulkDiscipline} onChange={(e) => setBulkDiscipline(e.target.value as any)} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-xs rounded px-2 py-1.5">
                            <option value="">— manter —</option>
                            {Object.values(Discipline).map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] text-slate-500 uppercase mb-0.5">Fase</label>
                        <select value={bulkPhase} onChange={(e) => setBulkPhase(e.target.value as any)} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-xs rounded px-2 py-1.5">
                            <option value="">— manter —</option>
                            {Object.values(ProjectPhase).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] text-slate-500 uppercase mb-0.5">Data de Início</label>
                        <input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-xs rounded px-2 py-1.5 dark:[color-scheme:dark]" />
                    </div>
                    <button onClick={applyBulk} disabled={saving} className="px-3 py-1.5 bg-brand-100 text-brand-700 hover:bg-brand-200 dark:bg-brand-900/30 dark:text-brand-400 rounded text-xs font-semibold transition-colors">
                        Aplicar
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[11px] text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-2.5 w-8">#</th>
                                <th className="px-3 py-2.5 min-w-[240px]">Nome do Arquivo</th>
                                <th className="px-3 py-2.5">Disciplina</th>
                                <th className="px-3 py-2.5">Fase</th>
                                <th className="px-3 py-2.5">Início</th>
                                <th className="px-3 py-2.5 w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {rows.map((row, idx) => (
                                <tr key={row.tempId} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors">
                                    <td className="px-4 py-2 text-xs text-slate-400 font-mono">{idx + 1}</td>
                                    <td className="px-3 py-2">
                                        <input
                                            type="text"
                                            value={row.filename}
                                            onChange={(e) => updateRow(row.tempId, 'filename', e.target.value)}
                                            className={`w-full bg-transparent border rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-brand-500 ${row.filename.trim() ? 'border-slate-200 dark:border-slate-600' : 'border-rose-400 bg-rose-50 dark:bg-rose-900/20'}`}
                                            placeholder="Nome obrigatório..."
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <select value={row.discipline} onChange={(e) => updateRow(row.tempId, 'discipline', e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs rounded px-2 py-1.5 w-full">
                                            {Object.values(Discipline).map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-3 py-2">
                                        <select value={row.phase} onChange={(e) => updateRow(row.tempId, 'phase', e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs rounded px-2 py-1.5 w-full">
                                            {Object.values(ProjectPhase).map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-1">
                                            <input type="date" value={row.startDate} onChange={(e) => updateRow(row.tempId, 'startDate', e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs rounded px-2 py-1.5 dark:[color-scheme:dark]" />
                                            <select value={row.startPeriod} onChange={(e) => updateRow(row.tempId, 'startPeriod', e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs rounded px-1 py-1.5">
                                                <option value="MANHA">Manhã</option>
                                                <option value="TARDE">Tarde</option>
                                            </select>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <button onClick={() => removeRow(row.tempId)} disabled={saving} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors" aria-label="Remover linha"><Trash2 size={15} /></button>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-400 italic">Nenhuma linha para cadastrar. Feche e tente novamente.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/20 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {hasInvalidRow ? <span className="text-rose-500 font-semibold">Há linhas sem nome — preencha ou remova para continuar.</span> : 'Todos os projetos entrarão como "Em Andamento".'}
                    </span>
                    <div className="flex items-center gap-3">
                        <button onClick={onCancel} disabled={saving} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors">Cancelar</button>
                        <button onClick={onConfirm} disabled={!canConfirm} className="px-6 py-2 bg-brand-700 hover:bg-brand-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg shadow-md font-semibold transition-all flex items-center gap-2">
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
                            {saving ? 'Salvando...' : `Confirmar Cadastro (${rows.length})`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
