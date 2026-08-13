import React, { useMemo, useState } from 'react';
import { ProjectFile, Discipline, Status, ClientDoc } from '../types';
import {
  differenceInCalendarDays,
  format,
  startOfDay,
  eachDayOfInterval,
  eachMonthOfInterval,
  min,
  max,
  parseISO,
  isValid,
  isWeekend,
  addDays,
  isSameDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronRight,
  ChevronDown,
  Layers,
  ZoomIn,
  X,
  Briefcase,
  CalendarClock,
  CalendarRange,
  CheckCircle2,
  Download,
  AlertTriangle,
  Flag,
  TrendingUp,
} from 'lucide-react';
import {
  calculateBusinessDaysWithHolidays,
  calculateNetExecutionDuration,
  addBusinessDaysWithHolidays,
  isProjectsSlaClosed,
} from '../utils';

interface ProjectTimelineProps {
  projects: ProjectFile[];
  clients: ClientDoc[];
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

const STRIPE_PATTERN_STYLE = {
  backgroundImage:
    'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)',
  backgroundSize: '1rem 1rem',
};

const escapeXml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const DONE_STATUSES_FOR_EXPORT: Status[] = [Status.DONE, Status.WAITING_APPROVAL, Status.APPROVED];

const exportToMSProjectXML = (clientName: string, rows: any[]) => {
  // Primeira passada: atribui UIDs a todas as tasks (disciplinas e arquivos),
  // necessário para poder referenciar predecessores que aparecem em qualquer ordem.
  let idCounter = 1;
  const uidByFileId: Record<string, number> = {};
  const taskEntries: { uid: number; row: any; level: 1 | 2 }[] = [];

  rows.forEach((discRow) => {
    const discId = idCounter++;
    taskEntries.push({ uid: discId, row: discRow, level: 1 });
    if (discRow.children) {
      discRow.children.forEach((fileRow: any) => {
        const fileId = idCounter++;
        uidByFileId[fileRow.id] = fileId;
        taskEntries.push({ uid: fileId, row: fileRow, level: 2 });
      });
    }
  });

  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  xml += `<Project xmlns="http://schemas.microsoft.com/project">\n`;
  xml += `  <Name>${escapeXml(clientName)}</Name>\n`;
  xml += `  <CreationDate>${format(new Date(), "yyyy-MM-dd'T'HH:mm:ss")}</CreationDate>\n`;
  xml += `  <Tasks>\n`;

  taskEntries.forEach(({ uid, row, level }) => {
    const durHours = row.duration * 8;
    const isFileTask = level === 2;
    const percentComplete = isFileTask && DONE_STATUSES_FOR_EXPORT.includes(row.status) ? 100 : 0;

    xml += `    <Task>\n`;
    xml += `      <UID>${uid}</UID>\n`;
    xml += `      <ID>${uid}</ID>\n`;
    xml += `      <Name>${escapeXml(row.label)}</Name>\n`;
    xml += `      <Type>1</Type>\n`;
    xml += `      <Start>${format(row.start, "yyyy-MM-dd'T'08:00:00")}</Start>\n`;
    xml += `      <Finish>${format(row.end, "yyyy-MM-dd'T'17:00:00")}</Finish>\n`;
    xml += `      <Duration>PT${durHours}H0M0S</Duration>\n`;
    xml += `      <DurationFormat>7</DurationFormat>\n`;
    xml += `      <OutlineLevel>${level}</OutlineLevel>\n`;
    if (isFileTask) {
      xml += `      <PercentComplete>${percentComplete}</PercentComplete>\n`;
      (row.predecessorIds || []).forEach((predId: string) => {
        const predUid = uidByFileId[predId];
        if (predUid !== undefined) {
          xml += `      <PredecessorLink><PredecessorUID>${predUid}</PredecessorUID><Type>1</Type></PredecessorLink>\n`;
        }
      });
    }
    xml += `    </Task>\n`;
  });

  xml += `  </Tasks>\n`;
  xml += `</Project>`;

  const blob = new Blob([xml], { type: 'application/vnd.ms-project' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Cronograma_MSProject_${clientName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xml`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const ClientDetailGantt = ({
  clientName,
  projects,
  holidays,
  clients,
  onClose,
}: {
  clientName: string;
  projects: ProjectFile[];
  holidays: string[];
  clients: ClientDoc[];
  onClose: () => void;
}) => {
  const [expandedDisciplines, setExpandedDisciplines] = useState<Set<string>>(new Set());
  const toggleDiscipline = (disc: string) => {
    const newSet = new Set(expandedDisciplines);
    if (newSet.has(disc)) newSet.delete(disc);
    else newSet.add(disc);
    setExpandedDisciplines(newSet);
  };

  const [dayWidth, setDayWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('cronograma_day_width'));
    return [40, 16, 6].includes(saved) ? saved : 40;
  });
  const changeDayWidth = (w: number) => {
    setDayWidth(w);
    localStorage.setItem('cronograma_day_width', String(w));
  };

  const { rows, days, totalDays, chartStart, contractDeadline, holidaySet } = useMemo(() => {
    const hSet = new Set(holidays);
    const clientDoc = clients.find((c) => c.name === clientName);
    // Data Estipulada para Finalizar os Projetos (marco fixo do eixo do gráfico)
    const cDeadline =
      clientDoc?.projectDeadlineDate && isValid(parseISO(clientDoc.projectDeadlineDate))
        ? parseISO(clientDoc.projectDeadlineDate)
        : null;
    const validProjects = projects.filter((p) => p.startDate && isValid(parseISO(p.startDate)));
    if (validProjects.length === 0)
      return {
        rows: [],
        days: [],
        totalDays: 0,
        chartStart: new Date(),
        contractDeadline: null as Date | null,
        holidaySet: hSet,
      };
    const allDates: Date[] = [];
    if (cDeadline) allDates.push(cDeadline);
    const discMap: Record<string, ProjectFile[]> = {};
    validProjects.forEach((p) => {
      if (!discMap[p.discipline]) discMap[p.discipline] = [];
      discMap[p.discipline].push(p);
    });
    const rowData: any[] = [];
    const today = new Date();
    Object.keys(discMap)
      .sort()
      .forEach((disc) => {
        const files = discMap[disc];
        const discDates: Date[] = []; // Datas reais de execução (para a barra da disciplina)
        const fileRows: any[] = [];

        files.forEach((f) => {
          const start = parseISO(f.startDate);
          let end = f.endDate && isValid(parseISO(f.endDate)) ? parseISO(f.endDate) : today;
          if (end < start) end = start;

          discDates.push(start, end);
          allDates.push(start, end);

          // Calcula duração considerando periodos
          const duration = calculateBusinessDaysWithHolidays(
            start,
            end,
            holidays,
            f.startPeriod,
            f.endPeriod || (f.endDate ? 'TARDE' : 'TARDE'),
          );
          const netDuration = calculateNetExecutionDuration(f, holidays);

          // Marcos de envio e feedback do cliente (ciclo de aprovação)
          const send = f.sendDate && isValid(parseISO(f.sendDate)) ? parseISO(f.sendDate) : null;
          const feedback =
            f.feedbackDate && isValid(parseISO(f.feedbackDate)) ? parseISO(f.feedbackDate) : null;
          if (send) allDates.push(send);
          if (feedback) allDates.push(feedback);

          fileRows.push({
            id: f.id,
            type: 'FILE',
            label: f.filename,
            revision: f.revision,
            discipline: f.discipline,
            status: f.status,
            start,
            end,
            duration,
            netDuration,
            send,
            feedback,
            pauses: f.pauses || [],
            predecessorIds: f.predecessorIds || [],
          });
        });
        fileRows.sort((a, b) => a.start.getTime() - b.start.getTime());
        if (discDates.length > 0) {
          const minD = min(discDates);
          const maxD = max(discDates);
          // Duração do grupo agora reflete apenas o período real de execução
          const duration = calculateBusinessDaysWithHolidays(minD, maxD, holidays);
          rowData.push({
            id: `disc-${disc}`,
            type: 'DISCIPLINE',
            label: disc,
            discipline: disc,
            start: minD,
            end: maxD,
            duration,
            children: fileRows,
          });
        }
      });

    // Dependências entre arquivos: violações de precedência (predecessor termina depois do sucessor começar)
    const fileIndex: Record<string, any> = {};
    rowData.forEach((d) =>
      d.children.forEach((fr: any) => {
        fileIndex[fr.id] = fr;
      }),
    );
    validProjects.forEach((p) => {
      if (!p.predecessorIds?.length) return;
      const fr = fileIndex[p.id];
      if (!fr) return;
      const violated = p.predecessorIds
        .map((id) => fileIndex[id])
        .filter((pred) => pred && pred.end > fr.start)
        .map((pred) => pred.label);
      fr.predecessorViolations = violated;
    });

    // Caminho crítico: maior cadeia de dependências por duração líquida
    const memo: Record<string, number> = {};
    const chainLength = (id: string, visiting: Set<string>): number => {
      if (memo[id] !== undefined) return memo[id];
      if (visiting.has(id)) return 0; // proteção contra ciclos
      visiting.add(id);
      const fr = fileIndex[id];
      if (!fr) return 0;
      const proj = validProjects.find((p) => p.id === id);
      const predBest = (proj?.predecessorIds || []).reduce(
        (best, pid) => Math.max(best, chainLength(pid, visiting)),
        0,
      );
      visiting.delete(id);
      memo[id] = (fr.netDuration || fr.duration || 0) + predBest;
      return memo[id];
    };
    let criticalEndId: string | null = null;
    let maxLen = 0;
    Object.keys(fileIndex).forEach((id) => {
      const len = chainLength(id, new Set());
      if (len > maxLen) {
        maxLen = len;
        criticalEndId = id;
      }
    });
    const inPath = new Set<string>();
    let cursor: string | null = criticalEndId;
    while (cursor) {
      inPath.add(cursor);
      const proj = validProjects.find((p) => p.id === cursor);
      const preds = (proj?.predecessorIds || []).filter((pid) => fileIndex[pid]);
      cursor = preds.length > 0 ? preds.reduce((a, b) => (memo[a] >= memo[b] ? a : b)) : null;
    }
    rowData.forEach((d) =>
      d.children.forEach((fr: any) => {
        fr.isCritical = inPath.has(fr.id) && inPath.size > 1;
      }),
    );

    const gStart = min(allDates);
    const gEnd = max(allDates);
    const gRange = differenceInCalendarDays(gEnd, gStart) + 1;
    const axisDays = eachDayOfInterval({ start: gStart, end: gEnd });
    return {
      rows: rowData,
      days: axisDays,
      totalDays: gRange,
      chartStart: gStart,
      contractDeadline: cDeadline,
      holidaySet: hSet,
    };
  }, [projects, holidays, clients, clientName]);

  const visibleRows = useMemo(() => {
    const flat: any[] = [];
    rows.forEach((r) => {
      flat.push(r);
      if (expandedDisciplines.has(r.label)) {
        flat.push(...r.children);
      }
    });
    return flat;
  }, [rows, expandedDisciplines]);
  const chartWidth = Math.max(900, totalDays * dayWidth);

  // Posição das linhas verticais de referência (Hoje e Prazo dos Projetos)
  const todayOffset = differenceInCalendarDays(startOfDay(new Date()), chartStart);
  const showTodayLine = totalDays > 0 && todayOffset >= 0 && todayOffset < totalDays;
  const todayLeftPct = ((todayOffset + 0.5) / totalDays) * 100;
  const deadlineOffset = contractDeadline
    ? differenceInCalendarDays(contractDeadline, chartStart)
    : -1;
  const showDeadlineLine = totalDays > 0 && deadlineOffset >= 0 && deadlineOffset < totalDays;
  const deadlineLeftPct = ((deadlineOffset + 1) / totalDays) * 100;

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center md:p-4 backdrop-blur-sm p-0">
      <div className="bg-white dark:bg-slate-800 md:rounded-xl rounded-none shadow-2xl max-w-[95vw] w-full h-full md:h-[90vh] flex flex-col border dark:border-slate-700 overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-start bg-slate-50 dark:bg-slate-700/50 shrink-0">
          <div>
            <h3 className="text-lg md:text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Briefcase size={20} className="text-slate-500" />
              {clientName}
            </h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-1">
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
                Detalhamento por Disciplina e Arquivos
              </p>
              <div className="flex items-center gap-3 text-[10px] md:text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm bg-slate-400"></div>
                  <span className="text-slate-600 dark:text-slate-300 font-medium tracking-tight uppercase">
                    Executado
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-0.5 h-3 bg-red-500"></div>
                  <span className="text-slate-600 dark:text-slate-300 font-medium tracking-tight uppercase">
                    Hoje
                  </span>
                </div>
                {contractDeadline && (
                  <div className="flex items-center gap-1">
                    <div className="h-3 border-l-2 border-dashed border-amber-500"></div>
                    <span className="text-slate-600 dark:text-slate-300 font-medium tracking-tight uppercase">
                      Prazo dos Projetos ({format(contractDeadline, 'dd/MM/yy')})
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rotate-45 bg-blue-500"></div>
                  <span className="text-slate-600 dark:text-slate-300 font-medium tracking-tight uppercase">
                    Envio
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rotate-45 bg-emerald-500"></div>
                  <span className="text-slate-600 dark:text-slate-300 font-medium tracking-tight uppercase">
                    Feedback
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1 h-3 bg-red-500"></div>
                  <span className="text-slate-600 dark:text-slate-300 font-medium tracking-tight uppercase">
                    Caminho Crítico
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden text-xs font-bold">
              {[
                { w: 40, label: 'Dia' },
                { w: 16, label: 'Semana' },
                { w: 6, label: 'Mês' },
              ].map((opt) => (
                <button
                  key={opt.w}
                  onClick={() => changeDayWidth(opt.w)}
                  className={`px-2.5 py-1.5 transition-colors ${dayWidth === opt.w ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => exportToMSProjectXML(clientName, rows)}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              <Download size={14} />
              <span className="hidden sm:inline">MS Project XML</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-full transition-colors text-slate-500 dark:text-slate-400"
              aria-label="Fechar"
            >
              <X size={24} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto custom-scrollbar relative bg-white dark:bg-slate-800">
          <div style={{ width: `${chartWidth}px` }} className="relative min-h-full">
            <div className="flex border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-30 h-12 shadow-sm">
              <div className="w-[130px] md:w-[350px] flex-shrink-0 p-3 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase bg-white dark:bg-slate-800 sticky left-0 z-40 border-r border-slate-100 dark:border-slate-700 flex items-center">
                Disciplina / Arquivo
              </div>
              <div className="flex-1 flex relative">
                {days.map((day, idx) => {
                  const isWe = isWeekend(day);
                  const isHol = holidaySet.has(format(day, 'yyyy-MM-dd'));
                  const isToday = isSameDay(day, new Date());
                  const isMonthStart = format(day, 'dd') === '01' || idx === 0;
                  const showDayNumber =
                    dayWidth >= 24 ||
                    (dayWidth >= 12 && day.getDay() === 1) ||
                    (dayWidth < 12 && format(day, 'dd') === '01');
                  return (
                    <div
                      key={idx}
                      style={{ width: `${100 / totalDays}%` }}
                      title={isHol ? 'Feriado' : undefined}
                      className={`border-l border-slate-100 dark:border-slate-700/50 flex flex-col items-center justify-end pb-2 ${isToday ? 'bg-red-50 dark:bg-red-900/30' : isHol ? 'bg-rose-50 dark:bg-rose-900/20' : isWe ? 'bg-slate-50 dark:bg-slate-900/50' : ''}`}
                    >
                      {showDayNumber && (
                        <span
                          className={`text-[10px] font-bold ${isToday ? 'text-red-600 dark:text-red-400' : isHol ? 'text-rose-400 dark:text-rose-500' : 'text-slate-400 dark:text-slate-500'}`}
                        >
                          {format(day, 'dd')}
                        </span>
                      )}
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
            <div className="absolute top-12 bottom-0 left-[130px] md:left-[350px] right-0 flex pointer-events-none z-0">
              {days.map((day, idx) => {
                const isWe = isWeekend(day);
                const isHol = holidaySet.has(format(day, 'yyyy-MM-dd'));
                return (
                  <div
                    key={idx}
                    style={{ width: `${100 / totalDays}%` }}
                    className={`border-l border-slate-100 dark:border-slate-700/30 h-full ${isHol ? 'bg-rose-50/60 dark:bg-rose-900/10' : isWe ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}`}
                  />
                );
              })}
            </div>
            <div className="relative z-10">
              {visibleRows.map((row: any) => {
                const offsetDays = differenceInCalendarDays(row.start, chartStart);
                const visualDuration = Math.max(
                  1,
                  differenceInCalendarDays(row.end, row.start) + 1,
                );
                const offsetPercent = (offsetDays / totalDays) * 100;
                const widthPercent = (visualDuration / totalDays) * 100;
                const isDisc = row.type === 'DISCIPLINE';
                const isExpanded = isDisc && expandedDisciplines.has(row.label);
                const isDone =
                  row.status === Status.DONE ||
                  row.status === Status.APPROVED ||
                  row.status === Status.WAITING_APPROVAL;
                const isRejected = row.status === Status.REJECTED;

                return (
                  <div
                    key={row.id}
                    className={`flex items-center h-10 border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 group transition-colors ${isDisc ? 'bg-slate-50 dark:bg-slate-800' : 'bg-white dark:bg-slate-800'} ${row.isCritical ? 'border-l-2 border-l-red-500' : ''}`}
                  >
                    <div className="w-[130px] md:w-[350px] flex-shrink-0 px-2 md:px-4 flex items-center sticky left-0 z-20 bg-inherit border-r border-slate-100 dark:border-slate-700/50 h-full overflow-hidden">
                      {isDisc ? (
                        <button
                          onClick={() => toggleDiscipline(row.label)}
                          className="flex items-center space-x-2 w-full text-left font-semibold text-slate-700 dark:text-slate-200"
                        >
                          {isExpanded ? (
                            <ChevronDown size={14} className="flex-shrink-0" />
                          ) : (
                            <ChevronRight size={14} className="flex-shrink-0" />
                          )}
                          <span className="truncate text-xs md:text-sm">{row.label}</span>
                          <span className="ml-auto flex items-center gap-1">
                            <span className="text-[9px] md:text-[10px] px-1.5 py-0.5 bg-slate-200 dark:bg-slate-600 rounded-full text-slate-600 dark:text-slate-300 hidden md:inline-block">
                              {row.children.length} arq
                            </span>
                          </span>
                        </button>
                      ) : (
                        <div className="pl-4 md:pl-6 flex items-center gap-1.5 text-xs md:text-sm text-slate-600 dark:text-slate-400 w-full overflow-hidden">
                          {row.revision !== undefined && (
                            <span className="flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 leading-none">
                              R{row.revision}
                            </span>
                          )}
                          <span
                            className={`truncate flex-1 ${row.status === Status.DONE ? 'line-through opacity-70' : ''}`}
                            title={row.label}
                          >
                            {row.label}
                          </span>
                          {row.predecessorViolations?.length > 0 && (
                            <span
                              className="flex-shrink-0"
                              title={`Iniciou antes do término de: ${row.predecessorViolations.join(', ')}`}
                            >
                              <AlertTriangle size={12} className="text-amber-500" />
                            </span>
                          )}
                          {isDone && (
                            <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0" />
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 relative h-full">
                      {/* Barra Executada Principal */}
                      <div
                        className={`absolute top-2.5 bottom-2.5 rounded-md shadow-sm transition-all flex items-center px-2 whitespace-nowrap overflow-hidden text-[10px] md:text-xs font-medium text-white ${isDisc ? 'opacity-80' : ''} ${DISCIPLINE_COLORS[row.discipline] || 'bg-slate-400'} ${isRejected ? 'ring-2 ring-rose-500' : ''} z-10`}
                        style={{
                          left: `${offsetPercent}%`,
                          width: `${widthPercent}%`,
                          ...(isDisc && !isDone ? STRIPE_PATTERN_STYLE : {}),
                        }}
                        title={`${row.label}\n${format(row.start, 'dd/MM/yyyy')} → ${format(row.end, 'dd/MM/yyyy')}${row.status ? `\nStatus: ${row.status}` : ''}`}
                      >
                        <span className="drop-shadow-md">
                          {row.type === 'FILE' && row.netDuration !== undefined
                            ? row.netDuration
                            : row.duration}{' '}
                          dias
                        </span>
                      </div>

                      {/* Indicador Visual de Pausas */}
                      {row.type === 'FILE' &&
                        row.pauses &&
                        row.pauses.length > 0 &&
                        row.pauses.map((pause: any, idx: number) => {
                          if (!pause.startDate) return null;
                          const pStart = parseISO(pause.startDate);
                          const pEnd = pause.endDate ? parseISO(pause.endDate) : new Date();
                          const pOffsetDays = differenceInCalendarDays(pStart, chartStart);
                          const pDuration = Math.max(1, differenceInCalendarDays(pEnd, pStart) + 1);
                          const pOffsetPercent = (pOffsetDays / totalDays) * 100;
                          const pWidthPercent = (pDuration / totalDays) * 100;
                          return (
                            <div
                              key={`pause-${row.id}-${idx}`}
                              className="absolute top-2.5 bottom-2.5 bg-black/40 dark:bg-black/60 z-[11] pointer-events-none rounded-sm border-x border-slate-400/50"
                              style={{
                                left: `${pOffsetPercent}%`,
                                width: `${pWidthPercent}%`,
                                backgroundImage:
                                  'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.1) 4px, rgba(255,255,255,0.1) 8px)',
                              }}
                              title={`Pausado: ${pause.reason || 'Sem motivo registrado'}`}
                            />
                          );
                        })}

                      {/* Faixa "tempo do cliente" (envio → feedback ou hoje) */}
                      {row.type === 'FILE' && row.send && (
                        <div
                          className="absolute bottom-1 h-1 rounded-full bg-blue-400/50 dark:bg-blue-500/40 z-[11] pointer-events-none"
                          style={{
                            left: `${((differenceInCalendarDays(row.send, chartStart) + 0.5) / totalDays) * 100}%`,
                            width: `${(Math.max(0.5, differenceInCalendarDays(row.feedback || new Date(), row.send)) / totalDays) * 100}%`,
                          }}
                        />
                      )}
                      {/* Marco: enviado ao cliente */}
                      {row.type === 'FILE' && row.send && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-blue-500 border border-white dark:border-slate-800 shadow z-[13]"
                          style={{
                            left: `${((differenceInCalendarDays(row.send, chartStart) + 0.5) / totalDays) * 100}%`,
                          }}
                          title={`Enviado ao cliente: ${format(row.send, 'dd/MM/yyyy')}`}
                        />
                      )}
                      {/* Marco: feedback do cliente */}
                      {row.type === 'FILE' && row.feedback && (
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border border-white dark:border-slate-800 shadow z-[13] ${row.status === Status.REJECTED ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{
                            left: `${((differenceInCalendarDays(row.feedback, chartStart) + 0.5) / totalDays) * 100}%`,
                          }}
                          title={`Feedback: ${format(row.feedback, 'dd/MM/yyyy')} — ${row.status}`}
                        />
                      )}

                      {/* Linhas de referência: Hoje e Prazo dos Projetos */}
                      {showTodayLine && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-red-500/70 z-[12] pointer-events-none"
                          style={{ left: `${todayLeftPct}%` }}
                        />
                      )}
                      {showDeadlineLine && (
                        <div
                          className="absolute top-0 bottom-0 border-l-2 border-dashed border-amber-500/60 z-[12] pointer-events-none"
                          style={{ left: `${deadlineLeftPct}%` }}
                        />
                      )}
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

export const ProjectTimeline: React.FC<ProjectTimelineProps> = ({
  projects,
  holidays,
  clients,
}) => {
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'CARDS' | 'TIMELINE'>('CARDS');

  const clientStats = useMemo(() => {
    const groups: Record<
      string,
      {
        totalFiles: number;
        startDate: Date;
        endDate: Date;
        activeFiles: number;
        deliveredFiles: number;
        relevantFiles: number;
        deliveryDates: Date[];
      }
    > = {};
    const today = new Date();
    // Entregue = executado e enviado/aprovado. Reprovado exige retrabalho; Revisado é obsoleto (sai do denominador).
    const DELIVERED_STATUSES: Status[] = [Status.DONE, Status.WAITING_APPROVAL, Status.APPROVED];

    projects.forEach((p) => {
      if (!groups[p.client]) {
        groups[p.client] = {
          totalFiles: 0,
          startDate: new Date(2100, 0, 1),
          endDate: new Date(1900, 0, 1),
          activeFiles: 0,
          deliveredFiles: 0,
          relevantFiles: 0,
          deliveryDates: [],
        };
      }
      groups[p.client].totalFiles += 1;
      if (p.status !== Status.REVISED) {
        groups[p.client].relevantFiles += 1;
        if (DELIVERED_STATUSES.includes(p.status)) {
          groups[p.client].deliveredFiles += 1;
          if (p.endDate && isValid(parseISO(p.endDate))) {
            groups[p.client].deliveryDates.push(parseISO(p.endDate));
          }
        }
      }
      if (p.status === Status.IN_PROGRESS) {
        groups[p.client].activeFiles += 1;
      }

      if (p.startDate && isValid(parseISO(p.startDate))) {
        const s = parseISO(p.startDate);
        if (s < groups[p.client].startDate) groups[p.client].startDate = s;

        let e = today;
        if (p.endDate && isValid(parseISO(p.endDate))) {
          e = parseISO(p.endDate);
        } else if (p.sendDate && isValid(parseISO(p.sendDate))) {
          e = parseISO(p.sendDate);
        }

        if (e > groups[p.client].endDate) groups[p.client].endDate = e;
      }
    });

    // Cleanup invalid dates if no project has dates
    Object.keys(groups).forEach((c) => {
      if (groups[c].startDate.getFullYear() === 2100) groups[c].startDate = today;
      if (groups[c].endDate.getFullYear() === 1900) groups[c].endDate = today;
    });

    return Object.entries(groups)
      .map(([name, stats]) => {
        const clientDoc = clients.find((c) => c.name === name);
        const deadline =
          clientDoc?.projectDeadlineDate && isValid(parseISO(clientDoc.projectDeadlineDate))
            ? parseISO(clientDoc.projectDeadlineDate)
            : null;
        const progress =
          stats.relevantFiles > 0
            ? Math.round((stats.deliveredFiles / stats.relevantFiles) * 100)
            : 0;
        const isOverdue =
          !!deadline && !isProjectsSlaClosed(clientDoc) && today > deadline && progress < 100;
        const isFinished =
          (stats.relevantFiles > 0 && progress >= 100) || !!clientDoc?.projectsDeliveredAt;

        // Previsão de conclusão: ritmo de entregas nos últimos 45 dias corridos
        const WINDOW_DAYS = 45;
        const windowStart = addDays(today, -WINDOW_DAYS);
        const recentDeliveries = stats.deliveryDates.filter(
          (d) => d >= windowStart && d <= today,
        ).length;
        const windowBusinessDays = calculateBusinessDaysWithHolidays(windowStart, today, holidays);
        const pace = windowBusinessDays > 0 ? recentDeliveries / windowBusinessDays : 0;
        const remaining = stats.relevantFiles - stats.deliveredFiles;
        let forecastDate: Date | null = null;
        if (remaining > 0 && pace > 0) {
          forecastDate = addBusinessDaysWithHolidays(today, Math.ceil(remaining / pace), holidays);
        }
        const forecastBeyondDeadline = !!(forecastDate && deadline && forecastDate > deadline);

        return {
          name,
          ...stats,
          // Na visão macro, mantemos o cálculo aproximado (inteiro), pois envolve muitos arquivos com períodos diferentes
          duration: calculateBusinessDaysWithHolidays(stats.startDate, stats.endDate, holidays),
          deadline,
          progress,
          isOverdue,
          isFinished,
          forecastDate,
          forecastBeyondDeadline,
          remaining,
        };
      })
      .sort((a, b) => {
        // Clientes em atraso primeiro, depois por volume de trabalho ativo
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return b.activeFiles - a.activeFiles;
      });
  }, [projects, holidays, clients]);

  const portfolio = useMemo(() => {
    if (clientStats.length === 0) return null;
    const today = new Date();
    const allDates: Date[] = [today];
    clientStats.forEach((c) => {
      allDates.push(c.startDate, c.endDate);
      if (c.deadline) allDates.push(c.deadline);
      if (c.forecastDate) allDates.push(c.forecastDate);
    });
    const gStart = min(allDates);
    const gEnd = max(allDates);
    const total = differenceInCalendarDays(gEnd, gStart) + 1;
    const months = eachMonthOfInterval({ start: gStart, end: gEnd });
    const pct = (d: Date) => (differenceInCalendarDays(d, gStart) / total) * 100;
    return { gStart, gEnd, total, months, pct, todayPct: pct(today) };
  }, [clientStats]);

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
        <CalendarRange size={48} className="text-slate-300 dark:text-slate-600 mb-4" />
        <h3 className="text-lg text-slate-500 dark:text-slate-400 font-medium">Cronograma Vazio</h3>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Adicione projetos com datas para visualizar o cronograma.
        </p>
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
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Visão macro dos prazos e andamento por cliente.
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-bold">
          <button
            onClick={() => setViewMode('CARDS')}
            className={`px-3 py-1.5 ${viewMode === 'CARDS' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            Cards
          </button>
          <button
            onClick={() => setViewMode('TIMELINE')}
            className={`px-3 py-1.5 ${viewMode === 'TIMELINE' ? 'bg-brand-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            Linha do tempo
          </button>
        </div>
      </div>

      {viewMode === 'CARDS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clientStats.map((client) => (
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
                  <h3
                    className="text-lg font-bold text-slate-800 dark:text-white truncate pr-2"
                    title={client.name}
                  >
                    {client.name}
                  </h3>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {client.isOverdue && (
                      <div className="bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap flex items-center gap-1">
                        <AlertTriangle size={12} /> Em atraso
                      </div>
                    )}
                    {client.isFinished && !client.isOverdue && (
                      <div className="bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">
                        Concluído
                      </div>
                    )}
                    <div className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">
                      {client.activeFiles} ativos
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <CalendarRange size={16} className="text-brand-600 dark:text-brand-400" />
                    <span>
                      {format(client.startDate, 'dd/MM/yyyy')} até{' '}
                      {format(client.endDate, 'dd/MM/yyyy')}
                    </span>
                  </div>
                  {client.deadline && (
                    <div
                      className={`flex items-center gap-2 text-sm ${client.isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}
                    >
                      <Flag
                        size={16}
                        className={
                          client.isOverdue ? 'text-red-500' : 'text-brand-600 dark:text-brand-400'
                        }
                      />
                      <span>Prazo contratual: {format(client.deadline, 'dd/MM/yyyy')}</span>
                    </div>
                  )}
                  {client.forecastDate && (
                    <div
                      className={`flex items-center gap-2 text-sm ${client.forecastBeyondDeadline ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400'}`}
                    >
                      <TrendingUp size={16} />
                      <span>Previsão de término: {format(client.forecastDate, 'dd/MM/yyyy')}</span>
                    </div>
                  )}
                  {!client.forecastDate && client.remaining > 0 && (
                    <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
                      <TrendingUp size={16} />
                      <span>Previsão: sem entregas nos últimos 45 dias</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Layers size={16} className="text-brand-600 dark:text-brand-400" />
                    <span>{client.totalFiles} arquivos totais</span>
                  </div>

                  <div className="pt-2">
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                      <span>Progresso (Arquivos Entregues)</span>
                      <span className="font-bold">{client.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${client.isOverdue ? 'bg-red-500' : 'bg-brand-600 dark:bg-brand-500'}`}
                        style={{ width: `${client.progress}%` }}
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
      )}

      {viewMode === 'TIMELINE' && portfolio && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {/* Eixo de meses */}
          <div className="flex h-8 border-b border-slate-200 dark:border-slate-700">
            <div className="w-[140px] md:w-[220px] flex-shrink-0 border-r border-slate-100 dark:border-slate-700"></div>
            <div className="flex-1 relative">
              {portfolio.months.map((m, i) => (
                <span
                  key={i}
                  className="absolute top-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 whitespace-nowrap"
                  style={{ left: `${portfolio.pct(m)}%` }}
                >
                  {format(m, 'MMM/yy', { locale: ptBR })}
                </span>
              ))}
            </div>
          </div>
          {/* Linhas por cliente */}
          {clientStats.map((client) => (
            <div
              key={client.name}
              onClick={() => setSelectedClient(client.name)}
              className="flex items-center h-11 border-b border-slate-50 dark:border-slate-700/30 hover:bg-slate-50 dark:hover:bg-slate-700/20 cursor-pointer"
            >
              <div
                className="w-[140px] md:w-[220px] flex-shrink-0 px-3 text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-200 truncate border-r border-slate-100 dark:border-slate-700"
                title={client.name}
              >
                {client.name}
              </div>
              <div className="flex-1 relative h-full">
                {/* Gridlines de mês */}
                {portfolio.months.map((m, i) => (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 w-px bg-slate-100 dark:bg-slate-700/40"
                    style={{ left: `${portfolio.pct(m)}%` }}
                  />
                ))}
                {/* Barra do cliente */}
                <div
                  className={`absolute top-3 bottom-3 rounded-full ${client.isOverdue ? 'bg-red-500' : client.isFinished ? 'bg-emerald-500' : 'bg-brand-600 dark:bg-brand-500'}`}
                  style={{
                    left: `${portfolio.pct(client.startDate)}%`,
                    width: `${Math.max(0.5, portfolio.pct(client.endDate) - portfolio.pct(client.startDate))}%`,
                  }}
                  title={`${client.name}: ${format(client.startDate, 'dd/MM/yy')} → ${format(client.endDate, 'dd/MM/yy')} · ${client.progress}% entregue`}
                />
                {/* Marco do prazo de entrega dos projetos */}
                {client.deadline && (
                  <div
                    className="absolute top-1 bottom-1 border-l-2 border-dashed border-amber-500"
                    style={{ left: `${portfolio.pct(client.deadline)}%` }}
                    title={`Prazo contratual: ${format(client.deadline, 'dd/MM/yyyy')}`}
                  />
                )}
                {/* Linha de hoje */}
                <div
                  className="absolute top-0 bottom-0 w-px bg-red-500/70"
                  style={{ left: `${portfolio.todayPct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedClient && (
        <ClientDetailGantt
          clientName={selectedClient}
          projects={projects.filter((p) => p.client === selectedClient)}
          holidays={holidays}
          clients={clients}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  );
};
