import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Plus, Send, BadgeCheck, ThumbsDown, FileEdit, Trash2, Layers, X, ChevronDown, ChevronRight, MapPin, GripVertical, PencilLine, Play, CheckCircle2, Hammer, Timer, CopyPlus, CheckSquare, Square, Loader2, Wand2, FastForward } from 'lucide-react';
import { useObraAtiva, ObraSelectScreen, ObraAtivaBar, ObraCardStat } from '../ObraGate';
import { ClientDoc, Discipline, Period, RevisionReason } from '../../types';
import { Referencia, Conjunto, RefStatus, GabaritoItem, canRefTransition, catalogoKpis, buildCodigoCompleto, inferRefStatusFromDates, planInstanciacaoLote, slugify, DISCIPLINA_SIGLA, gerarReferenciasDisciplinas, planGerarDisciplinasLote, swapDisciplinaSigla, papelFolha, nextFolhaNumber, renomearPapeisAuto } from '../../domain/portfolio';
import { KpiCard, StatusBadge, REF_STATUS_STYLE, DateActionModal, DateActionRequest, TimelineDatesEditor, TimelineDates, REF_TIMELINE_FIELDS, RevisionHistoryModal, execDaysOf } from './shared';
import { formatDateDisplay } from '../../utils';

interface CatalogoPageProps {
    referencias: Referencia[];
    conjuntos: Conjunto[];
    clients: ClientDoc[];       // apenas obras de rodovia
    holidays: string[];
    readOnly: boolean;
    onAdd: (ref: Omit<Referencia, 'id'>) => void;
    onUpdate: (id: string, changes: Partial<Referencia>) => void;
    onDelete: (id: string) => void;
    onMove: (ref: Referencia, to: RefStatus, date: string, period: Period, options?: { reason?: RevisionReason; comment?: string }) => void;
    onInstanciar: (ref: Referencia, base: string, codigoRodovia?: string) => Promise<boolean>;
    onInstanciarLote: (
        refs: Referencia[],
        bases: string[],
        onProgress?: (done: number, total: number) => void,
        codigoPorBase?: Record<string, string>
    ) => Promise<{ criados: number; puladas: number; semGabarito: string[]; erros: string[] } | null>;
    onAddMany: (refs: Omit<Referencia, 'id'>[], onProgress?: (done: number, total: number) => void) => Promise<{ criadas: number; erros: string[] }>;
    onDeleteMany: (ids: string[]) => Promise<{ excluidas: number; erros: string[] }>;
}

type RefFilter = 'ALL' | RefStatus;

export const CatalogoPage: React.FC<CatalogoPageProps> = ({
    referencias, conjuntos, clients, holidays, readOnly,
    onAdd, onUpdate, onDelete, onMove, onInstanciar, onInstanciarLote, onAddMany, onDeleteMany,
}) => {
    const [statusFilter, setStatusFilter] = useState<RefFilter>('ALL');
    const [editing, setEditing] = useState<Referencia | 'NEW' | null>(null);
    const [instanciando, setInstanciando] = useState<Referencia | null>(null);
    const [loteAberto, setLoteAberto] = useState(false);
    const [gerarLoteAberto, setGerarLoteAberto] = useState(false);
    // Origem da geração de disciplinas (a ref de ARQ; sem id quando recém-cadastrada)
    const [gerandoDe, setGerandoDe] = useState<Pick<Referencia, 'codigoCliente' | 'client' | 'discipline' | 'gabarito' | 'observacao'> | null>(null);

    // Navegação por obra (gate compartilhado com a Carteira — mesma obra ativa)
    const obraNames = useMemo(() => clients.map(c => c.name), [clients]);
    const { obraAtiva, selecionarObra: selecionarObraRaw, trocarObra: trocarObraRaw } =
        useObraAtiva('kpicerne.rodovia.obraAtiva', obraNames, ['kpicerne.catalogo.obraAtiva']);
    const selecionarObra = (name: string) => { selecionarObraRaw(name); setStatusFilter('ALL'); };
    const trocarObra = () => { trocarObraRaw(); setStatusFilter('ALL'); };

    // TODA a página (KPIs, lista, lotes, exclusão de disciplina) enxerga só a obra ativa
    const refsDaObra = useMemo(() => referencias.filter(r => r.client === obraAtiva), [referencias, obraAtiva]);

    const temArquitetura = useMemo(() => refsDaObra.some(r => r.discipline === Discipline.ARCHITECTURE), [refsDaObra]);
    const [dateAction, setDateAction] = useState<DateActionRequest | null>(null);
    const [historicoDe, setHistoricoDe] = useState<Referencia | null>(null);
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const kpis = useMemo(() => catalogoKpis(refsDaObra), [refsDaObra]);

    const conjuntosByRef = useMemo(() => {
        const map = new Map<string, Conjunto[]>();
        conjuntos.forEach(c => {
            if (!map.has(c.referenciaId)) map.set(c.referenciaId, []);
            map.get(c.referenciaId)!.push(c);
        });
        return map;
    }, [conjuntos]);

    const grouped = useMemo(() => {
        const filtered = refsDaObra.filter(r => statusFilter === 'ALL' || r.statusAprovacao === statusFilter);
        const byDiscipline = new Map<Discipline, Referencia[]>();
        filtered.forEach(r => {
            if (!byDiscipline.has(r.discipline)) byDiscipline.set(r.discipline, []);
            byDiscipline.get(r.discipline)!.push(r);
        });
        byDiscipline.forEach(list => list.sort((a, b) => a.codigoCliente.localeCompare(b.codigoCliente)));
        return [...byDiscipline.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    }, [refsDaObra, statusFilter]);

    const toggleCollapsed = (d: string) => setCollapsed(prev => {
        const next = new Set(prev);
        next.has(d) ? next.delete(d) : next.add(d);
        return next;
    });

    // Exclui TODAS as referências de uma disciplina DA OBRA ATIVA (nunca de outras
    // obras). Dupla proteção: referências com conjuntos instanciados são bloqueadas
    // (aqui e de novo no banco) e a confirmação exige DIGITAR o nome da disciplina.
    const excluirDisciplina = async (discipline: Discipline) => {
        const daDisciplina = refsDaObra.filter(r => r.discipline === discipline);
        if (daDisciplina.length === 0) return;
        const comConjuntos = daDisciplina.filter(r => (conjuntosByRef.get(r.id) || []).length > 0);
        const excluiveis = daDisciplina.filter(r => (conjuntosByRef.get(r.id) || []).length === 0);

        if (excluiveis.length === 0) {
            alert(`Todas as ${daDisciplina.length} referência(s) de ${discipline} possuem conjuntos instanciados em Projetos Locais. Exclua os conjuntos antes.`);
            return;
        }

        const aviso = comConjuntos.length > 0
            ? `\n\nATENÇÃO: ${comConjuntos.length} referência(s) com conjuntos instanciados NÃO serão excluídas:\n${comConjuntos.map(r => `  • ${r.codigoCliente}`).join('\n')}`
            : '';
        const digitado = prompt(
            `Excluir ${excluiveis.length} referência(s) da disciplina ${discipline} na obra "${obraAtiva}":\n${excluiveis.map(r => `  • ${r.codigoCliente}`).join('\n')}${aviso}\n\nEsta ação NÃO pode ser desfeita. Para confirmar, digite o nome da disciplina:`
        );
        if (digitado === null) return;
        if (digitado.trim().toLowerCase() !== discipline.toLowerCase()) {
            alert('Nome da disciplina não confere — exclusão cancelada.');
            return;
        }
        const { excluidas, erros } = await onDeleteMany(excluiveis.map(r => r.id));
        alert(`${excluidas} referência(s) de ${discipline} excluída(s).${erros.length > 0 ? `\n\nFalhas:\n${erros.join('\n')}` : ''}`);
    };

    const askMove = (ref: Referencia, to: RefStatus) => {
        // Reprovado → Em Elaboração é a abertura de REVISÃO: pede motivo + comentário,
        // que entram no histórico do molde (mesma dinâmica da aba Projetos).
        const isRevisao = to === RefStatus.EM_ELABORACAO && ref.statusAprovacao === RefStatus.REPROVADO;
        const cfg: Record<string, { title: string; confirmLabel: string; tone: DateActionRequest['tone']; withReason?: boolean; withComment?: boolean }> = {
            [RefStatus.EM_ELABORACAO]: isRevisao
                ? { title: `Revisar "${ref.codigoCliente}"`, confirmLabel: 'Iniciar Revisão', tone: 'brand', withReason: true, withComment: true }
                : { title: `Iniciar elaboração de "${ref.codigoCliente}"`, confirmLabel: 'Iniciar Elaboração', tone: 'brand' },
            [RefStatus.ELABORADO]: { title: `Concluir elaboração de "${ref.codigoCliente}"`, confirmLabel: 'Concluir', tone: 'violet' },
            [RefStatus.ENVIADO]: { title: `Enviar "${ref.codigoCliente}" ao cliente`, confirmLabel: 'Registrar Envio', tone: 'blue' },
            [RefStatus.APROVADO]: { title: `Aprovar "${ref.codigoCliente}"`, confirmLabel: 'Aprovar', tone: 'emerald' },
            [RefStatus.REPROVADO]: { title: `Reprovar "${ref.codigoCliente}"`, confirmLabel: 'Reprovar', tone: 'rose' },
        };
        const c = cfg[to];
        const descriptions: Partial<Record<RefStatus, string>> = {
            [RefStatus.EM_ELABORACAO]: isRevisao
                ? `O molde reprovado volta para elaboração como R${String((ref.revisao || 0) + 1).padStart(2, '0')}. O motivo fica no histórico e as datas de conclusão/envio/feedback são reiniciadas.`
                : 'A partir desta data o tempo de execução do preliminar passa a ser medido.',
            [RefStatus.ELABORADO]: 'Fecha a medição do tempo de execução (dias úteis entre início e conclusão).',
        };
        setDateAction({
            ...c,
            description: descriptions[to],
            onConfirm: (date, period, comment, reason) => onMove(ref, to, date, period, isRevisao ? { reason, comment } : undefined),
        });
    };

    // --- Tela de seleção de obra (antes da lista do catálogo) ---
    if (!obraAtiva) {
        return (
            <ObraSelectScreen
                obras={clients}
                subtitle="O catálogo é navegado por obra. A escolha fica salva — nas próximas visitas você entra direto nela."
                emptyTitle="Nenhuma obra de rodovia cadastrada"
                emptyHint='Cadastre uma obra do tipo "Obra de Rodovia" na aba Obras para começar o catálogo.'
                onSelect={selecionarObra}
                statsOf={(name) => {
                    const k = catalogoKpis(referencias.filter(r => r.client === name));
                    const nBases = (clients.find(c => c.name === name)?.bases || []).length;
                    const stats: ObraCardStat[] = [
                        { value: k.total, label: 'projeto(s) no catálogo' },
                        { value: nBases, label: 'base(s) registrada(s)' },
                    ];
                    if (k.emElaboracao > 0) stats.push({ value: k.emElaboracao, label: 'em elaboração', tone: 'text-amber-600 dark:text-amber-400 font-semibold' });
                    if (k.enviado > 0) stats.push({ value: k.enviado, label: 'com o cliente', tone: 'text-blue-600 dark:text-blue-400 font-semibold' });
                    if (k.aprovado > 0) stats.push({ value: k.aprovado, label: 'aprovado(s)', tone: 'text-emerald-600 dark:text-emerald-400 font-semibold' });
                    if (k.reprovado > 0) stats.push({ value: k.reprovado, label: 'reprovado(s)', tone: 'text-rose-600 dark:text-rose-400 font-semibold' });
                    if (k.total === 0) stats.push({ value: '', label: 'Nenhuma referência — comece por aqui', tone: 'italic col-span-2' });
                    return stats;
                }}
            />
        );
    }

    return (
        <div className="space-y-4">
            {/* Obra ativa: todo o catálogo abaixo é SÓ desta obra */}
            <ObraAtivaBar obra={obraAtiva} canTrocar={clients.length > 1} onTrocar={trocarObra} />

            {/* KPIs nível Referência: elaboração + validação dos TIPOS (nunca mistura com pranchas) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                <KpiCard color="slate" icon={<BookOpen size={16} />} label="Todos os Tipos" value={kpis.total} active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
                <KpiCard color="slate" icon={<FileEdit size={16} />} label="Rascunho" value={kpis.rascunho} active={statusFilter === RefStatus.RASCUNHO} onClick={() => setStatusFilter(f => f === RefStatus.RASCUNHO ? 'ALL' : RefStatus.RASCUNHO)} />
                <KpiCard color="amber" icon={<Hammer size={16} />} label="Em Elaboração" value={kpis.emElaboracao} active={statusFilter === RefStatus.EM_ELABORACAO} onClick={() => setStatusFilter(f => f === RefStatus.EM_ELABORACAO ? 'ALL' : RefStatus.EM_ELABORACAO)} />
                <KpiCard color="violet" icon={<CheckCircle2 size={16} />} label="Elaborados" value={kpis.elaborado} active={statusFilter === RefStatus.ELABORADO} onClick={() => setStatusFilter(f => f === RefStatus.ELABORADO ? 'ALL' : RefStatus.ELABORADO)} />
                <KpiCard color="blue" icon={<Send size={16} />} label="Com o Cliente" value={kpis.enviado} active={statusFilter === RefStatus.ENVIADO} onClick={() => setStatusFilter(f => f === RefStatus.ENVIADO ? 'ALL' : RefStatus.ENVIADO)} />
                <KpiCard color="emerald" icon={<BadgeCheck size={16} />} label="Tipos Aprovados" value={kpis.aprovado} active={statusFilter === RefStatus.APROVADO} onClick={() => setStatusFilter(f => f === RefStatus.APROVADO ? 'ALL' : RefStatus.APROVADO)} />
                <KpiCard color="rose" icon={<ThumbsDown size={16} />} label="Reprovados" value={kpis.reprovado} active={statusFilter === RefStatus.REPROVADO} onClick={() => setStatusFilter(f => f === RefStatus.REPROVADO ? 'ALL' : RefStatus.REPROVADO)} />
                <KpiCard color="cyan" icon={<FastForward size={16} />} label="Executivo Gerado" value={kpis.executivoGerado} active={statusFilter === RefStatus.SUPERSEDED} onClick={() => setStatusFilter(f => f === RefStatus.SUPERSEDED ? 'ALL' : RefStatus.SUPERSEDED)} />
            </div>

            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                    Moldes por tipo de obra. Uma referência nunca é consumida: instancie-a em quantas bases (KM) precisar.
                </p>
                {!readOnly && (
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <button
                            onClick={() => setGerarLoteAberto(true)}
                            disabled={!temArquitetura}
                            className="flex items-center gap-2 border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-40 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all"
                            title="Gerar as disciplinas de várias Arquiteturas de uma vez"
                        >
                            <Wand2 size={14} /> Gerar Disciplinas
                        </button>
                        <button
                            onClick={() => setLoteAberto(true)}
                            disabled={refsDaObra.length === 0}
                            className="flex items-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all"
                            title="Instanciar várias referências em várias bases de uma vez"
                        >
                            <CopyPlus size={14} /> Instanciar em Lote
                        </button>
                        <button
                            onClick={() => setEditing('NEW')}
                            className="flex items-center gap-2 bg-brand-700 hover:bg-brand-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm transition-all"
                        >
                            <Plus size={14} /> Nova Referência
                        </button>
                    </div>
                )}
            </div>

            {refsDaObra.length === 0 && (
                <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-600">
                    <BookOpen className="mx-auto text-slate-300 dark:text-slate-600 mb-3" size={40} />
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Nenhuma referência no catálogo de {obraAtiva}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cadastre o projeto básico de cada TIPO de edificação (ex.: BSO, PSP) com seu gabarito de pranchas.</p>
                </div>
            )}

            {grouped.map(([discipline, refs]) => (
                <div key={discipline} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="flex items-center bg-slate-50/60 dark:bg-slate-900/30">
                        <button
                            onClick={() => toggleCollapsed(discipline)}
                            className="flex-1 flex items-center justify-between px-4 py-3 hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors"
                        >
                            <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                                {collapsed.has(discipline) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                                <Layers size={15} className="text-brand-600 dark:text-brand-400" />
                                {discipline}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{refs.length} tipo(s)</span>
                        </button>
                        {!readOnly && (
                            <button
                                onClick={() => excluirDisciplina(discipline)}
                                className="p-2 mx-2 rounded-lg text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400 transition-colors flex-shrink-0"
                                title={`Excluir TODAS as referências de ${discipline} (com confirmação)`}
                            >
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>

                    {!collapsed.has(discipline) && (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                            {refs.map(ref => {
                                const bases = conjuntosByRef.get(ref.id) || [];
                                const exec = execDaysOf(ref, ref.statusAprovacao === RefStatus.EM_ELABORACAO, holidays);
                                return (
                                    <div key={ref.id} className="px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{ref.codigoCliente}</span>
                                                {(ref.revisao ?? 0) > 0 || (ref.revisions?.length ?? 0) > 0 ? (
                                                    <button
                                                        onClick={() => setHistoricoDe(ref)}
                                                        className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded px-1.5 py-0.5 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                                                        title="Ver histórico de revisões (motivos e comentários)"
                                                        aria-label={`Ver histórico de revisões de ${ref.codigoCliente}`}
                                                    >
                                                        R{String(ref.revisao ?? 0).padStart(2, '0')}
                                                    </button>
                                                ) : (
                                                    <span className="text-[10px] font-bold text-slate-400 border border-slate-200 dark:border-slate-600 rounded px-1.5 py-0.5">R00</span>
                                                )}
                                                <StatusBadge label={ref.statusAprovacao} className={REF_STATUS_STYLE[ref.statusAprovacao]} />
                                                {ref.importada && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400" title="Criada pela migração a partir de executivos sem preliminar">importada</span>}
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
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
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {ref.discipline === Discipline.ARCHITECTURE && (
                                                    <ActionBtn title="Gerar referências das outras disciplinas a partir desta (troca a sigla no código)" tone="text-violet-600" onClick={() => setGerandoDe(ref)}><Wand2 size={15} /></ActionBtn>
                                                )}
                                                {canRefTransition(ref.statusAprovacao, RefStatus.EM_ELABORACAO) && (
                                                    <ActionBtn title={ref.statusAprovacao === RefStatus.REPROVADO ? 'Retrabalhar (nova revisão do molde)' : 'Iniciar elaboração (começa a medir o tempo de execução)'} tone="text-amber-600" onClick={() => askMove(ref, RefStatus.EM_ELABORACAO)}><Play size={15} /></ActionBtn>
                                                )}
                                                {canRefTransition(ref.statusAprovacao, RefStatus.ELABORADO) && (
                                                    <ActionBtn title="Concluir elaboração (fecha o tempo de execução)" tone="text-violet-600" onClick={() => askMove(ref, RefStatus.ELABORADO)}><CheckCircle2 size={15} /></ActionBtn>
                                                )}
                                                {canRefTransition(ref.statusAprovacao, RefStatus.ENVIADO) && (
                                                    <ActionBtn title="Registrar envio ao cliente" onClick={() => askMove(ref, RefStatus.ENVIADO)}><Send size={15} /></ActionBtn>
                                                )}
                                                {canRefTransition(ref.statusAprovacao, RefStatus.APROVADO) && (
                                                    <ActionBtn title="Aprovar" tone="text-emerald-600" onClick={() => askMove(ref, RefStatus.APROVADO)}><BadgeCheck size={15} /></ActionBtn>
                                                )}
                                                {canRefTransition(ref.statusAprovacao, RefStatus.REPROVADO) && (
                                                    <ActionBtn title="Reprovar" tone="text-rose-600" onClick={() => askMove(ref, RefStatus.REPROVADO)}><ThumbsDown size={15} /></ActionBtn>
                                                )}
                                                <ActionBtn title="Editar referência e gabarito" onClick={() => setEditing(ref)}><PencilLine size={15} /></ActionBtn>
                                                <ActionBtn title="Excluir" tone="text-rose-600" onClick={() => onDelete(ref.id)}><Trash2 size={15} /></ActionBtn>
                                                {/* Instanciar é a ÚLTIMA ação do fluxo (não exige aprovação) — fica mais à direita */}
                                                <button
                                                    onClick={() => setInstanciando(ref)}
                                                    className="flex items-center gap-1.5 bg-brand-700 hover:bg-brand-800 text-white px-3 py-2 rounded-lg text-[11px] font-bold shadow-sm"
                                                    title="Criar um Conjunto em uma base (KM), pré-gerando as pranchas do gabarito"
                                                >
                                                    <MapPin size={13} /> Instanciar em Base
                                                </button>
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
                    defaultClient={obraAtiva}
                    onClose={() => setEditing(null)}
                    onSave={(data) => {
                        if (editing === 'NEW') {
                            onAdd(data);
                            // Arquitetura cadastrada → oferece gerar as demais disciplinas na hora
                            if (data.discipline === Discipline.ARCHITECTURE) setGerandoDe(data);
                        } else {
                            onUpdate(editing.id, data);
                        }
                        setEditing(null);
                    }}
                />
            )}

            {instanciando && (
                <InstanciarModal
                    referencia={instanciando}
                    existingBases={(conjuntosByRef.get(instanciando.id) || []).map(c => c.base)}
                    basesRegistradas={clients.find(c => c.name === instanciando.client)?.bases || []}
                    onClose={() => setInstanciando(null)}
                    onConfirm={async (base, codigo) => {
                        const ok = await onInstanciar(instanciando, base, codigo);
                        if (ok) setInstanciando(null);
                    }}
                />
            )}

            {loteAberto && (
                <InstanciarLoteModal
                    referencias={refsDaObra}
                    conjuntos={conjuntos}
                    clients={clients}
                    onClose={() => setLoteAberto(false)}
                    onConfirm={onInstanciarLote}
                />
            )}

            {gerandoDe && (
                <GerarDisciplinasModal
                    origem={gerandoDe}
                    referencias={referencias}
                    onClose={() => setGerandoDe(null)}
                    onConfirm={onAddMany}
                />
            )}

            {gerarLoteAberto && (
                <GerarDisciplinasLoteModal
                    referencias={refsDaObra}
                    clients={clients}
                    onClose={() => setGerarLoteAberto(false)}
                    onConfirm={onAddMany}
                />
            )}

            {dateAction && <DateActionModal request={dateAction} onClose={() => setDateAction(null)} />}

            {historicoDe && (
                <RevisionHistoryModal
                    title={historicoDe.codigoCliente}
                    revisions={historicoDe.revisions || []}
                    readOnly={readOnly}
                    onSave={(updated) => {
                        onUpdate(historicoDe.id, { revisions: updated });
                        setHistoricoDe({ ...historicoDe, revisions: updated });
                    }}
                    onClose={() => setHistoricoDe(null)}
                />
            )}
        </div>
    );
};

function ActionBtn({ children, title, onClick, tone }: { children: React.ReactNode; title: string; onClick: () => void; tone?: string }) {
    return (
        <button
            onClick={onClick}
            title={title}
            className={`p-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-brand-300 transition-colors ${tone || 'text-slate-500 dark:text-slate-400'}`}
        >
            {children}
        </button>
    );
}

// --- Modal de cadastro/edição da Referência (molde + gabarito) ---

function ReferenciaModal({ referencia, clients, defaultClient, onClose, onSave }: {
    referencia: Referencia | null;
    clients: ClientDoc[];
    defaultClient?: string;    // obra ativa do catálogo — referência nova nasce nela
    onClose: () => void;
    onSave: (data: Omit<Referencia, 'id'>) => void;
}) {
    const [codigoCliente, setCodigoCliente] = useState(referencia?.codigoCliente || '');
    const [client, setClient] = useState(referencia?.client || defaultClient || clients[0]?.name || '');
    const [discipline, setDiscipline] = useState<Discipline>(referencia?.discipline || Discipline.ARCHITECTURE);
    const [revisao, setRevisao] = useState(referencia?.revisao ?? 0);
    const [observacao, setObservacao] = useState(referencia?.observacao || '');
    // Todas as datas do processo, editáveis (correção de lançamentos errados)
    const [dates, setDates] = useState<TimelineDates>({
        startDate: referencia?.startDate || '', startPeriod: referencia?.startPeriod || 'MANHA',
        endDate: referencia?.endDate || '', endPeriod: referencia?.endPeriod || 'TARDE',
        sendDate: referencia?.sendDate || '', sendPeriod: referencia?.sendPeriod || 'MANHA',
        feedbackDate: referencia?.feedbackDate || '', feedbackPeriod: referencia?.feedbackPeriod || 'TARDE',
    });
    const [gabarito, setGabarito] = useState<GabaritoItem[]>(
        referencia?.gabarito?.length ? referencia.gabarito : [{ id: crypto.randomUUID(), papel: papelFolha(codigoCliente, 1), sufixoCodigo: '' }]
    );
    // Nome automático dos entregáveis: codificação + F01, F02... As linhas que
    // seguem o padrão acompanham a codificação sendo digitada/corrigida; linha
    // renomeada à mão sai do padrão e nunca mais é tocada.
    const prevCodigo = useRef(codigoCliente);
    useEffect(() => {
        const old = prevCodigo.current;
        if (old === codigoCliente) return;
        prevCodigo.current = codigoCliente;
        setGabarito(prev => renomearPapeisAuto(prev, old, codigoCliente));
    }, [codigoCliente]);

    const addEntregavel = () => setGabarito(prev => [
        ...prev,
        { id: crypto.randomUUID(), papel: papelFolha(codigoCliente, nextFolhaNumber(codigoCliente, prev.map(g => g.papel))), sufixoCodigo: '' },
    ]);

    const setItem = (id: string, changes: Partial<GabaritoItem>) =>
        setGabarito(prev => prev.map(g => g.id === id ? { ...g, ...changes } : g));

    const save = () => {
        if (!codigoCliente.trim()) { alert('Informe a codificação do cliente (ex.: BSO-CONSTRUCAP-ARQ-R00).'); return; }
        if (!client.trim()) { alert('Selecione a obra.'); return; }
        const cleanGabarito = gabarito
            .map(g => ({ ...g, papel: g.papel.trim(), sufixoCodigo: g.sufixoCodigo?.trim() || undefined }))
            .filter(g => g.papel.length > 0);
        if (cleanGabarito.length === 0) { alert('O gabarito precisa de ao menos 1 entregável (ex.: o próprio nome do projeto, Folha 101, Memorial Descritivo...).'); return; }
        if (dates.startDate && dates.endDate && dates.endDate < dates.startDate) {
            alert('A conclusão da execução não pode ser anterior ao início.'); return;
        }
        if (dates.sendDate && dates.feedbackDate && dates.feedbackDate < dates.sendDate) {
            alert('O feedback não pode ser anterior ao envio ao cliente.'); return;
        }

        // Ao editar, enviamos as datas mesmo vazias ('') para que o patch as APAGUE
        // quando o usuário limpa um lançamento errado (blockedDays é recalculado no
        // handler). Numa referência nova, só enviamos o que estiver preenchido.
        const isEdit = !!referencia;
        const datePayload: Record<string, any> = {};
        REF_TIMELINE_FIELDS.forEach(f => {
            const date = dates[f.dateKey] as string | undefined;
            if (isEdit) {
                // envia sempre (inclusive '') para permitir apagar
                datePayload[f.dateKey] = date || '';
                if (date) datePayload[f.periodKey] = dates[f.periodKey];
            } else if (date) {
                datePayload[f.dateKey] = date;
                datePayload[f.periodKey] = dates[f.periodKey];
            }
        });

        // Aplica a lógica do fluxo: se o usuário mexeu nas datas, o status é derivado
        // da linha do tempo (apagar início/fim retroage o status; preencher avança).
        const dateChanged = isEdit && ['startDate', 'endDate', 'sendDate', 'feedbackDate'].some(
            k => (dates[k as keyof TimelineDates] as string || '') !== ((referencia as any)[k] || '')
        );
        const nextStatus = dateChanged
            ? inferRefStatusFromDates(
                { startDate: dates.startDate, endDate: dates.endDate, sendDate: dates.sendDate, feedbackDate: dates.feedbackDate },
                referencia!.statusAprovacao,
            )
            : (referencia?.statusAprovacao || RefStatus.RASCUNHO);

        onSave({
            codigoCliente: codigoCliente.trim(),
            client: client.trim(),
            discipline,
            revisao,
            statusAprovacao: nextStatus,
            gabarito: cleanGabarito,
            ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
            ...datePayload,
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
                        <button onClick={addEntregavel}
                            className="flex items-center gap-1 text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline">
                            <Plus size={12} /> Adicionar entregável
                        </button>
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                        Ao instanciar em uma base, cada linha vira 1 prancha. O nome de cada entregável é preenchido
                        automaticamente com a codificação + F01, F02... e acompanha a codificação enquanto seguir esse
                        padrão (edite à vontade se a folha tiver outro nome). O sufixo é opcional e apenas pré-preenche o
                        código (a codificação final é manual — varia por órgão regulamentador).
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

                {/* Todas as datas do processo — editáveis para corrigir lançamentos.
                    Só aparecem ao EDITAR: numa referência nova elas são registradas pelo fluxo. */}
                {referencia && (
                    <div className="mb-4">
                        <TimelineDatesEditor
                            fields={REF_TIMELINE_FIELDS}
                            value={dates}
                            onChange={patch => setDates(prev => ({ ...prev, ...patch }))}
                            note="Ajuste qualquer data do preliminar. O status segue a linha do tempo: apagar início/fim de elaboração retroage o status (ex.: Elaborado → Em Elaboração/Rascunho). Os dias úteis com o cliente recalculam a partir de envio e feedback."
                        />
                    </div>
                )}

                <div className="mb-6">
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Observações</label>
                    <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
                        className="w-full h-16 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 resize-none" />
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium">Cancelar</button>
                    <button onClick={save} className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-sm">
                        {referencia ? 'Salvar Alterações' : 'Cadastrar Referência'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// --- Modal de instanciação: escolhe a BASE (KM) e pré-visualiza as pranchas ---

function InstanciarModal({ referencia, existingBases, basesRegistradas, onClose, onConfirm }: {
    referencia: Referencia;
    existingBases: string[];
    basesRegistradas: string[];   // bases nomeadas registradas na Obra (fonte preferencial)
    onClose: () => void;
    onConfirm: (base: string, codigoRodovia?: string) => void | Promise<void>;
}) {
    // Bases registradas na obra que ainda NÃO foram instanciadas para esta referência
    const existingSlugs = new Set(existingBases.map(slugify));
    const disponiveis = basesRegistradas.filter(b => !existingSlugs.has(slugify(b)));

    const [base, setBase] = useState(disponiveis[0] || '');
    const [digitando, setDigitando] = useState(disponiveis.length === 0); // sem registro → digitação livre
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
                {!digitando && disponiveis.length > 0 ? (
                    <>
                        <select value={base} onChange={e => setBase(e.target.value)} autoFocus
                            className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-1">
                            {disponiveis.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <button type="button" onClick={() => { setDigitando(true); setBase(''); }}
                            className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline mb-1">
                            Base não registrada? Digitar manualmente
                        </button>
                    </>
                ) : (
                    <>
                        <input value={base} onChange={e => setBase(e.target.value)} placeholder="Ex: 104+000" autoFocus
                            className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-1" />
                        {disponiveis.length > 0 && (
                            <button type="button" onClick={() => { setDigitando(false); setBase(disponiveis[0]); }}
                                className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline mb-1">
                                Voltar para as bases registradas
                            </button>
                        )}
                        {basesRegistradas.length === 0 && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-1">
                                Dica: registre as bases desta rodovia na aba Obras para padronizar a grafia e habilitar a instanciação em lote.
                            </p>
                        )}
                    </>
                )}
                {existingBases.length > 0 && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">Bases já instanciadas (não podem repetir): {existingBases.join(', ')}</p>
                )}

                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 mt-3">Prefixo da Codificação da Rodovia (manual, opcional)</label>
                <input value={codigoRodovia} onChange={e => setCodigoRodovia(e.target.value)} placeholder="Ex: ELO-040RJ-104+000-BSO-EXE"
                    className="w-full font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-1" />
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
                    A codificação varia por órgão regulamentador, então é digitada à mão. O prefixo + sufixo do gabarito apenas
                    pré-preenchem o código de cada prancha — tudo editável depois, em Projetos Locais.
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

                {/* Nova regra: instanciar encerra o preliminar — etapas pendentes são desconsideradas */}
                {referencia.statusAprovacao !== RefStatus.APROVADO && referencia.statusAprovacao !== RefStatus.SUPERSEDED && (
                    <p className="text-[11px] text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-100 dark:border-cyan-900/40 rounded-lg px-3 py-2 mb-4">
                        Ao instanciar, o ciclo preliminar desta referência será encerrado como <b>Executivo Gerado</b> —
                        as etapas pendentes ({referencia.statusAprovacao}) são desconsideradas e o trabalho segue nas pranchas de Projetos Locais.
                    </p>
                )}

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

// --- Modal de instanciação em LOTE: matriz referências × bases da MESMA obra ---
//
// O escopo por obra evita a inconsistência de instanciar referência de uma rodovia
// na base de outra. O preview usa o MESMO planejador puro que será executado, então
// o que aparece na tela é exatamente o que será criado/pulado.

function InstanciarLoteModal({ referencias, conjuntos, clients, onClose, onConfirm }: {
    referencias: Referencia[];
    conjuntos: Conjunto[];
    clients: ClientDoc[];
    onClose: () => void;
    onConfirm: CatalogoPageProps['onInstanciarLote'];
}) {
    const obrasComRefs = useMemo(
        () => clients.filter(c => referencias.some(r => r.client === c.name)),
        [clients, referencias]
    );
    const [obra, setObra] = useState(obrasComRefs[0]?.name || '');
    const [selRefs, setSelRefs] = useState<Set<string>>(new Set());
    const [selBases, setSelBases] = useState<Set<string>>(new Set());
    // Prefixo manual da codificação POR BASE (opcional; pré-preenche o código das pranchas)
    const [prefixos, setPrefixos] = useState<Record<string, string>>({});
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [result, setResult] = useState<{ criados: number; puladas: number; semGabarito: string[]; erros: string[] } | null>(null);

    const obraDoc = obrasComRefs.find(c => c.name === obra);
    const refsDaObra = useMemo(() => referencias.filter(r => r.client === obra), [referencias, obra]);
    const basesRegistradas = obraDoc?.bases || [];

    const trocarObra = (nome: string) => { setObra(nome); setSelRefs(new Set()); setSelBases(new Set()); setPrefixos({}); setResult(null); };

    const toggle = (set: Set<string>, setter: (s: Set<string>) => void, value: string) => {
        const next = new Set(set);
        next.has(value) ? next.delete(value) : next.add(value);
        setter(next);
    };

    const refsEscolhidas = refsDaObra.filter(r => selRefs.has(r.id));
    const basesEscolhidas = basesRegistradas.filter(b => selBases.has(b));

    // Preview com o mesmo planejador da execução (pula existentes, deduplica bases)
    const preview = useMemo(() => planInstanciacaoLote({
        referencias: refsEscolhidas,
        bases: basesEscolhidas,
        existingConjuntos: conjuntos,
        today: new Date().toISOString().split('T')[0],
        codigoPorBase: prefixos,
    }), [refsEscolhidas, basesEscolhidas, conjuntos, prefixos]);

    const executar = async () => {
        setProgress({ done: 0, total: preview.items.length });
        const r = await onConfirm(refsEscolhidas, basesEscolhidas, (done, total) => setProgress({ done, total }), prefixos);
        setProgress(null);
        if (r) setResult(r);
    };

    const rodando = progress !== null;

    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-3xl w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <CopyPlus size={18} className="text-violet-600 dark:text-violet-400" /> Instanciar em Lote
                    </h3>
                    <button onClick={onClose} disabled={rodando} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40" aria-label="Fechar"><X size={20} /></button>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Selecione as referências e as bases: cada combinação vira 1 conjunto com as pranchas do gabarito.
                    Combinações já instanciadas são <strong>puladas automaticamente</strong> — rodar de novo não duplica nada.
                    Ao instanciar, o ciclo preliminar de cada referência é encerrado como <strong>Executivo Gerado</strong> (etapas pendentes são desconsideradas; referências já Aprovadas mantêm o veredito).
                </p>

                {/* Resultado da execução */}
                {result ? (
                    <div className="space-y-3">
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                                <CheckCircle2 size={16} /> {result.criados} conjunto(s) criado(s)
                            </p>
                            {result.puladas > 0 && (
                                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">{result.puladas} combinação(ões) já existia(m) e foi(ram) pulada(s).</p>
                            )}
                            {result.semGabarito.length > 0 && (
                                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">Sem gabarito (ignoradas): {result.semGabarito.join(', ')}</p>
                            )}
                        </div>
                        {result.erros.length > 0 && (
                            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4">
                                <p className="text-sm font-bold text-rose-800 dark:text-rose-300 mb-1">{result.erros.length} falha(s):</p>
                                <ul className="text-xs text-rose-700 dark:text-rose-400 space-y-0.5">{result.erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
                            </div>
                        )}
                        <div className="flex justify-end">
                            <button onClick={onClose} className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-sm">Fechar</button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Obra (escopo do lote — referências e bases sempre da MESMA rodovia) */}
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Obra (Rodovia)</label>
                        <select value={obra} onChange={e => trocarObra(e.target.value)} disabled={rodando}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-sm rounded-lg p-2.5 mb-4">
                            {obrasComRefs.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            {/* Coluna 1: referências */}
                            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                <SelHeader
                                    label={`Referências (${selRefs.size}/${refsDaObra.length})`}
                                    allSelected={refsDaObra.length > 0 && refsDaObra.every(r => selRefs.has(r.id) || r.gabarito.length === 0)}
                                    disabled={rodando}
                                    onToggleAll={() => {
                                        const selecionaveis = refsDaObra.filter(r => r.gabarito.length > 0);
                                        const allSel = selecionaveis.every(r => selRefs.has(r.id));
                                        setSelRefs(allSel ? new Set() : new Set(selecionaveis.map(r => r.id)));
                                    }}
                                />
                                <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-700/60">
                                    {refsDaObra.length === 0 && <p className="p-3 text-xs text-slate-400 italic">Nenhuma referência nesta obra.</p>}
                                    {refsDaObra.map(r => {
                                        const semGab = r.gabarito.length === 0;
                                        return (
                                            <button key={r.id} disabled={semGab || rodando}
                                                onClick={() => toggle(selRefs, setSelRefs, r.id)}
                                                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors ${semGab ? 'opacity-40 cursor-not-allowed' : ''}`}>
                                                {selRefs.has(r.id) ? <CheckSquare size={15} className="text-violet-600 flex-shrink-0" /> : <Square size={15} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />}
                                                <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{r.codigoCliente}</span>
                                                <span className="ml-auto text-[10px] text-slate-400 flex-shrink-0">
                                                    {semGab ? 'sem gabarito' : `${r.gabarito.length} prancha(s)`}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Coluna 2: bases registradas na Obra */}
                            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                <SelHeader
                                    label={`Bases (${selBases.size}/${basesRegistradas.length})`}
                                    allSelected={basesRegistradas.length > 0 && basesRegistradas.every(b => selBases.has(b))}
                                    disabled={rodando}
                                    onToggleAll={() => {
                                        const allSel = basesRegistradas.every(b => selBases.has(b));
                                        setSelBases(allSel ? new Set() : new Set(basesRegistradas));
                                    }}
                                />
                                <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-700/60">
                                    {basesRegistradas.length === 0 && (
                                        <p className="p-3 text-xs text-amber-600 dark:text-amber-400">
                                            Esta obra não tem bases registradas. Cadastre as bases (KM) na aba <strong>Obras</strong> para habilitar o lote.
                                        </p>
                                    )}
                                    {basesRegistradas.map(b => (
                                        <button key={b} disabled={rodando} onClick={() => toggle(selBases, setSelBases, b)}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                                            {selBases.has(b) ? <CheckSquare size={15} className="text-violet-600 flex-shrink-0" /> : <Square size={15} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />}
                                            <MapPin size={11} className="text-brand-600 dark:text-brand-400 flex-shrink-0" />
                                            <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">{b}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Prefixo da codificação POR BASE: cada base instanciada pode ter o seu
                            (prefixo + sufixo do gabarito pré-preenchem o código de cada prancha) */}
                        {basesEscolhidas.length > 0 && (
                            <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 mb-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Prefixo da codificação por base (manual, opcional)</p>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                                    O prefixo de cada base + o sufixo do gabarito pré-preenchem o código das pranchas daquela base
                                    (ex.: <span className="font-mono">WRS-153MG-081+430-SAU-EXE</span>). Base sem prefixo fica só com o sufixo — tudo editável depois, em Projetos Locais.
                                </p>
                                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                                    {basesEscolhidas.map(b => (
                                        <div key={b} className="flex items-center gap-2">
                                            <span className="flex items-center gap-1 w-32 flex-shrink-0 font-mono text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                                                <MapPin size={11} className="text-brand-600 dark:text-brand-400 flex-shrink-0" /> {b}
                                            </span>
                                            <input
                                                value={prefixos[b] || ''}
                                                disabled={rodando}
                                                onChange={e => setPrefixos(prev => ({ ...prev, [b]: e.target.value }))}
                                                placeholder="Ex: WRS-153MG-081+430-SAU-EXE"
                                                className="flex-1 font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white text-xs rounded-lg p-2"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Preview: exatamente o que o planejador vai criar/pular */}
                        {(refsEscolhidas.length > 0 && basesEscolhidas.length > 0) && (
                            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3 mb-4 text-xs text-violet-800 dark:text-violet-300">
                                <p className="font-bold">
                                    {refsEscolhidas.length} referência(s) × {basesEscolhidas.length} base(s) →
                                    criará <strong>{preview.items.length} conjunto(s)</strong> com <strong>{preview.totalPranchas} prancha(s)</strong>
                                </p>
                                {preview.puladas.length > 0 && (
                                    <p className="mt-1 text-violet-600 dark:text-violet-400">
                                        {preview.puladas.length} combinação(ões) já instanciada(s) será(ão) pulada(s): {preview.puladas.slice(0, 5).map(p => `${p.codigoCliente} @ ${p.base}`).join('; ')}{preview.puladas.length > 5 ? '…' : ''}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Progresso da execução */}
                        {rodando && progress && (
                            <div className="mb-4">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    <Loader2 size={13} className="animate-spin" /> Instanciando... {progress.done}/{progress.total}
                                </div>
                                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-violet-600 rounded-full transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}></div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <button onClick={onClose} disabled={rodando} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium disabled:opacity-40">Cancelar</button>
                            <button
                                onClick={executar}
                                disabled={rodando || preview.items.length === 0}
                                className="px-5 py-2 text-sm bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-semibold shadow-sm"
                            >
                                {rodando ? 'Instanciando...' : `Instanciar ${preview.items.length} conjunto(s)`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// --- Modal de geração de disciplinas a partir da Arquitetura ---
//
// A nomenclatura "Edificação-Cliente-Disciplina" permite derivar os códigos das
// demais disciplinas trocando a sigla. O gabarito da ARQ é copiado como ponto de
// partida; disciplinas fora do contrato basta desmarcar (ou excluir depois).

const DISCIPLINAS_GERAVEIS: { discipline: Discipline; sigla: string }[] = [
    { discipline: Discipline.COVERAGE, sigla: DISCIPLINA_SIGLA[Discipline.COVERAGE]! },
    { discipline: Discipline.FOUNDATION, sigla: DISCIPLINA_SIGLA[Discipline.FOUNDATION]! },
    { discipline: Discipline.ELECTRICAL, sigla: DISCIPLINA_SIGLA[Discipline.ELECTRICAL]! },
    { discipline: Discipline.DATA, sigla: DISCIPLINA_SIGLA[Discipline.DATA]! },
    { discipline: Discipline.HYDRAULIC, sigla: DISCIPLINA_SIGLA[Discipline.HYDRAULIC]! },
    { discipline: Discipline.SPDA, sigla: DISCIPLINA_SIGLA[Discipline.SPDA]! },
    { discipline: Discipline.FIRE, sigla: DISCIPLINA_SIGLA[Discipline.FIRE]! },
    { discipline: Discipline.HVAC, sigla: DISCIPLINA_SIGLA[Discipline.HVAC]! },
];

function GerarDisciplinasModal({ origem, referencias, onClose, onConfirm }: {
    origem: Pick<Referencia, 'codigoCliente' | 'client' | 'discipline' | 'gabarito' | 'observacao'>;
    referencias: Referencia[];
    onClose: () => void;
    onConfirm: (refs: Omit<Referencia, 'id'>[]) => Promise<{ criadas: number; erros: string[] }>;
}) {
    // Todas marcadas por padrão ("é só apagar e boa" — a exceção é Outros, que exige sigla)
    const [marcadas, setMarcadas] = useState<Set<Discipline>>(new Set(DISCIPLINAS_GERAVEIS.map(d => d.discipline)));
    const [outrosSigla, setOutrosSigla] = useState('');
    const [outrosMarcada, setOutrosMarcada] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [resultado, setResultado] = useState<{ criadas: number; erros: string[]; puladas: string[] } | null>(null);

    const siglaOrigem = DISCIPLINA_SIGLA[origem.discipline] || 'ARQ';

    const destinos = useMemo(() => {
        const d = DISCIPLINAS_GERAVEIS.filter(x => marcadas.has(x.discipline)).map(x => ({ ...x }));
        if (outrosMarcada && outrosSigla.trim()) d.push({ discipline: Discipline.OTHER, sigla: outrosSigla.trim().toUpperCase() });
        return d;
    }, [marcadas, outrosMarcada, outrosSigla]);

    // Preview com a MESMA função que gera (o que aparece é o que será criado)
    const plano = useMemo(() => gerarReferenciasDisciplinas({
        origem, destinos, existingReferencias: referencias,
    }), [origem, destinos, referencias]);

    const toggle = (d: Discipline) => setMarcadas(prev => {
        const next = new Set(prev);
        next.has(d) ? next.delete(d) : next.add(d);
        return next;
    });

    const gerar = async () => {
        setSalvando(true);
        try {
            const r = await onConfirm(plano.novas);
            setResultado({ ...r, puladas: plano.puladas });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Wand2 size={18} className="text-violet-600 dark:text-violet-400" /> Gerar Disciplinas
                    </h3>
                    <button onClick={onClose} disabled={salvando} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40" aria-label="Fechar"><X size={20} /></button>
                </div>

                {resultado ? (
                    <div className="space-y-3">
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                                <CheckCircle2 size={16} /> {resultado.criadas} referência(s) criada(s) no catálogo
                            </p>
                            {resultado.puladas.length > 0 && (
                                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">Já existiam (puladas): {resultado.puladas.join(', ')}</p>
                            )}
                        </div>
                        {resultado.erros.length > 0 && (
                            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4">
                                <p className="text-sm font-bold text-rose-800 dark:text-rose-300 mb-1">Falhas:</p>
                                <ul className="text-xs text-rose-700 dark:text-rose-400 space-y-0.5">{resultado.erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
                            </div>
                        )}
                        <div className="flex justify-end">
                            <button onClick={onClose} className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-sm">Fechar</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            A partir de <span className="font-mono font-bold text-slate-700 dark:text-slate-200">{origem.codigoCliente}</span>,
                            as disciplinas abaixo serão cadastradas trocando a sigla <strong>{siglaOrigem}</strong> no código.
                            O gabarito ({origem.gabarito.length} entregável(is)) é copiado como ponto de partida — edite depois se precisar.
                            Disciplina fora do contrato? É só desmarcar.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-3">
                            {DISCIPLINAS_GERAVEIS.map(({ discipline, sigla }) => {
                                const codigo = swapDisciplinaSigla(origem.codigoCliente, siglaOrigem, sigla);
                                const jaExiste = plano.puladas.includes(codigo);
                                return (
                                    <button key={discipline} onClick={() => toggle(discipline)} disabled={salvando}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${marcadas.has(discipline) && !jaExiste ? 'border-violet-300 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-900/20' : 'border-slate-200 dark:border-slate-700'} ${jaExiste ? 'opacity-50' : 'hover:border-violet-300'}`}>
                                        {marcadas.has(discipline) && !jaExiste
                                            ? <CheckSquare size={15} className="text-violet-600 flex-shrink-0" />
                                            : <Square size={15} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />}
                                        <span className="min-w-0">
                                            <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">{discipline} <span className="text-slate-400 font-mono">({sigla})</span></span>
                                            <span className={`block text-[10px] font-mono truncate ${jaExiste ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                                {jaExiste ? `${codigo} — já existe` : codigo}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}

                            {/* Outros: sigla a preencher */}
                            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${outrosMarcada ? 'border-violet-300 dark:border-violet-700 bg-violet-50/60 dark:bg-violet-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                                <button onClick={() => setOutrosMarcada(v => !v)} disabled={salvando} className="flex-shrink-0">
                                    {outrosMarcada
                                        ? <CheckSquare size={15} className="text-violet-600" />
                                        : <Square size={15} className="text-slate-300 dark:text-slate-600" />}
                                </button>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">Outros</span>
                                    <input
                                        value={outrosSigla}
                                        onChange={e => { setOutrosSigla(e.target.value); if (e.target.value.trim()) setOutrosMarcada(true); }}
                                        placeholder="Sigla (ex: PAISAG)"
                                        disabled={salvando}
                                        className="w-full bg-transparent border-b border-slate-200 dark:border-slate-600 text-[11px] font-mono text-slate-600 dark:text-slate-300 outline-none focus:border-violet-400 py-0.5"
                                    />
                                </span>
                            </div>
                        </div>

                        <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3 mb-4 text-xs text-violet-800 dark:text-violet-300">
                            <p className="font-bold">Serão criadas {plano.novas.length} referência(s) em Rascunho.</p>
                            {plano.puladas.length > 0 && <p className="mt-0.5 text-violet-600 dark:text-violet-400">{plano.puladas.length} já existe(m) e será(ão) pulada(s).</p>}
                            {outrosMarcada && !outrosSigla.trim() && <p className="mt-0.5 text-amber-600 dark:text-amber-400">"Outros" está marcado sem sigla — será ignorado.</p>}
                        </div>

                        <div className="flex justify-end gap-2">
                            <button onClick={onClose} disabled={salvando} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium disabled:opacity-40">Agora não</button>
                            <button
                                onClick={gerar}
                                disabled={salvando || plano.novas.length === 0}
                                className="px-5 py-2 text-sm bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-semibold shadow-sm"
                            >
                                {salvando ? 'Gerando...' : `Gerar ${plano.novas.length} referência(s)`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// --- Modal de geração de disciplinas EM LOTE (várias Arquiteturas de uma vez) ---
//
// Seleciona múltiplas referências de ARQ (agrupadas por obra) e as disciplinas a
// gerar. O planejador de lote reaproveita a mesma lógica por origem e deduplica
// dentro do próprio lote, então o preview reflete exatamente o que será criado.

function GerarDisciplinasLoteModal({ referencias, clients, onClose, onConfirm }: {
    referencias: Referencia[];
    clients: ClientDoc[];
    onClose: () => void;
    onConfirm: CatalogoPageProps['onAddMany'];
}) {
    const arquiteturas = useMemo(
        () => referencias.filter(r => r.discipline === Discipline.ARCHITECTURE)
            .sort((a, b) => `${a.client}|${a.codigoCliente}`.localeCompare(`${b.client}|${b.codigoCliente}`)),
        [referencias]
    );

    const [selArq, setSelArq] = useState<Set<string>>(new Set(arquiteturas.map(r => r.id)));
    const [marcadas, setMarcadas] = useState<Set<Discipline>>(new Set(DISCIPLINAS_GERAVEIS.map(d => d.discipline)));
    const [outrosSigla, setOutrosSigla] = useState('');
    const [outrosMarcada, setOutrosMarcada] = useState(false);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [resultado, setResultado] = useState<{ criadas: number; erros: string[]; puladas: number } | null>(null);

    const destinos = useMemo(() => {
        const d = DISCIPLINAS_GERAVEIS.filter(x => marcadas.has(x.discipline)).map(x => ({ ...x }));
        if (outrosMarcada && outrosSigla.trim()) d.push({ discipline: Discipline.OTHER, sigla: outrosSigla.trim().toUpperCase() });
        return d;
    }, [marcadas, outrosMarcada, outrosSigla]);

    const origens = useMemo(() => arquiteturas.filter(r => selArq.has(r.id)), [arquiteturas, selArq]);

    const plano = useMemo(() => planGerarDisciplinasLote({
        origens, destinos, existingReferencias: referencias,
    }), [origens, destinos, referencias]);

    // ARQ agrupadas por obra (só visual)
    const porObra = useMemo(() => {
        const map = new Map<string, Referencia[]>();
        arquiteturas.forEach(r => {
            if (!map.has(r.client)) map.set(r.client, []);
            map.get(r.client)!.push(r);
        });
        return [...map.entries()];
    }, [arquiteturas]);

    const toggleArq = (id: string) => setSelArq(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleDisc = (d: Discipline) => setMarcadas(prev => {
        const next = new Set(prev);
        next.has(d) ? next.delete(d) : next.add(d);
        return next;
    });

    const rodando = progress !== null;

    const gerar = async () => {
        setProgress({ done: 0, total: plano.novas.length });
        const r = await onConfirm(plano.novas, (done, total) => setProgress({ done, total }));
        setProgress(null);
        setResultado({ ...r, puladas: plano.puladas.length });
    };

    return (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-3xl w-full p-6 border dark:border-slate-700 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-150">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Wand2 size={18} className="text-violet-600 dark:text-violet-400" /> Gerar Disciplinas em Lote
                    </h3>
                    <button onClick={onClose} disabled={rodando} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40" aria-label="Fechar"><X size={20} /></button>
                </div>

                {resultado ? (
                    <div className="space-y-3">
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                                <CheckCircle2 size={16} /> {resultado.criadas} referência(s) criada(s)
                            </p>
                            {resultado.puladas > 0 && <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">{resultado.puladas} já existia(m) e foi(ram) pulada(s).</p>}
                        </div>
                        {resultado.erros.length > 0 && (
                            <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4">
                                <p className="text-sm font-bold text-rose-800 dark:text-rose-300 mb-1">{resultado.erros.length} falha(s):</p>
                                <ul className="text-xs text-rose-700 dark:text-rose-400 space-y-0.5">{resultado.erros.map((e, i) => <li key={i}>{e}</li>)}</ul>
                            </div>
                        )}
                        <div className="flex justify-end"><button onClick={onClose} className="px-5 py-2 text-sm bg-brand-700 hover:bg-brand-800 text-white rounded-lg font-semibold shadow-sm">Fechar</button></div>
                    </div>
                ) : (
                    <>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                            Selecione as <strong>Arquiteturas</strong> e as disciplinas: para cada ARQ escolhida, as disciplinas
                            marcadas são cadastradas trocando a sigla no código. Códigos já existentes são pulados.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            {/* Coluna 1: Arquiteturas (agrupadas por obra) */}
                            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                <SelHeader
                                    label={`Arquiteturas (${selArq.size}/${arquiteturas.length})`}
                                    allSelected={arquiteturas.length > 0 && arquiteturas.every(r => selArq.has(r.id))}
                                    disabled={rodando}
                                    onToggleAll={() => {
                                        const all = arquiteturas.every(r => selArq.has(r.id));
                                        setSelArq(all ? new Set() : new Set(arquiteturas.map(r => r.id)));
                                    }}
                                />
                                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                    {arquiteturas.length === 0 && <p className="p-3 text-xs text-slate-400 italic">Nenhuma referência de Arquitetura no catálogo.</p>}
                                    {porObra.map(([obra, refs]) => (
                                        <div key={obra}>
                                            <p className="px-3 py-1 bg-slate-50 dark:bg-slate-900/40 text-[10px] font-bold text-slate-400 uppercase sticky top-0">{obra}</p>
                                            {refs.map(r => (
                                                <button key={r.id} disabled={rodando} onClick={() => toggleArq(r.id)}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors border-b border-slate-100 dark:border-slate-700/40 last:border-b-0">
                                                    {selArq.has(r.id) ? <CheckSquare size={15} className="text-violet-600 flex-shrink-0" /> : <Square size={15} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />}
                                                    <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{r.codigoCliente}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Coluna 2: disciplinas a gerar */}
                            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                <SelHeader
                                    label={`Disciplinas (${destinos.length})`}
                                    allSelected={DISCIPLINAS_GERAVEIS.every(d => marcadas.has(d.discipline))}
                                    disabled={rodando}
                                    onToggleAll={() => {
                                        const all = DISCIPLINAS_GERAVEIS.every(d => marcadas.has(d.discipline));
                                        setMarcadas(all ? new Set() : new Set(DISCIPLINAS_GERAVEIS.map(d => d.discipline)));
                                    }}
                                />
                                <div className="max-h-64 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-700/40">
                                    {DISCIPLINAS_GERAVEIS.map(({ discipline, sigla }) => (
                                        <button key={discipline} disabled={rodando} onClick={() => toggleDisc(discipline)}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                                            {marcadas.has(discipline) ? <CheckSquare size={15} className="text-violet-600 flex-shrink-0" /> : <Square size={15} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />}
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{discipline}</span>
                                            <span className="ml-auto text-[10px] font-mono text-slate-400">{sigla}</span>
                                        </button>
                                    ))}
                                    <div className="flex items-center gap-2 px-3 py-2">
                                        <button onClick={() => setOutrosMarcada(v => !v)} disabled={rodando} className="flex-shrink-0">
                                            {outrosMarcada ? <CheckSquare size={15} className="text-violet-600" /> : <Square size={15} className="text-slate-300 dark:text-slate-600" />}
                                        </button>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Outros</span>
                                        <input value={outrosSigla} onChange={e => { setOutrosSigla(e.target.value); if (e.target.value.trim()) setOutrosMarcada(true); }}
                                            placeholder="sigla" disabled={rodando}
                                            className="ml-auto w-24 bg-transparent border-b border-slate-200 dark:border-slate-600 text-[11px] font-mono text-slate-600 dark:text-slate-300 outline-none focus:border-violet-400 py-0.5 text-right" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Preview */}
                        <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3 mb-4 text-xs text-violet-800 dark:text-violet-300">
                            <p className="font-bold">
                                {origens.length} arquitetura(s) × {destinos.length} disciplina(s) → criará <strong>{plano.novas.length} referência(s)</strong> em Rascunho.
                            </p>
                            {plano.puladas.length > 0 && <p className="mt-0.5 text-violet-600 dark:text-violet-400">{plano.puladas.length} já existe(m) e será(ão) pulada(s).</p>}
                        </div>

                        {rodando && progress && (
                            <div className="mb-4">
                                <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    <Loader2 size={13} className="animate-spin" /> Gerando... {progress.done}/{progress.total}
                                </div>
                                <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                    <div className="h-full bg-violet-600 rounded-full transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }}></div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            <button onClick={onClose} disabled={rodando} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg font-medium disabled:opacity-40">Cancelar</button>
                            <button onClick={gerar} disabled={rodando || plano.novas.length === 0}
                                className="px-5 py-2 text-sm bg-violet-700 hover:bg-violet-800 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-lg font-semibold shadow-sm">
                                {rodando ? 'Gerando...' : `Gerar ${plano.novas.length} referência(s)`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function SelHeader({ label, allSelected, onToggleAll, disabled }: { label: string; allSelected: boolean; onToggleAll: () => void; disabled?: boolean }) {
    return (
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">{label}</span>
            <button onClick={onToggleAll} disabled={disabled} className="text-[11px] font-bold text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-40">
                {allSelected ? 'Limpar' : 'Selecionar todas'}
            </button>
        </div>
    );
}
