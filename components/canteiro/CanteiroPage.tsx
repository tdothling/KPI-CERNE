import React, { useMemo, useState } from 'react';
import { ProjectFile, ClientDoc, Status, Discipline, ProjectPhase, Period, RevisionReason, SiteType, ObraStatus } from '../../types';
import { useObraAtiva, ObraSelectScreen, ObraAtivaBar, ObraCardStat } from '../ObraGate';
import {
    KpiCard, StatusBadge, DateActionModal, DateActionRequest,
    TimelineDatesEditor, TimelineDates, REF_TIMELINE_FIELDS,
    RevisionHistoryModal, execDaysOf,
} from '../portfolio/shared';
import {
    canTransitionTo, inferStatusFromDates, calculateBusinessDaysWithHolidays,
    formatDateDisplay, calculateDeadlineDate, getEffectiveStatus,
} from '../../utils';
import { parseISO, isValid, format } from 'date-fns';
import {
    HardHat, Layers, ChevronDown, ChevronRight, Plus, X, Search,
    Play, CheckCircle2, Send, BadgeCheck, ThumbsDown, RotateCcw,
    PencilLine, Trash2, Timer, ArrowUpRight, AlertTriangle,
} from 'lucide-react';

// --- Canteiro de Obras (antiga aba Projetos) ---
//
// Mesma experiência da aba Projetos Referências (KPI-cards que filtram, grupos
// de disciplina colapsáveis, ações de fluxo com data/período, histórico de
// revisões), SEM a lógica de instanciação: o ciclo de vida do projeto nasce,
// evolui e encerra aqui mesmo, sobre a MESMA coleção `projects` de sempre —
// nenhum dado é migrado ou convertido.

interface CanteiroPageProps {
    projects: ProjectFile[];
    clients: ClientDoc[];
    holidays: string[];
    readOnly: boolean;
    onAdd: (data: Omit<ProjectFile, 'id'>) => Promise<any>;
    onUpdate: (updated: ProjectFile) => void;
    onDelete: (id: string) => void;
    onAddRevision: (id: string, reason: RevisionReason, comment: string, startDate?: string, startPeriod?: Period) => void;
    onPromote: (id: string) => void;
}

type StatusFilter = 'ALL' | Status;

// Badge por status do ciclo do canteiro (mesma linguagem visual das outras abas)
const CANTEIRO_STATUS_STYLE: Record<Status, string> = {
    [Status.IN_PROGRESS]: 'text-brand-700 bg-brand-50 border-brand-200 dark:bg-brand-900/40 dark:border-brand-800 dark:text-brand-400',
    [Status.DONE]: 'text-violet-700 bg-violet-100 border-violet-300 dark:bg-violet-900/40 dark:border-violet-700 dark:text-violet-400',
    [Status.WAITING_APPROVAL]: 'text-blue-700 bg-blue-100 border-blue-300 dark:bg-blue-900/40 dark:border-blue-700 dark:text-blue-400',
    [Status.APPROVED]: 'text-emerald-700 bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700 dark:text-emerald-400',
    [Status.REJECTED]: 'text-rose-700 bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700 dark:text-rose-400',
    [Status.REVISED]: 'text-slate-500 bg-slate-100 border-slate-300 dark:bg-slate-700/60 dark:border-slate-600 dark:text-slate-400',
    [Status.SUPERSEDED]: 'text-cyan-700 bg-cyan-100 border-cyan-300 dark:bg-cyan-900/40 dark:border-cyan-700 dark:text-cyan-400',
};

const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const CanteiroPage: React.FC<CanteiroPageProps> = (props) => {
    const { projects, clients } = props;

    // Obras da aba: todas as que NÃO são de rodovia (rodovia vive em Projetos
    // Referências/Projetos Locais), mais nomes presentes em projetos antigos e
    // não cadastrados na aba Obras. MESMA chave de localStorage de antes: a
    // obra ativa memorizada pelo usuário é preservada na reformulação.
    const obras = useMemo(() => {
        const registradas = clients.filter(c => c.type !== SiteType.HIGHWAY);
        const nomes = new Set(registradas.map(c => c.name));
        const extras = [...new Set(projects.map(p => p.client).filter(Boolean))].filter(n => !nomes.has(n)).sort();
        return [
            ...registradas.map(c => ({ id: c.id, name: c.name })),
            ...extras.map(n => ({ id: `legado-${n}`, name: n })),
        ];
    }, [clients, projects]);
    const obraNames = useMemo(() => obras.map(o => o.name), [obras]);

    const { obraAtiva, selecionarObra, trocarObra } = useObraAtiva('kpicerne.projetos.obraAtiva', obraNames);
    const projetosDaObra = useMemo(() => projects.filter(p => p.client === obraAtiva), [projects, obraAtiva]);

    if (!obraAtiva) {
        return (
            <ObraSelectScreen
                obras={obras}
                subtitle="O canteiro é navegado por obra. A escolha fica salva — nas próximas visitas você entra direto nela."
                emptyTitle="Nenhuma obra cadastrada"
                emptyHint="Cadastre uma obra na aba Obras para gerenciar os projetos do canteiro."
                onSelect={selecionarObra}
                statsOf={(name) => {
                    const da = projects.filter(p => p.client === name);
                    const n = (s: Status) => da.filter(p => p.status === s).length;
                    const stats: ObraCardStat[] = [
                        { value: da.length, label: 'arquivo(s) de projeto' },
                        { value: n(Status.IN_PROGRESS), label: 'em execução' },
                    ];
                    const aguardando = n(Status.WAITING_APPROVAL);
                    const aprovados = n(Status.APPROVED);
                    const reprovados = n(Status.REJECTED);
                    if (aguardando > 0) stats.push({ value: aguardando, label: 'aguardando aprovação', tone: 'text-amber-600 dark:text-amber-400 font-semibold' });
                    if (aprovados > 0) stats.push({ value: aprovados, label: 'aprovado(s)', tone: 'text-emerald-600 dark:text-emerald-400 font-semibold' });
                    if (reprovados > 0) stats.push({ value: reprovados, label: 'reprovado(s)', tone: 'text-rose-600 dark:text-rose-400 font-semibold' });
                    if (da.length === 0) stats.push({ value: '', label: 'Sem projetos nesta obra — comece por aqui', tone: 'italic col-span-2' });
                    return stats;
                }}
            />
        );
    }

    return (
        <div className="space-y-4">
            <ObraAtivaBar obra={obraAtiva} canTrocar={obras.length > 1} onTrocar={trocarObra} />
            <CanteiroInner {...props} projects={projetosDaObra} obraAtiva={obraAtiva} />
        </div>
    );
};

function CanteiroInner({
    projects, clients, holidays, readOnly, obraAtiva,
    onAdd, onUpdate, onDelete, onAddRevision, onPromote,
}: CanteiroPageProps & { obraAtiva: string }) {
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [search, setSearch] = useState('');
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [editing, setEditing] = useState<ProjectFile | null>(null);
    const [creating, setCreating] = useState(false);
    const [historicoDe, setHistoricoDe] = useState<ProjectFile | null>(null);
    const [dateAction, setDateAction] = useState<DateActionRequest | null>(null);

    const obraDoc = useMemo(() => clients.find(c => c.name === obraAtiva), [clients, obraAtiva]);

    // Atraso pelo SLA da obra — mesma régua dos Indicadores e de Projetos Locais
    // (obra pausada, concluída ou cancelada não gera atraso)
    const isOverdue = (p: ProjectFile): boolean => {
        if (!obraDoc?.contractDate || obraDoc.deadlineDays === undefined) return false;
        if (getEffectiveStatus(obraDoc) !== ObraStatus.ACTIVE) return false;
        const deadline = calculateDeadlineDate(obraDoc.contractDate, obraDoc.deadlineDays);
        if (!deadline) return false;
        const deadlineStr = format(deadline, 'yyyy-MM-dd');
        if (p.endDate) return p.endDate > deadlineStr;
        if (p.status === Status.IN_PROGRESS || p.status === Status.REJECTED) {
            return new Date().toISOString().split('T')[0] > deadlineStr;
        }
        return false;
    };

    // --- KPIs (mesma dinâmica do Catálogo: cada card é um filtro) ---
    const kpis = useMemo(() => {
        const n = (s: Status) => projects.filter(p => p.status === s).length;
        return {
            total: projects.length,
            emExecucao: n(Status.IN_PROGRESS),
            concluido: n(Status.DONE),
            comCliente: n(Status.WAITING_APPROVAL),
            aprovado: n(Status.APPROVED),
            reprovado: n(Status.REJECTED),
            revisado: n(Status.REVISED),
            executivoGerado: n(Status.SUPERSEDED),
        };
    }, [projects]);

    // Disciplina → projetos visíveis (filtro de status + busca sem acento)
    const grouped = useMemo(() => {
        const q = norm(search.trim());
        const byDiscipline = new Map<Discipline, ProjectFile[]>();
        projects.forEach(p => {
            if (statusFilter !== 'ALL' && p.status !== statusFilter) return;
            if (q && !norm(p.filename).includes(q) && !norm(p.base || '').includes(q)) return;
            if (!byDiscipline.has(p.discipline)) byDiscipline.set(p.discipline, []);
            byDiscipline.get(p.discipline)!.push(p);
        });
        byDiscipline.forEach(list => list.sort((a, b) =>
            a.filename.localeCompare(b.filename) || (a.revision || 0) - (b.revision || 0)
        ));
        return [...byDiscipline.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [projects, statusFilter, search]);

    const toggleCollapsed = (d: string) => setCollapsed(prev => {
        const next = new Set(prev);
        next.has(d) ? next.delete(d) : next.add(d);
        return next;
    });

    // --- Ações de fluxo (mesmas regras de negócio de sempre) ---
    const askMove = (p: ProjectFile, action: 'COMPLETE' | 'SEND' | 'APPROVE' | 'REJECT') => {
        const cfg = {
            COMPLETE: { title: `Concluir execução de "${p.filename}"`, confirmLabel: 'Concluir', tone: 'violet' as const, description: 'Fecha a medição do tempo de execução (dias úteis entre início e conclusão).' },
            SEND: { title: `Enviar "${p.filename}" ao cliente`, confirmLabel: 'Registrar Envio', tone: 'blue' as const, description: undefined },
            APPROVE: { title: `Aprovar "${p.filename}"`, confirmLabel: 'Aprovar', tone: 'emerald' as const, description: undefined },
            REJECT: { title: `Reprovar "${p.filename}"`, confirmLabel: 'Reprovar', tone: 'rose' as const, description: undefined },
        }[action];
        setDateAction({
            ...cfg,
            onConfirm: (date, period) => {
                const updated = { ...p };
                if (action === 'COMPLETE') {
                    if (p.startDate && date < p.startDate) { alert('A Data de Conclusão não pode ser anterior à Data de Início.'); return; }
                    updated.status = Status.DONE; updated.endDate = date; updated.endPeriod = period;
                } else if (action === 'SEND') {
                    if (p.endDate && date < p.endDate) { alert('A Data de Envio não pode ser anterior à Conclusão da execução.'); return; }
                    updated.status = Status.WAITING_APPROVAL; updated.sendDate = date; updated.sendPeriod = period;
                } else {
                    if (p.sendDate && date < p.sendDate) { alert('O Feedback não pode ser anterior ao Envio ao cliente.'); return; }
                    if (p.sendDate) {
                        updated.blockedDays = calculateBusinessDaysWithHolidays(parseISO(p.sendDate), parseISO(date), holidays, p.sendPeriod || 'MANHA', period);
                    }
                    updated.status = action === 'APPROVE' ? Status.APPROVED : Status.REJECTED;
                    updated.feedbackDate = date; updated.feedbackPeriod = period;
                }
                onUpdate(updated);
            },
        });
    };

    // Nova revisão: encerra o arquivo atual como Revisado e abre a R+1 em execução
    const askRevision = (p: ProjectFile) => {
        setDateAction({
            title: `Nova revisão de "${p.filename}"`,
            confirmLabel: `Abrir R${String((p.revision || 0) + 1).padStart(2, '0')}`,
            tone: 'brand',
            withReason: true,
            withComment: true,
            description: `O arquivo atual encerra como "Revisado" e a R${String((p.revision || 0) + 1).padStart(2, '0')} nasce em execução na data escolhida. O motivo fica no histórico.`,
            onConfirm: (date, period, comment, reason) => onAddRevision(p.id, reason, comment, date, period),
        });
    };

    const handleDelete = (p: ProjectFile) => {
        if (confirm(`Excluir "${p.filename}"?\n\nO registro vai para a Lixeira e pode ser restaurado por lá.`)) {
            onDelete(p.id);
        }
    };

    return (
        <div className="space-y-4">
            {/* KPIs nível projeto: cada card filtra a lista (mesma dinâmica das abas de rodovia) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                <KpiCard color="slate" icon={<HardHat size={16} />} label="Todos" value={kpis.total} active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
                <KpiCard color="amber" icon={<Play size={16} />} label="Em Execução" value={kpis.emExecucao} active={statusFilter === Status.IN_PROGRESS} onClick={() => setStatusFilter(f => f === Status.IN_PROGRESS ? 'ALL' : Status.IN_PROGRESS)} />
                <KpiCard color="violet" icon={<CheckCircle2 size={16} />} label="Concluídos" value={kpis.concluido} active={statusFilter === Status.DONE} onClick={() => setStatusFilter(f => f === Status.DONE ? 'ALL' : Status.DONE)} />
                <KpiCard color="blue" icon={<Send size={16} />} label="Com o Cliente" value={kpis.comCliente} active={statusFilter === Status.WAITING_APPROVAL} onClick={() => setStatusFilter(f => f === Status.WAITING_APPROVAL ? 'ALL' : Status.WAITING_APPROVAL)} />
                <KpiCard color="emerald" icon={<BadgeCheck size={16} />} label="Aprovados" value={kpis.aprovado} active={statusFilter === Status.APPROVED} onClick={() => setStatusFilter(f => f === Status.APPROVED ? 'ALL' : Status.APPROVED)} />
                <KpiCard color="rose" icon={<ThumbsDown size={16} />} label="Reprovados" value={kpis.reprovado} active={statusFilter === Status.REJECTED} onClick={() => setStatusFilter(f => f === Status.REJECTED ? 'ALL' : Status.REJECTED)} />
                <KpiCard color="slate" icon={<RotateCcw size={16} />} label="Revisados" value={kpis.revisado} active={statusFilter === Status.REVISED} onClick={() => setStatusFilter(f => f === Status.REVISED ? 'ALL' : Status.REVISED)} />
                <KpiCard color="cyan" icon={<ArrowUpRight size={16} />} label="Executivo Gerado" value={kpis.executivoGerado} active={statusFilter === Status.SUPERSEDED} onClick={() => setStatusFilter(f => f === Status.SUPERSEDED ? 'ALL' : Status.SUPERSEDED)} />
            </div>

            {/* Busca + ação de criação: o ciclo de vida nasce e termina NESTA aba */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nome ou base (sem acento)..."
                        className="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs rounded-lg focus:ring-brand-500 focus:border-brand-500"
                    />
                </div>
                {!readOnly && (
                    <button
                        onClick={() => setCreating(true)}
                        className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm"
                    >
                        <Plus size={14} /> Novo Projeto
                    </button>
                )}
            </div>

            {projects.length === 0 && (
                <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
                    <HardHat className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Nenhum projeto em {obraAtiva}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Use "Novo Projeto" ou o botão Importar para cadastrar os primeiros arquivos.</p>
                </div>
            )}

            {projects.length > 0 && grouped.length === 0 && (
                <p className="px-4 py-6 text-xs text-slate-400 italic text-center">Nenhum projeto corresponde ao filtro/busca atual.</p>
            )}

            {grouped.map(([discipline, items]) => (
                <div key={discipline} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                        onClick={() => toggleCollapsed(discipline)}
                        className="w-full flex items-center gap-2 px-4 py-3 bg-slate-50/60 dark:bg-slate-900/30 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors text-sm font-bold text-slate-700 dark:text-slate-200"
                    >
                        {collapsed.has(discipline) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        <Layers size={15} className="text-brand-600 dark:text-brand-400" />
                        {discipline}
                        <span className="text-[10px] font-bold text-slate-400 uppercase ml-auto">{items.length} projeto(s)</span>
                    </button>

                    {!collapsed.has(discipline) && (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                            {items.map(p => {
                                const exec = execDaysOf(p, p.status === Status.IN_PROGRESS, holidays);
                                const atrasado = isOverdue(p);
                                return (
                                    <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{p.filename}</span>
                                                {(p.revision || 0) > 0 || (p.revisions?.length ?? 0) > 0 ? (
                                                    <button
                                                        onClick={() => setHistoricoDe(p)}
                                                        className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded px-1 py-0.5 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                                                        title="Ver histórico de revisões (motivos e comentários)"
                                                    >
                                                        R{String(p.revision || 0).padStart(2, '0')}
                                                    </button>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-slate-400 border border-slate-200 dark:border-slate-600 rounded px-1 py-0.5">R00</span>
                                                )}
                                                <StatusBadge label={p.phase || ProjectPhase.EXECUTIVE} className="text-slate-500 bg-slate-50 border-slate-200 dark:bg-slate-700/40 dark:border-slate-600 dark:text-slate-400" />
                                                <StatusBadge label={p.status} className={CANTEIRO_STATUS_STYLE[p.status]} />
                                                {atrasado && <StatusBadge label="Atrasado" className="text-red-600 bg-red-50 border-red-200 dark:bg-red-900/30 dark:border-red-800 dark:text-red-400" />}
                                            </div>
                                            <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex-wrap">
                                                {p.base && p.base !== 'Geral' && <span>Base: {p.base}</span>}
                                                {p.startDate && <span>Início: {formatDateDisplay(p.startDate)}</span>}
                                                {p.endDate && <span>Fim: {formatDateDisplay(p.endDate)}</span>}
                                                {p.sendDate && <span>Envio: {formatDateDisplay(p.sendDate)}</span>}
                                                {p.feedbackDate && <span>Feedback: {formatDateDisplay(p.feedbackDate)}</span>}
                                                {(p.blockedDays || 0) > 0 && <span className="font-semibold">{p.blockedDays}d com o cliente</span>}
                                                {exec && (
                                                    <span className={`flex items-center gap-1 font-semibold ${exec.running ? 'text-amber-600 dark:text-amber-400' : 'text-violet-600 dark:text-violet-400'}`}>
                                                        <Timer size={10} /> {exec.days}d úteis {exec.running ? '(correndo)' : 'de execução'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {!readOnly && (
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {canTransitionTo(p.status, 'COMPLETE') && (
                                                    <ActionBtn title="Concluir execução (fecha o tempo de execução)" tone="text-violet-600" onClick={() => askMove(p, 'COMPLETE')}><CheckCircle2 size={15} /></ActionBtn>
                                                )}
                                                {canTransitionTo(p.status, 'SEND') && (
                                                    <ActionBtn title="Registrar envio ao cliente" tone="text-blue-600" onClick={() => askMove(p, 'SEND')}><Send size={15} /></ActionBtn>
                                                )}
                                                {canTransitionTo(p.status, 'APPROVE') && (
                                                    <ActionBtn title="Aprovar" tone="text-emerald-600" onClick={() => askMove(p, 'APPROVE')}><BadgeCheck size={15} /></ActionBtn>
                                                )}
                                                {canTransitionTo(p.status, 'REJECT') && (
                                                    <ActionBtn title="Reprovar" tone="text-rose-600" onClick={() => askMove(p, 'REJECT')}><ThumbsDown size={15} /></ActionBtn>
                                                )}
                                                {p.status !== Status.REVISED && p.status !== Status.SUPERSEDED && (
                                                    <ActionBtn title="Nova revisão (encerra este arquivo como Revisado e abre a R+1)" tone="text-amber-600" onClick={() => askRevision(p)}><RotateCcw size={15} /></ActionBtn>
                                                )}
                                                {(p.phase || ProjectPhase.EXECUTIVE) === ProjectPhase.PRELIMINARY && p.status !== Status.REVISED && p.status !== Status.SUPERSEDED && (
                                                    <ActionBtn title="Gerar versão Executiva (mantém o histórico do Preliminar)" tone="text-cyan-600" onClick={() => onPromote(p.id)}><ArrowUpRight size={15} /></ActionBtn>
                                                )}
                                                <ActionBtn title="Editar dados e linha do tempo" onClick={() => setEditing(p)}><PencilLine size={15} /></ActionBtn>
                                                <ActionBtn title="Excluir (vai para a Lixeira)" tone="text-rose-600" onClick={() => handleDelete(p)}><Trash2 size={15} /></ActionBtn>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}

            {/* Aviso de SLA da obra, quando cadastrado */}
            {obraDoc?.contractDate && obraDoc.deadlineDays !== undefined && (
                <p className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                    <AlertTriangle size={12} className="text-amber-500" />
                    Prazo contratual da obra: {formatDateDisplay(format(calculateDeadlineDate(obraDoc.contractDate, obraDoc.deadlineDays) || new Date(), 'yyyy-MM-dd'))} — projetos além dessa data são marcados como Atrasados.
                </p>
            )}

            {/* --- Modais --- */}
            {dateAction && <DateActionModal request={dateAction} onClose={() => setDateAction(null)} />}

            {historicoDe && (
                <RevisionHistoryModal
                    title={`Histórico de revisões — ${historicoDe.filename}`}
                    revisions={historicoDe.revisions || []}
                    readOnly={readOnly}
                    onSave={(revs) => { onUpdate({ ...historicoDe, revisions: revs }); setHistoricoDe(null); }}
                    onClose={() => setHistoricoDe(null)}
                />
            )}

            {(editing || creating) && (
                <ProjetoModal
                    projeto={editing}
                    obraAtiva={obraAtiva}
                    obraDoc={obraDoc}
                    holidays={holidays}
                    onClose={() => { setEditing(null); setCreating(false); }}
                    onSave={async (data) => {
                        if (editing) {
                            onUpdate({ ...editing, ...data });
                        } else {
                            await onAdd({
                                ...data,
                                client: obraAtiva,
                                groupId: crypto.randomUUID(),
                                revision: 0,
                                revisions: [],
                                blockedDays: data.blockedDays || 0,
                            } as Omit<ProjectFile, 'id'>);
                        }
                        setEditing(null); setCreating(false);
                    }}
                />
            )}
        </div>
    );
}

function ActionBtn({ title, tone, onClick, children }: { title: string; tone?: string; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`p-1.5 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 ${tone || 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
        >
            {children}
        </button>
    );
}

// --- Modal de cadastro/edição (mesmo padrão do modal de Referência) ---

function ProjetoModal({ projeto, obraAtiva, obraDoc, holidays, onClose, onSave }: {
    projeto: ProjectFile | null;
    obraAtiva: string;
    obraDoc: ClientDoc | undefined;
    holidays: string[];
    onClose: () => void;
    onSave: (data: Partial<ProjectFile>) => void | Promise<void>;
}) {
    const [filename, setFilename] = useState(projeto?.filename || '');
    const [discipline, setDiscipline] = useState<Discipline>(projeto?.discipline || Discipline.ARCHITECTURE);
    const [phase, setPhase] = useState<ProjectPhase>(projeto?.phase || ProjectPhase.EXECUTIVE);
    const [base, setBase] = useState(projeto?.base || 'Geral');
    const [revisao, setRevisao] = useState(projeto?.revision ?? 0);
    const today = new Date().toISOString().split('T')[0];
    const autoPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';
    const [dates, setDates] = useState<TimelineDates>({
        startDate: projeto?.startDate || today, startPeriod: projeto?.startPeriod || autoPeriod,
        endDate: projeto?.endDate || '', endPeriod: projeto?.endPeriod || 'TARDE',
        sendDate: projeto?.sendDate || '', sendPeriod: projeto?.sendPeriod || 'MANHA',
        feedbackDate: projeto?.feedbackDate || '', feedbackPeriod: projeto?.feedbackPeriod || 'TARDE',
    });
    const [saving, setSaving] = useState(false);

    const showBase = !obraDoc || obraDoc.type === SiteType.OPERATIONAL_BASE;

    const save = async () => {
        if (!filename.trim()) { alert('Informe o nome do projeto/arquivo.'); return; }
        if (dates.startDate && dates.endDate && dates.endDate < dates.startDate) { alert('A conclusão não pode ser anterior ao início.'); return; }
        if (dates.sendDate && dates.feedbackDate && dates.feedbackDate < dates.sendDate) { alert('O feedback não pode ser anterior ao envio.'); return; }

        // Dias com o cliente recalculados a partir de envio+feedback; o status
        // segue a linha do tempo (mesma máquina de estados de sempre)
        let blockedDays = projeto?.blockedDays || 0;
        if (dates.sendDate && dates.feedbackDate) {
            const send = parseISO(dates.sendDate);
            const fb = parseISO(dates.feedbackDate);
            if (isValid(send) && isValid(fb) && fb >= send) {
                blockedDays = calculateBusinessDaysWithHolidays(send, fb, holidays, dates.sendPeriod || 'MANHA', dates.feedbackPeriod || 'TARDE');
            }
        }
        const draft: Partial<ProjectFile> = {
            filename: filename.trim(),
            discipline,
            phase,
            base: base.trim() || 'Geral',
            revision: revisao,
            startDate: dates.startDate || '', ...(dates.startDate ? { startPeriod: dates.startPeriod } : {}),
            endDate: dates.endDate || '', ...(dates.endDate ? { endPeriod: dates.endPeriod } : {}),
            sendDate: dates.sendDate || '', ...(dates.sendDate ? { sendPeriod: dates.sendPeriod } : {}),
            feedbackDate: dates.feedbackDate || '', ...(dates.feedbackDate ? { feedbackPeriod: dates.feedbackPeriod } : {}),
            blockedDays,
        };
        draft.status = inferStatusFromDates({ ...(projeto || {}), ...draft } as ProjectFile);
        setSaving(true);
        try { await onSave(draft); } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                        {projeto ? 'Editar Projeto' : `Novo Projeto — ${obraAtiva}`}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={20} /></button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Nome do Projeto / Arquivo *</label>
                        <input value={filename} onChange={e => setFilename(e.target.value)} placeholder="Ex: PLANTA BAIXA ELETRICA" autoFocus={!projeto}
                            className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Disciplina</label>
                        <select value={discipline} onChange={e => setDiscipline(e.target.value as Discipline)}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5">
                            {Object.values(Discipline).map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Fase</label>
                            <select value={phase} onChange={e => setPhase(e.target.value as ProjectPhase)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5">
                                <option value={ProjectPhase.PRELIMINARY}>Preliminar</option>
                                <option value={ProjectPhase.EXECUTIVE}>Executivo</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Revisão</label>
                            <input type="number" min={0} value={revisao} onChange={e => setRevisao(Math.max(0, parseInt(e.target.value || '0', 10)))}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5" />
                        </div>
                    </div>
                    {showBase && (
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Base / Setor</label>
                            <input value={base} onChange={e => setBase(e.target.value)} placeholder="Ex: Base 01, Centro (padrão: Geral)"
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5" />
                        </div>
                    )}
                </div>

                <div className="mb-6">
                    <TimelineDatesEditor
                        fields={REF_TIMELINE_FIELDS}
                        value={dates}
                        onChange={patch => setDates(prev => ({ ...prev, ...patch }))}
                        note="O status segue a linha do tempo: preencher datas avança o fluxo, apagar retroage (Aprovado/Reprovado são preservados quando há feedback). Os dias úteis com o cliente recalculam a partir de envio e feedback."
                    />
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium">Cancelar</button>
                    <button onClick={save} disabled={saving}
                        className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-semibold shadow-sm">
                        {saving ? 'Salvando...' : projeto ? 'Salvar Alterações' : 'Cadastrar Projeto'}
                    </button>
                </div>
            </div>
        </div>
    );
}
