
import React, { useState, useMemo, useEffect, memo } from 'react';
import { ProjectFile, Status, Discipline, RevisionReason, Period, ProjectPhase } from '../types';
import { format, parseISO, isValid } from 'date-fns';
import { Trash2, GitBranch, History, CornerDownRight, AlertTriangle, Edit2, Save, X, Eye, ArrowUpDown, ArrowUp, ArrowDown, BadgeCheck, Send, CheckSquare, ThumbsDown, List, Search, ArrowUpCircle, ChevronRight, ChevronDown, Play, Pause, ListTree, LayoutList, ClipboardList, Minimize2, Maximize2, CheckCircle2 } from 'lucide-react';
import { subscribeToClients } from '../services/db';
import { getProjectBaseName, getRevisionNumber, formatDateDisplay, calculateBusinessDaysWithHolidays, getStatusColor, inferStatusFromDates, calculateDeadlineDate, canTransitionTo } from '../utils';

interface ProjectListProps {
    projects: ProjectFile[];
    onUpdate: (updated: ProjectFile) => void;
    onDelete: (id: string) => void;
    onAddRevision: (id: string, reason: RevisionReason, comment: string) => void;
    onPromote?: (id: string) => void;
    holidays: string[];
    readOnly?: boolean;
}

// Busca sem acentos: "eletrica" encontra "Elétrica"
const ACCENTS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g');
const normalizeText = (s: string) => s.normalize('NFD').replace(ACCENTS_REGEX, '').toLowerCase();

const LS_VIEW_MODE = 'kpiCerne.projects.viewMode';
const LS_COMPACT = 'kpiCerne.projects.compact';
const LS_EXPANDED_DISCIPLINES = 'kpiCerne.projects.expandedDisciplines';

type ViewMode = 'GROUPED' | 'FLAT' | 'PENDING';
type BatchAction = 'COMPLETE' | 'SEND' | 'APPROVE' | 'REJECT';

// Linha unificada da tabela: usada para a última revisão (pai), revisões antigas
// (filhas) e em todas as visões (Agrupado, Lista, Pendências).
const ProjectRow = memo(({ project, isLatest, isChildRow, groupToggle, groupEnd, readOnly, compact, selectable, selected, onToggleSelect, setViewHistoryProject, setPendingCompletion, setPendingSend, setPendingApproval, setPendingRejection, setActiveRevModal, setDetailsProject, setEditingProject, setProjectToDelete, onPromote, onTogglePause, executiveExistenceMap, clientsMap }: any) => {
    const revNumber = project.revision !== undefined ? project.revision : getRevisionNumber(project.filename);
    const isRevision = revNumber > 0;
    const canCreateRevision = isLatest || project.status === Status.REJECTED;

    // Lógica de Promoção:
    // 1. Deve ser Preliminar
    // 2. Deve estar Concluído, Aguardando Aprovação ou Aprovado (Permite fluxo flexível)
    // 3. NÃO pode existir um Executivo correspondente (verificado via mapa)
    const baseNameKey = project.groupId || getProjectBaseName(project.filename).replace(/_EXEC/gi, '').replace(/\s*\[R\d+\]/gi, '').trim().toLowerCase();
    const uniqueKey = `${project.client}|${project.discipline}|${baseNameKey}`;
    const hasExecutiveVersion = executiveExistenceMap.has(uniqueKey);

    const canPromote = onPromote &&
        project.phase === ProjectPhase.PRELIMINARY &&
        (project.status === Status.DONE || project.status === Status.WAITING_APPROVAL || project.status === Status.APPROVED) &&
        !hasExecutiveVersion &&
        isLatest;

    let feedbackColorClass = "text-slate-600 dark:text-slate-400";
    if (project.status === Status.APPROVED) feedbackColorClass = "text-emerald-700 dark:text-emerald-400 font-medium";
    if (project.status === Status.REJECTED) feedbackColorClass = "text-rose-700 dark:text-rose-400 font-medium";

    const displayDate = (date: string, period?: Period) => {
        const d = formatDateDisplay(date);
        if (d === '-') return d;
        if (period) return `${d} (${period === 'MANHA' ? 'M' : 'T'})`;
        return d;
    };

    const currentPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';

    // Estado de Inconsistência (Data Faltante)
    const missingSendDate = (project.status === Status.WAITING_APPROVAL || project.status === Status.APPROVED || project.status === Status.REJECTED) && !project.sendDate;
    const missingFeedbackDate = (project.status === Status.APPROVED || project.status === Status.REJECTED) && !project.feedbackDate;

    // SLA Calculation via ClientDoc
    const clientData = clientsMap[project.client];
    const contractDate = clientData?.contractDate;
    const deadlineDays = clientData?.deadlineDays;
    const obraCompleted = !!clientData?.completedAt;

    const deadlineDate = contractDate && deadlineDays !== undefined
        ? calculateDeadlineDate(contractDate, deadlineDays)
        : null;

    let isOverdue = false;
    if (deadlineDate && !obraCompleted) {
        const deadlineStr = format(deadlineDate, 'yyyy-MM-dd');
        if (project.endDate && project.status !== Status.REVISED) {
            isOverdue = project.endDate > deadlineStr;
        } else if (project.status !== Status.DONE && project.status !== Status.WAITING_APPROVAL && project.status !== Status.APPROVED && project.status !== Status.REVISED) {
            isOverdue = new Date().toISOString().split('T')[0] > deadlineStr;
        }
    }
    const slaDisplay = deadlineDate ? format(deadlineDate, 'dd/MM/yy') : '-';

    return (
        <tr className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors duration-150 ease-out ${groupEnd ? 'border-b-2 border-slate-200/80 dark:border-slate-700' : ''} ${isChildRow ? 'bg-slate-100/70 dark:bg-slate-900/40 border-l-4 border-brand-300/60 dark:border-brand-500/40' : ''}`}>
            {!readOnly && (
                <td className="px-2 py-2.5 text-center w-8">
                    {selectable && (
                        <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => onToggleSelect(project.id)}
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-brand-600 cursor-pointer"
                            aria-label={`Selecionar ${project.filename}`}
                        />
                    )}
                </td>
            )}
            <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                <div className="flex items-center space-x-1.5 overflow-hidden" title={project.filename}>
                    {groupToggle ? (
                        <button
                            onClick={groupToggle.onToggle}
                            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex-shrink-0"
                            aria-label={groupToggle.isExpanded ? 'Recolher revisões' : 'Expandir revisões'}
                        >
                            {groupToggle.isExpanded
                                ? <ChevronDown size={14} className="text-brand-600 dark:text-brand-400" />
                                : <ChevronRight size={14} className="text-slate-400" />
                            }
                        </button>
                    ) : isChildRow ? (
                        <CornerDownRight size={14} className="text-slate-400 flex-shrink-0" />
                    ) : (
                        <span className="w-[22px] flex-shrink-0"></span>
                    )}
                    {isRevision ? (<button onClick={() => setViewHistoryProject(project)} className="flex-shrink-0 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors duration-150" aria-label={`Ver histórico de revisão ${revNumber}`}>R{revNumber}</button>) : null}
                    <span className={`truncate select-all ${isChildRow ? 'text-slate-500 dark:text-slate-400 text-[11px] opacity-80' : 'text-slate-800 dark:text-slate-200 text-sm'}`}>{project.filename} {isChildRow && isRevision && `[R${revNumber}]`}</span>
                    {project.phase === ProjectPhase.PRELIMINARY && <span className="flex-shrink-0 text-[9px] uppercase font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Prel</span>}
                    {project.phase === ProjectPhase.EXECUTIVE && <span className="flex-shrink-0 text-[9px] uppercase font-bold text-violet-600 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded border border-violet-100 dark:border-violet-800">Exec</span>}
                    {groupToggle && !groupToggle.isExpanded && (
                        <span className="flex-shrink-0 text-[9px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                            +{groupToggle.childCount} rev
                        </span>
                    )}
                </div>
            </td>
            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 text-sm truncate max-w-[120px]">{project.client}</td>
            {!compact && <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 text-xs truncate max-w-[80px]">{project.base || '-'}</td>}
            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 text-xs">{project.discipline}</td>
            <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ${getStatusColor(project.status)}`}>{project.status === Status.DONE ? 'Concluído' : project.status}</span></td>
            <td className="px-3 py-2.5 text-center text-xs">
                {deadlineDate ? (
                    <span className={`px-1.5 py-0.5 rounded border whitespace-nowrap text-[11px] ${isOverdue ? 'bg-rose-50 text-rose-700 border-rose-200 font-bold dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800' : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`} title={`Contrato: ${formatDateDisplay(contractDate || '')} | SLA: ${deadlineDays} dias`}>{slaDisplay}</span>
                ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
            </td>
            {/* Coluna Agrupada: Execução (Início → Conclusão) */}
            <td className="px-3 py-1.5 border-l border-slate-200/60 dark:border-slate-700/50 text-xs">
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase w-5">Ini</span>
                        <span className="text-slate-600 dark:text-slate-400">{displayDate(project.startDate, project.startPeriod)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase w-5">Fim</span>
                        <span className="text-slate-600 dark:text-slate-400">{displayDate(project.endDate, project.endPeriod)}</span>
                    </div>
                </div>
            </td>
            {/* Coluna Agrupada: Aprovação (Envio → Feedback) */}
            <td className="px-3 py-1.5 border-l border-brand-100/60 dark:border-brand-900/20 bg-brand-50/20 dark:bg-brand-900/5 text-xs relative">
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-semibold text-brand-400 dark:text-brand-500 uppercase w-5">Env</span>
                        <span className="text-brand-700 dark:text-brand-400 font-medium">{displayDate(project.sendDate, project.sendPeriod)}</span>
                        {missingSendDate && <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" title="Data de Envio Faltante" />}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase w-5">Ret</span>
                        <span className={feedbackColorClass}>{displayDate(project.feedbackDate, project.feedbackPeriod)}</span>
                        {missingFeedbackDate && <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" title="Data de Feedback Faltante" />}
                    </div>
                </div>
            </td>
            {!compact && <td className="px-3 py-2.5 text-center"><span className="font-mono text-xs text-slate-700 dark:text-slate-300">{project.blockedDays || <span className="text-slate-300 dark:text-slate-600">—</span>}</span></td>}

            {!readOnly && (
                <td className="px-4 py-3">
                    <div className="flex items-center justify-center space-x-2">
                        {project.status === Status.IN_PROGRESS && (<button onClick={() => { const today = new Date().toISOString().split('T')[0]; setPendingCompletion({ id: project.id, date: today, period: currentPeriod }); }} title="Concluir Execução" aria-label="Concluir Execução" className="p-1.5 bg-violet-50 text-violet-600 hover:bg-violet-100 rounded-md transition-colors border border-violet-200"><CheckSquare size={16} /></button>)}
                        {project.status === Status.IN_PROGRESS && (() => {
                            const isPaused = project.pauses?.some((p: any) => !p.endDate);
                            return (
                                <button
                                    onClick={() => onTogglePause(project)}
                                    title={isPaused ? "Retomar Execução" : "Pausar Execução"}
                                    aria-label={isPaused ? "Retomar" : "Pausar"}
                                    className={`p-1.5 rounded-md transition-colors border ${isPaused ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200'}`}
                                >
                                    {isPaused ? <Play size={16} /> : <Pause size={16} />}
                                </button>
                            );
                        })()}
                        {/* Botão de Envio aparece se estiver Concluído OU se estiver Aguardando Aprovação mas sem data (Correção) */}
                        {(project.status === Status.DONE || missingSendDate) && (<button onClick={() => { const today = new Date().toISOString().split('T')[0]; const defaultDate = (project.endDate && today > project.endDate) ? today : (project.endDate || today); setPendingSend({ id: project.id, date: defaultDate, period: currentPeriod }); }} title={missingSendDate ? "Corrigir Data de Envio" : "Registrar Envio ao Cliente"} aria-label="Registrar Envio" className={`p-1.5 rounded-md transition-colors border ${missingSendDate ? 'bg-amber-100 text-amber-700 border-amber-300 animate-pulse' : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border-blue-200'}`}><Send size={16} /></button>)}

                        {project.status === Status.WAITING_APPROVAL && !missingSendDate && (<><button onClick={() => { const today = new Date().toISOString().split('T')[0]; setPendingApproval({ id: project.id, date: today, period: currentPeriod }); }} title="Aprovar Projeto" aria-label="Aprovar" className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-md transition-colors border border-emerald-200"><BadgeCheck size={16} /></button><button onClick={() => { const today = new Date().toISOString().split('T')[0]; setPendingRejection({ id: project.id, date: today, period: currentPeriod }); }} title="Reprovar Projeto" aria-label="Reprovar" className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-md transition-colors border border-rose-200"><ThumbsDown size={16} /></button></>)}

                        {canCreateRevision && project.sendDate && project.status !== Status.REVISED && project.status !== Status.WAITING_APPROVAL && (<button onClick={() => setActiveRevModal(project.id)} title={project.status === Status.REJECTED ? "Gerar Nova Revisão (Pós-Reprovação)" : "Gerar Revisão"} aria-label="Gerar Revisão" className={`p-1.5 rounded-md transition-colors border ${project.status === Status.REJECTED ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100' : 'text-slate-400 hover:text-brand-600 border-transparent hover:bg-brand-50'}`}><GitBranch size={16} /></button>)}

                        {/* Botão de Promoção para Executivo */}
                        {canPromote && (
                            <button
                                onClick={() => onPromote(project.id)}
                                title="Gerar Versão Executiva (Novo Arquivo)"
                                className="p-1.5 bg-violet-50 text-violet-600 hover:bg-violet-100 rounded-md transition-colors border border-violet-200 animate-in zoom-in"
                            >
                                <ArrowUpCircle size={16} />
                            </button>
                        )}
                    </div>
                </td>
            )}

            <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end space-x-1">
                    <button onClick={() => setDetailsProject(project)} className="p-1.5 text-slate-400 hover:text-violet-500 rounded-full hover:bg-violet-50 transition-colors" aria-label="Ver Detalhes"><Eye size={16} /></button>
                    {!readOnly && (
                        <>
                            <button onClick={() => setEditingProject({ ...project })} className="p-1.5 text-slate-400 hover:text-blue-500 rounded-full hover:bg-blue-50 transition-colors" aria-label="Editar"><Edit2 size={16} /></button>
                            <button onClick={() => setProjectToDelete(project)} className="p-1.5 text-slate-400 hover:text-rose-500 rounded-full hover:bg-rose-50 transition-colors" aria-label="Excluir"><Trash2 size={16} /></button>
                        </>
                    )}
                </div>
            </td>
        </tr>
    );
});

type SortKey = keyof ProjectFile | 'blockedDays';
type SortDirection = 'asc' | 'desc';

interface ProjectGroup {
    baseName: string;
    discipline: Discipline;
    latestProject: ProjectFile;
    children: ProjectFile[]; // older revisions (all except latest)
    allProjects: ProjectFile[]; // all projects in the group, sorted by revision
}

interface PhaseGroup {
    phase: ProjectPhase;
    groups: ProjectGroup[];
}

interface DisciplineGroup {
    discipline: Discipline;
    phaseGroups: PhaseGroup[];
}

const BATCH_META: Record<BatchAction, { title: string; description: string; confirmLabel: string; btnClass: string; iconBg: string }> = {
    COMPLETE: { title: 'Concluir Execução em Lote', description: 'A data de conclusão será aplicada a todos os projetos selecionados que estão "Em Andamento".', confirmLabel: 'Concluir Selecionados', btnClass: 'bg-violet-600 hover:bg-violet-700', iconBg: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' },
    SEND: { title: 'Registrar Envio em Lote', description: 'A data de envio ao cliente será aplicada a todos os projetos selecionados que estão "Concluídos".', confirmLabel: 'Enviar Selecionados', btnClass: 'bg-blue-600 hover:bg-blue-700', iconBg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
    APPROVE: { title: 'Aprovar em Lote', description: 'A data de aprovação será aplicada a todos os projetos selecionados que estão "Aguardando Aprovação". Os dias bloqueados serão calculados automaticamente.', confirmLabel: 'Aprovar Selecionados', btnClass: 'bg-emerald-600 hover:bg-emerald-700', iconBg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
    REJECT: { title: 'Reprovar em Lote', description: 'A data de reprovação será aplicada a todos os projetos selecionados que estão "Aguardando Aprovação".', confirmLabel: 'Reprovar Selecionados', btnClass: 'bg-rose-600 hover:bg-rose-700', iconBg: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' },
};

export const ProjectList: React.FC<ProjectListProps> = ({ projects, onUpdate, onDelete, onAddRevision, onPromote, holidays, readOnly = false }) => {
    const [activeRevModal, setActiveRevModal] = useState<string | null>(null);
    const [projectToDelete, setProjectToDelete] = useState<ProjectFile | null>(null);
    const [editingProject, setEditingProject] = useState<ProjectFile | null>(null);
    const [detailsProject, setDetailsProject] = useState<ProjectFile | null>(null);
    const [viewHistoryProject, setViewHistoryProject] = useState<ProjectFile | null>(null);
    const [search, setSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 100;
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [statusFilter, setStatusFilter] = useState<Status | 'ALL' | 'OVERDUE'>('ALL');

    // Preferências de visualização persistidas entre sessões
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        try {
            const v = localStorage.getItem(LS_VIEW_MODE);
            if (v === 'GROUPED' || v === 'FLAT' || v === 'PENDING') return v;
        } catch { }
        return 'GROUPED';
    });
    const [compact, setCompact] = useState<boolean>(() => {
        try { return localStorage.getItem(LS_COMPACT) === '1'; } catch { }
        return false;
    });
    const [expandedDisciplines, setExpandedDisciplines] = useState<Set<Discipline>>(() => {
        try {
            const saved = localStorage.getItem(LS_EXPANDED_DISCIPLINES);
            if (saved) return new Set(JSON.parse(saved) as Discipline[]);
        } catch { }
        return new Set();
    });

    useEffect(() => { try { localStorage.setItem(LS_VIEW_MODE, viewMode); } catch { } }, [viewMode]);
    useEffect(() => { try { localStorage.setItem(LS_COMPACT, compact ? '1' : '0'); } catch { } }, [compact]);
    useEffect(() => { try { localStorage.setItem(LS_EXPANDED_DISCIPLINES, JSON.stringify([...expandedDisciplines])); } catch { } }, [expandedDisciplines]);

    // Seleção múltipla para ações em lote
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [pendingBatch, setPendingBatch] = useState<{ action: BatchAction; date: string; period: Period } | null>(null);

    const [clientsList, setClientsList] = useState<{ id: string, name: string }[]>([]);
    const [clientsMap, setClientsMap] = useState<Record<string, any>>({});

    useEffect(() => {
        const unsub = subscribeToClients((data) => {
            setClientsList(data.map(c => ({ id: c.id, name: c.name })));

            const map: Record<string, any> = {};
            data.forEach(c => {
                map[c.name] = c;
            });
            setClientsMap(map);
        });
        return () => unsub();
    }, []);

    // Determina se um projeto está atrasado em relação ao prazo (SLA) da obra
    const isProjectOverdue = (project: ProjectFile): boolean => {
        const clientData = clientsMap[project.client];
        const contractDate = clientData?.contractDate;
        const deadlineDays = clientData?.deadlineDays;
        const obraCompleted = !!clientData?.completedAt;
        if (!contractDate || deadlineDays === undefined || obraCompleted) return false;
        const deadlineDate = calculateDeadlineDate(contractDate, deadlineDays);
        if (!deadlineDate) return false;
        const deadlineStr = format(deadlineDate, 'yyyy-MM-dd');
        if (project.endDate && project.status !== Status.REVISED) {
            return project.endDate > deadlineStr;
        }
        if (project.status !== Status.DONE && project.status !== Status.WAITING_APPROVAL && project.status !== Status.APPROVED && project.status !== Status.REVISED) {
            return new Date().toISOString().split('T')[0] > deadlineStr;
        }
        return false;
    };

    // Contadores globais para os cards de resumo (independentes do filtro ativo)
    const summaryCounts = useMemo(() => {
        const counts = { total: projects.length, inProgress: 0, done: 0, waiting: 0, approved: 0, rejected: 0, overdue: 0 };
        projects.forEach(p => {
            if (p.status === Status.IN_PROGRESS) counts.inProgress++;
            else if (p.status === Status.DONE) counts.done++;
            else if (p.status === Status.WAITING_APPROVAL) counts.waiting++;
            else if (p.status === Status.APPROVED) counts.approved++;
            else if (p.status === Status.REJECTED) counts.rejected++;
            if (isProjectOverdue(p)) counts.overdue++;
        });
        return counts;
    }, [projects, clientsMap]);

    const [pendingCompletion, setPendingCompletion] = useState<{ id: string, date: string, period: Period } | null>(null);
    const [pendingSend, setPendingSend] = useState<{ id: string, date: string, period: Period } | null>(null);
    const [pendingApproval, setPendingApproval] = useState<{ id: string, date: string, period: Period } | null>(null);
    const [pendingRejection, setPendingRejection] = useState<{ id: string, date: string, period: Period } | null>(null);

    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'filename', direction: 'asc', });
    const [revReason, setRevReason] = useState<RevisionReason>(RevisionReason.CLIENT_REQUEST);
    const [revComment, setRevComment] = useState('');
    const [editingRevision, setEditingRevision] = useState<{ fileId: string; revisionId: string; reason: RevisionReason; comment: string; revisionNumber?: number } | null>(null);

    // Computa o Mapa de Existência de Executivos
    // A chave é: Cliente + Disciplina + NomeBaseLimpo (sem _EXEC)
    const executiveExistenceMap = useMemo(() => {
        const map = new Set<string>();
        projects.forEach(p => {
            if (p.phase === ProjectPhase.EXECUTIVE) {
                const baseName = p.groupId || getProjectBaseName(p.filename).replace(/_EXEC/gi, '').replace(/\s*\[R\d+\]/gi, '').trim().toLowerCase();
                const key = `${p.client}|${p.discipline}|${baseName}`;
                map.add(key);
            }
        });
        return map;
    }, [projects]);

    // Build grouped project data
    const projectGroups = useMemo((): ProjectGroup[] => {
        const term = normalizeText(search);
        const filtered = projects.filter(p => {
            const matchesSearch = normalizeText(p.filename).includes(term) || normalizeText(p.client).includes(term) || normalizeText(p.discipline).includes(term) || (p.base && normalizeText(p.base).includes(term));
            if (!matchesSearch) return false;
            if (statusFilter === 'ALL') return true;
            if (statusFilter === 'OVERDUE') return isProjectOverdue(p);
            return p.status === statusFilter;
        });
        const rawGroups: Record<string, ProjectFile[]> = {};
        filtered.forEach(p => {
            const baseName = p.groupId || getProjectBaseName(p.filename).toLowerCase();
            const phase = p.phase || ProjectPhase.PRELIMINARY;
            const groupKey = `${baseName}|${phase}`;
            if (!rawGroups[groupKey]) { rawGroups[groupKey] = []; }
            rawGroups[groupKey].push(p);
        });
        Object.values(rawGroups).forEach(group => {
            group.sort((a, b) => {
                const revA = a.revision !== undefined ? a.revision : getRevisionNumber(a.filename);
                const revB = b.revision !== undefined ? b.revision : getRevisionNumber(b.filename);
                return revA - revB;
            });
        });
        const sortedRawGroups = Object.values(rawGroups).sort((groupA, groupB) => {
            const fileA = groupA[0]; const fileB = groupB[0];
            let valA = fileA[sortConfig.key]; let valB = fileB[sortConfig.key];
            if (typeof valA === 'string') valA = valA.toLowerCase(); if (typeof valB === 'string') valB = valB.toLowerCase();
            if (sortConfig.key === 'blockedDays') { valA = fileA.blockedDays || 0; valB = fileB.blockedDays || 0; }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1; if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1; return 0;
        });
        return sortedRawGroups.map(group => {
            const latest = group[group.length - 1];
            const children = group.slice(0, group.length - 1);
            const baseName = latest.groupId || getProjectBaseName(latest.filename).toLowerCase();
            const phase = latest.phase || ProjectPhase.PRELIMINARY;
            const groupKey = `${baseName}|${phase}`;
            return { baseName: groupKey, discipline: latest.discipline, latestProject: latest, children, allProjects: group };
        });
    }, [projects, sortConfig, search, statusFilter, clientsMap]);

    const disciplineGroups = useMemo((): DisciplineGroup[] => {
        const disciplineMap: Partial<Record<Discipline, Partial<Record<ProjectPhase, ProjectGroup[]>>>> = {};

        projectGroups.forEach(pg => {
            const phase = pg.latestProject.phase || ProjectPhase.PRELIMINARY;
            if (!disciplineMap[pg.discipline]) {
                disciplineMap[pg.discipline] = {};
            }
            if (!disciplineMap[pg.discipline]![phase]) {
                disciplineMap[pg.discipline]![phase] = [];
            }
            disciplineMap[pg.discipline]![phase]!.push(pg);
        });

        return Object.entries(disciplineMap).map(([discipline, phases]) => ({
            discipline: discipline as Discipline,
            phaseGroups: Object.entries(phases!).map(([phase, groups]) => ({
                phase: phase as ProjectPhase,
                groups: groups as ProjectGroup[]
            })).sort((a, b) => {
                // Executive first, then Preliminary
                if (a.phase === ProjectPhase.EXECUTIVE) return -1;
                if (b.phase === ProjectPhase.EXECUTIVE) return 1;
                return 0;
            })
        })).sort((a, b) => a.discipline.localeCompare(b.discipline));
    }, [projectGroups]);

    // Visão Pendências: agrupa pela PRÓXIMA AÇÃO necessária, na ordem da rotina diária
    const pendingBuckets = useMemo(() => {
        const buckets = {
            rejected: [] as ProjectGroup[],
            readyToSend: [] as ProjectGroup[],
            withClient: [] as ProjectGroup[],
            inProgress: [] as ProjectGroup[],
        };
        projectGroups.forEach(g => {
            const p = g.latestProject;
            if (p.status === Status.REJECTED) buckets.rejected.push(g);
            else if (p.status === Status.DONE) buckets.readyToSend.push(g);
            else if (p.status === Status.WAITING_APPROVAL) buckets.withClient.push(g);
            else if (p.status === Status.IN_PROGRESS) buckets.inProgress.push(g);
        });
        // Mais antigo primeiro = maior urgência
        buckets.rejected.sort((a, b) => (a.latestProject.feedbackDate || '').localeCompare(b.latestProject.feedbackDate || ''));
        buckets.readyToSend.sort((a, b) => (a.latestProject.endDate || '').localeCompare(b.latestProject.endDate || ''));
        buckets.withClient.sort((a, b) => (a.latestProject.sendDate || '').localeCompare(b.latestProject.sendDate || ''));
        buckets.inProgress.sort((a, b) => (a.latestProject.startDate || '').localeCompare(b.latestProject.startDate || ''));
        return buckets;
    }, [projectGroups]);

    const pendingTotal = pendingBuckets.rejected.length + pendingBuckets.readyToSend.length + pendingBuckets.withClient.length + pendingBuckets.inProgress.length;
    const noPendingCount = projectGroups.length - pendingTotal;

    // Flat list for compatibility with status counts and history
    const sortedProjects = useMemo(() => projectGroups.flatMap(g => g.allProjects), [projectGroups]);

    const toggleGroup = (baseName: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(baseName)) { next.delete(baseName); } else { next.add(baseName); }
            return next;
        });
    };

    const toggleDiscipline = (discipline: Discipline) => {
        setExpandedDisciplines(prev => {
            const next = new Set(prev);
            if (next.has(discipline)) { next.delete(discipline); } else { next.add(discipline); }
            return next;
        });
    };

    const allDisciplinesExpanded = expandedDisciplines.size > 0;
    const toggleAllDisciplines = () => {
        if (allDisciplinesExpanded) {
            setExpandedDisciplines(new Set());
        } else {
            setExpandedDisciplines(new Set(disciplineGroups.map(d => d.discipline)));
        }
    };

    // Pagination (counts groups, not individual rows) — não se aplica à visão Pendências
    const totalPages = Math.max(1, Math.ceil(projectGroups.length / ITEMS_PER_PAGE));
    const paginatedGroups = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return projectGroups.slice(start, start + ITEMS_PER_PAGE);
    }, [projectGroups, currentPage, ITEMS_PER_PAGE]);

    // Reset page when search/filter changes
    useEffect(() => { setCurrentPage(1); }, [search, projects, statusFilter, viewMode]);

    // Limpa seleção ao mudar contexto para evitar ações em itens fora da tela
    useEffect(() => { setSelectedIds(new Set()); }, [search, statusFilter, viewMode]);

    // --- Seleção múltipla / lote ---
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    };

    const visibleLatestIds = useMemo(() => {
        if (viewMode === 'PENDING') {
            return [...pendingBuckets.rejected, ...pendingBuckets.readyToSend, ...pendingBuckets.withClient, ...pendingBuckets.inProgress].map(g => g.latestProject.id);
        }
        return paginatedGroups.map(g => g.latestProject.id);
    }, [viewMode, paginatedGroups, pendingBuckets]);

    const allVisibleSelected = visibleLatestIds.length > 0 && visibleLatestIds.every(id => selectedIds.has(id));
    const toggleSelectAll = () => {
        setSelectedIds(allVisibleSelected ? new Set() : new Set(visibleLatestIds));
    };

    const selectedProjects = useMemo(() => projects.filter(p => selectedIds.has(p.id)), [projects, selectedIds]);
    const eligibleCounts = useMemo(() => ({
        COMPLETE: selectedProjects.filter(p => canTransitionTo(p.status, 'COMPLETE')).length,
        SEND: selectedProjects.filter(p => canTransitionTo(p.status, 'SEND')).length,
        APPROVE: selectedProjects.filter(p => canTransitionTo(p.status, 'APPROVE')).length,
        REJECT: selectedProjects.filter(p => canTransitionTo(p.status, 'REJECT')).length,
    }), [selectedProjects]);

    const openBatchModal = (action: BatchAction) => {
        const today = new Date().toISOString().split('T')[0];
        const currentPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';
        setPendingBatch({ action, date: today, period: currentPeriod });
    };

    const handleConfirmBatch = () => {
        if (!pendingBatch) return;
        const { action, date, period } = pendingBatch;
        let done = 0, skipped = 0;
        selectedProjects.forEach(project => {
            if (!canTransitionTo(project.status, action)) { skipped++; return; }
            const updated = { ...project };
            if (action === 'COMPLETE') {
                if (project.startDate && date < project.startDate) { skipped++; return; }
                updated.status = Status.DONE; updated.endDate = date; updated.endPeriod = period;
            } else if (action === 'SEND') {
                if (project.endDate && date < project.endDate) { skipped++; return; }
                updated.status = Status.WAITING_APPROVAL; updated.sendDate = date; updated.sendPeriod = period;
            } else {
                if (project.sendDate && date < project.sendDate) { skipped++; return; }
                if (project.sendDate) {
                    updated.blockedDays = calculateBusinessDaysWithHolidays(parseISO(project.sendDate), parseISO(date), holidays, project.sendPeriod || 'MANHA', period);
                }
                updated.status = action === 'APPROVE' ? Status.APPROVED : Status.REJECTED;
                updated.feedbackDate = date; updated.feedbackPeriod = period;
            }
            onUpdate(updated);
            done++;
        });
        setPendingBatch(null);
        setSelectedIds(new Set());
        if (skipped > 0) {
            alert(`${done} projeto(s) atualizado(s). ${skipped} ignorado(s) por status ou data incompatível com a ação.`);
        }
    };

    const projectHistory = useMemo(() => { if (!viewHistoryProject) return []; const baseName = getProjectBaseName(viewHistoryProject.filename); const lineage = projects.filter(p => getProjectBaseName(p.filename) === baseName); const historyEvents = lineage.flatMap(p => { const revNum = p.revision !== undefined ? p.revision : getRevisionNumber(p.filename); return p.revisions.map(rev => ({ ...rev, fileId: p.id, filename: p.filename, revisionNumber: revNum })); }); return historyEvents.sort((a, b) => b.revisionNumber - a.revisionNumber); }, [viewHistoryProject, projects]);
    const detailsHistory = useMemo(() => { if (!detailsProject) return []; const baseName = getProjectBaseName(detailsProject.filename); const lineage = projects.filter(p => getProjectBaseName(p.filename) === baseName); const historyEvents = lineage.flatMap(p => { const revNum = p.revision !== undefined ? p.revision : getRevisionNumber(p.filename); return p.revisions.map(rev => ({ ...rev, fileId: p.id, filename: p.filename, revisionNumber: revNum })); }); return historyEvents.sort((a, b) => b.revisionNumber - a.revisionNumber); }, [detailsProject, projects]);

    const handleSort = (key: SortKey) => { setSortConfig(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc', })); };
    const handleRevisionSubmit = () => { if (activeRevModal) { onAddRevision(activeRevModal, revReason, revComment); setActiveRevModal(null); setRevComment(''); } };
    const handleConfirmCompletion = () => { if (!pendingCompletion) return; const project = projects.find(p => p.id === pendingCompletion.id); if (project) { if (project.startDate && pendingCompletion.date < project.startDate) { alert("A Data de Fim não pode ser anterior à Data de Início."); return; } onUpdate({ ...project, status: Status.DONE, endDate: pendingCompletion.date, endPeriod: pendingCompletion.period }); } setPendingCompletion(null); };
    const handleConfirmSend = () => { if (!pendingSend) return; const project = projects.find(p => p.id === pendingSend.id); if (project) { if (project.endDate && pendingSend.date < project.endDate) { alert("A Data de Envio não pode ser anterior à Data de Conclusão da execução."); return; } onUpdate({ ...project, status: Status.WAITING_APPROVAL, sendDate: pendingSend.date, sendPeriod: pendingSend.period }); } setPendingSend(null); };
    const handleConfirmApproval = () => { if (!pendingApproval) return; const project = projects.find(p => p.id === pendingApproval.id); if (project) { if (project.sendDate && pendingApproval.date < project.sendDate) { alert(`Data Inválida.`); return; } let blockedDays = project.blockedDays; if (project.sendDate) { const send = parseISO(project.sendDate); const approval = parseISO(pendingApproval.date); blockedDays = calculateBusinessDaysWithHolidays(send, approval, holidays, project.sendPeriod || 'MANHA', pendingApproval.period); } onUpdate({ ...project, status: Status.APPROVED, feedbackDate: pendingApproval.date, feedbackPeriod: pendingApproval.period, blockedDays: blockedDays }); } setPendingApproval(null); };
    const handleConfirmRejection = () => { if (!pendingRejection) return; const project = projects.find(p => p.id === pendingRejection.id); if (project) { if (project.sendDate && pendingRejection.date < project.sendDate) { alert(`Data Inválida.`); return; } let blockedDays = project.blockedDays; if (project.sendDate) { const send = parseISO(project.sendDate); const rejection = parseISO(pendingRejection.date); blockedDays = calculateBusinessDaysWithHolidays(send, rejection, holidays, project.sendPeriod || 'MANHA', pendingRejection.period); } onUpdate({ ...project, status: Status.REJECTED, feedbackDate: pendingRejection.date, feedbackPeriod: pendingRejection.period, blockedDays: blockedDays }); } setPendingRejection(null); }
    const handleConfirmDelete = () => { if (projectToDelete) { onDelete(projectToDelete.id); setProjectToDelete(null); } };

    const handleSaveEdit = () => { if (editingProject) { onUpdate(editingProject); setEditingProject(null); } };

    const handleSaveRevisionEdit = () => {
        if (!editingRevision) return;
        const project = projects.find(p => p.id === editingRevision.fileId);
        if (project) {
            const updatedRevisions = project.revisions.map(rev =>
                rev.id === editingRevision.revisionId
                    ? { ...rev, reason: editingRevision.reason, comment: editingRevision.comment }
                    : rev
            );
            onUpdate({ ...project, revisions: updatedRevisions });
        }
        setEditingRevision(null);
    };

    const updateEditingField = (field: keyof ProjectFile, value: any) => {
        if (!editingProject) return;

        let updated = { ...editingProject, [field]: value };

        if (field === 'sendDate' || field === 'feedbackDate' || field === 'sendPeriod' || field === 'feedbackPeriod') {
            if (updated.sendDate && updated.feedbackDate) {
                const send = parseISO(updated.sendDate);
                const feedback = parseISO(updated.feedbackDate);
                if (isValid(send) && isValid(feedback) && feedback >= send) {
                    updated.blockedDays = calculateBusinessDaysWithHolidays(send, feedback, holidays, updated.sendPeriod || 'MANHA', updated.feedbackPeriod || 'TARDE');
                }
            }
        }

        updated.status = inferStatusFromDates(updated);

        if (field === 'status') {
            if ((value === Status.APPROVED || value === Status.REJECTED) && !updated.feedbackDate) {
                updated.status = value;
            }
        }

        setEditingProject(updated);
    };

    const handleAddPause = () => {
        if (!editingProject) return;
        const newPause = { id: Math.random().toString(36).substr(2, 9), startDate: new Date().toISOString().split('T')[0] };
        setEditingProject({
            ...editingProject,
            pauses: [...(editingProject.pauses || []), newPause]
        });
    };

    const handleUpdatePause = (pauseId: string, field: 'startDate' | 'endDate' | 'reason' | 'startPeriod' | 'endPeriod', value: string) => {
        if (!editingProject || !editingProject.pauses) return;
        const updatedPauses = editingProject.pauses.map(p =>
            p.id === pauseId ? { ...p, [field]: value } : p
        );
        setEditingProject({ ...editingProject, pauses: updatedPauses });
    };

    const handleRemovePause = (pauseId: string) => {
        if (!editingProject || !editingProject.pauses) return;
        setEditingProject({
            ...editingProject,
            pauses: editingProject.pauses.filter(p => p.id !== pauseId)
        });
    };

    const handleEndPause = (pauseId: string) => {
        if (!editingProject || !editingProject.pauses) return;
        const today = new Date().toISOString().split('T')[0];
        const updatedPauses = editingProject.pauses.map(p =>
            p.id === pauseId ? { ...p, endDate: today } : p
        );
        setEditingProject({ ...editingProject, pauses: updatedPauses });
    };

    const handleTogglePause = (projectToToggle: ProjectFile) => {
        const today = new Date().toISOString().split('T')[0];
        const newProject = { ...projectToToggle };
        const pauses = [...(newProject.pauses || [])];
        const activePauseIndex = pauses.findIndex(p => !p.endDate);

        if (activePauseIndex !== -1) {
            pauses[activePauseIndex] = { ...pauses[activePauseIndex], endDate: today };
        } else {
            pauses.push({ id: Math.random().toString(36).substr(2, 9), startDate: today });
        }
        newProject.pauses = pauses;
        if (onUpdate) onUpdate(newProject);
    };

    const SortIcon = ({ column }: { column: SortKey }) => { if (sortConfig.key !== column) return <ArrowUpDown size={12} className="ml-1 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />; return sortConfig.direction === 'asc' ? <ArrowUp size={12} className="ml-1 text-brand-600 dark:text-brand-400" /> : <ArrowDown size={12} className="ml-1 text-brand-600 dark:text-brand-400" />; };
    const renderHeader = (label: string, key: SortKey, className: string = "") => (<th className={`px-4 py-3 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors select-none ${className}`} onClick={() => handleSort(key)}> <div className={`flex items-center ${className.includes('text-right') ? 'justify-end' : className.includes('text-center') ? 'justify-center' : 'justify-start'}`}> {label} <SortIcon column={key} /> </div> </th>);

    const PeriodSelector = ({ value, onChange, disabled }: { value?: Period, onChange: (v: Period) => void, disabled?: boolean }) => (
        <select value={value || 'MANHA'} onChange={(e) => onChange(e.target.value as Period)} disabled={disabled} className="ml-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs px-1 py-1.5 focus:outline-none focus:border-brand-500 disabled:opacity-50">
            <option value="MANHA">Manhã</option>
            <option value="TARDE">Tarde</option>
        </select>
    );

    // Número de colunas visíveis (para colSpan das linhas de cabeçalho internas)
    const colCount = 8 + (compact ? 0 : 2) + (readOnly ? 0 : 2);

    // Props compartilhadas por todas as linhas
    const commonRowProps = {
        readOnly, compact,
        onToggleSelect: toggleSelect,
        setViewHistoryProject, setPendingCompletion, setPendingSend, setPendingApproval, setPendingRejection,
        setActiveRevModal, setDetailsProject, setEditingProject, setProjectToDelete,
        onPromote, onTogglePause: handleTogglePause,
        executiveExistenceMap, clientsMap,
    };

    // Renderiza um grupo: linha da última revisão + revisões antigas quando expandido
    const renderGroupRows = (group: ProjectGroup) => {
        const isExpanded = expandedGroups.has(group.baseName);
        const hasChildren = group.children.length > 0;
        return (
            <React.Fragment key={group.baseName}>
                <ProjectRow
                    project={group.latestProject}
                    isLatest={true}
                    isChildRow={false}
                    groupToggle={hasChildren ? { isExpanded, childCount: group.children.length, onToggle: () => toggleGroup(group.baseName) } : undefined}
                    groupEnd={!hasChildren || !isExpanded}
                    selectable={!readOnly}
                    selected={selectedIds.has(group.latestProject.id)}
                    {...commonRowProps}
                />
                {hasChildren && isExpanded && group.children.map((child, i) => (
                    <ProjectRow
                        key={child.id}
                        project={child}
                        isLatest={false}
                        isChildRow={true}
                        groupEnd={i === group.children.length - 1}
                        selectable={false}
                        selected={false}
                        {...commonRowProps}
                    />
                ))}
            </React.Fragment>
        );
    };

    if (projects.length === 0) { return (<div className="animate-in fade-in zoom-in-95 duration-200"> <div className="flex items-center justify-between mb-6"> <div> <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"> <List className="text-brand-600 dark:text-brand-400" /> Carteira de Projetos </h2> <p className="text-sm text-slate-500 dark:text-slate-400">Gerenciamento detalhado de arquivos, status, datas e revisões.</p> </div> </div> <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700"> <List className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /> <h3 className="text-lg text-slate-500 dark:text-slate-400">Nenhum projeto cadastrado</h3> <p className="text-sm text-slate-400 dark:text-slate-500">Importe arquivos ou adicione manualmente.</p> </div> </div>); }

    const pendingSections: { key: keyof typeof pendingBuckets; label: string; hint: string; dotClass: string }[] = [
        { key: 'rejected', label: 'Reprovados — Gerar Revisão', hint: 'Corrija e gere uma nova versão', dotClass: 'bg-rose-500' },
        { key: 'readyToSend', label: 'Prontos para Enviar', hint: 'Execução concluída, aguardando envio ao cliente', dotClass: 'bg-violet-500' },
        { key: 'withClient', label: 'Com o Cliente — Aguardando Retorno', hint: 'Mais antigos primeiro: cobre o retorno', dotClass: 'bg-amber-500' },
        { key: 'inProgress', label: 'Em Execução', hint: 'Conclua quando o desenho for finalizado', dotClass: 'bg-brand-500' },
    ];

    return (
        <div className="animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <List className="text-brand-600 dark:text-brand-400" />
                        Carteira de Projetos
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Gerenciamento detalhado de arquivos, status, datas e revisões.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors duration-200">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-700/30 space-y-3">
                    {/* Cards de resumo — clicáveis para filtrar por status */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        <SummaryCard color="slate" icon={<List size={16} />} label="Todos" value={summaryCounts.total} active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
                        <SummaryCard color="blue" icon={<Play size={16} />} label="Em andamento" value={summaryCounts.inProgress} active={statusFilter === Status.IN_PROGRESS} onClick={() => setStatusFilter(prev => prev === Status.IN_PROGRESS ? 'ALL' : Status.IN_PROGRESS)} />
                        <SummaryCard color="amber" icon={<Send size={16} />} label="Aguardando" value={summaryCounts.waiting} active={statusFilter === Status.WAITING_APPROVAL} onClick={() => setStatusFilter(prev => prev === Status.WAITING_APPROVAL ? 'ALL' : Status.WAITING_APPROVAL)} />
                        <SummaryCard color="emerald" icon={<BadgeCheck size={16} />} label="Aprovados" value={summaryCounts.approved} active={statusFilter === Status.APPROVED} onClick={() => setStatusFilter(prev => prev === Status.APPROVED ? 'ALL' : Status.APPROVED)} />
                        <SummaryCard color="rose" icon={<ThumbsDown size={16} />} label="Reprovados" value={summaryCounts.rejected} active={statusFilter === Status.REJECTED} onClick={() => setStatusFilter(prev => prev === Status.REJECTED ? 'ALL' : Status.REJECTED)} />
                        <SummaryCard color="red" icon={<AlertTriangle size={16} />} label="Atrasados" value={summaryCounts.overdue} active={statusFilter === 'OVERDUE'} onClick={() => setStatusFilter(prev => prev === 'OVERDUE' ? 'ALL' : 'OVERDUE')} />
                    </div>

                    {/* Busca + controles */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[200px] max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input type="text" placeholder="Buscar por cliente, arquivo ou disciplina..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all duration-150" />
                        </div>

                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{sortedProjects.length} registros ({projectGroups.length} projetos)</span>

                        {statusFilter !== 'ALL' && (
                            <button onClick={() => setStatusFilter('ALL')} className="flex items-center gap-1 text-[11px] font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 px-2 py-1 rounded-full hover:bg-brand-100 transition-colors">
                                <X size={12} /> Limpar filtro
                            </button>
                        )}

                        <div className="ml-auto flex items-center gap-2">
                            {/* Seletor de visão */}
                            <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                <ViewModeButton active={viewMode === 'GROUPED'} onClick={() => setViewMode('GROUPED')} icon={<ListTree size={14} />} label="Agrupado" />
                                <ViewModeButton active={viewMode === 'FLAT'} onClick={() => setViewMode('FLAT')} icon={<LayoutList size={14} />} label="Lista" />
                                <ViewModeButton active={viewMode === 'PENDING'} onClick={() => setViewMode('PENDING')} icon={<ClipboardList size={14} />} label="Pendências" badge={pendingTotal > 0 ? pendingTotal : undefined} />
                            </div>

                            <button onClick={() => setCompact(!compact)} title={compact ? "Mostrar todas as colunas" : "Ocultar colunas secundárias (Base, Bloq.)"} className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors ${compact ? 'text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 border-brand-200 dark:border-brand-800' : 'text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:border-brand-300'}`}>
                                {compact ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                                {compact ? 'Completo' : 'Compacto'}
                            </button>

                            {viewMode === 'GROUPED' && (
                                <button onClick={toggleAllDisciplines} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-2.5 py-1.5 rounded-lg hover:border-brand-300 transition-colors">
                                    {allDisciplinesExpanded ? <><ChevronRight size={14} /> Recolher tudo</> : <><ChevronDown size={14} /> Expandir tudo</>}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Barra de ações em lote */}
                    {!readOnly && selectedIds.size > 0 && (
                        <div className="flex flex-wrap items-center gap-2 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 rounded-lg px-3 py-2 animate-in fade-in slide-in-from-top-1 duration-150">
                            <span className="text-xs font-bold text-brand-700 dark:text-brand-400">{selectedIds.size} selecionado(s)</span>
                            <div className="w-px h-5 bg-brand-200 dark:bg-brand-800"></div>
                            <BatchButton label="Concluir" count={eligibleCounts.COMPLETE} onClick={() => openBatchModal('COMPLETE')} className="bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800" icon={<CheckSquare size={13} />} />
                            <BatchButton label="Enviar" count={eligibleCounts.SEND} onClick={() => openBatchModal('SEND')} className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800" icon={<Send size={13} />} />
                            <BatchButton label="Aprovar" count={eligibleCounts.APPROVE} onClick={() => openBatchModal('APPROVE')} className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800" icon={<BadgeCheck size={13} />} />
                            <BatchButton label="Reprovar" count={eligibleCounts.REJECT} onClick={() => openBatchModal('REJECT')} className="bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800" icon={<ThumbsDown size={13} />} />
                            <button onClick={() => setSelectedIds(new Set())} className="ml-auto flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1 rounded transition-colors">
                                <X size={12} /> Limpar seleção
                            </button>
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="text-[11px] text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
                            <tr>
                                {!readOnly && (
                                    <th className="px-2 py-2.5 w-8 text-center">
                                        <input
                                            type="checkbox"
                                            checked={allVisibleSelected}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 accent-brand-600 cursor-pointer"
                                            aria-label="Selecionar todos os visíveis"
                                            title="Selecionar todos os visíveis"
                                        />
                                    </th>
                                )}
                                {renderHeader("Arquivo / Fase", "filename", "min-w-[280px]")}
                                {renderHeader("Cliente", "client", "min-w-[120px]")}
                                {!compact && renderHeader("Base", "base", "min-w-[80px]")}
                                {renderHeader("Disciplina", "discipline")}
                                {renderHeader("Status", "status")}
                                <th className="px-3 py-2.5 text-center">Prazo</th>
                                {renderHeader("Execução", "startDate", "border-l border-slate-200/60 dark:border-slate-700/50")}
                                {renderHeader("Aprovação", "sendDate", "border-l border-brand-100/60 dark:border-brand-900/20 bg-brand-50/20 dark:bg-brand-900/5")}
                                {!compact && renderHeader("Bloq.", "blockedDays", "w-16 text-center")}
                                {!readOnly && <th className="px-3 py-2.5 text-center">Ações</th>}
                                <th className="px-3 py-2.5 text-right">{readOnly ? 'Detalhes' : 'Det./Edit.'}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {/* ===== VISÃO AGRUPADA (Disciplina > Fase > Grupo) ===== */}
                            {viewMode === 'GROUPED' && disciplineGroups.map((dg) => {
                                // Durante a busca ou com filtro de status ativo, expande automaticamente para revelar os resultados
                                const isDisciplineExpanded = expandedDisciplines.has(dg.discipline) || !!search.trim() || statusFilter !== 'ALL';
                                const hasProjectsInPage = dg.phaseGroups.some(pg =>
                                    pg.groups.some(g => paginatedGroups.includes(g))
                                );

                                if (!hasProjectsInPage) return null;

                                return (
                                    <React.Fragment key={dg.discipline}>
                                        {/* Discipline Header Row */}
                                        <tr className="bg-slate-100/80 dark:bg-slate-900/40 border-y border-slate-200 dark:border-slate-700">
                                            <td colSpan={colCount} className="px-3 py-2">
                                                <button
                                                    onClick={() => toggleDiscipline(dg.discipline)}
                                                    className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider hover:text-brand-600 transition-colors"
                                                >
                                                    {isDisciplineExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                    {dg.discipline}
                                                    <span className="ml-1 text-[10px] font-medium text-slate-400 normal-case">
                                                        ({dg.phaseGroups.reduce((acc, pg) => acc + pg.groups.length, 0)} projetos)
                                                    </span>
                                                </button>
                                            </td>
                                        </tr>

                                        {isDisciplineExpanded && dg.phaseGroups.map((pg) => {
                                            const paginatedGroupsInPhase = pg.groups.filter(g => paginatedGroups.includes(g));
                                            if (paginatedGroupsInPhase.length === 0) return null;

                                            return (
                                                <React.Fragment key={pg.phase}>
                                                    {/* Phase Sub-header Row */}
                                                    <tr>
                                                        <td colSpan={colCount} className="px-8 py-1.5 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-700/50">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`w-1.5 h-1.5 rounded-full ${pg.phase === ProjectPhase.EXECUTIVE ? 'bg-violet-500' : 'bg-amber-500'}`} />
                                                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                                                    {pg.phase} ({paginatedGroupsInPhase.length})
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>

                                                    {paginatedGroupsInPhase.map(renderGroupRows)}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}

                            {/* ===== VISÃO LISTA (plana, apenas última revisão de cada projeto) ===== */}
                            {viewMode === 'FLAT' && paginatedGroups.map(renderGroupRows)}

                            {/* ===== VISÃO PENDÊNCIAS (agrupada pela próxima ação) ===== */}
                            {viewMode === 'PENDING' && (
                                <>
                                    {pendingSections.map(sec => {
                                        const groups = pendingBuckets[sec.key];
                                        if (groups.length === 0) return null;
                                        return (
                                            <React.Fragment key={sec.key}>
                                                <tr className="bg-slate-100/80 dark:bg-slate-900/40 border-y border-slate-200 dark:border-slate-700">
                                                    <td colSpan={colCount} className="px-3 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`w-2 h-2 rounded-full ${sec.dotClass}`} />
                                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{sec.label}</span>
                                                            <span className="text-[10px] font-medium text-slate-400 normal-case">({groups.length})</span>
                                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 italic normal-case hidden sm:inline">— {sec.hint}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {groups.map(renderGroupRows)}
                                            </React.Fragment>
                                        );
                                    })}
                                    {pendingTotal === 0 && (
                                        <tr>
                                            <td colSpan={colCount} className="px-6 py-14 text-center">
                                                <CheckCircle2 size={36} className="mx-auto text-emerald-400 mb-3" />
                                                <p className="text-slate-600 dark:text-slate-300 font-semibold">Nenhuma pendência!</p>
                                                <p className="text-sm text-slate-400 dark:text-slate-500">Todos os projetos filtrados estão aprovados ou revisados.</p>
                                            </td>
                                        </tr>
                                    )}
                                    {pendingTotal > 0 && noPendingCount > 0 && (
                                        <tr>
                                            <td colSpan={colCount} className="px-6 py-3 text-center text-xs text-slate-400 dark:text-slate-500 italic bg-slate-50/50 dark:bg-slate-800/30">
                                                + {noPendingCount} projeto(s) sem pendência (aprovados ou revisados) — use a visão "Lista" ou "Agrupado" para vê-los.
                                            </td>
                                        </tr>
                                    )}
                                </>
                            )}

                            {viewMode !== 'PENDING' && paginatedGroups.length === 0 && (<tr><td colSpan={colCount} className="px-6 py-10 text-center text-slate-400 italic">Nenhum registro encontrado.</td></tr>)}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                {viewMode !== 'PENDING' && totalPages > 1 && (
                    <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/20 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, projectGroups.length)} de {projectGroups.length} projetos
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                            >
                                ← Anterior
                            </button>
                            <span className="px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                {currentPage} / {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                            >
                                Próximo →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingProject && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full p-6 border dark:border-slate-700 flex flex-col max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-700 pb-4">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Edit2 size={20} className="text-brand-600" />Editar Projeto</h3>
                            <button onClick={() => setEditingProject(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar"><X size={24} /></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2"><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do Arquivo</label><input type="text" value={editingProject.filename} onChange={(e) => updateEditingField('filename', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2" /></div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cliente</label>
                                <select value={editingProject.client} onChange={(e) => updateEditingField('client', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2">
                                    <option value={editingProject.client}>{editingProject.client} (Atual)</option>
                                    {clientsList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Base / Setor</label><input type="text" value={editingProject.base} onChange={(e) => updateEditingField('base', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2" /></div>
                            <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Disciplina</label><select value={editingProject.discipline} onChange={(e) => updateEditingField('discipline', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2">{Object.values(Discipline).map(d => <option key={d} value={d}>{d}</option>)}</select></div>
                            <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fase (Etapa)</label><select value={editingProject.phase || ProjectPhase.EXECUTIVE} onChange={(e) => updateEditingField('phase', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2">{Object.values(ProjectPhase).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                            <div><label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status <span className="text-xs font-normal text-slate-400 ml-1">(Calculado automaticamente)</span></label><select value={editingProject.status} onChange={(e) => updateEditingField('status', e.target.value)} disabled={!editingProject.feedbackDate} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg px-3 py-2 cursor-not-allowed disabled:opacity-70">{Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}</select>{!editingProject.feedbackDate && <p className="text-xs text-brand-600 mt-1">Status bloqueado. Preencha as datas para avançar etapas.</p>}{editingProject.feedbackDate && <p className="text-xs text-emerald-600 mt-1">Desbloqueado: Você pode alternar entre Aprovado e Reprovado.</p>}</div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Início</label>
                                <div className="flex">
                                    <input type="date" value={editingProject.startDate} onChange={(e) => updateEditingField('startDate', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" />
                                    <PeriodSelector value={editingProject.startPeriod} onChange={(v) => updateEditingField('startPeriod', v)} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Fim (Execução)</label>
                                <div className="flex">
                                    <input type="date" value={editingProject.endDate} onChange={(e) => updateEditingField('endDate', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" />
                                    <PeriodSelector value={editingProject.endPeriod} onChange={(v) => updateEditingField('endPeriod', v)} />
                                </div>
                            </div>
                            <div className="md:col-span-2 bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mt-2">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wide">Pausas de Execução</span>
                                    <button onClick={handleAddPause} className="px-3 py-1 bg-brand-100 text-brand-700 hover:bg-brand-200 dark:bg-brand-900/30 dark:text-brand-400 rounded text-xs font-semibold transition-colors flex items-center gap-1">
                                        + Adicionar Pausa
                                    </button>
                                </div>

                                {(!editingProject.pauses || editingProject.pauses.length === 0) ? (
                                    <p className="text-sm text-slate-500 italic text-center py-2">Nenhuma pausa registrada.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {editingProject.pauses.map((pause, idx) => (
                                            <div key={pause.id} className="grid grid-cols-12 gap-3 items-center bg-white dark:bg-slate-800 p-2.5 rounded border border-slate-200 dark:border-slate-600">
                                                <div className="col-span-1 text-center font-bold text-slate-400 text-xs">#{idx + 1}</div>
                                                <div className="col-span-4">
                                                    <label className="block text-[10px] text-slate-500 uppercase mb-0.5">Início</label>
                                                    <div className="flex">
                                                        <input type="date" value={pause.startDate} onChange={(e) => handleUpdatePause(pause.id, 'startDate', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l px-2 py-1 text-xs dark:[color-scheme:dark]" />
                                                        <PeriodSelector value={pause.startPeriod} onChange={(v) => handleUpdatePause(pause.id, 'startPeriod', v)} />
                                                    </div>
                                                </div>
                                                <div className="col-span-4">
                                                    <label className="block text-[10px] text-slate-500 uppercase mb-0.5">Retomada</label>
                                                    {pause.endDate !== undefined ? (
                                                        <div className="flex">
                                                            <input type="date" value={pause.endDate} onChange={(e) => handleUpdatePause(pause.id, 'endDate', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l px-2 py-1 text-xs dark:[color-scheme:dark]" />
                                                            <PeriodSelector value={pause.endPeriod} onChange={(v) => handleUpdatePause(pause.id, 'endPeriod', v)} />
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => handleEndPause(pause.id)} className="w-full bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs py-1 rounded border border-emerald-200 transition-colors font-medium">
                                                            Registrar Retomada
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="col-span-2">
                                                    <label className="block text-[10px] text-slate-500 uppercase mb-0.5">Motivo</label>
                                                    <input type="text" value={pause.reason || ''} onChange={(e) => handleUpdatePause(pause.id, 'reason', e.target.value)} placeholder="Opcional..." className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded px-2 py-1 text-xs" />
                                                </div>
                                                <div className="col-span-1 flex justify-end">
                                                    <button onClick={() => handleRemovePause(pause.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded" aria-label="Remover Pausa"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="md:col-span-2 grid grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mt-2">
                                <div className="col-span-3 mb-1"><span className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wide">Controle de Aprovação / Feedback</span></div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Envio</label>
                                    <div className="flex">
                                        <input type="date" value={editingProject.sendDate} onChange={(e) => updateEditingField('sendDate', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-l px-2 py-1.5 text-sm dark:[color-scheme:dark]" />
                                        <PeriodSelector value={editingProject.sendPeriod} onChange={(v) => updateEditingField('sendPeriod', v)} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Feedback</label>
                                    <div className="flex">
                                        <input type="date" value={editingProject.feedbackDate} onChange={(e) => updateEditingField('feedbackDate', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-l px-2 py-1.5 text-sm dark:[color-scheme:dark]" />
                                        <PeriodSelector value={editingProject.feedbackPeriod} onChange={(v) => updateEditingField('feedbackPeriod', v)} />
                                    </div>
                                </div>
                                <div><label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Dias Bloq.</label><input type="number" step="0.5" value={editingProject.blockedDays} onChange={(e) => updateEditingField('blockedDays', e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded px-2 py-1.5 text-sm" /></div>
                            </div>
                        </div>
                        <div className="mt-8 flex justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                            <button onClick={() => setEditingProject(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button>
                            <button onClick={handleSaveEdit} className="px-6 py-2 bg-brand-700 hover:bg-brand-800 text-white rounded-lg shadow-md font-medium flex items-center gap-2"><Save size={18} />Salvar Alterações</button>
                        </div>
                    </div>
                </div>
            )}

            {pendingCompletion && (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-violet-100 dark:bg-violet-900/30 p-2 rounded-full text-violet-600 dark:text-violet-400"><CheckSquare size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Concluir Execução</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Defina a data em que o desenho/projeto foi finalizado.</p><div className="flex mb-6"><input type="date" value={pendingCompletion.date} onChange={(e) => setPendingCompletion(prev => prev ? { ...prev, date: e.target.value } : null)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" /><PeriodSelector value={pendingCompletion.period} onChange={(v) => setPendingCompletion(prev => prev ? { ...prev, period: v } : null)} /></div><div className="flex justify-end space-x-3"><button onClick={() => setPendingCompletion(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmCompletion} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg shadow-md font-medium">Concluir</button></div></div></div>)}
            {pendingSend && (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full text-blue-600 dark:text-blue-400"><Send size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Registrar Envio</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Quando este projeto foi enviado para o cliente?</p><div className="flex mb-6"><input type="date" value={pendingSend.date} onChange={(e) => setPendingSend(prev => prev ? { ...prev, date: e.target.value } : null)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" /><PeriodSelector value={pendingSend.period} onChange={(v) => setPendingSend(prev => prev ? { ...prev, period: v } : null)} /></div><div className="flex justify-end space-x-3"><button onClick={() => setPendingSend(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmSend} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md font-medium">Confirmar Envio</button></div></div></div>)}
            {pendingApproval && (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-full text-emerald-600 dark:text-emerald-400"><BadgeCheck size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Registrar Aprovação</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4">O projeto foi aprovado. Confirme a data para calcular o tempo de feedback.</p><div className="flex mb-6"><input type="date" value={pendingApproval.date} onChange={(e) => setPendingApproval(prev => prev ? { ...prev, date: e.target.value } : null)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" /><PeriodSelector value={pendingApproval.period} onChange={(v) => setPendingApproval(prev => prev ? { ...prev, period: v } : null)} /></div><div className="flex justify-end space-x-3"><button onClick={() => setPendingApproval(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmApproval} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-md font-medium">Aprovar Projeto</button></div></div></div>)}
            {pendingRejection && (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-rose-100 dark:bg-rose-900/30 p-2 rounded-full text-rose-600 dark:text-rose-400"><ThumbsDown size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Registrar Reprovação</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4">O projeto foi reprovado? Registre a data do feedback.<br /><span className="text-xs text-rose-500 italic mt-1 block">O status mudará para Reprovado e a opção de Aprovação será removida.</span></p><div className="flex mb-6"><input type="date" value={pendingRejection.date} onChange={(e) => setPendingRejection(prev => prev ? { ...prev, date: e.target.value } : null)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" /><PeriodSelector value={pendingRejection.period} onChange={(v) => setPendingRejection(prev => prev ? { ...prev, period: v } : null)} /></div><div className="flex justify-end space-x-3"><button onClick={() => setPendingRejection(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmRejection} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-md font-medium">Reprovar</button></div></div></div>)}
            {activeRevModal && (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full text-amber-600 dark:text-amber-400"><GitBranch size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Gerar Nova Versão</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 p-3 rounded-lg border border-slate-100 dark:border-slate-700">Isso criará um novo registro (Ex: [R1]) para correção, reiniciando o ciclo de trabalho.</p><label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Motivo da Nova Versão</label><select value={revReason} onChange={(e) => setRevReason(e.target.value as RevisionReason)} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 mb-4">{Object.values(RevisionReason).map(r => <option key={r} value={r}>{r}</option>)}</select><label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Comentários</label><textarea value={revComment} onChange={(e) => setRevComment(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 mb-6 h-24 resize-none" placeholder="O que será corrigido?" /><div className="flex justify-end space-x-3"><button onClick={() => setActiveRevModal(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleRevisionSubmit} className="px-4 py-2 bg-brand-700 text-white rounded-lg hover:bg-brand-800 shadow-md">Gerar Nova Versão</button></div></div></div>)}
            {projectToDelete && (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-rose-100 dark:bg-rose-900/30 p-2 rounded-full text-rose-600 dark:text-rose-400"><AlertTriangle size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Excluir Registro</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Tem certeza que deseja excluir o arquivo <strong>{projectToDelete.filename}</strong>? Esta ação não pode ser desfeita.</p><div className="flex justify-end space-x-3"><button onClick={() => setProjectToDelete(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmDelete} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-md font-medium">Sim, Excluir</button></div></div></div>)}
            {viewHistoryProject && (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border dark:border-slate-700 flex flex-col max-h-[80vh]"><div className="flex justify-between items-start mb-4"><div><h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2"><History size={20} className="text-brand-600 dark:text-brand-400" />Linha do Tempo (Revisões)</h3><p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-all">Projeto: <span className="font-semibold">{getProjectBaseName(viewHistoryProject.filename)}</span></p></div><button onClick={() => setViewHistoryProject(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar Histórico"><span className="text-2xl leading-none">&times;</span></button></div><div className="flex-1 overflow-y-auto pr-2">{projectHistory.length === 0 ? (<p className="text-sm text-slate-500 italic p-4 text-center border border-dashed rounded-lg">Nenhuma revisão registrada no histórico deste arquivo.</p>) : (<div className="space-y-6 relative ml-2 pl-4 border-l-2 border-slate-200 dark:border-slate-700">{projectHistory.map((rev, idx) => (<div key={`${rev.fileId}-${idx}`} className="relative"><div className="absolute -left-[23px] top-1 h-3 w-3 rounded-full bg-brand-600 dark:bg-brand-500 ring-4 ring-white dark:ring-slate-800"></div><div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700"><div className="flex justify-between items-start mb-2"><div className="flex items-center space-x-2"><span className="text-xs font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600 px-2 py-0.5 rounded shadow-sm">R{rev.revisionNumber}</span><span className="text-xs text-slate-500 dark:text-slate-400">{formatDateDisplay(rev.date)}</span></div><div className="flex items-center gap-2"><span className="text-xs font-semibold text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded">{rev.reason}</span>{!readOnly && (<button onClick={() => setEditingRevision({ fileId: rev.fileId, revisionId: rev.id, reason: rev.reason, comment: rev.comment, revisionNumber: rev.revisionNumber })} className="p-1 text-slate-400 hover:text-blue-500 transition-colors" title="Editar Motivo"><Edit2 size={12} /></button>)}</div></div><p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{rev.comment}</p></div></div>))}</div>)}</div><div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end"><button onClick={() => setViewHistoryProject(null)} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors">Fechar</button></div></div></div>)}
            {detailsProject && (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full p-0 border dark:border-slate-700 flex flex-col max-h-[90vh] overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-start bg-slate-50 dark:bg-slate-700/30"><div><h3 className="text-2xl font-bold text-slate-800 dark:text-white break-all">{detailsProject.filename}</h3><div className="flex items-center space-x-2 mt-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(detailsProject.status)}`}>{detailsProject.status}</span><span className="text-xs text-slate-400 dark:text-slate-500">ID: {detailsProject.id}</span></div></div><button onClick={() => setDetailsProject(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" aria-label="Fechar Detalhes"><X size={28} /></button></div><div className="overflow-y-auto p-6 space-y-8"><div className="grid grid-cols-2 md:grid-cols-4 gap-6"><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Cliente</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{detailsProject.client}</span></div><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Base</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{detailsProject.base || '-'}</span></div><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Disciplina</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{detailsProject.discipline}</span></div><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Dias Bloqueados</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{detailsProject.blockedDays} dias</span></div><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Versão Atual</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">R{getRevisionNumber(detailsProject.filename)}</span></div><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Fase</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{detailsProject.phase || '-'}</span></div></div><div><h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Linha do Tempo</h4><div className="flex flex-col md:flex-row justify-between items-center md:items-start bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 relative overflow-hidden"><div className="hidden md:block absolute top-[45px] left-10 right-10 h-0.5 bg-slate-100 dark:bg-slate-700 z-0"></div><div className="relative z-10 flex flex-col items-center text-center w-full md:w-1/4 mb-4 md:mb-0"><div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 border-4 border-white dark:border-slate-800 flex items-center justify-center mb-2"><div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500"></div></div><span className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase mb-1">Início</span><span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatDateDisplay(detailsProject.startDate)}</span></div><div className="relative z-10 flex flex-col items-center text-center w-full md:w-1/4"><div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 border-4 border-white dark:border-slate-800 flex items-center justify-center mb-2"><div className={`w-2.5 h-2.5 rounded-full ${detailsProject.endDate ? 'bg-slate-800 dark:bg-slate-200' : 'bg-transparent border border-slate-400'}`}></div></div><span className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase mb-1">Fim Exec.</span><span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatDateDisplay(detailsProject.endDate)}</span></div><div className="relative z-10 flex flex-col items-center text-center w-full md:w-1/4 mb-4 md:mb-0"><div className="w-8 h-8 rounded-full bg-brand-50 dark:bg-brand-900/30 border-4 border-white dark:border-slate-800 flex items-center justify-center mb-2"><div className="w-2.5 h-2.5 rounded-full bg-brand-500"></div></div><span className="text-xs text-brand-600 dark:text-brand-400 font-medium uppercase mb-1">Envio</span><span className="text-sm font-bold text-brand-700 dark:text-brand-300">{formatDateDisplay(detailsProject.sendDate)}</span></div><div className="relative z-10 flex flex-col items-center text-center w-full md:w-1/4 mb-4 md:mb-0"><div className={`w-8 h-8 rounded-full border-4 border-white dark:border-slate-800 flex items-center justify-center mb-2 ${detailsProject.status === Status.REJECTED ? 'bg-rose-50 dark:bg-rose-900/30' : 'bg-emerald-50 dark:bg-emerald-900/30'}`}><div className={`w-2.5 h-2.5 rounded-full ${detailsProject.status === Status.REJECTED ? 'bg-rose-500' : 'bg-emerald-500'}`}></div></div><span className={`text-xs font-medium uppercase mb-1 ${detailsProject.status === Status.REJECTED ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{detailsProject.status === Status.REJECTED ? 'Reprovação' : 'Aprovação'}</span><span className={`text-sm font-bold ${detailsProject.status === Status.REJECTED ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{formatDateDisplay(detailsProject.feedbackDate)}</span></div></div></div><div><h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Histórico Completo de Revisões</h4>{detailsHistory.length === 0 ? (<div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50"><History size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" /><p className="text-slate-500 dark:text-slate-400">Este projeto ainda não possui revisões registradas.</p></div>) : (<div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"><table className="w-full text-sm text-left"><thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase text-xs border-b border-slate-200 dark:border-slate-700"><tr><th className="px-6 py-3">Rev</th><th className="px-6 py-3">Data</th><th className="px-6 py-3">Motivo</th><th className="px-6 py-3">Comentário</th><th className="px-6 py-3 text-right">Arquivo Origem</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700">{detailsHistory.map((rev, idx) => (<tr key={`${rev.fileId}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"><td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">R{rev.revisionNumber}</td><td className="px-6 py-4 text-slate-600 dark:text-slate-400">{formatDateDisplay(rev.date)}</td><td className="px-6 py-4"><div className="flex items-center gap-2"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-100 dark:bg-brand-900/30 text-brand-800 dark:text-brand-300">{rev.reason}</span>{!readOnly && (<button onClick={() => setEditingRevision({ fileId: rev.fileId, revisionId: rev.id, reason: rev.reason, comment: rev.comment, revisionNumber: rev.revisionNumber })} className="p-1 text-slate-400 hover:text-blue-500 transition-colors" title="Editar Motivo"><Edit2 size={12} /></button>)}</div></td><td className="px-6 py-4 text-slate-600 dark:text-slate-300 max-w-md whitespace-normal">{rev.comment}</td><td className="px-6 py-4 text-right text-xs text-slate-400 font-mono">{rev.filename}</td></tr>))}</tbody></table></div>)}</div></div><div className="p-6 bg-slate-50 dark:bg-slate-700/30 border-t border-slate-100 dark:border-slate-700 flex justify-end"><button onClick={() => setDetailsProject(null)} className="px-6 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">Fechar</button></div></div></div>)}

            {editingRevision && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 border dark:border-slate-700">
                        <div className="flex items-center space-x-3 mb-4">
                            <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full text-blue-600 dark:text-blue-400">
                                <Edit2 size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                                Editar Motivo da Revisão {editingRevision.revisionNumber !== undefined ? `R${editingRevision.revisionNumber}` : ''}
                            </h3>
                        </div>

                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Motivo da Revisão</label>
                        <select
                            value={editingRevision.reason}
                            onChange={(e) => setEditingRevision({ ...editingRevision, reason: e.target.value as RevisionReason })}
                            className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 mb-4"
                        >
                            {Object.values(RevisionReason).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>

                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Comentários</label>
                        <textarea
                            value={editingRevision.comment}
                            onChange={(e) => setEditingRevision({ ...editingRevision, comment: e.target.value })}
                            className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 mb-6 h-24 resize-none"
                            placeholder="Descreva o que foi alterado..."
                        />

                        <div className="flex justify-end space-x-3">
                            <button onClick={() => setEditingRevision(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                                Cancelar
                            </button>
                            <button onClick={handleSaveRevisionEdit} className="px-4 py-2 bg-brand-700 text-white rounded-lg hover:bg-brand-800 shadow-md">
                                Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de confirmação de ação em lote */}
            {pendingBatch && (() => {
                const meta = BATCH_META[pendingBatch.action];
                const eligible = eligibleCounts[pendingBatch.action];
                return (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700">
                            <div className="flex items-center space-x-3 mb-4">
                                <div className={`p-2 rounded-full ${meta.iconBg}`}><CheckSquare size={24} /></div>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white">{meta.title}</h3>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{meta.description}</p>
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 rounded-lg p-2.5">
                                {eligible} de {selectedIds.size} selecionado(s) está(ão) no status correto para esta ação.
                                {eligible < selectedIds.size && ' Os demais serão ignorados.'}
                            </p>
                            <div className="flex mb-6">
                                <input type="date" value={pendingBatch.date} onChange={(e) => setPendingBatch(prev => prev ? { ...prev, date: e.target.value } : null)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" />
                                <PeriodSelector value={pendingBatch.period} onChange={(v) => setPendingBatch(prev => prev ? { ...prev, period: v } : null)} />
                            </div>
                            <div className="flex justify-end space-x-3">
                                <button onClick={() => setPendingBatch(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button>
                                <button onClick={handleConfirmBatch} disabled={eligible === 0} className={`px-4 py-2 text-white rounded-lg shadow-md font-medium disabled:opacity-50 disabled:cursor-not-allowed ${meta.btnClass}`}>{meta.confirmLabel}</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

// --- Botão do seletor de visão ---
function ViewModeButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all ${active ? 'bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
        >
            {icon}
            {label}
            {badge !== undefined && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{badge}</span>}
        </button>
    );
}

// --- Botão de ação em lote ---
function BatchButton({ label, count, onClick, className, icon }: { label: string; count: number; onClick: () => void; className: string; icon: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            disabled={count === 0}
            title={count === 0 ? `Nenhum selecionado está no status correto para "${label}"` : `${label} ${count} projeto(s)`}
            className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
        >
            {icon}
            {label} ({count})
        </button>
    );
}

// --- Card de resumo / filtro rápido por status ---
type CardColor = 'slate' | 'blue' | 'amber' | 'emerald' | 'rose' | 'red';

const CARD_STYLES: Record<CardColor, { active: string; iconActive: string; iconIdle: string; value: string }> = {
    slate:   { active: 'border-slate-400 bg-slate-100 dark:bg-slate-700/60 dark:border-slate-400 ring-1 ring-slate-300 dark:ring-slate-500', iconActive: 'bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-slate-800 dark:text-slate-100' },
    blue:    { active: 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-500 ring-1 ring-blue-300 dark:ring-blue-600', iconActive: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-blue-700 dark:text-blue-400' },
    amber:   { active: 'border-amber-400 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-500 ring-1 ring-amber-300 dark:ring-amber-600', iconActive: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-amber-700 dark:text-amber-400' },
    emerald: { active: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-500 ring-1 ring-emerald-300 dark:ring-emerald-600', iconActive: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-emerald-700 dark:text-emerald-400' },
    rose:    { active: 'border-rose-400 bg-rose-50 dark:bg-rose-900/30 dark:border-rose-500 ring-1 ring-rose-300 dark:ring-rose-600', iconActive: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-rose-700 dark:text-rose-400' },
    red:     { active: 'border-red-500 bg-red-50 dark:bg-red-900/30 dark:border-red-500 ring-1 ring-red-300 dark:ring-red-600', iconActive: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300', iconIdle: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400', value: 'text-red-600 dark:text-red-400' },
};

function SummaryCard({ color, icon, label, value, active, onClick }: { color: CardColor; icon: React.ReactNode; label: string; value: number; active: boolean; onClick: () => void }) {
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
