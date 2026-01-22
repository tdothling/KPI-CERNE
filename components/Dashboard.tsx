import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { ProjectFile, Discipline, Status, MaterialDoc } from '../types';
import { differenceInBusinessDays, parseISO, isWeekend, isWithinInterval, isValid } from 'date-fns';
import { LayoutDashboard } from 'lucide-react';

interface DashboardProps {
  data: ProjectFile[];
  materials?: MaterialDoc[];
  isDarkMode?: boolean;
  holidays: string[];
}

const COLORS = ['#8e1c3e', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#64748b'];

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

const getProjectBaseName = (filename: string): string => {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
  const match = nameWithoutExt.match(/^(.*?)\s\[R\d+\]$/);
  return match ? match[1] : nameWithoutExt;
};

const getRevisionNumber = (filename: string): number => {
    const match = filename.match(/\[R(\d+)\]/);
    return match ? parseInt(match[1], 10) : 0;
};

export const Dashboard: React.FC<DashboardProps> = ({ data, materials = [], isDarkMode = false, holidays }) => {
  const axisColor = isDarkMode ? '#94a3b8' : '#64748b';
  const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
  const tooltipBg = isDarkMode ? '#1e293b' : '#ffffff';
  const tooltipText = isDarkMode ? '#f1f5f9' : '#1e293b';

  const stats = useMemo(() => {
    const timeByDiscipline: Record<string, { totalDays: number; count: number }> = {};
    const blockedByClient: Record<string, { totalDays: number; count: number }> = {};
    const fttByDiscipline: Record<string, { totalGroups: number; successGroups: number }> = {};
    const fileGroups: Record<string, { discipline: string, hasRevisionOrRejection: boolean }> = {};
    const volumeMap: Record<string, any> = {};
    const reasonsMap: Record<string, number> = {};

    data.forEach(project => {
      let duration = 0;
      if (project.startDate && isValid(parseISO(project.startDate))) {
        const start = parseISO(project.startDate);
        let end: Date;
        if (project.endDate && isValid(parseISO(project.endDate))) {
            end = parseISO(project.endDate);
        } else {
            end = new Date();
        }
        if (end < start) end = start;
        const businessDays = differenceInBusinessDays(end, start) + 1;
        let holidaysOnWeekdays = 0;
        holidays.forEach(h => {
            const hDate = parseISO(h);
            if (isValid(hDate) && isWithinInterval(hDate, { start, end })) {
                if (!isWeekend(hDate)) {
                    holidaysOnWeekdays++;
                }
            }
        });
        const totalDays = Math.max(0, businessDays - holidaysOnWeekdays);
        duration = totalDays;
      }

      if (!timeByDiscipline[project.discipline]) {
        timeByDiscipline[project.discipline] = { totalDays: 0, count: 0 };
      }
      if (project.startDate) { 
        timeByDiscipline[project.discipline].totalDays += duration;
        timeByDiscipline[project.discipline].count += 1;
      }

      if (project.blockedDays >= 0) {
        if (!blockedByClient[project.client]) {
            blockedByClient[project.client] = { totalDays: 0, count: 0 };
        }
        blockedByClient[project.client].totalDays += project.blockedDays;
        blockedByClient[project.client].count += 1;
      }

      const baseName = getProjectBaseName(project.filename);
      const groupKey = `${project.client}|${project.discipline}|${baseName}`;

      if (!fileGroups[groupKey]) {
          fileGroups[groupKey] = { discipline: project.discipline, hasRevisionOrRejection: false };
      }

      if (getRevisionNumber(project.filename) > 0 || project.status === Status.REJECTED || project.status === Status.REVISED) {
          fileGroups[groupKey].hasRevisionOrRejection = true;
      }

      project.revisions.forEach(rev => {
         reasonsMap[rev.reason] = (reasonsMap[rev.reason] || 0) + 1;
      });

      if (!volumeMap[project.client]) {
        volumeMap[project.client] = { name: project.client, total: 0 };
      }
      volumeMap[project.client].total += 1;
      volumeMap[project.client][project.discipline] = (volumeMap[project.client][project.discipline] || 0) + 1;
    });

    Object.values(fileGroups).forEach(group => {
        if (!fttByDiscipline[group.discipline]) {
            fttByDiscipline[group.discipline] = { totalGroups: 0, successGroups: 0 };
        }
        fttByDiscipline[group.discipline].totalGroups += 1;
        if (!group.hasRevisionOrRejection) {
            fttByDiscipline[group.discipline].successGroups += 1;
        }
    });

    const executionData = Object.keys(timeByDiscipline).map(d => ({
      name: d,
      avgDays: timeByDiscipline[d].count ? Number((timeByDiscipline[d].totalDays / timeByDiscipline[d].count).toFixed(1)) : 0
    }));

    const blockedData = Object.keys(blockedByClient).map(c => ({
      name: c,
      days: blockedByClient[c].count ? Number((blockedByClient[c].totalDays / blockedByClient[c].count).toFixed(1)) : 0
    })).filter(d => d.days > 0);

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

    return { executionData, blockedData, fttData, volumeData, reasonsData };
  }, [data, holidays]);

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
     ];

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
      </div>

      <div className="space-y-6 mb-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Massa de Projetos (Volume por Cliente e Disciplina)</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Quantidade total de arquivos demandados por cliente, segmentado por disciplina.</p>
          <div className="h-80">
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
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Média Execução (Dias Úteis)</h3>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={stats.executionData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis dataKey="name" fontSize={10} angle={-45} textAnchor="end" height={60} interval={0} stroke={axisColor} />
                  <YAxis unit="d" width={30} fontSize={12} stroke={axisColor} />
                  <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, border: isDarkMode ? '1px solid #475569' : 'none' }} itemStyle={{ color: tooltipText }} labelStyle={{ color: tooltipText }} />
                  <Bar dataKey="avgDays" name="Dias Úteis" radius={[4, 4, 0, 0]}>
                    {stats.executionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={DISCIPLINE_COLORS[entry.name] || '#8884d8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Motivos de Revisão (Recorrência)</h3>
            <div className="h-60">
              {stats.reasonsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={stats.reasonsData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                    <XAxis type="number" stroke={axisColor} fontSize={10} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={110} fontSize={10} stroke={axisColor} />
                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, border: isDarkMode ? '1px solid #475569' : 'none' }} itemStyle={{ color: tooltipText }} labelStyle={{ color: tooltipText }} />
                    <Bar dataKey="count" name="Ocorrências" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                  Sem revisões registradas
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4" title="Índice de Aprovação na Primeira Revisão">IAPR (Aprovação Direta)</h3>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={stats.fttData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} stroke={gridColor} />
                  <XAxis type="number" domain={[0, 100]} unit="%" stroke={axisColor} fontSize={10} />
                  <YAxis dataKey="name" type="category" width={80} fontSize={10} stroke={axisColor} />
                  <Tooltip formatter={(value: number) => [`${value}%`, 'Aprovado sem Revisão']} cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, border: isDarkMode ? '1px solid #475569' : 'none' }} itemStyle={{ color: tooltipText }} labelStyle={{ color: tooltipText }} />
                  <Bar dataKey="rate" name="Taxa de Assertividade" radius={[0, 4, 4, 0]} barSize={20}>
                    {stats.fttData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={DISCIPLINE_COLORS[entry.name] || '#8884d8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Média de Tempo Bloqueado</h3>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie data={stats.blockedData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="days">
                    {stats.blockedData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value} dias (média)`, 'Bloqueado']} contentStyle={{ backgroundColor: tooltipBg, color: tooltipText, border: isDarkMode ? '1px solid #475569' : 'none' }} itemStyle={{ color: tooltipText }} />
                  <Legend verticalAlign="bottom" height={36} iconSize={10} fontSize={10}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition-colors duration-200">
             <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">ICLM (Conclusão de Listas)</h3>
             <div className="h-60 relative flex flex-col items-center justify-center">
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
    </div>
  );
};