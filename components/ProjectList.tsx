
import React, { useState, useMemo, useEffect, memo } from 'react';
import { ProjectFile, Status, Discipline, RevisionReason, Period, ProjectPhase } from '../types';
import { format, parseISO, isValid } from 'date-fns';
import { Trash2, GitBranch, History, CornerDownRight, AlertTriangle, Edit2, Save, X, Eye, ArrowUpDown, ArrowUp, ArrowDown, BadgeCheck, Send, CheckSquare, ThumbsDown, List, Search, ArrowUpCircle } from 'lucide-react';
import { subscribeToClients } from '../services/db';
import { getProjectBaseName, getRevisionNumber, formatDateDisplay, calculateBusinessDaysWithHolidays, getStatusColor, inferStatusFromDates, calculateDeadlineDate } from '../utils';

interface ProjectListProps {
  projects: ProjectFile[];
  onUpdate: (updated: ProjectFile) => void;
  onDelete: (id: string) => void;
  onAddRevision: (id: string, reason: RevisionReason, comment: string) => void;
  onPromote?: (id: string) => void; // Nova prop
  holidays: string[];
  readOnly?: boolean;
}

// Optimization: Memoized Row Component
const ProjectRow = memo(({ project, index, sortedProjects, readOnly, setViewHistoryProject, setPendingCompletion, setPendingSend, setPendingApproval, setPendingRejection, setActiveRevModal, setDetailsProject, setEditingProject, setProjectToDelete, onPromote, executiveExistenceMap, clientsMap }: any) => {
    const revNumber = getRevisionNumber(project.filename);
    const isRevision = revNumber > 0;
    const currentBase = getProjectBaseName(project.filename);
    const nextProject = sortedProjects[index + 1];
    const isLastInGroup = (!nextProject || getProjectBaseName(nextProject.filename) !== currentBase);
    const canCreateRevision = isLastInGroup || project.status === Status.REJECTED;
    
    // Lógica de Promoção:
    // 1. Deve ser Preliminar
    // 2. Deve estar Concluído, Aguardando Aprovação ou Aprovado (Permite fluxo flexível)
    // 3. NÃO pode existir um Executivo correspondente (verificado via mapa)
    
    // Normaliza o nome para verificar no mapa (remove _EXEC se por acaso tiver, e remove espaços)
    const baseNameKey = getProjectBaseName(project.filename).replace(/_EXEC/i, '').trim().toLowerCase();
    const uniqueKey = `${project.client}|${project.discipline}|${baseNameKey}`.toLowerCase();
    const hasExecutiveVersion = executiveExistenceMap.has(uniqueKey);

    const canPromote = onPromote && 
                       project.phase === ProjectPhase.PRELIMINARY && 
                       (project.status === Status.DONE || project.status === Status.WAITING_APPROVAL || project.status === Status.APPROVED) &&
                       !hasExecutiveVersion &&
                       isLastInGroup;

    let feedbackColorClass = "text-slate-600 dark:text-slate-400";
    if (project.status === Status.APPROVED) feedbackColorClass = "text-emerald-700 dark:text-emerald-400 font-medium";
    if (project.status === Status.REJECTED) feedbackColorClass = "text-rose-700 dark:text-rose-400 font-medium";

    const displayDate = (date: string, period?: Period) => {
        const d = formatDateDisplay(date);
        if (d === '-') return d;
        if (period) return `${d} (${period === 'MANHA' ? 'M' : 'T'})`;
        return d;
    };

    // Calculate current period for actions
    const currentPeriod: Period = new Date().getHours() < 12 ? 'MANHA' : 'TARDE';

    // Estado de Inconsistência (Data Faltante)
    const missingSendDate = (project.status === Status.WAITING_APPROVAL || project.status === Status.APPROVED || project.status === Status.REJECTED) && !project.sendDate;
    const missingFeedbackDate = (project.status === Status.APPROVED || project.status === Status.REJECTED) && !project.feedbackDate;

    // SLA Calculation via ClientDoc
    const clientData = clientsMap[project.client];
    const contractDate = clientData?.contractDate;
    const deadlineDays = clientData?.deadlineDays;

    const deadlineDate = contractDate && deadlineDays !== undefined
        ? calculateDeadlineDate(contractDate, deadlineDays)
        : null;
    
    let isOverdue = false;
    if (deadlineDate) {
        const deadlineStr = format(deadlineDate, 'yyyy-MM-dd');
        if (project.endDate && project.status !== Status.REVISED) {
            isOverdue = project.endDate > deadlineStr;
        } else if (project.status !== Status.DONE && project.status !== Status.WAITING_APPROVAL && project.status !== Status.APPROVED && project.status !== Status.REVISED) {
            isOverdue = new Date().toISOString().split('T')[0] > deadlineStr;
        }
    }
    const slaDisplay = deadlineDate ? format(deadlineDate, 'dd/MM/yy') : '-';

    return (
        <tr className={`hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors duration-150 ease-out ${isLastInGroup ? 'border-b-2 border-slate-200/80 dark:border-slate-700' : ''}`}>
        <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">
            <div className="flex items-center space-x-2 overflow-hidden" title={project.filename}>
                {isRevision && <CornerDownRight size={14} className="text-slate-400 flex-shrink-0" />}
                {isRevision ? (<button onClick={() => setViewHistoryProject(project)} className="flex-shrink-0 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors duration-150" aria-label={`Ver histórico de revisão ${revNumber}`}>R{revNumber}</button>) : (<span className="w-5"></span>)}
                <span className={`truncate select-all ${isRevision ? 'text-slate-500 dark:text-slate-400 text-xs' : 'text-slate-800 dark:text-slate-200 text-sm'}`}>{project.filename}</span>
                {project.phase === ProjectPhase.PRELIMINARY && <span className="flex-shrink-0 text-[9px] uppercase font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">Prel</span>}
                {project.phase === ProjectPhase.EXECUTIVE && <span className="flex-shrink-0 text-[9px] uppercase font-bold text-violet-600 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded border border-violet-100 dark:border-violet-800">Exec</span>}
            </div>
        </td>
        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 text-sm truncate max-w-[120px]">{project.client}</td>
        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 text-xs truncate max-w-[80px]">{project.base || '-'}</td>
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
        <td className="px-3 py-2.5 text-center"><span className="font-mono text-xs text-slate-700 dark:text-slate-300">{project.blockedDays || <span className="text-slate-300 dark:text-slate-600">—</span>}</span></td>
        
        {!readOnly && (
            <td className="px-4 py-3">
                <div className="flex items-center justify-center space-x-2">
                    {project.status === Status.IN_PROGRESS && (<button onClick={() => { const today = new Date().toISOString().split('T')[0]; setPendingCompletion({ id: project.id, date: today, period: currentPeriod }); }} title="Concluir Execução" aria-label="Concluir Execução" className="p-1.5 bg-violet-50 text-violet-600 hover:bg-violet-100 rounded-md transition-colors border border-violet-200"><CheckSquare size={16} /></button>)}
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

export const ProjectList: React.FC<ProjectListProps> = ({ projects, onUpdate, onDelete, onAddRevision, onPromote, holidays, readOnly = false }) => {
  const [activeRevModal, setActiveRevModal] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<ProjectFile | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectFile | null>(null);
  const [detailsProject, setDetailsProject] = useState<ProjectFile | null>(null);
  const [viewHistoryProject, setViewHistoryProject] = useState<ProjectFile | null>(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 25;
  
  const [clientsList, setClientsList] = useState<{id: string, name: string}[]>([]);
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

  const [pendingCompletion, setPendingCompletion] = useState<{ id: string, date: string, period: Period } | null>(null);
  const [pendingSend, setPendingSend] = useState<{ id: string, date: string, period: Period } | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{ id: string, date: string, period: Period } | null>(null);
  const [pendingRejection, setPendingRejection] = useState<{ id: string, date: string, period: Period } | null>(null);

  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'filename', direction: 'asc', });
  const [revReason, setRevReason] = useState<RevisionReason>(RevisionReason.CLIENT_REQUEST);
  const [revComment, setRevComment] = useState('');

  // Computa o Mapa de Existência de Executivos
  // Isso escaneia todos os projetos para saber quais já têm fase Executiva
  // A chave é: Cliente + Disciplina + NomeBaseLimpo (sem _EXEC)
  const executiveExistenceMap = useMemo(() => {
      const map = new Set<string>();
      projects.forEach(p => {
          if (p.phase === ProjectPhase.EXECUTIVE) {
              const baseName = getProjectBaseName(p.filename).replace(/_EXEC/i, '').trim().toLowerCase();
              const key = `${p.client}|${p.discipline}|${baseName}`.toLowerCase();
              map.add(key);
          }
      });
      return map;
  }, [projects]);

  const sortedProjects = useMemo(() => {
    const filtered = projects.filter(p => p.filename.toLowerCase().includes(search.toLowerCase()) || p.client.toLowerCase().includes(search.toLowerCase()) || p.discipline.toLowerCase().includes(search.toLowerCase()) || (p.base && p.base.toLowerCase().includes(search.toLowerCase())));
    const groups: Record<string, ProjectFile[]> = {};
    filtered.forEach(p => { 
        let baseName = getProjectBaseName(p.filename).toLowerCase(); 
        if (baseName.endsWith('_exec')) baseName = baseName.replace('_exec', '');
        if (!groups[baseName]) { groups[baseName] = []; } 
        groups[baseName].push(p); 
    });
    Object.values(groups).forEach(group => { group.sort((a, b) => getRevisionNumber(a.filename) - getRevisionNumber(b.filename)); });
    const sortedGroups = Object.values(groups).sort((groupA, groupB) => {
        const fileA = groupA[0]; const fileB = groupB[0];
        let valA = fileA[sortConfig.key]; let valB = fileB[sortConfig.key];
        if (typeof valA === 'string') valA = valA.toLowerCase(); if (typeof valB === 'string') valB = valB.toLowerCase();
        if (sortConfig.key === 'blockedDays') { valA = fileA.blockedDays || 0; valB = fileB.blockedDays || 0; }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1; if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1; return 0;
    });
    return sortedGroups.flat();
  }, [projects, sortConfig, search]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedProjects.length / ITEMS_PER_PAGE));
  const paginatedProjects = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return sortedProjects.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedProjects, currentPage, ITEMS_PER_PAGE]);

  // Reset page when search/filter changes
  useEffect(() => { setCurrentPage(1); }, [search, projects]);

  // Status summary counts
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    sortedProjects.forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [sortedProjects]);

  const projectHistory = useMemo(() => { if (!viewHistoryProject) return []; const baseName = getProjectBaseName(viewHistoryProject.filename); const lineage = projects.filter(p => getProjectBaseName(p.filename) === baseName); const historyEvents = lineage.flatMap(p => { const revNum = getRevisionNumber(p.filename); return p.revisions.map(rev => ({ ...rev, fileId: p.id, filename: p.filename, revisionNumber: revNum })); }); return historyEvents.sort((a, b) => b.revisionNumber - a.revisionNumber); }, [viewHistoryProject, projects]);
  const detailsHistory = useMemo(() => { if (!detailsProject) return []; const baseName = getProjectBaseName(detailsProject.filename); const lineage = projects.filter(p => getProjectBaseName(p.filename) === baseName); const historyEvents = lineage.flatMap(p => { const revNum = getRevisionNumber(p.filename); return p.revisions.map(rev => ({ ...rev, fileId: p.id, filename: p.filename, revisionNumber: revNum })); }); return historyEvents.sort((a, b) => b.revisionNumber - a.revisionNumber); }, [detailsProject, projects]);

  const handleSort = (key: SortKey) => { setSortConfig(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc', })); };
  const handleRevisionSubmit = () => { if (activeRevModal) { onAddRevision(activeRevModal, revReason, revComment); setActiveRevModal(null); setRevComment(''); } };
  const handleConfirmCompletion = () => { if (!pendingCompletion) return; const project = projects.find(p => p.id === pendingCompletion.id); if (project) { if (project.startDate && pendingCompletion.date < project.startDate) { alert("A Data de Fim não pode ser anterior à Data de Início."); return; } onUpdate({ ...project, status: Status.DONE, endDate: pendingCompletion.date, endPeriod: pendingCompletion.period }); } setPendingCompletion(null); };
  const handleConfirmSend = () => { if (!pendingSend) return; const project = projects.find(p => p.id === pendingSend.id); if (project) { if (project.endDate && pendingSend.date < project.endDate) { alert("A Data de Envio não pode ser anterior à Data de Conclusão da execução."); return; } onUpdate({ ...project, status: Status.WAITING_APPROVAL, sendDate: pendingSend.date, sendPeriod: pendingSend.period }); } setPendingSend(null); };
  const handleConfirmApproval = () => { if (!pendingApproval) return; const project = projects.find(p => p.id === pendingApproval.id); if (project) { if (project.sendDate && pendingApproval.date < project.sendDate) { alert(`Data Inválida.`); return; } let blockedDays = project.blockedDays; if (project.sendDate) { const send = parseISO(project.sendDate); const approval = parseISO(pendingApproval.date); blockedDays = calculateBusinessDaysWithHolidays(send, approval, holidays, project.sendPeriod || 'MANHA', pendingApproval.period); } onUpdate({ ...project, status: Status.APPROVED, feedbackDate: pendingApproval.date, feedbackPeriod: pendingApproval.period, blockedDays: blockedDays }); } setPendingApproval(null); };
  const handleConfirmRejection = () => { if (!pendingRejection) return; const project = projects.find(p => p.id === pendingRejection.id); if (project) { if (project.sendDate && pendingRejection.date < project.sendDate) { alert(`Data Inválida.`); return; } let blockedDays = project.blockedDays; if (project.sendDate) { const send = parseISO(project.sendDate); const rejection = parseISO(pendingRejection.date); blockedDays = calculateBusinessDaysWithHolidays(send, rejection, holidays, project.sendPeriod || 'MANHA', pendingRejection.period); } onUpdate({ ...project, status: Status.REJECTED, feedbackDate: pendingRejection.date, feedbackPeriod: pendingRejection.period, blockedDays: blockedDays }); } setPendingRejection(null); }
  const handleConfirmDelete = () => { if (projectToDelete) { onDelete(projectToDelete.id); setProjectToDelete(null); } };
  
  const handleSaveEdit = () => { if (editingProject) { onUpdate(editingProject); setEditingProject(null); } };
  
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

  const SortIcon = ({ column }: { column: SortKey }) => { if (sortConfig.key !== column) return <ArrowUpDown size={12} className="ml-1 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />; return sortConfig.direction === 'asc' ? <ArrowUp size={12} className="ml-1 text-brand-600 dark:text-brand-400" /> : <ArrowDown size={12} className="ml-1 text-brand-600 dark:text-brand-400" />; };
  const renderHeader = (label: string, key: SortKey, className: string = "") => ( <th className={`px-4 py-3 cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors select-none ${className}`} onClick={() => handleSort(key)}> <div className={`flex items-center ${className.includes('text-right') ? 'justify-end' : className.includes('text-center') ? 'justify-center' : 'justify-start'}`}> {label} <SortIcon column={key} /> </div> </th> );

  const PeriodSelector = ({ value, onChange, disabled }: { value?: Period, onChange: (v: Period) => void, disabled?: boolean }) => (
      <select value={value || 'MANHA'} onChange={(e) => onChange(e.target.value as Period)} disabled={disabled} className="ml-1 bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-xs px-1 py-1.5 focus:outline-none focus:border-brand-500 disabled:opacity-50">
          <option value="MANHA">Manhã</option>
          <option value="TARDE">Tarde</option>
      </select>
  );

  if (projects.length === 0) { return ( <div className="animate-in fade-in zoom-in-95 duration-200"> <div className="flex items-center justify-between mb-6"> <div> <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"> <List className="text-brand-600 dark:text-brand-400" /> Carteira de Projetos </h2> <p className="text-sm text-slate-500 dark:text-slate-400">Gerenciamento detalhado de arquivos, status, datas e revisões.</p> </div> </div> <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700"> <List className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" /> <h3 className="text-lg text-slate-500 dark:text-slate-400">Nenhum projeto cadastrado</h3> <p className="text-sm text-slate-400 dark:text-slate-500">Importe arquivos ou adicione manualmente.</p> </div> </div> ); }

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
      <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-700/30 flex flex-wrap items-center gap-3">
           <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" placeholder="Buscar por cliente, arquivo ou disciplina..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-all duration-150" />
           </div>
           <div className="flex items-center gap-2 flex-wrap text-[11px]">
               <span className="text-slate-500 dark:text-slate-400 font-medium">{sortedProjects.length} registros</span>
               <span className="text-slate-300 dark:text-slate-600">|</span>
               {statusCounts[Status.IN_PROGRESS] > 0 && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">{statusCounts[Status.IN_PROGRESS]} em andamento</span>}
               {statusCounts[Status.DONE] > 0 && <span className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 font-medium">{statusCounts[Status.DONE]} concluídos</span>}
               {statusCounts[Status.WAITING_APPROVAL] > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium">{statusCounts[Status.WAITING_APPROVAL]} aguardando</span>}
               {statusCounts[Status.APPROVED] > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">{statusCounts[Status.APPROVED]} aprovados</span>}
               {statusCounts[Status.REJECTED] > 0 && <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 font-medium">{statusCounts[Status.REJECTED]} reprovados</span>}
           </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm text-left whitespace-nowrap">
          <thead className="text-[11px] text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700">
            <tr>
              {renderHeader("Arquivo / Fase", "filename", "min-w-[280px]")}
              {renderHeader("Cliente", "client", "min-w-[120px]")}
              {renderHeader("Base", "base", "min-w-[80px]")}
              {renderHeader("Disciplina", "discipline")}
              {renderHeader("Status", "status")}
              <th className="px-3 py-2.5 text-center">Prazo</th>
              {renderHeader("Execução", "startDate", "border-l border-slate-200/60 dark:border-slate-700/50")}
              {renderHeader("Aprovação", "sendDate", "border-l border-brand-100/60 dark:border-brand-900/20 bg-brand-50/20 dark:bg-brand-900/5")}
              {renderHeader("Bloq.", "blockedDays", "w-16 text-center")}
              {!readOnly && <th className="px-3 py-2.5 text-center">Ações</th>}
              <th className="px-3 py-2.5 text-right">{readOnly ? 'Detalhes' : 'Det./Edit.'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {paginatedProjects.map((project, index) => {
                const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
                return (
                <ProjectRow 
                    key={project.id}
                    project={project}
                    index={globalIndex}
                    sortedProjects={sortedProjects}
                    readOnly={readOnly}
                    setViewHistoryProject={setViewHistoryProject}
                    setPendingCompletion={setPendingCompletion}
                    setPendingSend={setPendingSend}
                    setPendingApproval={setPendingApproval}
                    setPendingRejection={setPendingRejection}
                    setActiveRevModal={setActiveRevModal}
                    setDetailsProject={setDetailsProject}
                    setEditingProject={setEditingProject}
                    setProjectToDelete={setProjectToDelete}
                    onPromote={onPromote}
                    executiveExistenceMap={executiveExistenceMap}
                    clientsMap={clientsMap}
                />
            );
            })}
             {paginatedProjects.length === 0 && (<tr><td colSpan={readOnly ? 9 : 11} className="px-6 py-10 text-center text-slate-400 italic">Nenhum registro encontrado.</td></tr>)}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-700/20 flex items-center justify-between text-sm">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sortedProjects.length)} de {sortedProjects.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              ← Anterior
            </button>
            <span className="px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
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
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full p-6 border dark:border-slate-700 flex flex-col max-h-[90vh] overflow-y-auto">
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

      {pendingCompletion && ( <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-violet-100 dark:bg-violet-900/30 p-2 rounded-full text-violet-600 dark:text-violet-400"><CheckSquare size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Concluir Execução</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Defina a data em que o desenho/projeto foi finalizado.</p><div className="flex mb-6"><input type="date" value={pendingCompletion.date} onChange={(e) => setPendingCompletion(prev => prev ? { ...prev, date: e.target.value } : null)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" /><PeriodSelector value={pendingCompletion.period} onChange={(v) => setPendingCompletion(prev => prev ? { ...prev, period: v } : null)} /></div><div className="flex justify-end space-x-3"><button onClick={() => setPendingCompletion(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmCompletion} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg shadow-md font-medium">Concluir</button></div></div></div> )}
      {pendingSend && ( <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full text-blue-600 dark:text-blue-400"><Send size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Registrar Envio</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Quando este projeto foi enviado para o cliente?</p><div className="flex mb-6"><input type="date" value={pendingSend.date} onChange={(e) => setPendingSend(prev => prev ? { ...prev, date: e.target.value } : null)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" /><PeriodSelector value={pendingSend.period} onChange={(v) => setPendingSend(prev => prev ? { ...prev, period: v } : null)} /></div><div className="flex justify-end space-x-3"><button onClick={() => setPendingSend(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmSend} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-md font-medium">Confirmar Envio</button></div></div></div> )}
      {pendingApproval && ( <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-full text-emerald-600 dark:text-emerald-400"><BadgeCheck size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Registrar Aprovação</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4">O projeto foi aprovado. Confirme a data para calcular o tempo de feedback.</p><div className="flex mb-6"><input type="date" value={pendingApproval.date} onChange={(e) => setPendingApproval(prev => prev ? { ...prev, date: e.target.value } : null)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" /><PeriodSelector value={pendingApproval.period} onChange={(v) => setPendingApproval(prev => prev ? { ...prev, period: v } : null)} /></div><div className="flex justify-end space-x-3"><button onClick={() => setPendingApproval(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmApproval} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-md font-medium">Aprovar Projeto</button></div></div></div> )}
      {pendingRejection && ( <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-rose-100 dark:bg-rose-900/30 p-2 rounded-full text-rose-600 dark:text-rose-400"><ThumbsDown size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Registrar Reprovação</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4">O projeto foi reprovado? Registre a data do feedback.<br/><span className="text-xs text-rose-500 italic mt-1 block">O status mudará para Reprovado e a opção de Aprovação será removida.</span></p><div className="flex mb-6"><input type="date" value={pendingRejection.date} onChange={(e) => setPendingRejection(prev => prev ? { ...prev, date: e.target.value } : null)} className="w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-l-lg px-3 py-2 dark:[color-scheme:dark]" /><PeriodSelector value={pendingRejection.period} onChange={(v) => setPendingRejection(prev => prev ? { ...prev, period: v } : null)} /></div><div className="flex justify-end space-x-3"><button onClick={() => setPendingRejection(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmRejection} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-md font-medium">Reprovar</button></div></div></div> )}
      {activeRevModal && ( <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-amber-100 dark:bg-amber-900/30 p-2 rounded-full text-amber-600 dark:text-amber-400"><GitBranch size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Gerar Nova Versão</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-4 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 p-3 rounded-lg border border-slate-100 dark:border-slate-700">Isso criará um novo registro (Ex: [R1]) para correção, reiniciando o ciclo de trabalho.</p><label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Motivo da Nova Versão</label><select value={revReason} onChange={(e) => setRevReason(e.target.value as RevisionReason)} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 mb-4">{Object.values(RevisionReason).map(r => <option key={r} value={r}>{r}</option>)}</select><label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Comentários</label><textarea value={revComment} onChange={(e) => setRevComment(e.target.value)} className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-3 py-2 mb-6 h-24 resize-none" placeholder="O que será corrigido?" /><div className="flex justify-end space-x-3"><button onClick={() => setActiveRevModal(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleRevisionSubmit} className="px-4 py-2 bg-brand-700 text-white rounded-lg hover:bg-brand-800 shadow-md">Gerar Nova Versão</button></div></div></div> )}
      {projectToDelete && ( <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-sm w-full p-6 border dark:border-slate-700"><div className="flex items-center space-x-3 mb-4"><div className="bg-rose-100 dark:bg-rose-900/30 p-2 rounded-full text-rose-600 dark:text-rose-400"><AlertTriangle size={24} /></div><h3 className="text-lg font-bold text-slate-800 dark:text-white">Excluir Registro</h3></div><p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Tem certeza que deseja excluir o arquivo <strong>{projectToDelete.filename}</strong>? Esta ação não pode ser desfeita.</p><div className="flex justify-end space-x-3"><button onClick={() => setProjectToDelete(null)} className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">Cancelar</button><button onClick={handleConfirmDelete} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-md font-medium">Sim, Excluir</button></div></div></div> )}
      {viewHistoryProject && ( <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border dark:border-slate-700 flex flex-col max-h-[80vh]"><div className="flex justify-between items-start mb-4"><div><h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2"><History size={20} className="text-brand-600 dark:text-brand-400"/>Linha do Tempo (Revisões)</h3><p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-all">Projeto: <span className="font-semibold">{getProjectBaseName(viewHistoryProject.filename)}</span></p></div><button onClick={() => setViewHistoryProject(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Fechar Histórico"><span className="text-2xl leading-none">&times;</span></button></div><div className="flex-1 overflow-y-auto pr-2">{projectHistory.length === 0 ? (<p className="text-sm text-slate-500 italic p-4 text-center border border-dashed rounded-lg">Nenhuma revisão registrada no histórico deste arquivo.</p>) : (<div className="space-y-6 relative ml-2 pl-4 border-l-2 border-slate-200 dark:border-slate-700">{projectHistory.map((rev, idx) => (<div key={`${rev.fileId}-${idx}`} className="relative"><div className="absolute -left-[23px] top-1 h-3 w-3 rounded-full bg-brand-600 dark:bg-brand-500 ring-4 ring-white dark:ring-slate-800"></div><div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700"><div className="flex justify-between items-start mb-2"><div className="flex items-center space-x-2"><span className="text-xs font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-600 px-2 py-0.5 rounded shadow-sm">R{rev.revisionNumber}</span><span className="text-xs text-slate-500 dark:text-slate-400">{formatDateDisplay(rev.date)}</span></div><span className="text-xs font-semibold text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-2 py-0.5 rounded">{rev.reason}</span></div><p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{rev.comment}</p></div></div>))}</div>)}</div><div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end"><button onClick={() => setViewHistoryProject(null)} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-colors">Fechar</button></div></div></div> )}
      {detailsProject && ( <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"><div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full p-0 border dark:border-slate-700 flex flex-col max-h-[90vh] overflow-hidden"><div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-start bg-slate-50 dark:bg-slate-700/30"><div><h3 className="text-2xl font-bold text-slate-800 dark:text-white break-all">{detailsProject.filename}</h3><div className="flex items-center space-x-2 mt-2"><span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(detailsProject.status)}`}>{detailsProject.status}</span><span className="text-xs text-slate-400 dark:text-slate-500">ID: {detailsProject.id}</span></div></div><button onClick={() => setDetailsProject(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" aria-label="Fechar Detalhes"><X size={28} /></button></div><div className="overflow-y-auto p-6 space-y-8"><div className="grid grid-cols-2 md:grid-cols-4 gap-6"><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Cliente</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{detailsProject.client}</span></div><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Base</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{detailsProject.base || '-'}</span></div><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Disciplina</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{detailsProject.discipline}</span></div><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Dias Bloqueados</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{detailsProject.blockedDays} dias</span></div><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Versão Atual</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">R{getRevisionNumber(detailsProject.filename)}</span></div><div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-lg border border-slate-100 dark:border-slate-700/50"><span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase block mb-1">Fase</span><span className="text-lg font-semibold text-slate-800 dark:text-slate-100">{detailsProject.phase || '-'}</span></div></div><div><h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Linha do Tempo</h4><div className="flex flex-col md:flex-row justify-between items-center md:items-start bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 relative overflow-hidden"><div className="hidden md:block absolute top-[45px] left-10 right-10 h-0.5 bg-slate-100 dark:bg-slate-700 z-0"></div><div className="relative z-10 flex flex-col items-center text-center w-full md:w-1/4 mb-4 md:mb-0"><div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 border-4 border-white dark:border-slate-800 flex items-center justify-center mb-2"><div className="w-2.5 h-2.5 rounded-full bg-slate-400 dark:bg-slate-500"></div></div><span className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase mb-1">Início</span><span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatDateDisplay(detailsProject.startDate)}</span></div><div className="relative z-10 flex flex-col items-center text-center w-full md:w-1/4"><div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 border-4 border-white dark:border-slate-800 flex items-center justify-center mb-2"><div className={`w-2.5 h-2.5 rounded-full ${detailsProject.endDate ? 'bg-slate-800 dark:bg-slate-200' : 'bg-transparent border border-slate-400'}`}></div></div><span className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase mb-1">Fim Exec.</span><span className="text-sm font-bold text-slate-700 dark:text-slate-200">{formatDateDisplay(detailsProject.endDate)}</span></div><div className="relative z-10 flex flex-col items-center text-center w-full md:w-1/4 mb-4 md:mb-0"><div className="w-8 h-8 rounded-full bg-brand-50 dark:bg-brand-900/30 border-4 border-white dark:border-slate-800 flex items-center justify-center mb-2"><div className="w-2.5 h-2.5 rounded-full bg-brand-500"></div></div><span className="text-xs text-brand-600 dark:text-brand-400 font-medium uppercase mb-1">Envio</span><span className="text-sm font-bold text-brand-700 dark:text-brand-300">{formatDateDisplay(detailsProject.sendDate)}</span></div><div className="relative z-10 flex flex-col items-center text-center w-full md:w-1/4 mb-4 md:mb-0"><div className={`w-8 h-8 rounded-full border-4 border-white dark:border-slate-800 flex items-center justify-center mb-2 ${detailsProject.status === Status.REJECTED ? 'bg-rose-50 dark:bg-rose-900/30' : 'bg-emerald-50 dark:bg-emerald-900/30'}`}><div className={`w-2.5 h-2.5 rounded-full ${detailsProject.status === Status.REJECTED ? 'bg-rose-500' : 'bg-emerald-500'}`}></div></div><span className={`text-xs font-medium uppercase mb-1 ${detailsProject.status === Status.REJECTED ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{detailsProject.status === Status.REJECTED ? 'Reprovação' : 'Aprovação'}</span><span className={`text-sm font-bold ${detailsProject.status === Status.REJECTED ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{formatDateDisplay(detailsProject.feedbackDate)}</span></div></div></div><div><h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Histórico Completo de Revisões</h4>{detailsHistory.length === 0 ? (<div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50"><History size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" /><p className="text-slate-500 dark:text-slate-400">Este projeto ainda não possui revisões registradas.</p></div>) : (<div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"><table className="w-full text-sm text-left"><thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 uppercase text-xs border-b border-slate-200 dark:border-slate-700"><tr><th className="px-6 py-3">Rev</th><th className="px-6 py-3">Data</th><th className="px-6 py-3">Motivo</th><th className="px-6 py-3">Comentário</th><th className="px-6 py-3 text-right">Arquivo Origem</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700">{detailsHistory.map((rev, idx) => (<tr key={`${rev.fileId}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"><td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">R{rev.revisionNumber}</td><td className="px-6 py-4 text-slate-600 dark:text-slate-400">{formatDateDisplay(rev.date)}</td><td className="px-6 py-4"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-100 dark:bg-brand-900/30 text-brand-800 dark:text-brand-300">{rev.reason}</span></td><td className="px-6 py-4 text-slate-600 dark:text-slate-300 max-w-md whitespace-normal">{rev.comment}</td><td className="px-6 py-4 text-right text-xs text-slate-400 font-mono">{rev.filename}</td></tr>))}</tbody></table></div>)}</div></div><div className="p-6 bg-slate-50 dark:bg-slate-700/30 border-t border-slate-100 dark:border-slate-700 flex justify-end"><button onClick={() => setDetailsProject(null)} className="px-6 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">Fechar</button></div></div></div> )}
    </div>
  );
};
