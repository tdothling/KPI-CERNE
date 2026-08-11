import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ReferenceLine,
  ComposedChart,
  LabelList,
} from 'recharts';
import {
  ProjectFile,
  Discipline,
  Status,
  ProjectPhase,
  ClientDoc,
  ObraStatus,
  RevisionReason,
} from '../types';
import {
  format,
  parseISO,
  isValid,
  isAfter,
  isSameDay,
  addDays,
  startOfDay,
  subMonths,
  startOfMonth,
  differenceInCalendarDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  LayoutDashboard,
  FileDown,
  Activity,
  Clock3,
  AlertTriangle,
  Send,
  Target,
  CheckCircle2,
} from 'lucide-react';
import {
  getProjectBaseName,
  getRevisionNumber,
  calculateBusinessDaysWithHolidays,
  calculateNetExecutionDuration,
  calculateDeadlineDate,
  getEffectiveStatus,
} from '../utils';
import { useDashboardFilters } from '../hooks/useDashboardFilters';
import { DashboardFilters } from './DashboardFilters';
import { DrillDownModal, DrillDownPayload } from './DrillDownModal';
import { SectionHeader, KpiTile, metaAccent } from './DashboardPrimitives';

interface DashboardProps {
  data: ProjectFile[];
  clients?: ClientDoc[];
  isDarkMode?: boolean;
  holidays: string[];
}

// Metas corporativas dos indicadores (ajustar aqui quando a meta mudar)
const META_OTD = 85; // % de entregas dentro da SLA
const META_IAPR = 70; // % de aprovação sem revisão

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

// Causa gerencial de cada motivo de revisão: interna (processo/equipe) x externa (cliente/escopo)
type ReasonCategory = 'Interna' | 'Externa' | 'Outros';
const REASON_CATEGORY: Record<string, ReasonCategory> = {
  [RevisionReason.INTERNAL_ERROR]: 'Interna',
  [RevisionReason.COMPATIBILITY]: 'Interna',
  [RevisionReason.CLIENT_REQUEST]: 'Externa',
  [RevisionReason.SCOPE_CHANGE]: 'Externa',
  [RevisionReason.PROJECT_CHANGE]: 'Externa',
  [RevisionReason.ADDENDUM]: 'Externa',
  [RevisionReason.OTHER]: 'Outros',
};
// Paleta validada (validate_palette.js) por modo; identidade acompanha a categoria, nunca a posição
const CATEGORY_COLORS_LIGHT: Record<ReasonCategory, string> = {
  Interna: '#f43f5e',
  Externa: '#0ea5e9',
  Outros: '#f59e0b',
};
const CATEGORY_COLORS_DARK: Record<ReasonCategory, string> = {
  Interna: '#f43f5e',
  Externa: '#0284c7',
  Outros: '#d97706',
};

interface SlaAlert {
  project: ProjectFile;
  slaStatus: 'ATRASADO' | 'VENCENDO';
  deadline: Date;
  daysLate: number;
}

export const Dashboard: React.FC<DashboardProps> = ({
  data,
  clients = [],
  isDarkMode = false,
  holidays,
}) => {
  const axisColor = isDarkMode ? '#94a3b8' : '#64748b';
  const gridColor = isDarkMode ? '#334155' : '#e2e8f0';
  const tooltipBg = isDarkMode ? '#1e293b' : '#ffffff';
  const tooltipText = isDarkMode ? '#f1f5f9' : '#1e293b';
  const catColors = isDarkMode ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;
  const tooltipStyle = {
    backgroundColor: tooltipBg,
    color: tooltipText,
    border: isDarkMode ? '1px solid #475569' : 'none',
  };

  // --- Filtros dinâmicos ---
  const {
    filters,
    filteredProjects,
    activeFilterCount,
    availableClients,
    clearAllFilters,
    toggleMulti,
    setDateFrom,
    setDateTo,
  } = useDashboardFilters(data);

  // --- Drill-down state ---
  const [drillDown, setDrillDown] = useState<DrillDownPayload | null>(null);
  const closeDrillDown = useCallback(() => setDrillDown(null), []);

  // --- SLA alerts collapse + pagination ---
  const [slaCollapsed, setSlaCollapsed] = useState(true);
  const [slaPage, setSlaPage] = useState(0);
  const SLA_PAGE_SIZE = 8;

  // Tiles executivos navegam até o painel correspondente
  const alertsRef = useRef<HTMLDivElement>(null);
  const goToAlerts = useCallback(() => {
    setSlaCollapsed(false);
    setTimeout(() => alertsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const stats = useMemo(() => {
    // Tempo de execução por disciplina/fase — apenas ciclos CONCLUÍDOS (endDate real),
    // para a média não flutuar diariamente com projetos em aberto
    const timeByDiscipline: Record<
      string,
      { prelimTotal: number; prelimCount: number; execTotal: number; execCount: number }
    > = {};

    const clientResponseMap: Record<string, { totalDays: number; count: number }> = {};
    const volumeMap: Record<string, any> = {};
    const reasonsMap: Record<string, number> = {};
    const cycleTimeByDiscipline: Record<string, { total: number; count: number }> = {};

    // Agrupamento por entregável (cliente|disciplina|nome-base|fase): a unidade de medida
    // de OTD, IAPR e alertas é o entregável, não o arquivo (revisões não contam duas vezes)
    const fileGroups: Record<
      string,
      {
        client: string;
        discipline: string;
        phase: string;
        hasRevisionOrRejection: boolean;
        anyApproved: boolean;
        anyRejected: boolean;
        latest: ProjectFile;
        latestRev: number;
      }
    > = {};

    let totalWipFiles = 0;
    let volumeRevisoes = 0;
    const deliveredMonthly: Record<string, number> = {};
    const startedMonthly: Record<string, number> = {};
    let deliveries30 = 0;
    let deliveriesPrev30 = 0;

    const today = startOfDay(new Date());

    const clientsMap: Record<string, ClientDoc> = {};
    clients.forEach((c) => (clientsMap[c.name] = c));

    filteredProjects.forEach((project) => {
      // 1. Tempo de execução — somente concluídos
      if (
        project.startDate &&
        isValid(parseISO(project.startDate)) &&
        project.endDate &&
        isValid(parseISO(project.endDate))
      ) {
        const duration = calculateNetExecutionDuration(project, holidays);

        if (!timeByDiscipline[project.discipline]) {
          timeByDiscipline[project.discipline] = {
            prelimTotal: 0,
            prelimCount: 0,
            execTotal: 0,
            execCount: 0,
          };
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

      // 2. Tempo de resposta do cliente
      // C3: Usar days > 0 para excluir zeros falsos (valor padrão sem cálculo real)
      if (project.blockedDays !== undefined && project.blockedDays !== null) {
        const days = Number(project.blockedDays);
        if (
          days > 0 &&
          (project.feedbackDate ||
            project.status === Status.APPROVED ||
            project.status === Status.REJECTED)
        ) {
          if (!clientResponseMap[project.client]) {
            clientResponseMap[project.client] = { totalDays: 0, count: 0 };
          }
          clientResponseMap[project.client].totalDays += days;
          clientResponseMap[project.client].count += 1;
        }
      }

      // 3. Agrupamento por entregável
      const baseName = getProjectBaseName(project.filename);
      const projectPhase = project.phase || ProjectPhase.EXECUTIVE;
      const groupKey = `${project.client}|${project.discipline}|${baseName}|${projectPhase}`;
      const rev = project.revision ?? getRevisionNumber(project.filename);

      if (!fileGroups[groupKey]) {
        fileGroups[groupKey] = {
          client: project.client,
          discipline: project.discipline,
          phase: projectPhase,
          hasRevisionOrRejection: false,
          anyApproved: false,
          anyRejected: false,
          latest: project,
          latestRev: rev,
        };
      }
      const group = fileGroups[groupKey];
      if (rev > 0 || project.status === Status.REJECTED || project.status === Status.REVISED) {
        group.hasRevisionOrRejection = true;
      }
      if (project.status === Status.APPROVED) group.anyApproved = true;
      if (project.status === Status.REJECTED) group.anyRejected = true;
      if (rev >= group.latestRev) {
        group.latest = project;
        group.latestRev = rev;
      }

      project.revisions.forEach((r) => {
        reasonsMap[r.reason] = (reasonsMap[r.reason] || 0) + 1;
      });

      // 4. Volume / carga de trabalho — todos os arquivos, revisões inclusas (carga real)
      {
        if (!volumeMap[project.client]) {
          // Toda disciplina nasce zerada: o rótulo de total ancora no topo da
          // pilha via última barra, que precisa existir em todos os clientes
          volumeMap[project.client] = {
            name: project.client,
            total: 0,
            ...Object.fromEntries(Object.values(Discipline).map((d) => [d, 0])),
          };
        }
        volumeMap[project.client].total += 1;
        volumeMap[project.client][project.discipline] =
          (volumeMap[project.client][project.discipline] || 0) + 1;
        if (rev > 0) volumeRevisoes++; // arquivo que é reemissão (R01+) = retrabalho no volume
      }

      // S3: Cycle Time (startDate → feedbackDate) — apenas ciclos completos
      if (
        project.startDate &&
        project.feedbackDate &&
        isValid(parseISO(project.startDate)) &&
        isValid(parseISO(project.feedbackDate))
      ) {
        const start = parseISO(project.startDate);
        const feedback = parseISO(project.feedbackDate);
        if (feedback >= start) {
          const cycleDays = calculateBusinessDaysWithHolidays(
            start,
            feedback,
            holidays,
            project.startPeriod,
            project.feedbackPeriod || 'TARDE',
          );
          if (!cycleTimeByDiscipline[project.discipline]) {
            cycleTimeByDiscipline[project.discipline] = { total: 0, count: 0 };
          }
          cycleTimeByDiscipline[project.discipline].total += cycleDays;
          cycleTimeByDiscipline[project.discipline].count += 1;
        }
      }

      // 5. Arquivos em execução (WIP) — alimenta o subtítulo do tile "Em Execução"
      if (
        project.status === Status.IN_PROGRESS &&
        project.startDate &&
        isValid(parseISO(project.startDate)) &&
        parseISO(project.startDate) <= today
      ) {
        totalWipFiles++;
      }

      // 6. Entregas (evento de envio ao cliente): sendDate, ou endDate quando execução terminou
      const deliveryDateStr =
        project.sendDate && isValid(parseISO(project.sendDate))
          ? project.sendDate
          : project.status !== Status.IN_PROGRESS &&
              project.endDate &&
              isValid(parseISO(project.endDate))
            ? project.endDate
            : null;
      if (deliveryDateStr) {
        const dDate = parseISO(deliveryDateStr);
        const diff = differenceInCalendarDays(today, dDate);
        if (diff >= 0 && diff < 30) deliveries30++;
        else if (diff >= 30 && diff < 60) deliveriesPrev30++;
        const mKey = format(dDate, 'yyyy-MM');
        deliveredMonthly[mKey] = (deliveredMonthly[mKey] || 0) + 1;
      }

      // 7. Demanda: arquivos iniciados por mês (inclui revisões — trabalho que entrou na fila)
      if (project.startDate && isValid(parseISO(project.startDate))) {
        const sKey = format(parseISO(project.startDate), 'yyyy-MM');
        startedMonthly[sKey] = (startedMonthly[sKey] || 0) + 1;
      }
    });

    // --- Consolidação por entregável: IAPR, OTD e alertas usam só o arquivo mais recente ---
    const fttByDiscipline: Record<string, { totalGroups: number; successGroups: number }> = {};
    const otdMonthly: Record<string, { measured: number; onTime: number }> = {};
    const iaprMonthly: Record<string, { closed: number; success: number }> = {};
    const alerts: SlaAlert[] = [];
    let totalSlaMeasured = 0;
    let totalOnTime = 0;
    let groupsInProgress = 0;
    let groupsWaiting = 0;
    let closedGroups = 0;
    let successGroupsTotal = 0;

    Object.values(fileGroups).forEach((g) => {
      const latest = g.latest;
      if (latest.status === Status.IN_PROGRESS) groupsInProgress++;
      if (latest.status === Status.WAITING_APPROVAL) groupsWaiting++;

      // IAPR — somente ciclos fechados (aprovado, reprovado ou já revisado);
      // grupo ainda em andamento não conta como sucesso antecipado
      const isClosed = g.anyApproved || g.anyRejected || g.hasRevisionOrRejection;
      if (isClosed) {
        closedGroups++;
        const success = !g.hasRevisionOrRejection && g.anyApproved;
        if (success) successGroupsTotal++;
        const fttKey = `${g.discipline} (${g.phase === 'Preliminar' ? 'Prel' : 'Exec'})`;
        if (!fttByDiscipline[fttKey]) {
          fttByDiscipline[fttKey] = { totalGroups: 0, successGroups: 0 };
        }
        fttByDiscipline[fttKey].totalGroups += 1;
        if (success) fttByDiscipline[fttKey].successGroups += 1;

        // Tendência mensal do IAPR — mês de fechamento do ciclo (feedback ou fim da execução)
        const closeDateStr =
          latest.feedbackDate && isValid(parseISO(latest.feedbackDate))
            ? latest.feedbackDate
            : latest.endDate && isValid(parseISO(latest.endDate))
              ? latest.endDate
              : null;
        if (closeDateStr) {
          const cKey = format(parseISO(closeDateStr), 'yyyy-MM');
          if (!iaprMonthly[cKey]) iaprMonthly[cKey] = { closed: 0, success: 0 };
          iaprMonthly[cKey].closed++;
          if (success) iaprMonthly[cKey].success++;
        }
      }

      // OTD e alertas exigem SLA cadastrada na obra do cliente
      const clientData = clientsMap[g.client];
      const hasSLA = clientData?.contractDate && clientData?.deadlineDays !== undefined;
      if (!hasSLA) return;
      const deadline = calculateDeadlineDate(
        clientData.contractDate as string,
        clientData.deadlineDays as number,
      );
      if (!deadline) return;

      const effectiveObraStatus = getEffectiveStatus(clientData);
      const obraCompleted =
        effectiveObraStatus === ObraStatus.COMPLETED ||
        effectiveObraStatus === ObraStatus.CANCELLED ||
        effectiveObraStatus === ObraStatus.PAUSED;
      const isDone = latest.status === Status.DONE || latest.status === Status.APPROVED;

      if (isDone && latest.feedbackDate && isValid(parseISO(latest.feedbackDate))) {
        totalSlaMeasured++;
        const fb = parseISO(latest.feedbackDate);
        const onTime = !isAfter(fb, deadline);
        if (onTime) totalOnTime++;
        const mKey = format(fb, 'yyyy-MM');
        if (!otdMonthly[mKey]) otdMonthly[mKey] = { measured: 0, onTime: 0 };
        otdMonthly[mKey].measured++;
        if (onTime) otdMonthly[mKey].onTime++;
      } else if (!obraCompleted && latest.status === Status.IN_PROGRESS) {
        // REVISED (superado) e WAITING_APPROVAL (na mão do cliente) não penalizam
        if (isAfter(today, deadline)) {
          totalSlaMeasured++;
          alerts.push({
            project: latest,
            slaStatus: 'ATRASADO',
            deadline,
            daysLate: differenceInCalendarDays(today, deadline),
          });
        } else if (isSameDay(today, deadline) || isSameDay(addDays(today, 1), deadline)) {
          alerts.push({ project: latest, slaStatus: 'VENCENDO', deadline, daysLate: 0 });
        }
      }
    });

    const executionData = Object.keys(timeByDiscipline).map((d) => ({
      name: d,
      avgPrelim: timeByDiscipline[d].prelimCount
        ? Number((timeByDiscipline[d].prelimTotal / timeByDiscipline[d].prelimCount).toFixed(1))
        : 0,
      avgExec: timeByDiscipline[d].execCount
        ? Number((timeByDiscipline[d].execTotal / timeByDiscipline[d].execCount).toFixed(1))
        : 0,
      nPrelim: timeByDiscipline[d].prelimCount,
      nExec: timeByDiscipline[d].execCount,
    }));

    const clientResponseData = Object.keys(clientResponseMap)
      .map((c) => ({
        name: c,
        avgDays: clientResponseMap[c].count
          ? Number((clientResponseMap[c].totalDays / clientResponseMap[c].count).toFixed(1))
          : 0,
        n: clientResponseMap[c].count,
      }))
      .sort((a, b) => b.avgDays - a.avgDays);

    const fttData = Object.keys(fttByDiscipline).map((d) => ({
      name: d,
      rate: fttByDiscipline[d].totalGroups
        ? Math.round((fttByDiscipline[d].successGroups / fttByDiscipline[d].totalGroups) * 100)
        : 0,
      n: fttByDiscipline[d].totalGroups,
    }));

    const volumeData = Object.values(volumeMap).sort((a: any, b: any) => b.total - a.total);
    // Resumo da carga: massa total de arquivos, obras no filtro e retrabalho (R01+)
    const volumeResumo = {
      files: volumeData.reduce((acc: number, v: any) => acc + v.total, 0),
      obras: volumeData.length,
      revisoes: volumeRevisoes,
    };

    const reasonsData = Object.entries(reasonsMap)
      .map(([name, count]) => ({
        name,
        count,
        category: REASON_CATEGORY[name] || ('Outros' as ReasonCategory),
      }))
      .sort((a, b) => b.count - a.count);

    const reasonCategoryTotals: Record<ReasonCategory, number> = {
      Interna: 0,
      Externa: 0,
      Outros: 0,
    };
    reasonsData.forEach((r) => {
      reasonCategoryTotals[r.category] += r.count;
    });
    const totalReasons = reasonsData.reduce((acc, r) => acc + r.count, 0);

    const cycleTimeData = Object.keys(cycleTimeByDiscipline).map((d) => ({
      name: d,
      avgCycle: cycleTimeByDiscipline[d].count
        ? Number((cycleTimeByDiscipline[d].total / cycleTimeByDiscipline[d].count).toFixed(1))
        : 0,
      n: cycleTimeByDiscipline[d].count,
    }));

    const otdPercentage =
      totalSlaMeasured > 0 ? Math.round((totalOnTime / totalSlaMeasured) * 100) : 0;
    const otdChartData = [
      { name: 'No Prazo', value: totalOnTime, color: '#10b981' },
      { name: 'Atrasado', value: totalSlaMeasured - totalOnTime, color: '#ef4444' },
    ].filter((d) => d.value > 0);

    const iaprGlobal = closedGroups > 0 ? Math.round((successGroupsTotal / closedGroups) * 100) : 0;

    // Série mensal (últimos 12 meses): entregas, iniciados, OTD e IAPR do mês
    const monthlyData: {
      key: string;
      label: string;
      entregas: number;
      iniciados: number;
      otd: number | null;
      otdN: number;
      iapr: number | null;
      iaprN: number;
    }[] = [];
    for (let i = 11; i >= 0; i--) {
      const mDate = subMonths(startOfMonth(today), i);
      const key = format(mDate, 'yyyy-MM');
      const otd = otdMonthly[key];
      const iapr = iaprMonthly[key];
      monthlyData.push({
        key,
        label: format(mDate, 'MMM/yy', { locale: ptBR }),
        entregas: deliveredMonthly[key] || 0,
        iniciados: startedMonthly[key] || 0,
        otd: otd && otd.measured > 0 ? Math.round((otd.onTime / otd.measured) * 100) : null,
        otdN: otd?.measured || 0,
        iapr: iapr && iapr.closed > 0 ? Math.round((iapr.success / iapr.closed) * 100) : null,
        iaprN: iapr?.closed || 0,
      });
    }

    // Atrasados primeiro, mais dias de atraso no topo
    alerts.sort((a, b) => {
      if (a.slaStatus !== b.slaStatus) return a.slaStatus === 'ATRASADO' ? -1 : 1;
      return b.daysLate - a.daysLate;
    });

    return {
      executionData,
      fttData,
      volumeData,
      volumeResumo,
      reasonsData,
      clientResponseData,
      cycleTimeData,
      otdPercentage,
      otdChartData,
      totalSlaMeasured,
      alerts,
      reasonCategoryTotals,
      totalReasons,
      iaprGlobal,
      closedGroups,
      groupsInProgress,
      groupsWaiting,
      deliveries30,
      deliveriesPrev30,
      monthlyData,
      totalWipFiles,
    };
  }, [filteredProjects, holidays, clients]);

  const deliveryDelta = stats.deliveries30 - stats.deliveriesPrev30;

  return (
    <div className="animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <LayoutDashboard className="text-brand-600 dark:text-brand-400" />
            Painel de Indicadores
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Visão geral de prazo, qualidade, eficiência e carga de projetos.
          </p>
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

      {/* Filtro de status muda a base de cálculo de OTD/IAPR — avisar para não ler número distorcido */}
      {filters.statuses.length > 0 && (
        <div className="mb-4 -mt-2 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 print:hidden">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            Filtro de <strong>status</strong> ativo: OTD e IAPR passam a ser calculados só sobre os
            arquivos filtrados e podem ficar distorcidos. Use-o para investigar, não para reportar
            indicadores.
          </span>
        </div>
      )}

      {/* Leitura executiva: os 6 números da rotina */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-6 print:grid-cols-6">
        <KpiTile
          label="Em Execução"
          value={stats.groupsInProgress}
          sub={`${stats.totalWipFiles} arquivo${stats.totalWipFiles !== 1 ? 's' : ''} WIP`}
          icon={<Activity size={15} />}
        />
        <KpiTile
          label="Aguardando Cliente"
          value={stats.groupsWaiting}
          sub="entregáveis enviados"
          icon={<Clock3 size={15} />}
        />
        <KpiTile
          label="Atrasados (SLA)"
          value={stats.alerts.filter((a) => a.slaStatus === 'ATRASADO').length}
          sub="prazo da obra vencido"
          accent={
            stats.alerts.some((a) => a.slaStatus === 'ATRASADO')
              ? 'text-rose-500'
              : 'text-emerald-500'
          }
          icon={<AlertTriangle size={15} />}
          onClick={stats.alerts.length > 0 ? goToAlerts : undefined}
        />
        <KpiTile
          label="Entregas (30d)"
          value={stats.deliveries30}
          sub={
            <span
              className={
                deliveryDelta > 0
                  ? 'text-emerald-500'
                  : deliveryDelta < 0
                    ? 'text-rose-500'
                    : undefined
              }
            >
              {deliveryDelta > 0
                ? `▲ +${deliveryDelta}`
                : deliveryDelta < 0
                  ? `▼ ${deliveryDelta}`
                  : '= igual'}{' '}
              vs. 30d anteriores
            </span>
          }
          icon={<Send size={15} />}
        />
        <KpiTile
          label="OTD"
          value={stats.totalSlaMeasured > 0 ? `${stats.otdPercentage}%` : '—'}
          sub={
            stats.totalSlaMeasured > 0
              ? `meta ≥ ${META_OTD}% · ${stats.totalSlaMeasured} medidos`
              : 'nenhuma SLA medida'
          }
          accent={
            stats.totalSlaMeasured > 0 ? metaAccent(stats.otdPercentage, META_OTD) : undefined
          }
          icon={<Target size={15} />}
        />
        <KpiTile
          label="IAPR"
          value={stats.closedGroups > 0 ? `${stats.iaprGlobal}%` : '—'}
          sub={
            stats.closedGroups > 0
              ? `meta ≥ ${META_IAPR}% · ${stats.closedGroups} ciclos`
              : 'nenhum ciclo fechado'
          }
          accent={stats.closedGroups > 0 ? metaAccent(stats.iaprGlobal, META_IAPR) : undefined}
          icon={<CheckCircle2 size={15} />}
        />
      </div>

      {stats.alerts.length > 0 &&
        (() => {
          const totalPages = Math.ceil(stats.alerts.length / SLA_PAGE_SIZE);
          const pageAlerts = stats.alerts.slice(
            slaPage * SLA_PAGE_SIZE,
            (slaPage + 1) * SLA_PAGE_SIZE,
          );
          const atrasadoCount = stats.alerts.filter((a) => a.slaStatus === 'ATRASADO').length;
          const vencendoCount = stats.alerts.length - atrasadoCount;
          return (
            <div
              ref={alertsRef}
              className="mb-6 scroll-mt-4 bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-xl shadow-sm overflow-hidden"
            >
              <button
                onClick={() => {
                  setSlaCollapsed((c) => !c);
                  setSlaPage(0);
                }}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-rose-100/50 dark:hover:bg-rose-900/20 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                  </span>
                  <span className="text-base font-bold text-rose-800 dark:text-rose-400">
                    Entregáveis Atrasados ou Próximos do Vencimento (SLA da Obra)
                  </span>
                  <span className="flex items-center gap-1.5 ml-1">
                    {atrasadoCount > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-200 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300">
                        {atrasadoCount} atrasado{atrasadoCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {vencendoCount > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                        {vencendoCount} vencendo
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-rose-600 dark:text-rose-400 ml-4 flex-shrink-0">
                  {slaCollapsed ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </span>
              </button>

              {!slaCollapsed && (
                <div className="px-6 pb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {pageAlerts.map((alert) => (
                      <div
                        key={alert.project.id}
                        className="bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg p-4 shadow-sm flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${alert.slaStatus === 'ATRASADO' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'}`}
                            >
                              {alert.slaStatus}
                            </span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">
                              {alert.project.discipline}
                            </span>
                          </div>
                          <h4
                            className="font-semibold text-sm text-slate-800 dark:text-slate-200 line-clamp-2"
                            title={alert.project.filename}
                          >
                            {alert.project.filename}
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {alert.project.client} - {alert.project.base}
                          </p>
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                            {alert.project.status}
                          </span>
                          <span
                            className={`text-xs font-bold ${alert.slaStatus === 'ATRASADO' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}
                          >
                            {alert.slaStatus === 'ATRASADO'
                              ? `Prazo ${format(alert.deadline, 'dd/MM/yy')} · ${alert.daysLate}d atraso`
                              : `Vence ${isSameDay(startOfDay(new Date()), alert.deadline) ? 'hoje' : 'amanhã'} (${format(alert.deadline, 'dd/MM')})`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-3">
                      <button
                        onClick={() => setSlaPage((p) => Math.max(0, p - 1))}
                        disabled={slaPage === 0}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
                      >
                        ← Anterior
                      </button>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {slaPage + 1} / {totalPages}
                        <span className="ml-1 text-slate-400">({stats.alerts.length} total)</span>
                      </span>
                      <button
                        onClick={() => setSlaPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={slaPage === totalPages - 1}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
                      >
                        Próxima →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

      {/* ===== PRAZO & ENTREGA ===== */}
      <SectionHeader label="Prazo & Entrega" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:grid-cols-3">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center print:break-inside-avoid print:shadow-none print:border-slate-300">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1 text-center">
            Entrega no Prazo (OTD)
          </h3>
          <p className="text-xs text-slate-400 text-center mb-4">
            Entregáveis aprovados dentro da SLA da obra · Meta ≥ {META_OTD}%
          </p>
          {stats.totalSlaMeasured > 0 ? (
            <div className="h-32 w-full relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <PieChart>
                  <Pie
                    data={stats.otdChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={55}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {stats.otdChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [value, 'Entregáveis']}
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: tooltipText }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className={`text-2xl font-bold ${metaAccent(stats.otdPercentage, META_OTD)}`}>
                  {stats.otdPercentage}%
                </span>
                <span className="text-[10px] text-slate-400">{stats.totalSlaMeasured} medidos</span>
              </div>
            </div>
          ) : (
            <div className="h-32 flex flex-col items-center justify-center text-slate-400 text-xs italic text-center">
              Nenhuma SLA
              <br />
              medida ainda
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 print:break-inside-avoid print:shadow-none print:border-slate-300">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
            Fluxo Mensal: Iniciados × Entregues
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Linha acima das barras = demanda entrando mais rápido que a capacidade (fila cresce)
          </p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <ComposedChart data={stats.monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                <XAxis dataKey="label" stroke={axisColor} fontSize={9} interval={1} />
                <YAxis stroke={axisColor} fontSize={11} allowDecimals={false} width={28} />
                <Tooltip
                  cursor={{ fill: isDarkMode ? '#334155' : '#f1f5f9' }}
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: tooltipText }}
                  labelStyle={{ color: tooltipText }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="entregas"
                  name="Entregues"
                  fill={isDarkMode ? '#f43f5e' : '#8e1c3e'}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  dataKey="iniciados"
                  name="Iniciados"
                  stroke={isDarkMode ? '#38bdf8' : '#0284c7'}
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 print:break-inside-avoid print:shadow-none print:border-slate-300">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
            OTD por Mês
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            % de aprovações dentro do prazo por mês de feedback
          </p>
          <div className="h-48">
            {stats.monthlyData.some((m) => m.otd !== null) ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={stats.monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis dataKey="label" stroke={axisColor} fontSize={9} interval={1} />
                  <YAxis domain={[0, 100]} unit="%" stroke={axisColor} fontSize={11} width={38} />
                  <ReferenceLine
                    y={META_OTD}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{
                      value: `Meta ${META_OTD}%`,
                      fontSize: 10,
                      fill: '#10b981',
                      position: 'insideBottomRight',
                    }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: tooltipText }}
                    labelStyle={{ color: tooltipText }}
                    formatter={(value: number, _name: string, props: any) => [
                      `${value}% (n=${props.payload.otdN})`,
                      'OTD',
                    ]}
                  />
                  <Line
                    dataKey="otd"
                    name="OTD"
                    stroke={isDarkMode ? '#34d399' : '#059669'}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                Sem aprovações medidas contra SLA
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== QUALIDADE ===== */}
      <SectionHeader label="Qualidade" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 print:grid-cols-2">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 print:break-inside-avoid print:shadow-none print:border-slate-300">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
            Aprovação de Primeira (IAPR)
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Entregáveis aprovados sem revisão — apenas ciclos concluídos · Meta ≥ {META_IAPR}% ·
            clique para detalhar
          </p>
          <div className="h-60">
            {stats.fttData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={stats.fttData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} stroke={gridColor} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    unit="%"
                    stroke={axisColor}
                    fontSize={10}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={120}
                    fontSize={9}
                    stroke={axisColor}
                  />
                  <ReferenceLine
                    x={META_IAPR}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{
                      value: `Meta ${META_IAPR}%`,
                      fontSize: 10,
                      fill: '#10b981',
                      position: 'insideTopRight',
                    }}
                  />
                  <Tooltip
                    formatter={(value: number, _name: string, props: any) => [
                      `${value}% (n=${props.payload.n} ciclos)`,
                      'Aprovação direta',
                    ]}
                    cursor={{ fill: 'transparent' }}
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: tooltipText }}
                    labelStyle={{ color: tooltipText }}
                  />
                  <Bar
                    dataKey="rate"
                    name="Aprovação direta"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                    style={{ cursor: 'pointer' }}
                    onClick={(barData: any) => {
                      const nameParts = barData.name?.match(/^(.+?)\s\((Prel|Exec)\)$/);
                      if (!nameParts) return;
                      const disc = nameParts[1] as Discipline;
                      const phase = nameParts[2];
                      setDrillDown({
                        label: barData.name,
                        discipline: disc,
                        phase,
                        filterKey: 'ftt',
                      });
                    }}
                  >
                    {stats.fttData.map((entry, index) => {
                      const discName = entry.name.split(' (')[0];
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={DISCIPLINE_COLORS[discName] || '#8884d8'}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                Nenhum ciclo concluído para medir IAPR
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 print:break-inside-avoid print:shadow-none print:border-slate-300">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
            IAPR por Mês
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            % de aprovação sem revisão por mês de fechamento do ciclo
          </p>
          <div className="h-60">
            {stats.monthlyData.some((m) => m.iapr !== null) ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={stats.monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis dataKey="label" stroke={axisColor} fontSize={9} interval={1} />
                  <YAxis domain={[0, 100]} unit="%" stroke={axisColor} fontSize={11} width={38} />
                  <ReferenceLine
                    y={META_IAPR}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{
                      value: `Meta ${META_IAPR}%`,
                      fontSize: 10,
                      fill: '#10b981',
                      position: 'insideBottomRight',
                    }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: tooltipText }}
                    labelStyle={{ color: tooltipText }}
                    formatter={(value: number, _name: string, props: any) => [
                      `${value}% (n=${props.payload.iaprN})`,
                      'IAPR',
                    ]}
                  />
                  <Line
                    dataKey="iapr"
                    name="IAPR"
                    stroke={isDarkMode ? '#34d399' : '#059669'}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                Sem ciclos fechados para medir tendência
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 print:break-inside-avoid print:shadow-none print:border-slate-300">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
            Motivos de Revisão
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            Causa interna (processo) × externa (cliente/escopo) · clique para detalhar
          </p>
          {stats.totalReasons > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {(['Interna', 'Externa', 'Outros'] as ReasonCategory[]).map((cat) => {
                const n = stats.reasonCategoryTotals[cat];
                if (n === 0) return null;
                return (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: catColors[cat] }}
                    />
                    {cat}: {n} ({Math.round((n / stats.totalReasons) * 100)}%)
                  </span>
                );
              })}
            </div>
          )}
          <div className="h-52">
            {stats.reasonsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={stats.reasonsData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                  <XAxis type="number" stroke={axisColor} fontSize={10} allowDecimals={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={110}
                    fontSize={10}
                    stroke={axisColor}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: tooltipText }}
                    labelStyle={{ color: tooltipText }}
                    formatter={(value: number, _name: string, props: any) => [
                      `${value} (causa ${props.payload.category.toLowerCase()})`,
                      'Ocorrências',
                    ]}
                  />
                  <Bar
                    dataKey="count"
                    name="Ocorrências"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                    style={{ cursor: 'pointer' }}
                    onClick={(barData: any) => {
                      if (!barData.name) return;
                      setDrillDown({
                        label: `Motivo: ${barData.name}`,
                        reason: barData.name,
                        filterKey: 'reasons',
                      });
                    }}
                  >
                    {stats.reasonsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={catColors[entry.category]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                Sem revisões registradas
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== EFICIÊNCIA ===== */}
      <SectionHeader label="Eficiência" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 print:grid-cols-2">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 print:break-inside-avoid print:shadow-none print:border-slate-300">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
            Tempo Médio de Execução
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Dias úteis por fase — apenas projetos concluídos
          </p>
          <div className="h-60">
            {stats.executionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={stats.executionData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis
                    dataKey="name"
                    fontSize={10}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    interval={0}
                    stroke={axisColor}
                  />
                  <YAxis unit="d" width={30} fontSize={12} stroke={axisColor} />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: tooltipText }}
                    labelStyle={{ color: tooltipText }}
                    formatter={(value: number, name: string, props: any) => {
                      const n = name === 'Preliminar' ? props.payload.nPrelim : props.payload.nExec;
                      return [`${value} dias (n=${n})`, name];
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="avgPrelim" name="Preliminar" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgExec" name="Executivo" fill="#8e1c3e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                Sem projetos concluídos no período
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 print:break-inside-avoid print:shadow-none print:border-slate-300">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
            Tempo de Resposta do Cliente
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Dias úteis médios aguardando retorno do cliente
          </p>
          <div className="h-60">
            {stats.clientResponseData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={stats.clientResponseData} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} stroke={gridColor} />
                  <XAxis type="number" unit="d" stroke={axisColor} fontSize={10} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={80}
                    fontSize={10}
                    stroke={axisColor}
                  />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: tooltipText }}
                    labelStyle={{ color: tooltipText }}
                    formatter={(value: number, _name: string, props: any) => [
                      `${value} dias (n=${props.payload.n})`,
                      'Média',
                    ]}
                  />
                  <Bar
                    dataKey="avgDays"
                    name="Média Dias"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                    fill="#f59e0b"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                Sem dados de resposta
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 print:break-inside-avoid print:shadow-none print:border-slate-300">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
            Tempo de Ciclo Completo
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Início da execução → aprovação do cliente (dias úteis)
          </p>
          <div className="h-60">
            {stats.cycleTimeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={stats.cycleTimeData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis
                    dataKey="name"
                    fontSize={10}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    interval={0}
                    stroke={axisColor}
                  />
                  <YAxis unit="d" width={30} fontSize={12} stroke={axisColor} />
                  <Tooltip
                    cursor={{ fill: 'transparent' }}
                    contentStyle={tooltipStyle}
                    itemStyle={{ color: tooltipText }}
                    labelStyle={{ color: tooltipText }}
                    formatter={(value: number, _name: string, props: any) => [
                      `${value} dias (n=${props.payload.n})`,
                      'Ciclo Médio',
                    ]}
                  />
                  <Bar dataKey="avgCycle" name="Ciclo Médio" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                Sem ciclos completos (necessita data de feedback)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== CARGA DE TRABALHO ===== */}
      <SectionHeader label="Carga de Trabalho" />
      <div className="mb-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 print:break-inside-avoid print:shadow-none print:border-slate-300">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-1">
            Carga de Trabalho por Cliente
          </h3>
          <p className="text-xs text-slate-400 mb-2">
            Arquivos por disciplina — inclui revisões (esforço real da equipe)
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mb-4 text-xs text-slate-500 dark:text-slate-400">
            <span>
              <b className="text-slate-700 dark:text-slate-200 text-sm">
                {stats.volumeResumo.files}
              </b>{' '}
              arquivos no total
            </span>
            <span>
              <b className="text-slate-700 dark:text-slate-200 text-sm">
                {stats.volumeResumo.obras}
              </b>{' '}
              obra{stats.volumeResumo.obras !== 1 ? 's' : ''}
            </span>
            {stats.volumeResumo.obras > 0 && (
              <span>
                média de{' '}
                <b className="text-slate-700 dark:text-slate-200 text-sm">
                  {Math.round(stats.volumeResumo.files / stats.volumeResumo.obras)}
                </b>{' '}
                arquivos/obra
              </span>
            )}
            <span>
              <b
                className={`text-sm ${stats.volumeResumo.revisoes > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}`}
              >
                {stats.volumeResumo.revisoes}
              </b>{' '}
              revisõe{stats.volumeResumo.revisoes !== 1 ? 's' : ''} no volume
              {stats.volumeResumo.files > 0 && (
                <>
                  {' '}
                  ({Math.round((stats.volumeResumo.revisoes / stats.volumeResumo.files) * 100)}% de
                  retrabalho)
                </>
              )}
            </span>
          </div>
          <div className="h-80">
            {stats.volumeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={stats.volumeData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                  <XAxis dataKey="name" stroke={axisColor} fontSize={12} />
                  <YAxis stroke={axisColor} fontSize={12} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: isDarkMode ? '#334155' : '#f1f5f9' }}
                    contentStyle={{
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      ...tooltipStyle,
                    }}
                    itemStyle={{ color: tooltipText }}
                    labelStyle={{ color: tooltipText }}
                  />
                  <Legend />
                  {Object.values(Discipline).map((discipline, i, arr) => (
                    <Bar
                      key={discipline}
                      dataKey={discipline}
                      stackId="a"
                      fill={DISCIPLINE_COLORS[discipline] || '#cbd5e1'}
                      name={discipline}
                    >
                      {/* Massa total da obra no topo da pilha (ancorada na última barra, que existe zerada em todas) */}
                      {i === arr.length - 1 && (
                        <LabelList
                          dataKey="total"
                          position="top"
                          offset={6}
                          fill={isDarkMode ? '#e2e8f0' : '#334155'}
                          fontSize={11}
                          fontWeight={700}
                        />
                      )}
                    </Bar>
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
