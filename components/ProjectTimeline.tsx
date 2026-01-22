import React, { useMemo, useState } from 'react';
import { ProjectFile, Discipline, Status } from '../types';
import { differenceInCalendarDays, differenceInBusinessDays, format, startOfDay, endOfDay, eachDayOfInterval, min, max, parseISO, isValid, isWeekend, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronRight, ChevronDown, Layers, ZoomIn, X, Briefcase, CalendarClock, CalendarRange, CheckCircle2 } from 'lucide-react';

interface ProjectTimelineProps {
  projects: ProjectFile[];
  holidays: string[];
}

const DISCIPLINE_COLORS: Record<string, string> = {
  [Discipline.ARCHITECTURE]: 'bg-[#8e1c3e]', 
  [Discipline.STRUCTURE]: 'bg-slate-500',   
  [Discipline.FOUNDATION]: 'bg-slate-400',  
  [Discipline.HYDRAULIC]: 'bg-cyan-500',   
  [Discipline.ELECTRICAL]: 'bg-yellow-500',  
  [Discipline.DATA]: 'bg-violet-500',        
  [Discipline.SPDA]: 'bg-red-500',        
  [Discipline.HVAC]: 'bg-emerald-500',        
  [Discipline.OTHER]: 'bg-pink-500',       
};

const STRIPE_PATTERN_STYLE = { backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)', backgroundSize: '1rem 1rem' };

const calculateDuration = (start: Date, end: Date, holidays: string[]) => {
    const businessDays = differenceInBusinessDays(end, start) + 1;
    let holidaysOnWeekdays = 0;
    holidays.forEach(h => { const hDate = parseISO(h); if (isValid(hDate) && isWithinInterval(hDate, { start, end })) { if (!isWeekend(hDate)) holidaysOnWeekdays++; } });
    return Math.max(0, businessDays - holidaysOnWeekdays);
};

const ClientDetailGantt = ({ clientName, projects, holidays, onClose }: { clientName: string, projects: ProjectFile[], holidays: string[], onClose: () => void }) => {
    const [expandedDisciplines, setExpandedDisciplines] = useState<Set<string>>(new Set());
    const toggleDiscipline = (disc: string) => { const newSet = new Set(expandedDisciplines); if (newSet.has(disc)) newSet.delete(disc); else newSet.add(disc); setExpandedDisciplines(newSet); };

    const { rows, days, totalDays, chartStart } = useMemo(() => {
        const validProjects = projects.filter(p => p.startDate && isValid(parseISO(p.startDate)));
        if (validProjects.length === 0) return { rows: [], days: [], totalDays: 0, chartStart: new Date() };
        const allDates: Date[] = [];
        const discMap: Record<string, ProjectFile[]> = {};
        validProjects.forEach(p => { if (!discMap[p.discipline]) discMap[p.discipline] = []; discMap[p.discipline].push(p); });
        const rowData: any[] = [];
        const today = new Date();
        Object.keys(discMap).sort().forEach(disc => {
            const files = discMap[disc];
            const discDates: Date[] = [];
            const fileRows: any[] = [];
            files.forEach(f => {
                const start = parseISO(f.startDate);
                let end = (f.endDate && isValid(parseISO(f.endDate))) ? parseISO(f.endDate) : today;
                if (end < start) end = start;
                discDates.push(start, end); allDates.push(start, end);
                fileRows.push({ id: f.id, type: 'FILE', label: f.filename, discipline: f.discipline, status: f.status, start, end, duration: calculateDuration(start, end, holidays) });
            });
            fileRows.sort((a, b) => a.start.getTime() - b.start.getTime());
            if (discDates.length > 0) {
                const minD = min(discDates); const maxD = max(discDates);
                rowData.push({ id: `disc-${disc}`, type: 'DISCIPLINE', label: disc, discipline: disc, start: minD, end: maxD, duration: calculateDuration(minD, maxD, holidays), children: fileRows });
            }
        });
        const gStart = min(allDates); const gEnd = max(allDates);
        const gRange = differenceInCalendarDays(gEnd, gStart) + 1;
        const axisDays = eachDayOfInterval({ start: gStart, end: gEnd });
        return { rows: rowData, days: axisDays, totalDays: gRange, chartStart: gStart };
    }, [projects, holidays]);

    const visibleRows = useMemo(() => { const flat: any[] = []; rows.forEach(r => { flat.push(r); if (expandedDisciplines.has(r.label)) { flat.push(...r.children); } }); return flat; }, [rows, expandedDisciplines]);
    const chartWidth = Math.max(900, totalDays * 40);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-[95vw] w-full h-[90vh] flex flex-col border dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 shrink-0">
                    <div><h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Briefcase size={20} className="text-slate-500" />{clientName}</h3><p className="text-sm text-slate-500 dark:text-slate-400">Detalhamento por Disciplina e Arquivos</p></div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors text-slate-500 dark:text-slate-400" aria-label="Fechar"><X size={24} /></button>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar relative bg-white dark:bg-slate-800">
                    <div style={{ width: `${chartWidth}px` }} className="relative min-h-full">
                        <div className="flex border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-30 h-12 shadow-sm">
                            <div className="w-[350px] flex-shrink-0 p-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase bg-white dark:bg-slate-800 sticky left-0 z-40 border-r border-slate-100 dark:border-slate-700 flex items-center">Disciplina / Arquivo</div>
                            <div className="flex-1 flex relative">
                                {days.map((day, idx) => { const isWe = isWeekend(day); const isMonthStart = format(day, 'dd') === '01' || idx === 0; return (<div key={idx} style={{ width: `${100 / totalDays}%` }} className={`border-l border-slate-100 dark:border-slate-700/50 flex flex-col items-center justify-end pb-2 ${isWe ? 'bg-slate-50 dark:bg-slate-900/50' : ''}`}><span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{format(day, 'dd')}</span>{isMonthStart && (<span className="absolute top-1 text-[9px] font-bold text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/50 px-1 rounded z-10 whitespace-nowrap">{format(day, 'MMM/yy', { locale: ptBR })}</span>)}</div>); })}
                            </div>
                        </div>
                        <div className="absolute top-12 bottom-0 left-[350px] right-0 flex pointer-events-none z-0">{days.map((day, idx) => { const isWe = isWeekend(day); return (<div key={idx} style={{ width: `${100 / totalDays}%` }} className={`border-l border-slate-100 dark:border-slate-700/30 h-full ${isWe ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}`} />); })}</div>
                        <div className="relative z-10">
                            {visibleRows.map((row: any) => {
                                const offsetDays = differenceInCalendarDays(row.start, chartStart);
                                const visualDuration = Math.max(1, differenceInCalendarDays(row.end, row.start) + 1);
                                const offsetPercent = (offsetDays / totalDays) * 100;
                                const widthPercent = (visualDuration / totalDays) * 100;
                                const isDisc = row.type === 'DISCIPLINE';
                                const isExpanded = isDisc && expandedDisciplines.has(row.label);
                                const isDone = row.status === Status.DONE || row.status === Status.APPROVED || row.status === Status.WAITING_APPROVAL;
                                const isRejected = row.status === Status.REJECTED;
                                
                                return (
                                    <div key={row.id} className={`flex items-center h-10 border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 group transition-colors ${isDisc ? 'bg-slate-50/50 dark:bg-slate-800' : ''}`}>
                                        <div className="w-[350px] flex-shrink-0 px-4 flex items-center sticky left-0 z-20 bg-inherit border-r border-slate-100 dark:border-slate-700/50 h-full">
                                            {isDisc ? (
                                                <button onClick={() => toggleDiscipline(row.label)} className="flex items-center space-x-2 w-full text-left font-semibold text-slate-700 dark:text-slate-200">
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                    <span className="truncate">{row.label}</span>
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 dark:bg-slate-600 rounded-full text-slate-600 dark:text-slate-300 ml-auto">{row.children.length} arq</span>
                                                </button>
                                            ) : (
                                                <div className="pl-6 flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400 w-full">
                                                    <span className={`truncate flex-1 ${row.status === Status.DONE ? 'line-through opacity-70' : ''}`} title={row.label}>{row.label}</span>
                                                    {isDone && <CheckCircle2 size={12} className="text-emerald-500" />}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 relative h-full">
                                            <div 
                                                className={`absolute top-2 bottom-2 rounded-md shadow-sm transition-all flex items-center px-2 whitespace-nowrap overflow-hidden text-xs font-medium text-white ${isDisc ? 'opacity-80' : ''} ${DISCIPLINE_COLORS[row.discipline] || 'bg-slate-400'} ${isRejected ? 'ring-2 ring-rose-500' : ''}`}
                                                style={{ left: `${offsetPercent}%`, width: `${widthPercent}%`, ...((isDisc && !isDone) ? STRIPE_PATTERN_STYLE : {}) }}
                                            >
                                                <span className="drop-shadow-md">{row.duration} dias</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ProjectTimeline: React.FC<ProjectTimelineProps> = ({ projects, holidays }) => {
    const [selectedClient, setSelectedClient] = useState<string | null>(null);

    const clientStats = useMemo(() => {
        const groups: Record<string, { totalFiles: number, startDate: Date, endDate: Date, activeFiles: number }> = {};
        const today = new Date();

        projects.forEach(p => {
            if (!groups[p.client]) {
                groups[p.client] = { totalFiles: 0, startDate: new Date(2100, 0, 1), endDate: new Date(1900, 0, 1), activeFiles: 0 };
            }
            groups[p.client].totalFiles += 1;
            if (p.status === Status.IN_PROGRESS || p.status === Status.REVISED) {
                groups[p.client].activeFiles += 1;
            }

            if (p.startDate && isValid(parseISO(p.startDate))) {
                const s = parseISO(p.startDate);
                if (s < groups[p.client].startDate) groups[p.client].startDate = s;
                
                let e = today;
                if (p.endDate && isValid(parseISO(p.endDate))) {
                    e = parseISO(p.endDate);
                } else if (p.sendDate && isValid(parseISO(p.sendDate))) { // Fallback if no end date but sent
                     e = parseISO(p.sendDate);
                }
                
                if (e > groups[p.client].endDate) groups[p.client].endDate = e;
            }
        });

        // Cleanup invalid dates if no project has dates
        Object.keys(groups).forEach(c => {
             if (groups[c].startDate.getFullYear() === 2100) groups[c].startDate = today;
             if (groups[c].endDate.getFullYear() === 1900) groups[c].endDate = today;
        });

        return Object.entries(groups).map(([name, stats]) => ({
            name,
            ...stats,
            duration: calculateDuration(stats.startDate, stats.endDate, holidays)
        })).sort((a, b) => b.activeFiles - a.activeFiles);
    }, [projects, holidays]);

    if (projects.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                <CalendarRange size={48} className="text-slate-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg text-slate-500 dark:text-slate-400 font-medium">Cronograma Vazio</h3>
                <p className="text-sm text-slate-400 dark:text-slate-500">Adicione projetos com datas para visualizar o cronograma.</p>
            </div>
        );
    }

    return (
        <div className="animate-in fade-in zoom-in-95 duration-200">
             <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <CalendarClock className="text-brand-600 dark:text-brand-400" />
                        Cronograma Geral
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Visão macro dos prazos e andamento por cliente.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clientStats.map(client => (
                    <div 
                        key={client.name} 
                        onClick={() => setSelectedClient(client.name)}
                        className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all cursor-pointer group relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Briefcase size={64} className="text-slate-500 dark:text-slate-400" />
                        </div>
                        
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white truncate pr-2" title={client.name}>{client.name}</h3>
                                <div className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">
                                    {client.activeFiles} ativos
                                </div>
                            </div>
                            
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                    <CalendarRange size={16} className="text-brand-600 dark:text-brand-400" />
                                    <span>{format(client.startDate, 'dd/MM/yyyy')} até {format(client.endDate, 'dd/MM/yyyy')}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                    <Layers size={16} className="text-brand-600 dark:text-brand-400" />
                                    <span>{client.totalFiles} arquivos totais</span>
                                </div>
                                
                                <div className="pt-2">
                                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                                        <span>Progresso (Arquivos Entregues)</span>
                                        <span className="font-bold">{Math.round(((client.totalFiles - client.activeFiles) / client.totalFiles) * 100) || 0}%</span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className="bg-brand-600 dark:bg-brand-500 h-2 rounded-full transition-all duration-500" 
                                            style={{ width: `${((client.totalFiles - client.activeFiles) / client.totalFiles) * 100}%` }} 
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 flex items-center text-brand-700 dark:text-brand-400 text-sm font-semibold group-hover:underline">
                                <ZoomIn size={16} className="mr-2" />
                                Ver Detalhes Gantt
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {selectedClient && (
                <ClientDetailGantt 
                    clientName={selectedClient} 
                    projects={projects.filter(p => p.client === selectedClient)} 
                    holidays={holidays}
                    onClose={() => setSelectedClient(null)} 
                />
            )}
        </div>
    );
};
