import React, { useMemo } from 'react';
import {
  ComposedChart,
  Scatter,
  Line,
  BarChart,
  Bar,
  LineChart,
  ErrorBar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { AlertTriangle } from 'lucide-react';
import {
  BandStats,
  SteelFit,
  SteelKind,
  SteelRecord,
  TimeSeriesPoint,
  WIND_BANDS,
  expectedIntensity,
  intensity,
  windBandOf,
} from '../../domain/steel';
import { formatNumberBR } from '../../utils';
import { windBandColor } from './acoShared';

interface ChartTheme {
  axisColor: string;
  gridColor: string;
  tooltipStyle: React.CSSProperties;
}

const useChartTheme = (isDarkMode: boolean): ChartTheme => ({
  axisColor: isDarkMode ? '#94a3b8' : '#64748b',
  gridColor: isDarkMode ? '#334155' : '#e2e8f0',
  tooltipStyle: {
    backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
    color: isDarkMode ? '#f1f5f9' : '#1e293b',
    border: isDarkMode ? '1px solid #475569' : 'none',
    fontSize: 12,
  },
});

const EmptyChart = ({ label }: { label: string }) => (
  <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
    {label}
  </div>
);

// --- Consumo × Vento ---

interface ScatterPoint {
  x: number;
  y: number;
  client: string;
  base: string;
}

function ScatterTooltipContent({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload as ScatterPoint;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200">
        {p.client} — {p.base}
      </p>
      <p className="text-slate-500 dark:text-slate-400">
        Vento: {formatNumberBR(p.x, 1)} m/s · {formatNumberBR(p.y, 2)} kg/m²
      </p>
    </div>
  );
}

export const SteelScatterChart: React.FC<{
  records: SteelRecord[];
  kind: SteelKind;
  fit: SteelFit | null;
  isDarkMode: boolean;
}> = ({ records, kind, fit, isDarkMode }) => {
  const theme = useChartTheme(isDarkMode);

  const bandGroups = useMemo(
    () =>
      WIND_BANDS.map((band) => {
        const points: ScatterPoint[] = records
          .filter((r) => windBandOf(r.windSpeed).key === band.key)
          .map((r) => ({ x: r.windSpeed, y: intensity(r, kind), client: r.client, base: r.base }))
          .filter((p): p is ScatterPoint => p.y !== null);
        return { band, points };
      }).filter((g) => g.points.length > 0),
    [records, kind],
  );

  const curvePoints = useMemo(() => {
    if (!fit) return [];
    const winds = records.map((r) => r.windSpeed);
    if (winds.length === 0) return [];
    const min = Math.min(...winds);
    const max = Math.max(...winds);
    const steps = 24;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const x = min + ((max - min) * i) / (steps || 1);
      return { x, y: expectedIntensity(fit, x) };
    });
  }, [fit, records]);

  const totalPoints = bandGroups.reduce((s, g) => s + g.points.length, 0);
  if (totalPoints === 0) return <EmptyChart label="Sem dados com área cadastrada" />;

  return (
    <div className="h-full flex flex-col">
      {!fit && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 mb-1">
          <AlertTriangle size={12} className="flex-shrink-0" />
          Amostra insuficiente para curva esperada (mínimo 5 registros e 3 ventos distintos) —
          exibindo só os pontos observados.
        </p>
      )}
      {fit && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-1">
          Curva ajustada sobre {fit.n} registros · R² = {formatNumberBR(fit.r2, 2)}
        </p>
      )}
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.gridColor} />
            <XAxis
              type="number"
              dataKey="x"
              name="Vento"
              unit=" m/s"
              stroke={theme.axisColor}
              fontSize={11}
              domain={['dataMin - 1', 'dataMax + 1']}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="kg/m²"
              stroke={theme.axisColor}
              fontSize={11}
              width={40}
            />
            <Tooltip content={<ScatterTooltipContent />} cursor={{ strokeDasharray: '3 3' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {bandGroups.map((g) => (
              <Scatter
                key={g.band.key}
                name={g.band.label}
                data={g.points}
                dataKey="y"
                fill={windBandColor(g.band.key, isDarkMode)}
              />
            ))}
            {fit && curvePoints.length > 0 && (
              <Line
                data={curvePoints}
                dataKey="y"
                name="Curva esperada"
                stroke={isDarkMode ? '#f1f5f9' : '#1e293b'}
                strokeWidth={2}
                dot={false}
                legendType="line"
                isAnimationActive={false}
                type="monotone"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// --- Mediana por faixa de vento ---

export const SteelBandChart: React.FC<{ bands: BandStats[]; isDarkMode: boolean }> = ({
  bands,
  isDarkMode,
}) => {
  const theme = useChartTheme(isDarkMode);
  const data = bands.map((b) => ({
    label: b.band.label,
    key: b.band.key,
    mediana: Math.round(b.mediana * 100) / 100,
    n: b.n,
    errorRange: [
      Math.max(0, b.mediana - b.p25),
      Math.max(0, b.p75 - b.mediana),
    ] as [number, number],
  }));

  if (data.length === 0) return <EmptyChart label="Sem dados com área cadastrada" />;

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.gridColor} vertical={false} />
        <XAxis dataKey="label" stroke={theme.axisColor} fontSize={11} />
        <YAxis stroke={theme.axisColor} fontSize={11} width={40} />
        <Tooltip
          contentStyle={theme.tooltipStyle}
          formatter={(value: any, name: string) =>
            name === 'mediana' ? [`${formatNumberBR(Number(value), 2)} kg/m²`, 'Mediana'] : value
          }
          labelFormatter={(label, payload) => {
            const n = payload?.[0]?.payload?.n;
            return `${label}${n ? ` (n=${n})` : ''}`;
          }}
        />
        <Bar dataKey="mediana" fill="#8e1c3e" radius={[4, 4, 0, 0]}>
          <ErrorBar dataKey="errorRange" width={4} strokeWidth={1.5} stroke={theme.axisColor} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// --- Evolução no tempo ---

export const SteelTimeSeriesChart: React.FC<{
  points: TimeSeriesPoint[];
  isDarkMode: boolean;
}> = ({ points, isDarkMode }) => {
  const theme = useChartTheme(isDarkMode);

  const { pivot, bandKeys } = useMemo(() => {
    const byPeriod = new Map<string, Record<string, any>>();
    points.forEach((p) => {
      const row = byPeriod.get(p.periodKey) || { periodKey: p.periodKey, periodLabel: p.periodLabel };
      row[p.bandKey] = p.mediana;
      byPeriod.set(p.periodKey, row);
    });
    const pivot = Array.from(byPeriod.values()).sort((a, b) =>
      String(a.periodKey).localeCompare(String(b.periodKey)),
    );
    const bandKeys = WIND_BANDS.map((b) => b.key).filter((k) => points.some((p) => p.bandKey === k));
    return { pivot, bandKeys };
  }, [points]);

  if (pivot.length === 0) return <EmptyChart label="Sem dados suficientes ao longo do tempo" />;

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <LineChart data={pivot} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.gridColor} vertical={false} />
        <XAxis dataKey="periodLabel" stroke={theme.axisColor} fontSize={11} />
        <YAxis stroke={theme.axisColor} fontSize={11} width={40} />
        <Tooltip
          contentStyle={theme.tooltipStyle}
          formatter={(value: any) => `${formatNumberBR(Number(value), 2)} kg/m²`}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {bandKeys.map((key) => {
          const band = WIND_BANDS.find((b) => b.key === key)!;
          return (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={band.label}
              stroke={windBandColor(key, isDarkMode)}
              connectNulls
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
};
