/**
 * Gráficos do relatório A4.
 *
 * Diferenças propositais em relação aos gráficos do Dashboard:
 *  - largura e altura em pixels fixos (ver reportLayout.ts), nunca ResponsiveContainer;
 *  - `isAnimationActive={false}` em todas as séries — o recharts anima na montagem,
 *    e a impressão disparada logo em seguida capturava o gráfico pela metade;
 *  - sem <Tooltip>, que não existe em papel;
 *  - cores fixas em tema claro, independentes do modo escuro do app.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { Discipline } from '../../types';
import {
  CATEGORY_COLORS_LIGHT,
  DISCIPLINE_COLORS,
  DashboardStats,
  META_IAPR,
  META_OTD,
} from '../dashboardShared';
import { CHART_FULL, CHART_HALF, REPORT_COLORS } from './reportLayout';

const axisProps = {
  stroke: REPORT_COLORS.axis,
  fontSize: 10,
};

/** Espaço reservado quando o filtro atual não produziu dados para o gráfico. */
function EmptyChart({ width, height, label }: { width: number; height: number; label: string }) {
  return (
    <div
      style={{ width, height }}
      className="flex items-center justify-center rounded border border-dashed border-slate-300 text-[10px] italic text-slate-400"
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------- Prazo

export function OtdDonutChart({ stats }: { stats: DashboardStats }) {
  const size = 150;
  if (stats.totalSlaMeasured === 0) {
    return <EmptyChart width={CHART_HALF} height={size} label="Nenhuma SLA medida no período" />;
  }
  return (
    <div className="relative" style={{ width: CHART_HALF, height: size }}>
      <PieChart width={CHART_HALF} height={size}>
        <Pie
          data={stats.otdChartData}
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={62}
          paddingAngle={2}
          dataKey="value"
          isAnimationActive={false}
        >
          {stats.otdChartData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} stroke="none" />
          ))}
        </Pie>
      </PieChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-2xl font-bold"
          style={{
            color: stats.otdPercentage >= META_OTD ? REPORT_COLORS.good : REPORT_COLORS.bad,
          }}
        >
          {stats.otdPercentage}%
        </span>
        <span className="text-[9px] text-slate-500">{stats.totalSlaMeasured} medidos</span>
      </div>
    </div>
  );
}

export function MonthlyFlowChart({ stats }: { stats: DashboardStats }) {
  return (
    <ComposedChart width={CHART_FULL} height={210} data={stats.monthlyData}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={REPORT_COLORS.grid} />
      <XAxis dataKey="label" {...axisProps} />
      <YAxis {...axisProps} allowDecimals={false} />
      <Legend wrapperStyle={{ fontSize: 10 }} />
      <Bar
        dataKey="iniciados"
        name="Iniciados"
        fill={REPORT_COLORS.info}
        radius={[3, 3, 0, 0]}
        isAnimationActive={false}
      />
      <Bar
        dataKey="entregas"
        name="Entregues"
        fill={REPORT_COLORS.brandLight}
        radius={[3, 3, 0, 0]}
        isAnimationActive={false}
      />
    </ComposedChart>
  );
}

export function OtdMonthlyChart({ stats }: { stats: DashboardStats }) {
  return (
    <LineChart width={CHART_HALF} height={190} data={stats.monthlyData}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={REPORT_COLORS.grid} />
      <XAxis dataKey="label" {...axisProps} />
      <YAxis {...axisProps} domain={[0, 100]} unit="%" />
      <ReferenceLine
        y={META_OTD}
        stroke={REPORT_COLORS.good}
        strokeDasharray="4 4"
        label={{ value: `Meta ${META_OTD}%`, fontSize: 9, fill: REPORT_COLORS.good }}
      />
      <Line
        type="monotone"
        dataKey="otd"
        name="OTD"
        stroke={REPORT_COLORS.brand}
        strokeWidth={2}
        dot={{ r: 2 }}
        connectNulls
        isAnimationActive={false}
      />
    </LineChart>
  );
}

// ------------------------------------------------------------- Qualidade

export function IaprByDisciplineChart({ stats }: { stats: DashboardStats }) {
  const height = Math.max(190, stats.fttData.length * 22 + 40);
  if (stats.fttData.length === 0) {
    return <EmptyChart width={CHART_HALF} height={190} label="Nenhum ciclo concluído" />;
  }
  return (
    <BarChart
      width={CHART_HALF}
      height={height}
      data={stats.fttData}
      layout="vertical"
      margin={{ left: 8, right: 16 }}
    >
      <CartesianGrid strokeDasharray="3 3" horizontal stroke={REPORT_COLORS.grid} />
      <XAxis type="number" domain={[0, 100]} unit="%" {...axisProps} />
      <YAxis dataKey="name" type="category" width={110} fontSize={9} stroke={REPORT_COLORS.axis} />
      <ReferenceLine x={META_IAPR} stroke={REPORT_COLORS.good} strokeDasharray="4 4" />
      <Bar dataKey="rate" radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={false}>
        {stats.fttData.map((entry) => (
          <Cell key={entry.name} fill={DISCIPLINE_COLORS[entry.name.split(' (')[0]] || '#94a3b8'} />
        ))}
        <LabelList
          dataKey="rate"
          position="right"
          fontSize={9}
          formatter={(v: number) => `${v}%`}
        />
      </Bar>
    </BarChart>
  );
}

export function IaprMonthlyChart({ stats }: { stats: DashboardStats }) {
  return (
    <LineChart width={CHART_HALF} height={190} data={stats.monthlyData}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={REPORT_COLORS.grid} />
      <XAxis dataKey="label" {...axisProps} />
      <YAxis {...axisProps} domain={[0, 100]} unit="%" />
      <ReferenceLine
        y={META_IAPR}
        stroke={REPORT_COLORS.good}
        strokeDasharray="4 4"
        label={{ value: `Meta ${META_IAPR}%`, fontSize: 9, fill: REPORT_COLORS.good }}
      />
      <Line
        type="monotone"
        dataKey="iapr"
        name="IAPR"
        stroke={REPORT_COLORS.brandLight}
        strokeWidth={2}
        dot={{ r: 2 }}
        connectNulls
        isAnimationActive={false}
      />
    </LineChart>
  );
}

export function ReasonsChart({ stats }: { stats: DashboardStats }) {
  if (stats.reasonsData.length === 0) {
    return <EmptyChart width={CHART_FULL} height={180} label="Nenhuma revisão registrada" />;
  }
  const height = Math.max(160, stats.reasonsData.length * 24 + 40);
  return (
    <BarChart
      width={CHART_FULL}
      height={height}
      data={stats.reasonsData}
      layout="vertical"
      margin={{ left: 8, right: 32 }}
    >
      <CartesianGrid strokeDasharray="3 3" horizontal stroke={REPORT_COLORS.grid} />
      <XAxis type="number" allowDecimals={false} {...axisProps} />
      <YAxis dataKey="name" type="category" width={190} fontSize={9} stroke={REPORT_COLORS.axis} />
      <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={14} isAnimationActive={false}>
        {stats.reasonsData.map((entry) => (
          <Cell key={entry.name} fill={CATEGORY_COLORS_LIGHT[entry.category]} />
        ))}
        <LabelList dataKey="count" position="right" fontSize={9} />
      </Bar>
    </BarChart>
  );
}

// ------------------------------------------------------------- Eficiência

export function ExecutionTimeChart({ stats }: { stats: DashboardStats }) {
  if (stats.executionData.length === 0) {
    return <EmptyChart width={CHART_FULL} height={200} label="Nenhum ciclo concluído" />;
  }
  return (
    <BarChart width={CHART_FULL} height={200} data={stats.executionData} margin={{ top: 14 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={REPORT_COLORS.grid} />
      <XAxis dataKey="name" {...axisProps} />
      <YAxis {...axisProps} unit="d" />
      <Legend wrapperStyle={{ fontSize: 10 }} />
      <Bar
        dataKey="avgPrelim"
        name="Preliminar"
        fill="#94a3b8"
        radius={[3, 3, 0, 0]}
        isAnimationActive={false}
      >
        <LabelList dataKey="avgPrelim" position="top" fontSize={8} />
      </Bar>
      <Bar
        dataKey="avgExec"
        name="Executivo"
        fill={REPORT_COLORS.brandLight}
        radius={[3, 3, 0, 0]}
        isAnimationActive={false}
      >
        <LabelList dataKey="avgExec" position="top" fontSize={8} />
      </Bar>
    </BarChart>
  );
}

export function ClientResponseChart({ stats }: { stats: DashboardStats }) {
  if (stats.clientResponseData.length === 0) {
    return <EmptyChart width={CHART_HALF} height={190} label="Sem tempo de resposta medido" />;
  }
  const height = Math.max(160, stats.clientResponseData.length * 22 + 40);
  return (
    <BarChart
      width={CHART_HALF}
      height={height}
      data={stats.clientResponseData}
      layout="vertical"
      margin={{ left: 8, right: 28 }}
    >
      <CartesianGrid strokeDasharray="3 3" horizontal stroke={REPORT_COLORS.grid} />
      <XAxis type="number" {...axisProps} unit="d" />
      <YAxis dataKey="name" type="category" width={110} fontSize={9} stroke={REPORT_COLORS.axis} />
      <Bar
        dataKey="avgDays"
        fill={REPORT_COLORS.warn}
        radius={[0, 3, 3, 0]}
        barSize={14}
        isAnimationActive={false}
      >
        <LabelList dataKey="avgDays" position="right" fontSize={9} />
      </Bar>
    </BarChart>
  );
}

export function CycleTimeChart({ stats }: { stats: DashboardStats }) {
  if (stats.cycleTimeData.length === 0) {
    return <EmptyChart width={CHART_HALF} height={190} label="Nenhum ciclo completo" />;
  }
  const height = Math.max(160, stats.cycleTimeData.length * 22 + 40);
  return (
    <BarChart
      width={CHART_HALF}
      height={height}
      data={stats.cycleTimeData}
      layout="vertical"
      margin={{ left: 8, right: 28 }}
    >
      <CartesianGrid strokeDasharray="3 3" horizontal stroke={REPORT_COLORS.grid} />
      <XAxis type="number" {...axisProps} unit="d" />
      <YAxis dataKey="name" type="category" width={110} fontSize={9} stroke={REPORT_COLORS.axis} />
      <Bar
        dataKey="avgCycle"
        fill={REPORT_COLORS.info}
        radius={[0, 3, 3, 0]}
        barSize={14}
        isAnimationActive={false}
      >
        <LabelList dataKey="avgCycle" position="right" fontSize={9} />
      </Bar>
    </BarChart>
  );
}

// ---------------------------------------------------------------- Carga

export function VolumeChart({ stats }: { stats: DashboardStats }) {
  if (stats.volumeData.length === 0) {
    return <EmptyChart width={CHART_FULL} height={240} label="Sem dados de volume" />;
  }
  const disciplines = Object.values(Discipline);
  return (
    <BarChart
      width={CHART_FULL}
      height={260}
      data={stats.volumeData}
      margin={{ top: 20, right: 16 }}
    >
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={REPORT_COLORS.grid} />
      <XAxis dataKey="name" {...axisProps} />
      <YAxis {...axisProps} allowDecimals={false} />
      <Legend wrapperStyle={{ fontSize: 9 }} />
      {disciplines.map((discipline, i) => (
        <Bar
          key={discipline}
          dataKey={discipline}
          stackId="a"
          name={discipline}
          fill={DISCIPLINE_COLORS[discipline] || '#cbd5e1'}
          isAnimationActive={false}
        >
          {/* Massa total da obra no topo da pilha, ancorada na última barra */}
          {i === disciplines.length - 1 && (
            <LabelList
              dataKey="total"
              position="top"
              offset={6}
              fill={REPORT_COLORS.text}
              fontSize={10}
              fontWeight={700}
            />
          )}
        </Bar>
      ))}
    </BarChart>
  );
}
