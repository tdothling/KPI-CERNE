import React, { useMemo, useState } from 'react';
import { BookOpen, Plus, Send, BadgeCheck, ThumbsDown, FileEdit, Trash2, Layers, X, ChevronDown, ChevronRight, MapPin, GripVertical, PencilLine, Play, CheckCircle2, Hammer, Timer } from 'lucide-react';
import { parseISO, isValid } from 'date-fns';
import { ClientDoc, Discipline, Period } from '../../types';
import { Referencia, Conjunto, RefStatus, GabaritoItem, canRefTransition, catalogoKpis, buildCodigoCompleto } from '../../domain/portfolio';
import { KpiCard, StatusBadge, REF_STATUS_STYLE, DateActionModal, DateActionRequest } from './shared';
import { formatDateDisplay, calculateBusinessDaysWithHolidays } from '../../utils';

interface CatalogoPageProps {
    referencias: Referencia[];
    conjuntos: Conjunto[];
    clients: ClientDoc[];       // apenas obras de rodovia
    holidays: string[];
    readOnly: boolean;
    onAdd: (ref: Omit<Referencia, 'id'>) => void;
    onUpdate: (id: string, changes: Partial<Referencia>) => void;
    onDelete: (id: string) => void;
    onMove: (ref: Referencia, to: RefStatus, date: string, period: Period) => void;
    onInstanciar: (ref: Referencia, base: string, codigoRodovia?: string) => Promise<boolean>;
}

// Tempo de execução do preliminar em dias úteis: início → conclusão da elaboração;
// se ainda está em elaboração, mede até hoje (contador "correndo").
const execDaysOf = (ref: Referencia, holidays: string[]): { days: number; running: boolean } | null => {
    if (!ref.startDate) return null;
    const start = parseISO(ref.startDate);
    if (!isValid(start)) return null;
    if (ref.endDate) {
        const end = parseISO(ref.endDate);
        if (!isValid(end) || end < start) return null;
        return { days: calculateBusinessDaysWithHolidays(start, end, holidays, ref.startPeriod || 'MANHA', ref.endPeriod || 'TARDE'), running: false };
    }
    if (ref.statusAprovacao !== RefStatus.EM_ELABORACAO) return null;
    const today = new Date();
    if (today < start) return null;
    return { days: calculateBusinessDaysWithHolidays(start, today, holidays, ref.startPeriod || 'MANHA', 'TARDE'), running: true };
};

type RefFilter = 'ALL' | RefStatus;

export const CatalogoPage: React.FC<CatalogoPageProps> = ({
    referencias, conjuntos, clients, holidays, readOnly,
    onAdd, onUpdate, onDelete, onMove, onInstanciar,
}) => {
    const [statusFilter, setStatusFilter] = useState<RefFilter>('ALL');
    const [editing, setEditing] = useState<Referencia | 'NEW' | null>(null);
    const [instanciando, setInstanciando] = useState<Referencia | null>(null);
    const [dateAction, setDateAction] = useState<DateActionRequest | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const kpis = useMemo(() => catalogoKpis(referencias), [referencias]);

    const conjuntosByRef = useMemo(() => {
        const map = new Map<string, Conjunto[]>();
        conjuntos.forEach(c => {
            if (!map.has(c.referenciaId)) map.set(c.referenciaId, []);
            map.get(c.referenciaId)!.push(c);
        });
        return map;
    }, [conjuntos]);

    const grouped = useMemo(() => {
        const filtered = referencias.filter(r => statusFilter === 'ALL' || r.statusAprovacao === statusFilter);
        const byDiscipline = new Map<Discipline, Referencia[]>();
        filtered.forEach(r => {
            if (!byDiscipline.has(r.discipline)) byDiscipline.set(r.discipline, []);
            byDiscipline.get(r.discipline)!.push(r);
        });
        byDiscipline.forEach(list => list.sort((a, b) => a.codigoCliente.localeCompare(b.codigoCliente)));
        return [...byDiscipline.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [referencias, statusFilter]);

    const toggleCollapsed = (d: string) => setCollapsed(prev => {
        const next = new Set(prev);
        next.has(d) ? next.delete(d) : next.add(d);
        return next;
    });

    const askMove = (ref: Referencia, to: RefStatus) => {
        const cfg: Record<string, { title: string; confirmLabel: string; tone: DateActionRequest['tone'] }> = {
            [RefStatus.EM_ELABORACAO]: { title: `Iniciar elaboração de "${ref.codigoCliente}"`, confirmLabel: 'Iniciar Elaboração', tone: 'brand' },
            [RefStatus.ELABORADO]: { title: `Concluir elaboração de "${ref.codigoCliente}"`, confirmLabel: 'Concluir', tone: 'violet' },
            [RefStatus.ENVIADO]: { title: `Enviar "${ref.codigoCliente}" ao cliente`, confirmLabel: 'Registrar Envio', tone: 'blue' },
            [RefStatus.APROVADO]: { title: `Aprovar "${ref.codigoCliente}"`, confirmLabel: 'Aprovar', tone: 'emerald' },
            [RefStatus.REPROVADO]: { title: `Reprovar "${ref.codigoCliente}"`, confirmLabel: 'Reprovar', tone: 'rose' },
        };
        const c = cfg[to];
        const descriptions: Partial<Record<RefStatus, string>> = {
            [RefStatus.EM_ELABORACAO]: ref.statusAprovacao === RefStatus.REPROVADO
                ? 'Retrabalho após reprovação: a revisão do molde será incrementada e o tempo de execução recomeça a contar.'
                : 'A partir desta data o tempo de execução do preliminar passa a ser medido.',
            [RefStatus.ELABORADO]: 'Fecha a medição do tempo de execução (dias úteis entre início e conclusão).',
        };
        setDateAction({
            ...c,
            description: descriptions[to],
            onConfirm: (date, period) => onMove(ref, to, date, period),
        });
    };

    return (
        <div className="space-y-4">
            {/* KPIs nível Referência: elaboração + validação dos TIPOS (nunca mistura com pranchas) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                <KpiCard color="slate" icon={<BookOpen size={16} />} label="Todos os Tipos" value={kpis.total} active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
                <KpiCard color="slate" icon={<FileEdit size={16} />} label="Rascunho" value={kpis.rascunho} active={statusFilter === RefStatus.RASCUNHO} onClick={() => setStatusFilter(f => f === RefStatus.RASCUNHO ? 'ALL' : RefStatus.RASCUNHO)} />
                <KpiCard color="amber" icon={<Hammer size={16} />} label="Em Elaboração" value={kpis.emElaboracao} active={statusFilter === RefStatus.EM_ELABORACAO} onClick={() => setStatusFilter(f => f === RefStatus.EM_ELABORACAO ? 'ALL' : RefStatus.EM_ELABORACAO)} />
                <KpiCard color="violet" icon={<CheckCircle2 size={16} />} label="Elaborados" value={kpis.elaborado} active={statusFilter === RefStatus.ELABORADO} onClick={() => setStatusFilter(f => f === RefStatus.ELABORADO ? 'ALL' : RefStatus.ELABORADO)} />
                <KpiCard color="blue" icon={<Send size={16} />} label="Com o Cliente" value={kpis.enviado} active={statusFilter === RefStatus.ENVIADO} onClick={() => setStatusFilter(f => f === RefStatus.ENVIADO ? 'ALL' : RefStatus.ENVIADO)} />
                <KpiCard color="emerald" icon={<BadgeCheck size={16} />} label="Tipos Aprovados" value={kpis.aprovado} active={statusFilter === RefStatus.APROVADO} onClick={() => setStatusFilter(f => f === RefStatus.APROVADO ? 'ALL' : RefStatus.APROVADO)} />
                <KpiCard color="rose" icon={<ThumbsDown size={16} />} label="Reprovados" value={kpis.reprovado} active={statusFilter === RefStatus.REPROVADO} onClick={() => setStatusFilter(f => f === RefStatus.REPROVADO ? 'ALL' : RefStatus.REPROVADO)} />
            </div>

            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                    Moldes por tipo de obra. Uma referência nunca é consumida: instancie-a em quantas bases (KM) precisar.
                </p>
                {!readOnly && (
                    <button
                        onClick={() => setEditing('NEW')}
                        className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all"
                    >
                        <Plus size={14} /> Nova Referência
                    </button>
                )}
            </div>

            {referencias.length === 0 && (
                <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
                    <BookOpen className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Nenhuma referência no catálogo</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cadastre o projeto básico de cada TIPO de obra (ex.: BSO, PSP) com seu gabarito de pranchas.</p>
                </div>
            )}

            {grouped.map(([discipline, refs]) => (
                <div key={discipline} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                        onClick={() => toggleCollapsed(discipline)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/60 dark:bg-slate-900/30 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors"
                    >
                        <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                            {collapsed.has(discipline) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                            <Layers size={15} className="text-brand-600 dark:text-brand-400" />
                            {discipline}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{refs.length} tipo(s)</span>
                    </button>

                    {!collapsed.has(discipline) && (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                            {refs.map(ref => {
                                const bases = conjuntosByRef.get(ref.id) || [];
                                const exec = execDaysOf(ref, holidays);
                                return (
                                    <div key={ref.id} className="px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{ref.codigoCliente}</span>
                                                <span className="text-[10px] font-bold text-slate-400 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5">R{String(ref.revisao ?? 0).padStart(2, '0')}</span>
                                                <StatusBadge label={ref.statusAprovacao} className={REF_STATUS_STYLE[ref.statusAprovacao]} />
                                                {ref.importada && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400" title="Criada pela migração a partir de executivos sem preliminar">importada</span>}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                                                <span>{ref.client}</span>
                                                <span className="flex items-center gap-1"><GripVertical size={11} /> {ref.gabarito.length} entregável(is) no gabarito</span>
                                                <span className="flex items-center gap-1"><MapPin size={11} /> {bases.length} base(s) instanciada(s)</span>
                                                {ref.startDate && <span>Início: {formatDateDisplay(ref.startDate)}</span>}
                                                {ref.endDate && <span>Conclusão: {formatDateDisplay(ref.endDate)}</span>}
                                                {ref.sendDate && <span>Envio: {formatDateDisplay(ref.sendDate)}</span>}
                                                {ref.feedbackDate && <span>Feedback: {formatDateDisplay(ref.feedbackDate)}</span>}
                                                {exec && (
                                                    <span className={`flex items-center gap-1 font-semibold ${exec.running ? 'text-amber-600 dark:text-amber-400' : 'text-violet-600 dark:text-violet-400'}`}>
                                                        <Timer size={11} /> {exec.running ? `Em elaboração há ${exec.days}d úteis` : `Execução: ${exec.days}d úteis`}
                                                    </span>
                                                )}
                                                {(ref.blockedDays || 0) > 0 && <span className="text-amber-600 dark:text-amber-400">{ref.blockedDays}d com o cliente</span>}
                                            </div>
                                        </div>

                                        {!readOnly && (
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {/* Instanciar NÃO exige aprovação: o processo pode seguir sem ela */}
                                                <button
                                                    onClick={() => setInstanciando(ref)}
                                                    className="flex items-center gap-1.5 bg-brand-700 hover:bg-brand-800 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold shadow-sm"
                                                    title="Criar um Conjunto em uma base (KM), pré-gerando as pranchas do gabarito"
                                                >
                                                    <MapPin size={12} /> Instanciar em Base
                                                </button>
                                                {canRefTransition(ref.statusAprovacao, RefStatus.EM_ELABORACAO) && (
                                                    <ActionBtn title={ref.statusAprovacao === RefStatus.REPROVADO ? 'Retrabalhar (nova revisão do molde)' : 'Iniciar elaboração (começa a medir o tempo de execução)'} tone="text-amber-600" onClick={() => askMove(ref, RefStatus.EM_ELABORACAO)}><Play size={13} /></ActionBtn>
                                                )}
                                                {canRefTransition(ref.statusAprovacao, RefStatus.ELABORADO) && (
                                                    <ActionBtn title="Concluir elaboração (fecha o tempo de execução)" tone="text-violet-600" onClick={() => askMove(ref, RefStatus.ELABORADO)}><CheckCircle2 size={13} /></ActionBtn>
                                                )}
                                                {canRefTransition(ref.statusAprovacao, RefStatus.ENVIADO) && (
                                                    <ActionBtn title="Registrar envio ao cliente" onClick={() => askMove(ref, RefStatus.ENVIADO)}><Send size={13} /></ActionBtn>
                                                )}
                                                {canRefTransition(ref.statusAprovacao, RefStatus.APROVADO) && (
                                                    <ActionBtn title="Aprovar" tone="text-emerald-600" onClick={() => askMove(ref, RefStatus.APROVADO)}><BadgeCheck size={13} /></ActionBtn>
                                                )}
                                                {canRefTransition(ref.statusAprovacao, RefStatus.REPROVADO) && (
                                                    <ActionBtn title="Reprovar" tone="text-rose-600" onClick={() => askMove(ref, RefStatus.REPROVADO)}><ThumbsDown size={13} /></ActionBtn>
                                                )}
                                                <ActionBtn title="Editar referência e gabarito" onClick={() => setEditing(ref)}><PencilLine size={13} /></ActionBtn>
                                                <ActionBtn title="Excluir" tone="text-rose-600" onClick={() => onDelete(ref.id)}><Trash2 size={13} /></ActionBtn>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}

            {editing && (
                <ReferenciaModal
                    referencia={editing === 'NEW' ? null : editing}
                    clients={clients}
                    onClose={() => setEditing(null)}
                    onSave={(data) => {
                        if (editing === 'NEW') onAdd(data);
                        else onUpdate(editing.id, data);
                        setEditing(null);
                    }}
                />
            )}

            {instanciando && (
                <InstanciarModal
                    referencia={instanciando}
                    existingBases={(conjuntosByRef.get(instanciando.id) || []).map(c => c.base)}
                    onClose={() => setInstanciando(null)}
                    onConfirm={async (base, codigo) => {
                        const ok = await onInstanciar(instanciando, base, codigo);
                        if (ok) setInstanciando(null);
                    }}
                />
            )}

            {dateAction && <DateActionModal request={dateAction} onClose={() => setDateAction(null)} />}
        </div>
    );
};

function ActionBtn({ children, title, onClick, tone }: { children: React.ReactNode; title: string; onClick: () => void; tone?: string }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-brand-300 transition-colors ${tone || 'text-slate-500 dark:text-slate-400'}`}
        >
            {children}
        </button>
    );
}

// --- Modal de cadastro/edição da Referência (molde + gabarito) ---

function ReferenciaModal({ referencia, clients, onClose, onSave }: {
    referencia: Referencia | null;
    clients: ClientDoc[];
    onClose: () => void;
    onSave: (data: Omit<Referencia, 'id'>) => void;
}) {
    const [codigoCliente, setCodigoCliente] = useState(referencia?.codigoCliente || '');
    const [client, setClient] = useState(referencia?.client || clients[0]?.name || '');
    const [discipline, setDiscipline] = useState<Discipline>(referencia?.discipline || Discipline.ARCHITECTURE);
    const [revisao, setRevisao] = useState(referencia?.revisao ?? 0);
    const [observacao, setObservacao] = useState(referencia?.observacao || '');
    const [gabarito, setGabarito] = useState<GabaritoItem[]>(
        referencia?.gabarito?.length ? referencia.gabarito : [{ id: crypto.randomUUID(), papel: 'Folha 101', sufixoCodigo: '' }]
    );

    const setItem = (id: string, changes: Partial<GabaritoItem>) =>
        setGabarito(prev => prev.map(g => g.id === id ? { ...g, ...changes } : g));

    const save = () => {
        if (!codigoCliente.trim()) { alert('Informe a codificação do cliente (ex.: BSO-CONSTRUCAP-ARQ-R00).'); return; }
        if (!client.trim()) { alert('Selecione a obra.'); return; }
        const cleanGabarito = gabarito
            .map(g => ({ ...g, papel: g.papel.trim(), sufixoCodigo: g.sufixoCodigo?.trim() || undefined }))
            .filter(g => g.papel.length > 0);
        if (cleanGabarito.length === 0) { alert('O gabarito precisa de ao menos 1 entregável (ex.: Folha 101).'); return; }

        onSave({
            codigoCliente: codigoCliente.trim(),
            client: client.trim(),
            discipline,
            revisao,
            statusAprovacao: referencia?.statusAprovacao || RefStatus.RASCUNHO,
            gabarito: cleanGabarito,
            ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
            ...(referencia?.startDate ? { startDate: referencia.startDate } : {}),
            ...(referencia?.importada ? { importada: true } : {}),
        } as Omit<Referencia, 'id'>);
    };

    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                        {referencia ? 'Editar Referência' : 'Nova Referência (Molde)'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={20} /></button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Codificação do Cliente *</label>
                        <input value={codigoCliente} onChange={e => setCodigoCliente(e.target.value)} placeholder="Ex: BSO-CONSTRUCAP-ARQ-R00"
                            className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Obra (Rodovia) *</label>
                        <select value={client} onChange={e => setClient(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5">
                            {clients.length === 0 && <option value="">Nenhuma obra de rodovia cadastrada</option>}
                            {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Disciplina</label>
                            <select value={discipline} onChange={e => setDiscipline(e.target.value as Discipline)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5">
                                {Object.values(Discipline).map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Revisão</label>
                            <input type="number" min={0} value={revisao} onChange={e => setRevisao(Math.max(0, parseInt(e.target.value || '0', 10)))}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5" />
                        </div>
                    </div>
                </div>

                {/* Gabarito: as saídas que serão PRÉ-GERADAS a cada instanciação */}
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Gabarito de Entregáveis *</label>
                        <button onClick={() => setGabarito(prev => [...prev, { id: crypto.randomUUID(), papel: '', sufixoCodigo: '' }])}
                            className="flex items-center gap-1 text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline">
                            <Plus size={12} /> Adicionar entregável
                        </button>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                        Ao instanciar em uma base, cada linha vira 1 prancha. O sufixo é opcional e apenas pré-preenche o código
                        (a codificação final é manual — varia por órgão regulamentador).
                    </p>
                    <div className="space-y-1.5">
                        {gabarito.map((g, i) => (
                            <div key={g.id} className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 w-5 text-right">{i + 1}.</span>
                                <input value={g.papel} onChange={e => setItem(g.id, { papel: e.target.value })} placeholder="Papel (ex: Folha 101, Memorial Descritivo)"
                                    className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2" />
                                <input value={g.sufixoCodigo || ''} onChange={e => setItem(g.id, { sufixoCodigo: e.target.value })} placeholder="Sufixo (ex: DE-P1-101)"
                                    className="w-40 font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-xs rounded-lg p-2" />
                                <button onClick={() => setGabarito(prev => prev.filter(x => x.id !== g.id))} disabled={gabarito.length <= 1}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30" title="Remover">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Observações</label>
                    <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
                        className="w-full h-16 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 resize-none" />
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium">Cancelar</button>
                    <button onClick={save} className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-sm">
                        {referencia ? 'Salvar Alterações' : 'Cadastrar no Catálogo'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Modal de instanciação: escolhe a BASE (KM) e pré-visualiza as pranchas ---

function InstanciarModal({ referencia, existingBases, onClose, onConfirm }: {
    referencia: Referencia;
    existingBases: string[];
    onClose: () => void;
    onConfirm: (base: string, codigoRodovia?: string) => void | Promise<void>;
}) {
    const [base, setBase] = useState('');
    const [codigoRodovia, setCodigoRodovia] = useState('');
    const [saving, setSaving] = useState(false);

    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Instanciar em Base</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={20} /></button>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{referencia.codigoCliente}</span> será replicada
                    na base escolhida, pré-gerando <strong>{referencia.gabarito.length} prancha(s)</strong> do gabarito.
                    A referência continua no catálogo para outras bases.
                </p>

                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Base (KM) *</label>
                <input value={base} onChange={e => setBase(e.target.value)} placeholder="Ex: 104+000" autoFocus
                    className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-1" />
                {existingBases.length > 0 && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">Bases já instanciadas (não podem repetir): {existingBases.join(', ')}</p>
                )}

                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 mt-3">Prefixo da Codificação da Rodovia (manual, opcional)</label>
                <input value={codigoRodovia} onChange={e => setCodigoRodovia(e.target.value)} placeholder="Ex: ELO-040RJ-104+000-BSO-EXE"
                    className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-1" />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
                    A codificação varia por órgão regulamentador, então é digitada à mão. O prefixo + sufixo do gabarito apenas
                    pré-preenchem o código de cada prancha — tudo editável depois, na Carteira.
                </p>

                {/* Pré-visualização das pranchas que serão criadas */}
                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 mb-5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Pranchas que serão pré-geradas (status "A Fazer")</p>
                    <ul className="space-y-1">
                        {referencia.gabarito.map(g => (
                            <li key={g.id} className="flex items-center justify-between text-xs">
                                <span className="text-slate-600 dark:text-slate-300">{g.papel}</span>
                                <span className="font-mono text-slate-400 dark:text-slate-500">{buildCodigoCompleto(codigoRodovia, g) || '(código manual depois)'}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium">Cancelar</button>
                    <button
                        onClick={async () => { setSaving(true); try { await onConfirm(base, codigoRodovia || undefined); } finally { setSaving(false); } }}
                        disabled={!base.trim() || saving}
                        className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-semibold shadow-sm"
                    >
                        {saving ? 'Instanciando...' : `Criar Conjunto (${referencia.gabarito.length} pranchas)`}
                    </button>
                </div>
            </div>
        </div>
    );
}
