
import React, { useMemo, useState, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ProjectFile, Discipline, Status, MaterialDoc, ProjectPhase, ClientDoc } from '../types';
import { format, parseISO, isValid, isAfter, isSameDay, addDays, startOfDay } from 'date-fns';
import { LayoutDashboard, FileDown } from 'lucide-react';
import { getProjectBaseName, getRevisionNumber, calculateBusinessDaysWithHolidays, calculateNetExecutionDuration, calculateDeadlineDate } from '../utils';
import { useDashboardFilters } from '../hooks/useDashboardFilters';
import { DashboardFilters } from './DashboardFilters';
import { DrillDownModal, DrillDownPayload } from './DrillDownModal';


interface DashboardProps {
  data: ProjectFile[];
  materials?: MaterialDoc[];
  clients?: ClientDoc[];
  isDarkMode?: boolean;
  holidays: string[];
}

const DISCIPLINE_COLORS: Record<string, string> = {
  [Discipline.ARCHITECTURE]: '#8e1c3e', 
  [Discipline.STRUCTURE]: '#64748b',   
  [Discipline.FOUNDATION]: '#94a3b8',  
  [Discipline.HYDRAULIC]: '#06b6d4',   
  [Discipline.ELECTRICAL]: '#eab308',  
  [Discipline.DATA]: '#8b5cf6',        
  [Discipline.SPDA]: '#ef4444',        
  [Discipline.HVAC]: '#10b981',        
  [Discipline.OTHER]: '#f472b6',       
};

export const Dashboard: React.FC<DashboardProps> = ({ data, materials = [], clients = [], isDarkMode = false, holidays }) => {
  const axisColor = isDarkMode ? '#94a3b8' : '#64748b';
  const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
  const tooltipBg = isDarkMode ? '#1e293b' : '#ffffff';
  const tooltipText = isDarkMode ? '#f1f5f9' : '#1e293b';

  // --- Filtros dinâmicos ---
  const { filters, filteredProjects, activeFilterCount, availableClients, clearAllFilters, toggleMulti, setDateFrom, setDateTo } = useDashboardFilters(data);

  // --- Drill-down state ---
  const [drillDown, setDrillDown] = useState<DrillDownPayload | null>(null);
  const closeDrillDown = useCallback(() => setDrillDown(null), []);


  const handlePrint = () => {
      window.print();
  };

  const stats = useMemo(() => {
    // Structure for Execution Time by Phase
    const timeByDiscipline: Record<string, { prelimTotal: number; prelimCount: number; execTotal: number; execCount: number }> = {};
    
    const fttByDiscipline: Record<string, { totalGroups: number; successGroups: number; phase: string }> = {};
    const clientResponseMap: Record<string, { totalDays: number; count: number }> = {};
    const fileGroups: Record<string, { discipline: string, phase: string, hasRevisionOrRejection: boolean }> = {};
    const volumeMap: Record<string, any> = {};
    const reasonsMap: Record<string, number> = {};
    const cycleTimeByDiscipline: Record<string, { total: number; count: number }> = {};
    
    let totalSlaMeasured = 0;
    let totalOnTime = 0;
    
    const alerts: ProjectFile[] = [];
    const today = startOfDay(new Date());

    const clientsMap: Record<string, ClientDoc> = {};
    clients.forEach(c => clientsMap[c.name] = c);

    // Usa filteredProjects em vez de data para reagir aos filtros
    filteredProjects.forEach(project => {


      // 1. Execution Time Calculation (Split by Phase)
      // C2: Conta projetos com startDate (ciclo aberto usa today como fim)
      // Inclui TODOS os projetos (inclusive REVISED) no cálculo de tempo médio de execução
      if (project.startDate && isValid(parseISO(project.startDate))) {
        const start = parseISO(project.startDate);
        let end = (project.endDate && isValid(parseISO(project.endDate)))
            ? parseISO(project.endDate)
            : today;
        if (end < start) end = start;
        
        const duration = calculateNetExecutionDuration(
            { ...project, endDate: project.endDate || format(today, 'yyyy-MM-dd') },
            holidays
        );

        if (!timeByDiscipline[project.discipline]) {
          timeByDiscipline[project.discipline] = { prelimTotal: 0, prelimCount: 0, execTotal: 0, execCount: 0 };
        }

        const phase = project.phase || ProjectPhase.EXECUTIVE;
        
        if (phase === ProjectPhase.PRELIMINARY) {
            timeByDiscipline[project.discipline].prelimTotal += duration;
            timeByDiscipline[project.discipline].prelimCount += 1;
        } else {
            timeByDiscipline[project.discipline].execTotal += duration;
            timeByDiscipline[project.discipline].execCount += 1;
        }
      }

      // 2. Client Response Time
      // C3: Usar days > 0 para excluir zeros falsos (valor padrão sem cálculo real)
      if (project.blockedDays !== undefined && project.blockedDays !== null) {
          const days = Number(project.blockedDays);
          if (days > 0 && (project.feedbackDate || project.status === Status.APPROVED || project.status === Status.REJECTED)) {
              if (!clientResponseMap[project.client]) {
                  clientResponseMap[project.client] = { totalDays: 0, count: 0 };
              }
              clientResponseMap[project.client].totalDays += days;
              clientResponseMap[project.client].count += 1;
          }
      }

      // 3. FTT & Groups Logic
      // M4: Separar FTT/IAPR por fase
      const baseName = getProjectBaseName(project.filename);
      const projectPhase = project.phase || 'Executivo';
      const groupKey = `${project.client}|${project.discipline}|${baseName}|${projectPhase}`;

      if (!fileGroups[groupKey]) {
          fileGroups[groupKey] = { discipline: project.discipline, phase: projectPhase, hasRevisionOrRejection: false };
      }

      if (getRevisionNumber(project.filename) > 0 || project.status === Status.REJECTED || project.status === Status.REVISED) {
          fileGroups[groupKey].hasRevisionOrRejection = true;
      }

      project.revisions.forEach(rev => {
         reasonsMap[rev.reason] = (reasonsMap[rev.reason] || 0) + 1;
      });

      // 4. Volume Logic — inclui TODOS os projetos para refletir dados reais
      {
        if (!volumeMap[project.client]) {
          volumeMap[project.client] = { name: project.client, total: 0 };
        }
        volumeMap[project.client].total += 1;
        volumeMap[project.client][project.discipline] = (volumeMap[project.client][project.discipline] || 0) + 1;
      }

      // S3: Cycle Time (startDate → feedbackDate) — inclui todos os projetos com ciclo completo
      if (project.startDate && project.feedbackDate && 
          isValid(parseISO(project.startDate)) && isValid(parseISO(project.feedbackDate))) {
          const start = parseISO(project.startDate);
          const feedback = parseISO(project.feedbackDate);
          if (feedback >= start) {
              const cycleDays = calculateBusinessDaysWithHolidays(start, feedback, holidays, project.startPeriod, project.feedbackPeriod || 'TARDE');
              if (!cycleTimeByDiscipline[project.discipline]) {
                  cycleTimeByDiscipline[project.discipline] = { total: 0, count: 0 };
              }
              cycleTimeByDiscipline[project.discipline].total += cycleDays;
              cycleTimeByDiscipline[project.discipline].count += 1;
          }
      }

      // 5. OTD and SLA Alerts
      // Atrasos e OTD exigem que o cliente daquele projeto tenha uma SLA associada 
      const clientData = clientsMap[project.client];
      const hasSLA = clientData?.contractDate && clientData?.deadlineDays !== undefined;
      
      if (hasSLA) {
          const deadlineDate = calculateDeadlineDate(clientData.contractDate as string, clientData.deadlineDays as number);
          
          if (deadlineDate) {
              const deadline = deadlineDate;
              const isDone = project.status === Status.DONE || project.status === Status.APPROVED;

              // Kanban Alert calculation string conditions: Vencendo Hoje or Atrasado
              if (!isDone && project.status !== Status.REJECTED && project.status !== Status.WAITING_APPROVAL) {
                  if (isAfter(today, deadline)) {
                      alerts.push({ ...project, _tempSlaStatus: 'ATRASADO' } as any);
                  } else if (isSameDay(today, deadline) || isSameDay(addDays(today, 1), deadline)) {
                      // Vencendo hoje ou amanha
                      alerts.push({ ...project, _tempSlaStatus: 'VENCENDO' } as any);
                  }
              }

              // OTD Calculation - Only measured if project is DONE/APPROVED or if it went past due in an active state
              if (isDone && project.feedbackDate) {
                  totalSlaMeasured++;
                  if (!isAfter(parseISO(project.feedbackDate), deadline)) {
                      totalOnTime++;
                  }
              } else if (!isDone && isAfter(today, deadline)) {
                  // Active project that is already late also negatively hits the OTD rate
                  totalSlaMeasured++;
              }
          }
      }
    });

    // M4: IAPR separado por fase (Preliminar / Executivo)
    Object.values(fileGroups).forEach(group => {
        const fttKey = `${group.discipline} (${group.phase === 'Preliminar' ? 'Prel' : 'Exec'})`;
        if (!fttByDiscipline[fttKey]) {
            fttByDiscipline[fttKey] = { totalGroups: 0, successGroups: 0, phase: group.phase };
        }
        fttByDiscipline[fttKey].totalGroups += 1;
        if (!group.hasRevisionOrRejection) {
            fttByDiscipline[fttKey].successGroups += 1;
        }
    });

    const executionData = Object.keys(timeByDiscipline).map(d => ({
      name: d,
      avgPrelim: timeByDiscipline[d].prelimCount ? Number((timeByDiscipline[d].prelimTotal / timeByDiscipline[d].prelimCount).toFixed(1)) : 0,
      avgExec: timeByDiscipline[d].execCount ? Number((timeByDiscipline[d].execTotal / timeByDiscipline[d].execCount).toFixed(1)) : 0
    }));

    const clientResponseData = Object.keys(clientResponseMap).map(c => ({
        name: c,
        avgDays: clientResponseMap[c].count ? Number((clientResponseMap[c].totalDays / clientResponseMap[c].count).toFixed(1)) : 0
    })).sort((a, b) => b.avgDays - a.avgDays); 

    const fttData = Object.keys(fttByDiscipline).map(d => ({
      name: d,
      rate: fttByDiscipline[d].totalGroups 
        ? Math.round((fttByDiscipline[d].successGroups / fttByDiscipline[d].totalGroups) * 100) 
        : 0
    }));

    const volumeData = Object.values(volumeMap).sort((a: any, b: any) => b.total - a.total);

    const reasonsData = Object.entries(reasonsMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // S3: Dados de Cycle Time
    const cycleTimeData = Object.keys(cycleTimeByDiscipline).map(d => ({
      name: d,
      avgCycle: cycleTimeByDiscipline[d].count ? Number((cycleTimeByDiscipline[d].total / cycleTimeByDiscipline[d].count).toFixed(1)) : 0
    }));

    const otdPercentage = totalSlaMeasured > 0 ? Math.round((totalOnTime / totalSlaMeasured) * 100) : 0;
    const otdChartData = [
         { name: 'No Prazo', value: totalOnTime, color: '#10b981' }, 
         { name: 'Atrasado', value: totalSlaMeasured - totalOnTime, color: '#ef4444' }
    ].filter(d => d.value > 0);

    // Sort alerts: ATRASADO first
    alerts.sort((a: any, b: any) => {
        if (a._tempSlaStatus === 'ATRASADO' && b._tempSlaStatus !== 'ATRASADO') return -1;
        if (b._tempSlaStatus === 'ATRASADO' && a._tempSlaStatus !== 'ATRASADO') return 1;
        return 0;
    });

    return { executionData, fttData, volumeData, reasonsData, clientResponseData, cycleTimeData, otdPercentage, otdChartData, totalSlaMeasured, alerts, rawReasons: reasonsData };
  }, [filteredProjects, holidays, clients]);

  const materialStats = useMemo(() => {
     const groups: Record<string, MaterialDoc[]> = {};
     materials.forEach(m => {
         const baseName = getProjectBaseName(m.filename);
         if (!groups[baseName]) {
             groups[baseName] = [];
         }
         groups[baseName].push(m);
     });

     const latestFiles = Object.values(groups).map(group => {
         return group.sort((a, b) => getRevisionNumber(b.filename) - getRevisionNumber(a.filename))[0];
     });

     const total = latestFiles.length;
     const done = latestFiles.filter(m => m.status === 'DONE').length;
     const pending = total - done;
     const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
     
     const chartData = [
         { name: 'Concluído', value: done, color: '#10b981' }, 
         { name: 'Pendente', value: pending, color: isDarkMode ? '#334155' : '#e2e8f0' }
     ].filter(d => d.value > 0);

     return { total, done, percentage, chartData };
  }, [materials, isDarkMode]);


  return (
    <div className="animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between mb-6">
        <div>
           <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
             <LayoutDashboard className="text-brand-600 dark:text-brand-400" />
             Painel de Indicadores
           </h2>
           <p className="text-sm text-slate-500 dark:text-slate-400">Visão geral do desempenho, assertividade e volume de projetos.</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
          >
            <FileDown size={18} />
            <span className="font-medium hidden sm:inline">Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* Filtros Dinâmicos */}
      <DashboardFilters
        filters={filters}
        availableClients={availableClients}
        activeFilterCount={activeFilterCount}
        onToggleMulti={toggleMulti}
        onSetDateFrom={setDateFrom}
        onSetDateTo={setDateTo}
        onClearAll={clearAllFilters}
      />

      {stats.alerts.length > 0 && (
          <div className="mb-6 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-xl p-6 shadow-sm">
             <h3 className="text-lg font-bold text-rose-800 dark:text-rose-400 mb-4 flex items-center gap-2">
                 <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span></span>
                 Projetos Atrasados ou Próximos do Vencimento (Kanban SLA)
             </h3>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                 {stats.alerts.map((alert: any) => (
                     <div key={alert.id} className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-4 shadow-sm flex flex-col justify-between">
                         <div>
                             <div className="flex justify-between items-start mb-2">
                                 <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${alert._tempSlaStatus === 'ATRASADO' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}>
                                     {alert._tempSlaStatus}
                                 </span>
                                 <span className="text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">{alert.discipline}</span>
                             </div>
                             <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-200 line-clamp-2" title={alert.filename}>{alert.filename}</h4>
                             <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{alert.client} - {alert.base}</p>
                         </div>
                         <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                             <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{alert.status}</span>
                             <span className="text-xs font-bold text-rose-600 dark:text-rose-400">Verificar URGs</span>
                         </div>
                     </div>
                 ))}
             </div>
          </div>
      )}

      <div className="space-y-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 print:grid-cols-3">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2 text-center">On-Time Delivery (OTD)</h3>
                <p className="text-xs text-slate-400 text-center mb-4">Projetos entregues dentro da SLA</p>
                {stats.totalSlaMeasured > 0 ? (
                    <div className="h-32 w-full relative flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <PieChart>
                                <Pie data={stats.otdChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={55} paddingAngle={2} dataKey="value">
                                    {stats.otdChartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(value: number) => [value, 'Projetos']} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, border: isDarkMode ? '1px solid #475569' : 'none' }} itemStyle={{ color: tooltipText }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className={`text-2xl font-bold ${stats.otdPercentage >= 85 ? 'text-emerald-500' : stats.otdPercentage >= 70 ? 'text-amber-500' : 'text-rose-500'}`}>
                                {stats.otdPercentage}%
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="h-32 flex flex-col items-center justify-center text-slate-400 text-xs italic text-center">
                        Nenhuma SLA<br/>medida ainda
                    </div>
                )}
            </div>

            <div className="col-span-1 md:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200 print:break-inside-avoid print:shadow-none print:border-slate-300">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Massa de Projetos (Volume por Cliente e Disciplina)</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Quantidade total de arquivos demandados por cliente, segmentado por disciplina.</p>
                <div className="h-80">
                  {stats.volumeData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={stats.volumeData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                          <XAxis dataKey="name" stroke={axisColor} fontSize={12} />
                          <YAxis stroke={axisColor} fontSize={12} allowDecimals={false} />
                          <Tooltip cursor={{ fill: isDarkMode ? '#334155' : '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: isDarkMode ? '1px solid #475569' : 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', backgroundColor: tooltipBg, color: tooltipText }} itemStyle={{ color: tooltipText }} labelStyle={{ color: tooltipText }} />
                          <Legend />
                          {Object.values(Discipline).map((discipline) => (
                            <Bar key={discipline} dataKey={discipline} stackId="a" fill={DISCIPLINE_COLORS[discipline] || '#cbd5e1'} name={discipline} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                  ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                          Sem dados de volume
                      </div>
                  )}
                </div>
            </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 print:grid-cols-2">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200 print:break-inside-avoid print:shadow-none print:border-slate-300">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Média Execução por Fase (Dias Úteis)</h3>
            <div className="h-60">
              {stats.executionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={stats.executionData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                      <XAxis dataKey="name" fontSize={10} angle={-45} textAnchor="end" height={60} interval={0} stroke={axisColor} />
                      <YAxis unit="d" width={30} fontSize={12} stroke={axisColor} />
                      <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, border: isDarkMode ? '1px solid #475569' : 'none' }} itemStyle={{ color: tooltipText }} labelStyle={{ color: tooltipText }} />
                      <Legend verticalAlign="top" height={36}/>
                      <Bar dataKey="avgPrelim" name="Preliminar" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="avgExec" name="Executivo" fill="#8e1c3e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
              ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                      Sem dados de execução
                  </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200 print:break-inside-avoid print:shadow-none print:border-slate-300">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Tempo Resposta Cliente</h3>
            <div className="h-60">
              {stats.clientResponseData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={stats.clientResponseData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} stroke={gridColor} />
                      <XAxis type="number" unit="d" stroke={axisColor} fontSize={10} />
                      <YAxis dataKey="name" type="category" width={80} fontSize={10} stroke={axisColor} />
                      <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, border: isDarkMode ? '1px solid #475569' : 'none' }} itemStyle={{ color: tooltipText }} labelStyle={{ color: tooltipText }} formatter={(value: number) => [`${value} dias`, 'Média']} />
                      <Bar dataKey="avgDays" name="Média Dias" radius={[0, 4, 4, 0]} barSize={20} fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
              ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                      Sem dados de resposta
                  </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200 print:break-inside-avoid print:shadow-none print:border-slate-300">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Motivos de Revisão (Recorrência)</h3>
            <div className="h-60">
              {stats.reasonsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={stats.reasonsData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                    <XAxis type="number" stroke={axisColor} fontSize={10} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={110} fontSize={10} stroke={axisColor} />
                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, border: isDarkMode ? '1px solid #475569' : 'none' }} itemStyle={{ color: tooltipText }} labelStyle={{ color: tooltipText }} />
                    <Bar 
                      dataKey="count" 
                      name="Ocorrências" 
                      fill="#6366f1" 
                      radius={[0, 4, 4, 0]} 
                      barSize={20} 
                      style={{ cursor: 'pointer' }}
                      onClick={(barData: any) => {
                        if (!barData.name) return;
                        setDrillDown({
                          label: `Motivo: ${barData.name}`,
                          reason: barData.name,
                          filterKey: 'reasons'
                        });
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                  Sem revisões registradas
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200 print:break-inside-avoid print:shadow-none print:border-slate-300">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4" title="Índice de Aprovação na Primeira Revisão">IAPR (Aprovação Direta por Fase)</h3>
            <div className="h-60">
              {stats.fttData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={stats.fttData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} stroke={gridColor} />
                      <XAxis type="number" domain={[0, 100]} unit="%" stroke={axisColor} fontSize={10} />
                      <YAxis dataKey="name" type="category" width={120} fontSize={9} stroke={axisColor} />
                      <Tooltip formatter={(value: number) => [`${value}%`, 'Aprovado sem Revisão']} cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, border: isDarkMode ? '1px solid #475569' : 'none' }} itemStyle={{ color: tooltipText }} labelStyle={{ color: tooltipText }} />
                      <Bar
                        dataKey="rate"
                        name="Taxa de Assertividade"
                        radius={[0, 4, 4, 0]}
                        barSize={20}
                        style={{ cursor: 'pointer' }}
                        onClick={(barData: any) => {
                          const nameParts = barData.name?.match(/^(.+?)\s\((Prel|Exec)\)$/);
                          if (!nameParts) return;
                          const disc = nameParts[1] as Discipline;
                          const phase = nameParts[2];
                          setDrillDown({ label: barData.name, discipline: disc, phase, filterKey: 'ftt' });
                        }}
                      >
                        {stats.fttData.map((entry, index) => {
                          const discName = entry.name.split(' (')[0];
                          return <Cell key={`cell-${index}`} fill={DISCIPLINE_COLORS[discName] || '#8884d8'} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
              ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                      Sem dados IAPR
                  </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200 print:break-inside-avoid print:shadow-none print:border-slate-300">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4" title="Tempo total do ciclo: início até aprovação do cliente">Cycle Time (Ciclo Completo)</h3>
            <div className="h-60">
              {stats.cycleTimeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={stats.cycleTimeData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                    <XAxis dataKey="name" fontSize={10} angle={-45} textAnchor="end" height={60} interval={0} stroke={axisColor} />
                    <YAxis unit="d" width={30} fontSize={12} stroke={axisColor} />
                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, border: isDarkMode ? '1px solid #475569' : 'none' }} itemStyle={{ color: tooltipText }} labelStyle={{ color: tooltipText }} formatter={(value: number) => [`${value} dias`, 'Ciclo Médio']} />
                    <Bar dataKey="avgCycle" name="Ciclo Médio" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                  Sem dados de ciclo completo (necessita feedbackDate)
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200 print:break-inside-avoid print:shadow-none print:border-slate-300">
             <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">ICLM (Conclusão de Listas)</h3>
             <div className="h-60 relative flex flex-col items-center justify-center">
                 {materialStats.total > 0 ? (
                     <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                         <PieChart>
                             <Pie data={materialStats.chartData} cx="50%" cy="50%" startAngle={180} endAngle={0} innerRadius={60} outerRadius={80} paddingAngle={0} dataKey="value">
                                 {materialStats.chartData.map((entry, index) => (
                                     <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                 ))}
                             </Pie>
                             <Tooltip formatter={(value: number) => [value, 'Listas Únicas']} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, border: isDarkMode ? '1px solid #475569' : 'none' }} itemStyle={{ color: tooltipText }} />
                         </PieChart>
                     </ResponsiveContainer>
                 ) : (
                     <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-xs italic text-center pb-10">
                         Nenhuma lista<br/>registrada
                     </div>
                 )}
                 <div className="absolute top-1/2 left-0 right-0 text-center -translate-y-1 transform">
                     <span className="text-3xl font-bold text-slate-800 dark:text-white block">{materialStats.percentage}%</span>
                     <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Concluído</span>
                 </div>
                 <div className="mt-[-20px] text-center">
                     <p className="text-xs text-slate-400 dark:text-slate-500">
                         {materialStats.done} concluídas de {materialStats.total} ativas
                     </p>
                 </div>
             </div>
          </div>
        </div>
      </div>

      {/* Drill-Down Modal */}
      {drillDown && (
        <DrillDownModal
          payload={drillDown}
          projects={filteredProjects}
          holidays={holidays}
          onClose={closeDrillDown}
        />
      )}

    </div>
  );
};
