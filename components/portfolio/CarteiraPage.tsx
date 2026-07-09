import React, { useMemo, useState } from 'react';
import { FolderKanban, Play, Send, BadgeCheck, ThumbsDown, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Layers, ListTodo, MapPin, PencilLine, Trash2, X, RotateCcw, Database } from 'lucide-react';
import { ClientDoc, Discipline, Period, RevisionReason } from '../../types';
import { Referencia, Conjunto, Prancha, PranchaStatus, canPranchaTransition, carteiraKpis, conjuntosKpis, rollupConjunto, inferPranchaStatusFromDates } from '../../domain/portfolio';
import { KpiCard, StatusBadge, PRANCHA_STATUS_STYLE, DateActionModal, DateActionRequest, TimelineDatesEditor, TimelineDates, PRANCHA_TIMELINE_FIELDS, RevisionHistoryModal } from './shared';
import { calculateDeadlineDate, formatDateDisplay } from '../../utils';
import { format } from 'date-fns';

interface CarteiraPageProps {
    referencias: Referencia[];
    conjuntos: Conjunto[];
    pranchas: Prancha[];
    clients: ClientDoc[]; // apenas obras de rodovia
    readOnly: boolean;
    legacyPendingCount: number;     // projetos antigos de obras de rodovia ainda não migrados
    isMigrationAdmin: boolean;
    onMigrate: () => void;
    onMovePrancha: (p: Prancha, to: PranchaStatus, date: string, period: Period, options?: { reason?: RevisionReason; comment?: string }) => void;
    onUpdatePrancha: (id: string, changes: Partial<Prancha>) => void;
    onDeletePrancha: (p: Prancha) => void;
    onDeleteConjunto: (c: Conjunto) => void;
}

type PranchaFilter = 'ALL' | 'OVERDUE' | PranchaStatus;

export const CarteiraPage: React.FC<CarteiraPageProps> = ({
    referencias, conjuntos, pranchas, clients, readOnly,
    legacyPendingCount, isMigrationAdmin, onMigrate,
    onMovePrancha, onUpdatePrancha, onDeletePrancha, onDeleteConjunto,
}) => {
    const [statusFilter, setStatusFilter] = useState<PranchaFilter>('ALL');
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [dateAction, setDateAction] = useState<DateActionRequest | null>(null);
    const [editingPrancha, setEditingPrancha] = useState<Prancha | null>(null);
    const [historicoDe, setHistoricoDe] = useState<Prancha | null>(null);

    const refById = useMemo(() => new Map(referencias.map(r => [r.id, r])), [referencias]);
    const clientsMap = useMemo(() => {
        const map: Record<string, ClientDoc> = {};
        clients.forEach(c => { map[c.name] = c; });
        return map;
    }, [clients]);

    const pranchasByConjunto = useMemo(() => {
        const map = new Map<string, Prancha[]>();
        pranchas.forEach(p => {
            if (!map.has(p.conjuntoId)) map.set(p.conjuntoId, []);
            map.get(p.conjuntoId)!.push(p);
        });
        map.forEach(list => list.sort((a, b) => (a.papel || '').localeCompare(b.papel || '')));
        return map;
    }, [pranchas]);

    // Atraso pelo SLA da obra (mesma régua da aba Projetos)
    const isPranchaOverdue = (p: Prancha, conjunto: Conjunto): boolean => {
        const obra = clientsMap[conjunto.client];
        if (!obra?.contractDate || obra.deadlineDays === undefined || obra.completedAt) return false;
        const deadline = calculateDeadlineDate(obra.contractDate, obra.deadlineDays);
        if (!deadline) return false;
        const deadlineStr = format(deadline, 'yyyy-MM-dd');
        if (p.endDate) return p.endDate > deadlineStr;
        if (p.status === PranchaStatus.A_FAZER || p.status === PranchaStatus.EM_ANDAMENTO || p.status === PranchaStatus.REPROVADO) {
            return new Date().toISOString().split('T')[0] > deadlineStr;
        }
        return false;
    };

    const conjuntoById = useMemo(() => new Map(conjuntos.map(c => [c.id, c])), [conjuntos]);

    // --- KPIs: nível Prancha e nível Conjunto, cada um contando SÓ a sua entidade ---
    const kpis = useMemo(() => carteiraKpis(pranchas, (p: Prancha) => {
        const c = conjuntoById.get(p.conjuntoId);
        return c ? isPranchaOverdue(p, c) : false;
    }), [pranchas, conjuntoById, clientsMap]);

    const baseKpis = useMemo(() => conjuntosKpis(conjuntos, pranchasByConjunto), [conjuntos, pranchasByConjunto]);

    const matchesFilter = (p: Prancha, c: Conjunto) => {
        if (statusFilter === 'ALL') return true;
        if (statusFilter === 'OVERDUE') return isPranchaOverdue(p, c);
        return p.status === statusFilter;
    };

    // Disciplina (da referência) → conjuntos com pranchas visíveis
    const grouped = useMemo(() => {
        const byDiscipline = new Map<Discipline, { conjunto: Conjunto; ref: Referencia | undefined; visiveis: Prancha[] }[]>();
        conjuntos.forEach(conjunto => {
            const ref = refById.get(conjunto.referenciaId);
            const todas = pranchasByConjunto.get(conjunto.id) || [];
            const visiveis = todas.filter(p => matchesFilter(p, conjunto));
            if (statusFilter !== 'ALL' && visiveis.length === 0) return;
            const d = ref?.discipline || Discipline.OTHER;
            if (!byDiscipline.has(d)) byDiscipline.set(d, []);
            byDiscipline.get(d)!.push({ conjunto, ref, visiveis });
        });
        byDiscipline.forEach(list => list.sort((a, b) =>
            `${a.ref?.codigoCliente || ''}|${a.conjunto.base}`.localeCompare(`${b.ref?.codigoCliente || ''}|${b.conjunto.base}`)
        ));
        return [...byDiscipline.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [conjuntos, refById, pranchasByConjunto, statusFilter, clientsMap]);

    const toggleExpanded = (id: string) => setExpanded(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });

    const askMovePrancha = (p: Prancha, to: PranchaStatus) => {
        const isRevisao = to === PranchaStatus.EM_ANDAMENTO && p.status === PranchaStatus.REPROVADO;
        const cfg: Partial<Record<PranchaStatus, { title: string; confirmLabel: string; tone: DateActionRequest['tone']; withComment?: boolean; withReason?: boolean; description?: string }>> = {
            [PranchaStatus.EM_ANDAMENTO]: isRevisao
                ? { title: `Revisar "${p.codigoCompleto || p.papel}"`, confirmLabel: 'Iniciar Revisão', tone: 'brand', withReason: true, withComment: true, description: 'A prancha reprovada volta para execução como nova revisão. O motivo fica no histórico e as datas de fim/envio/feedback serão reiniciadas.' }
                : { title: `Iniciar "${p.codigoCompleto || p.papel}"`, confirmLabel: 'Iniciar Execução', tone: 'brand' },
            [PranchaStatus.CONCLUIDO]: { title: `Concluir execução de "${p.codigoCompleto || p.papel}"`, confirmLabel: 'Concluir', tone: 'violet' },
            [PranchaStatus.ENVIADO]: { title: `Enviar "${p.codigoCompleto || p.papel}"`, confirmLabel: 'Registrar Envio', tone: 'blue' },
            [PranchaStatus.APROVADO]: { title: `Aprovar "${p.codigoCompleto || p.papel}"`, confirmLabel: 'Aprovar', tone: 'emerald' },
            [PranchaStatus.REPROVADO]: { title: `Reprovar "${p.codigoCompleto || p.papel}"`, confirmLabel: 'Reprovar', tone: 'rose', withComment: true },
        };
        const c = cfg[to]!;
        setDateAction({
            ...c,
            onConfirm: (date, period, comment, reason) =>
                onMovePrancha(p, to, date, period, isRevisao ? { reason, comment } : (comment ? { comment } : undefined)),
        });
    };

    return (
        <div className="space-y-4">
            {/* Migração pendente: projetos antigos de obras de rodovia ainda no modelo 1:1 */}
            {legacyPendingCount > 0 && isMigrationAdmin && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-between gap-4 animate-in fade-in">
                    <div className="flex items-start gap-3">
                        <Database className="text-amber-600 dark:text-amber-400 mt-0.5" size={18} />
                        <div>
                            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Migração pendente (apenas admin)</p>
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                                Existem {legacyPendingCount} projeto(s) de obras de rodovia no modelo antigo. A migração converte preliminares em
                                Referências e executivos em Conjuntos com pranchas — sem apagar nada da coleção original. Pode rodar mais de uma vez.
                            </p>
                        </div>
                    </div>
                    <button onClick={onMigrate} className="flex-shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm">
                        Migrar para a Carteira
                    </button>
                </div>
            )}

            {/* Rollup nível Conjunto: bases instanciadas / concluídas */}
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">
                <MapPin size={14} className="text-brand-600 dark:text-brand-400" />
                <span><strong className="text-slate-700 dark:text-slate-200">{baseKpis.bases}</strong> base(s) instanciada(s)</span>
                <span className="w-px h-4 bg-slate-200 dark:bg-slate-700"></span>
                <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
                <span><strong className="text-slate-700 dark:text-slate-200">{baseKpis.concluidas}</strong> base(s) com execução concluída</span>
            </div>

            {/* KPIs nível Prancha: entidades comparáveis entre si (nunca somadas a referências) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                <KpiCard color="slate" icon={<FolderKanban size={16} />} label="Todas" value={kpis.total} active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
                <KpiCard color="slate" icon={<ListTodo size={16} />} label="A Fazer" value={kpis.aFazer} active={statusFilter === PranchaStatus.A_FAZER} onClick={() => setStatusFilter(f => f === PranchaStatus.A_FAZER ? 'ALL' : PranchaStatus.A_FAZER)} />
                <KpiCard color="blue" icon={<Play size={16} />} label="Em Andamento" value={kpis.emAndamento} active={statusFilter === PranchaStatus.EM_ANDAMENTO} onClick={() => setStatusFilter(f => f === PranchaStatus.EM_ANDAMENTO ? 'ALL' : PranchaStatus.EM_ANDAMENTO)} />
                <KpiCard color="violet" icon={<CheckCircle2 size={16} />} label="Concluídas" value={kpis.concluido} active={statusFilter === PranchaStatus.CONCLUIDO} onClick={() => setStatusFilter(f => f === PranchaStatus.CONCLUIDO ? 'ALL' : PranchaStatus.CONCLUIDO)} />
                <KpiCard color="amber" icon={<Send size={16} />} label="Aguardando" value={kpis.aguardando} active={statusFilter === PranchaStatus.ENVIADO} onClick={() => setStatusFilter(f => f === PranchaStatus.ENVIADO ? 'ALL' : PranchaStatus.ENVIADO)} />
                <KpiCard color="emerald" icon={<BadgeCheck size={16} />} label="Aprovadas" value={kpis.aprovado} active={statusFilter === PranchaStatus.APROVADO} onClick={() => setStatusFilter(f => f === PranchaStatus.APROVADO ? 'ALL' : PranchaStatus.APROVADO)} />
                <KpiCard color="rose" icon={<ThumbsDown size={16} />} label="Reprovadas" value={kpis.reprovado} active={statusFilter === PranchaStatus.REPROVADO} onClick={() => setStatusFilter(f => f === PranchaStatus.REPROVADO ? 'ALL' : PranchaStatus.REPROVADO)} />
                <KpiCard color="red" icon={<AlertTriangle size={16} />} label="Atrasadas" value={kpis.atrasado} active={statusFilter === 'OVERDUE'} onClick={() => setStatusFilter(f => f === 'OVERDUE' ? 'ALL' : 'OVERDUE')} />
            </div>

            {conjuntos.length === 0 && (
                <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
                    <FolderKanban className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Nenhum conjunto instanciado</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Use "Instanciar em Base" no Catálogo para replicar uma referência em uma base (KM).</p>
                </div>
            )}

            {grouped.map(([discipline, items]) => (
                <div key={discipline} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-slate-50/60 dark:bg-slate-900/30 text-sm font-bold text-slate-700 dark:text-slate-200">
                        <Layers size={15} className="text-brand-600 dark:text-brand-400" />
                        {discipline}
                        <span className="text-[10px] font-bold text-slate-400 uppercase ml-auto">{items.length} conjunto(s)</span>
                    </div>

                    <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        {items.map(({ conjunto, ref, visiveis }) => {
                            const todas = pranchasByConjunto.get(conjunto.id) || [];
                            const rollup = rollupConjunto(todas);
                            const isOpen = expanded.has(conjunto.id);
                            return (
                                <div key={conjunto.id}>
                                    {/* Linha do Conjunto: status é SEMPRE derivado (rollup), nunca editável */}
                                    <div
                                        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"
                                        onClick={() => toggleExpanded(conjunto.id)}
                                    >
                                        {isOpen ? <ChevronDown size={16} className="text-slate-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="flex items-center gap-1 text-xs font-bold text-brand-700 dark:text-brand-400"><MapPin size={12} /> {conjunto.base}</span>
                                                <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{conjunto.codigoRodovia || ref?.codigoCliente || '—'}</span>
                                                {rollup.isConcluido && <StatusBadge label="Conjunto concluído" className="text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-400" />}
                                                {rollup.reprovado > 0 && <StatusBadge label={`${rollup.reprovado} reprovada(s)`} className="text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-400" />}
                                            </div>
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                {conjunto.client} · Molde: <span className="font-mono">{ref?.codigoCliente || 'referência removida'}</span> · Criado em {formatDateDisplay(conjunto.createdAt)}
                                            </div>
                                        </div>

                                        {/* Rollup 4/6 + barra de progresso */}
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            <div className="text-right">
                                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{rollup.executadas}/{rollup.total}</span>
                                                <span className="block text-[10px] text-slate-400 uppercase font-semibold">executadas</span>
                                            </div>
                                            <div className="w-24 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden hidden sm:block">
                                                <div
                                                    className={`h-full rounded-full transition-all ${rollup.isConcluido ? 'bg-emerald-500' : 'bg-brand-600'}`}
                                                    style={{ width: `${rollup.pctExecutado}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 w-9 text-right">{rollup.pctExecutado}%</span>
                                            {!readOnly && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onDeleteConjunto(conjunto); }}
                                                    className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400 transition-colors"
                                                    title="Excluir conjunto e suas pranchas"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Pranchas filhas */}
                                    {isOpen && (
                                        <div className="bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-700/60">
                                            {visiveis.length === 0 && (
                                                <p className="px-12 py-3 text-xs text-slate-400 italic">Nenhuma prancha corresponde ao filtro atual.</p>
                                            )}
                                            {visiveis.map(p => (
                                                <div key={p.id} className="pl-12 pr-4 py-2 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700/40 last:border-b-0">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{p.papel}</span>
                                                            {(p.revisao > 0 || (p.revisions?.length ?? 0) > 0) && (
                                                                <button
                                                                    onClick={() => setHistoricoDe(p)}
                                                                    className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded px-1 py-0.5 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                                                                    title="Ver histórico de revisões (motivos e comentários)"
                                                                    aria-label={`Ver histórico de revisões de ${p.codigoCompleto || p.papel}`}
                                                                >
                                                                    R{String(p.revisao).padStart(2, '0')}
                                                                </button>
                                                            )}
                                                            <StatusBadge label={p.status} className={PRANCHA_STATUS_STYLE[p.status]} />
                                                            {isPranchaOverdue(p, conjunto) && <StatusBadge label="Atrasada" className="text-red-600 bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400" />}
                                                        </div>
                                                        <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono truncate">
                                                            <span className="truncate">{p.codigoCompleto || '(sem código — edite para preencher)'}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                                                            {p.startDate && <span>Início: {formatDateDisplay(p.startDate)}</span>}
                                                            {p.endDate && <span>Fim: {formatDateDisplay(p.endDate)}</span>}
                                                            {p.sendDate && <span>Envio: {formatDateDisplay(p.sendDate)}</span>}
                                                            {p.feedbackDate && <span>Feedback: {formatDateDisplay(p.feedbackDate)}</span>}
                                                            {(p.blockedDays || 0) > 0 && <span className="text-amber-600 dark:text-amber-400">{p.blockedDays}d com o cliente</span>}
                                                        </div>
                                                    </div>

                                                    {!readOnly && (
                                                        <div className="flex items-center gap-1 flex-shrink-0">
                                                            {canPranchaTransition(p.status, PranchaStatus.EM_ANDAMENTO) && (
                                                                <PranchaBtn title={p.status === PranchaStatus.REPROVADO ? 'Revisar (reabre execução)' : 'Iniciar execução'} onClick={() => askMovePrancha(p, PranchaStatus.EM_ANDAMENTO)}>
                                                                    {p.status === PranchaStatus.REPROVADO ? <RotateCcw size={13} /> : <Play size={13} />}
                                                                </PranchaBtn>
                                                            )}
                                                            {canPranchaTransition(p.status, PranchaStatus.CONCLUIDO) && (
                                                                <PranchaBtn title="Concluir execução" tone="text-violet-600" onClick={() => askMovePrancha(p, PranchaStatus.CONCLUIDO)}><CheckCircle2 size={13} /></PranchaBtn>
                                                            )}
                                                            {canPranchaTransition(p.status, PranchaStatus.ENVIADO) && (
                                                                <PranchaBtn title="Registrar envio" tone="text-blue-600" onClick={() => askMovePrancha(p, PranchaStatus.ENVIADO)}><Send size={13} /></PranchaBtn>
                                                            )}
                                                            {canPranchaTransition(p.status, PranchaStatus.APROVADO) && (
                                                                <PranchaBtn title="Aprovar" tone="text-emerald-600" onClick={() => askMovePrancha(p, PranchaStatus.APROVADO)}><BadgeCheck size={13} /></PranchaBtn>
                                                            )}
                                                            {canPranchaTransition(p.status, PranchaStatus.REPROVADO) && (
                                                                <PranchaBtn title="Reprovar" tone="text-rose-600" onClick={() => askMovePrancha(p, PranchaStatus.REPROVADO)}><ThumbsDown size={13} /></PranchaBtn>
                                                            )}
                                                            <PranchaBtn title="Editar papel/código" onClick={() => setEditingPrancha(p)}><PencilLine size={13} /></PranchaBtn>
                                                            <PranchaBtn title="Excluir prancha" tone="text-rose-600" onClick={() => onDeletePrancha(p)}><Trash2 size={13} /></PranchaBtn>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {dateAction && <DateActionModal request={dateAction} onClose={() => setDateAction(null)} />}

            {historicoDe && (
                <RevisionHistoryModal
                    title={historicoDe.codigoCompleto || historicoDe.papel}
                    revisions={historicoDe.revisions || []}
                    readOnly={readOnly}
                    onSave={(updated) => {
                        onUpdatePrancha(historicoDe.id, { revisions: updated });
                        setHistoricoDe({ ...historicoDe, revisions: updated });
                    }}
                    onClose={() => setHistoricoDe(null)}
                />
            )}

            {editingPrancha && (
                <PranchaEditModal
                    prancha={editingPrancha}
                    onClose={() => setEditingPrancha(null)}
                    onSave={(changes) => { onUpdatePrancha(editingPrancha.id, changes); setEditingPrancha(null); }}
                />
            )}
        </div>
    );
};

function PranchaBtn({ children, title, onClick, tone }: { children: React.ReactNode; title: string; onClick: () => void; tone?: string }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`p-1 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-brand-300 transition-colors ${tone || 'text-slate-500 dark:text-slate-400'}`}
        >
            {children}
        </button>
    );
}

// A codificação é manual (varia por órgão regulamentador): este modal é o ponto
// de ajuste fino do código de cada prancha.
function PranchaEditModal({ prancha, onClose, onSave }: {
    prancha: Prancha;
    onClose: () => void;
    onSave: (changes: Partial<Prancha>) => void;
}) {
    const [papel, setPapel] = useState(prancha.papel);
    const [codigo, setCodigo] = useState(prancha.codigoCompleto);
    const [observacao, setObservacao] = useState(prancha.observacao || '');
    const [dates, setDates] = useState<TimelineDates>({
        startDate: prancha.startDate || '', startPeriod: prancha.startPeriod || 'MANHA',
        endDate: prancha.endDate || '', endPeriod: prancha.endPeriod || 'TARDE',
        sendDate: prancha.sendDate || '', sendPeriod: prancha.sendPeriod || 'MANHA',
        feedbackDate: prancha.feedbackDate || '', feedbackPeriod: prancha.feedbackPeriod || 'TARDE',
    });

    const save = () => {
        if (!papel.trim()) { alert('O papel não pode ficar vazio.'); return; }
        if (dates.startDate && dates.endDate && dates.endDate < dates.startDate) {
            alert('A conclusão da execução não pode ser anterior ao início.'); return;
        }
        if (dates.sendDate && dates.feedbackDate && dates.feedbackDate < dates.sendDate) {
            alert('O feedback não pode ser anterior ao envio.'); return;
        }
        // Datas enviadas sempre (inclusive '') para permitir apagar; o período só
        // acompanha quando há data. blockedDays é recalculado no handler.
        const datePayload: Record<string, any> = {};
        PRANCHA_TIMELINE_FIELDS.forEach(f => {
            const date = dates[f.dateKey] as string | undefined;
            datePayload[f.dateKey] = date || '';
            if (date) datePayload[f.periodKey] = dates[f.periodKey];
        });

        // Lógica do fluxo: se alguma data mudou, o status é derivado da linha do tempo
        // (apagar datas retroage o status; preencher avança).
        const dateChanged = ['startDate', 'endDate', 'sendDate', 'feedbackDate'].some(
            k => (dates[k as keyof TimelineDates] as string || '') !== ((prancha as any)[k] || '')
        );
        const statusPatch = dateChanged
            ? { status: inferPranchaStatusFromDates({ startDate: dates.startDate, endDate: dates.endDate, sendDate: dates.sendDate, feedbackDate: dates.feedbackDate }, prancha.status) }
            : {};

        onSave({ papel: papel.trim(), codigoCompleto: codigo.trim(), observacao: observacao.trim() || undefined, ...datePayload, ...statusPatch });
    };

    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Editar Prancha</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={20} /></button>
                </div>

                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Papel (do gabarito)</label>
                <input value={papel} onChange={e => setPapel(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-4" />

                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Código Completo (manual)</label>
                <input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ex: ELO-040RJ-104+000-BSO-EXE-DE-P1-101"
                    className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-4" />

                <div className="mb-4">
                    <TimelineDatesEditor
                        fields={PRANCHA_TIMELINE_FIELDS}
                        value={dates}
                        onChange={patch => setDates(prev => ({ ...prev, ...patch }))}
                        note="O status segue a linha do tempo: apagar datas retroage o status (ex.: Concluída → Em Andamento/A Fazer) e preencher avança. Aprovada/Reprovada preservam a decisão. Os dias com o cliente recalculam de envio e feedback."
                    />
                </div>

                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Observações</label>
                <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
                    className="w-full h-16 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-5 resize-none" />

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium">Cancelar</button>
                    <button onClick={save} className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-sm">
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}
