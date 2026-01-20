
import React, { useMemo, useState } from 'react';
import { ProjectFile, Discipline, Status } from '../types';
import { 
  differenceInCalendarDays, 
  differenceInBusinessDays,
  format, 
  startOfDay, 
  endOfDay, 
  eachDayOfInterval, 
  min, 
  max,
  parseISO,
  isValid,
  isWeekend,
  isWithinInterval
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronRight, ChevronDown, Layers, FileText, ZoomIn, X, Briefcase, CalendarClock, CalendarRange } from 'lucide-react';

interface ProjectTimelineProps {
  projects: ProjectFile[];
  holidays: string[];
}

// Colors
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

// Helper: Calculate business duration
const calculateDuration = (start: Date, end: Date, holidays: string[]) => {
    const businessDays = differenceInBusinessDays(end, start) + 1;
    let holidaysOnWeekdays = 0;
    holidays.forEach(h => {
        const hDate = parseISO(h);
        if (isValid(hDate) && isWithinInterval(hDate, { start, end })) {
            if (!isWeekend(hDate)) holidaysOnWeekdays++;
        }
    });
    return Math.max(0, businessDays - holidaysOnWeekdays);
};

// --- SUB-COMPONENT: CLIENT DETAIL MODAL ---
const ClientDetailGantt = ({ 
    clientName, 
    projects, 
    holidays, 
    onClose 
}: { 
    clientName: string, 
    projects: ProjectFile[], 
    holidays: string[], 
    onClose: () => void 
}) => {
    const [expandedDisciplines, setExpandedDisciplines] = useState<Set<string>>(new Set());

    const toggleDiscipline = (disc: string) => {
        const newSet = new Set(expandedDisciplines);
        if (newSet.has(disc)) newSet.delete(disc);
        else newSet.add(disc);
        setExpandedDisciplines(newSet);
    };

    // Prepare Data for Detail View
    const { rows, days, totalDays, chartStart } = useMemo(() => {
        const validProjects = projects.filter(p => p.startDate && isValid(parseISO(p.startDate)));
        if (validProjects.length === 0) return { rows: [], days: [], totalDays: 0, chartStart: new Date() };

        const allDates: Date[] = [];
        
        // Group by Discipline
        const discMap: Record<string, ProjectFile[]> = {};
        validProjects.forEach(p => {
            if (!discMap[p.discipline]) discMap[p.discipline] = [];
            discMap[p.discipline].push(p);
        });

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
                
                discDates.push(start, end);
                allDates.push(start, end);

                fileRows.push({
                    id: f.id,
                    type: 'FILE',
                    label: f.filename,
                    discipline: f.discipline,
                    status: f.status,
                    start,
                    end,
                    duration: calculateDuration(start, end, holidays)
                });
            });

            // Sort files by start date
            fileRows.sort((a, b) => a.start.getTime() - b.start.getTime());

            // Discipline Aggregation
            if (discDates.length > 0) {
                const minD = min(discDates);
                const maxD = max(discDates);
                
                rowData.push({
                    id: `disc-${disc}`,
                    type: 'DISCIPLINE',
                    label: disc,
                    discipline: disc,
                    start: minD,
                    end: maxD,
                    duration: calculateDuration(minD, maxD, holidays),
                    children: fileRows
                });
            }
        });

        const gStart = min(allDates);
        const gEnd = max(allDates);
        const gRange = differenceInCalendarDays(gEnd, gStart) + 1;
        const axisDays = eachDayOfInterval({ start: gStart, end: gEnd });

        return { rows: rowData, days: axisDays, totalDays: gRange, chartStart: gStart };
    }, [projects, holidays]);

    // Flatten for rendering
    const visibleRows = useMemo(() => {
        const flat: any[] = [];
        rows.forEach(r => {
            flat.push(r);
            if (expandedDisciplines.has(r.label)) {
                flat.push(...r.children);
            }
        });
        return flat;
    }, [rows, expandedDisciplines]);

    const MIN_DAY_WIDTH = 40;
    const chartWidth = Math.max(900, totalDays * MIN_DAY_WIDTH);

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-[95vw] w-full h-[90vh] flex flex-col border dark:border-slate-700 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-700/50 shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <Briefcase size={20} className="text-slate-500" />
                            {clientName}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Detalhamento por Disciplina e Arquivos</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors text-slate-500 dark:text-slate-400">
                        <X size={24} />
                    </button>
                </div>

                {/* Timeline Body */}
                <div className="flex-1 overflow-auto custom-scrollbar relative bg-white dark:bg-slate-800">
                    <div style={{ width: `${chartWidth}px` }} className="relative min-h-full">
                         
                         {/* Axis Header */}
                        <div className="flex border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-30 h-12 shadow-sm">
                            <div className="w-[350px] flex-shrink-0 p-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase bg-white dark:bg-slate-800 sticky left-0 z-40 border-r border-slate-100 dark:border-slate-700 flex items-center">
                                Disciplina / Arquivo
                            </div>
                            <div className="flex-1 flex relative">
                                {days.map((day, idx) => {
                                    const isWe = isWeekend(day);
                                    const isMonthStart = format(day, 'dd') === '01' || idx === 0;
                                    return (
                                        <div 
                                            key={idx} 
                                            style={{ width: `${100 / totalDays}%` }}
                                            className={`border-l border-slate-100 dark:border-slate-700/50 flex flex-col items-center justify-end pb-2 ${isWe ? 'bg-slate-50 dark:bg-slate-900/50' : ''}`}
                                        >
                                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                                                {format(day, 'dd')}
                                            </span>
                                            {isMonthStart && (
                                                <span className="absolute top-1 text-[9px] font-bold text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/50 px-1 rounded z-10 whitespace-nowrap">
                                                    {format(day, 'MMM/yy', { locale: ptBR })}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Grid Lines */}
                        <div className="absolute top-12 bottom-0 left-[350px] right-0 flex pointer-events-none z-0">
                             {days.map((day, idx) => {
                                const isWe = isWeekend(day);
                                return (
                                    <div 
                                    key={idx} 
                                    style={{ width: `${100 / totalDays}%` }}
                                    className={`border-l border-slate-100 dark:border-slate-700/30 h-full ${isWe ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}`}
                                    />
                                );
                            })}
                        </div>

                        {/* Rows */}
                        <div className="relative z-10">
                            {visibleRows.map((row: any) => {
                                const offsetDays = differenceInCalendarDays(row.start, chartStart);
                                const visualDuration = differenceInCalendarDays(row.end, row.start) + 1;
                                const offsetPercent = (offsetDays / totalDays) * 100;
                                const widthPercent = (visualDuration / totalDays) * 100;

                                const isDisc = row.type === 'DISCIPLINE';
                                const isExpanded = isDisc && expandedDisciplines.has(row.label);
                                
                                return (
                                    <div key={row.id} className={`flex items-center h-10 border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors ${isDisc ? 'bg-slate-50 dark:bg-slate-700/10' : ''}`}>
                                        
                                        {/* Label */}
                                        <div className="w-[350px] flex-shrink-0 flex items-center pr-4 pl-4 border-r border-slate-100 dark:border-slate-700 sticky left-0 z-20 bg-inherit h-full">
                                            {isDisc ? (
                                                <button onClick={() => toggleDiscipline(row.label)} className="flex items-center gap-2 w-full text-left group">
                                                    <div className="p-1 rounded text-slate-400 group-hover:text-brand-600 transition-colors">
                                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                    </div>
                                                    <Layers size={14} className="text-slate-400" />
                                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{row.label}</span>
                                                    <span className="ml-auto text-[10px] bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded-full text-slate-600 dark:text-slate-300">
                                                        {row.duration}d
                                                    </span>
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-2 pl-8 w-full">
                                                    <FileText size={14} className="text-slate-300 min-w-[14px]" />
                                                    <span className="text-xs text-slate-600 dark:text-slate-400 truncate" title={row.label}>{row.label}</span>
                                                    {row.status === Status.DONE && <span className="ml-auto text-[9px] text-emerald-600 font-bold">✓</span>}
                                                </div>
                                            )}
                                        </div>

                                        {/* Bar */}
                                        <div className="flex-1 relative h-full">
                                            <div 
                                                onClick={() => isDisc && toggleDiscipline(row.label)}
                                                className={`absolute top-1/2 -translate-y-1/2 rounded shadow-sm cursor-pointer transition-all hover:scale-[1.01] ${isDisc ? 'h-5 z-10' : 'h-3 z-0 opacity-80'}`}
                                                style={{ 
                                                    left: `${offsetPercent}%`, 
                                                    width: `${widthPercent}%`,
                                                    backgroundColor: isDisc 
                                                        ? undefined // Use class 
                                                        : undefined // Use logic
                                                }}
                                            >
                                                {/* Bar Styling */}
                                                <div className={`w-full h-full rounded ${isDisc ? DISCIPLINE_COLORS[row.discipline] : (row.status === Status.DONE ? 'bg-slate-400' : DISCIPLINE_COLORS[row.discipline])}`}></div>
                                                
                                                {/* Tooltip Overlay */}
                                                <div className="absolute inset-0 opacity-0 hover:opacity-100 bg-black/10 transition-opacity flex items-center justify-center">
                                                    {!isDisc && <ZoomIn size={12} className="text-white drop-shadow-md" />}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
export const ProjectTimeline: React.FC<ProjectTimelineProps> = ({ projects, holidays }) => {
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  // 1. Overview Data (Group by Client)
  const { clientRows, globalStart, globalEnd, totalDays } = useMemo(() => {
      const validProjects = projects.filter(p => p.startDate && isValid(parseISO(p.startDate)));
      if (validProjects.length === 0) {
          const now = new Date();
          return { clientRows: [], globalStart: startOfDay(now), globalEnd: endOfDay(now), totalDays: 1 };
      }

      const today = new Date();
      const allDates: Date[] = [];
      const clientMap: Record<string, Date[]> = {};

      validProjects.forEach(p => {
          if (!clientMap[p.client]) clientMap[p.client] = [];
          
          const start = parseISO(p.startDate);
          let end = (p.endDate && isValid(parseISO(p.endDate))) ? parseISO(p.endDate) : today;
          if (end < start) end = start;

          clientMap[p.client].push(start, end);
          allDates.push(start, end);
      });

      const rows = Object.keys(clientMap).sort().map(client => {
          const dates = clientMap[client];
          const minD = min(dates);
          const maxD = max(dates);
          
          return {
              client,
              start: minD,
              end: maxD,
              duration: calculateDuration(minD, maxD, holidays)
          };
      });

      const gStart = min(allDates);
      const gEnd = max(allDates);
      const gRange = differenceInCalendarDays(gEnd, gStart) + 1;

      return { clientRows: rows, globalStart: gStart, globalEnd: gEnd, totalDays: gRange };
  }, [projects, holidays]);

  const days = useMemo(() => {
      if (totalDays <= 0) return [];
      return eachDayOfInterval({ start: globalStart, end: globalEnd });
  }, [globalStart, globalEnd, totalDays]);

  // Sizing
  const MIN_DAY_WIDTH = 30;
  const chartWidth = Math.max(800, totalDays * MIN_DAY_WIDTH);

  if (clientRows.length === 0) {
      return (
          <div className="animate-in fade-in zoom-in-95 duration-200">
             <div className="flex items-center justify-between mb-6">
                <div>
                   <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                     <CalendarRange className="text-brand-600 dark:text-brand-400" />
                     Cronograma de Projetos
                   </h2>
                   <p className="text-sm text-slate-500 dark:text-slate-400">Linha do tempo visual da execução dos projetos por cliente.</p>
                </div>
            </div>
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 text-center">
                <CalendarClock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-slate-400">Sem dados suficientes para o cronograma.</p>
            </div>
          </div>
      );
  }

  return (
    <div className="animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
            <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <CalendarRange className="text-brand-600 dark:text-brand-400" />
                    Cronograma de Projetos
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Linha do tempo visual da execução dos projetos por cliente.</p>
            </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Visão Geral por Cliente</h3>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-900 dark:bg-slate-400"></span>
                    <span>Clique na barra para ver detalhes</span>
                </div>
            </div>

            <div className="overflow-x-auto pb-2 custom-scrollbar">
                <div style={{ width: `${chartWidth}px` }} className="relative">
                    
                    {/* Header */}
                    <div className="flex border-b border-slate-200 dark:border-slate-700 mb-2 sticky top-0 bg-white dark:bg-slate-800 z-20 h-10">
                        <div className="w-[200px] flex-shrink-0 p-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase bg-white dark:bg-slate-800 sticky left-0 z-30 border-r border-slate-100 dark:border-slate-700 flex items-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            Cliente
                        </div>
                        <div className="flex-1 flex relative">
                            {days.map((day, idx) => {
                                const isMonthStart = format(day, 'dd') === '01' || idx === 0;
                                return (
                                    <div 
                                        key={idx} 
                                        style={{ width: `${100 / totalDays}%` }}
                                        className="border-l border-slate-100 dark:border-slate-700/50 flex flex-col items-center justify-end pb-1 relative"
                                    >
                                        {isMonthStart && (
                                            <span className="absolute bottom-2 left-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 whitespace-nowrap uppercase">
                                                {format(day, 'MMM', { locale: ptBR })}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Grid Lines */}
                    <div className="absolute top-10 bottom-0 left-[200px] right-0 flex pointer-events-none z-0">
                        {days.map((day, idx) => {
                            const isWe = isWeekend(day);
                            return (
                                <div 
                                key={idx} 
                                style={{ width: `${100 / totalDays}%` }}
                                className={`border-l border-slate-100 dark:border-slate-700/30 h-full ${isWe ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}`}
                                />
                            );
                        })}
                    </div>

                    {/* Rows */}
                    <div className="space-y-3 relative z-10 py-2">
                        {clientRows.map((row) => {
                            const offsetDays = differenceInCalendarDays(row.start, globalStart);
                            const visualDuration = differenceInCalendarDays(row.end, row.start) + 1;
                            const offsetPercent = (offsetDays / totalDays) * 100;
                            const widthPercent = (visualDuration / totalDays) * 100;

                            return (
                                <div key={row.client} className="flex items-center h-12 group hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors rounded-lg">
                                    <div className="w-[200px] flex-shrink-0 px-4 border-r border-slate-100 dark:border-slate-700 sticky left-0 z-10 bg-inherit font-semibold text-sm text-slate-700 dark:text-slate-200 truncate">
                                        {row.client}
                                    </div>
                                    <div className="flex-1 relative h-full">
                                        <div 
                                            onClick={() => setSelectedClient(row.client)}
                                            className="absolute top-1/2 -translate-y-1/2 h-6 bg-slate-800 dark:bg-slate-500 rounded-md shadow-sm cursor-pointer hover:bg-brand-700 dark:hover:bg-brand-500 transition-all hover:scale-[1.01] hover:h-7 group-hover:shadow-md"
                                            style={{ 
                                                left: `${offsetPercent}%`, 
                                                width: `${widthPercent}%` 
                                            }}
                                            title={`${row.client}\n${row.duration} dias úteis totais`}
                                        >
                                             {widthPercent > 15 && (
                                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white/90">
                                                    {row.duration} dias
                                                </span>
                                             )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>

        {/* DETAIL MODAL */}
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
