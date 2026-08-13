/**
 * Documento A4 do relatório de indicadores.
 *
 * Este componente NÃO é a tela do Dashboard impressa: é um documento próprio,
 * de largura fixa (REPORT_DOC_WIDTH), tema claro e conteúdo sempre expandido —
 * sem painéis recolhidos, sem paginação interna e sem áreas com rolagem, que
 * eram o motivo de a lista de atrasados sair incompleta no PDF.
 *
 * Estrutura: capa com escopo → sumário executivo → tabela completa de
 * atrasados → anexo com os gráficos detalhados.
 */
import { format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardFilterState } from '../../hooks/useDashboardFilters';
import { DashboardStats, META_IAPR, META_OTD } from '../dashboardShared';
import { NarrativeState } from './aiNarrative';
import {
  ClientResponseChart,
  CycleTimeChart,
  ExecutionTimeChart,
  IaprByDisciplineChart,
  IaprMonthlyChart,
  MonthlyFlowChart,
  OtdDonutChart,
  OtdMonthlyChart,
  ReasonsChart,
  VolumeChart,
} from './ReportCharts';
import {
  ReportCard,
  ReportField,
  ReportGauge,
  ReportSection,
  ReportStat,
} from './ReportPrimitives';
import { CARD_GAP, REPORT_COLORS, REPORT_DOC_WIDTH } from './reportLayout';

export interface ReportViewProps {
  stats: DashboardStats;
  filters: DashboardFilterState;
  /** Quantidade de arquivos que passaram pelos filtros — base de cálculo do relatório. */
  totalProjects: number;
  generatedAt: Date;
  narrative: NarrativeState;
}

function formatDay(iso: string): string {
  const d = parseISO(iso);
  return isValid(d) ? format(d, 'dd/MM/yyyy') : iso;
}

/** Descreve o período coberto pelos filtros de data. Reaproveitado no email. */
export function describePeriodo(filters: DashboardFilterState): string {
  const { dateFrom, dateTo } = filters;
  if (dateFrom && dateTo) return `${formatDay(dateFrom)} a ${formatDay(dateTo)}`;
  if (dateFrom) return `a partir de ${formatDay(dateFrom)}`;
  if (dateTo) return `até ${formatDay(dateTo)}`;
  return 'Todo o histórico registrado';
}

export function ReportView({
  stats,
  filters,
  totalProjects,
  generatedAt,
  narrative,
}: ReportViewProps) {
  const atrasados = stats.alerts.filter((a) => a.slaStatus === 'ATRASADO');
  const vencendo = stats.alerts.filter((a) => a.slaStatus === 'VENCENDO');
  const deliveryDelta = stats.deliveries30 - stats.deliveriesPrev30;
  const temFiltroDeRecorte =
    filters.clients.length > 0 ||
    filters.disciplines.length > 0 ||
    filters.phases.length > 0 ||
    filters.statuses.length > 0;

  return (
    <div
      className="report-doc bg-white text-slate-900"
      style={{ width: REPORT_DOC_WIDTH }}
      lang="pt-BR"
    >
      {/* ================= Cabeçalho ================= */}
      <header
        className="report-block flex items-end justify-between rounded-lg px-5 py-4 text-white"
        style={{ backgroundColor: REPORT_COLORS.brand }}
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">
            Cerne Construções
          </p>
          <h1 className="mt-1 text-xl font-bold leading-tight">Relatório de Indicadores</h1>
          <p className="mt-0.5 text-[11px] opacity-90">
            Prazo, qualidade, eficiência e carga de projetos
          </p>
        </div>
        <div className="text-right text-[10px] leading-relaxed opacity-90">
          <p>Gerado em</p>
          <p className="text-sm font-bold">
            {format(generatedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
      </header>

      {/* ================= Escopo ================= */}
      <div className="report-block mt-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
          Escopo deste relatório
        </p>
        <div className="grid grid-cols-2 gap-x-6">
          <ReportField label="Período" value={describePeriodo(filters)} />
          <ReportField
            label="Base de cálculo"
            value={`${totalProjects} arquivo${totalProjects !== 1 ? 's' : ''} de projeto`}
          />
          <ReportField
            label="Obras"
            value={filters.clients.length > 0 ? filters.clients.join(', ') : 'Todas'}
          />
          <ReportField
            label="Disciplinas"
            value={filters.disciplines.length > 0 ? filters.disciplines.join(', ') : 'Todas'}
          />
          <ReportField
            label="Fases"
            value={filters.phases.length > 0 ? filters.phases.join(', ') : 'Todas'}
          />
          <ReportField
            label="Status"
            value={filters.statuses.length > 0 ? filters.statuses.join(', ') : 'Todos'}
          />
        </div>

        {filters.statuses.length > 0 && (
          <p
            className="mt-2 rounded border px-2 py-1.5 text-[9px] leading-snug"
            style={{
              borderColor: '#fcd34d',
              backgroundColor: '#fffbeb',
              color: '#92400e',
            }}
          >
            <strong>Atenção:</strong> há filtro de status ativo. OTD e IAPR passam a ser calculados
            apenas sobre os arquivos filtrados e não representam o indicador da operação. Use este
            recorte para investigar, não para reportar.
          </p>
        )}
        {!temFiltroDeRecorte && (
          <p className="mt-2 text-[9px] italic text-slate-500">
            Nenhum filtro de recorte aplicado — os números abaixo representam a operação completa.
          </p>
        )}
      </div>

      {/* ================= Análise executiva (IA) ================= */}
      {narrative.status !== 'error' && (
        <ReportCard title="Análise Executiva (IA)" className="mt-3">
          {narrative.status === 'loading' && (
            <p className="text-[10px] italic text-slate-400">Gerando análise com IA…</p>
          )}
          {narrative.status === 'done' && (
            <>
              <div className="space-y-2">
                {narrative.text
                  .split('\n')
                  .filter((paragrafo) => paragrafo.trim())
                  .map((paragrafo, i) => (
                    <p key={i} className="text-[10.5px] leading-relaxed text-slate-700">
                      {paragrafo}
                    </p>
                  ))}
              </div>
              <p className="mt-2.5 text-[9px] italic text-slate-400">
                Texto gerado por IA (Gemini) a partir dos indicadores deste período — revise antes
                de enviar.
              </p>
            </>
          )}
        </ReportCard>
      )}

      {/* ================= Sumário executivo ================= */}
      <ReportSection label="Sumário Executivo" />

      <div className="grid grid-cols-3 gap-2.5">
        <ReportStat
          label="Em execução"
          value={stats.groupsInProgress}
          sub={`${stats.totalWipFiles} arquivo${stats.totalWipFiles !== 1 ? 's' : ''} em trabalho`}
        />
        <ReportStat
          label="Aguardando cliente"
          value={stats.groupsWaiting}
          sub="entregáveis já enviados"
        />
        <ReportStat
          label="Atrasados (SLA)"
          value={atrasados.length}
          sub={`${vencendo.length} vencendo em até 1 dia`}
          accent={atrasados.length > 0 ? REPORT_COLORS.bad : REPORT_COLORS.good}
        />
        <ReportStat
          label="Entregas (30 dias)"
          value={stats.deliveries30}
          sub={`${
            deliveryDelta > 0
              ? `+${deliveryDelta}`
              : deliveryDelta < 0
                ? `${deliveryDelta}`
                : 'sem variação'
          } vs. os 30 dias anteriores`}
        />
        <ReportStat
          label="Ciclos concluídos"
          value={stats.closedGroups}
          sub="entregáveis com ciclo fechado"
        />
        <ReportStat
          label="Volume de arquivos"
          value={stats.volumeResumo.files}
          sub={`${stats.volumeResumo.obras} obra${stats.volumeResumo.obras !== 1 ? 's' : ''} · ${
            stats.volumeResumo.revisoes
          } revisões`}
        />
      </div>

      <div className="mt-2.5 flex" style={{ gap: CARD_GAP }}>
        <ReportGauge
          label="OTD — Entrega no Prazo"
          value={stats.totalSlaMeasured > 0 ? stats.otdPercentage : null}
          meta={META_OTD}
          sample={
            stats.totalSlaMeasured > 0
              ? `${stats.totalSlaMeasured} entregáveis medidos`
              : 'Nenhuma SLA medida no período'
          }
          hint="Entregáveis aprovados dentro do prazo de entrega dos projetos."
        />
        <ReportGauge
          label="IAPR — Aprovação de Primeira"
          value={stats.closedGroups > 0 ? stats.iaprGlobal : null}
          meta={META_IAPR}
          sample={
            stats.closedGroups > 0
              ? `${stats.closedGroups} ciclos concluídos`
              : 'Nenhum ciclo concluído no período'
          }
          hint="Entregáveis aprovados sem precisar de revisão."
        />
      </div>

      {/* ================= Atrasados ================= */}
      <ReportSection label="Entregáveis Atrasados ou a Vencer" />

      {stats.alerts.length === 0 ? (
        <div
          className="report-block rounded-lg border px-4 py-3 text-[11px]"
          style={{ borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', color: '#065f46' }}
        >
          Nenhum entregável atrasado ou próximo do vencimento no recorte deste relatório.
        </div>
      ) : (
        <>
          <p className="mb-2 text-[10px] text-slate-600">
            <strong>{atrasados.length}</strong> atrasado{atrasados.length !== 1 ? 's' : ''} e{' '}
            <strong>{vencendo.length}</strong> a vencer, medidos contra o prazo de entrega dos
            projetos. Lista completa, ordenada do maior atraso para o menor.
          </p>
          <table className="w-full table-fixed border-collapse text-[9.5px]">
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th className="w-[62px] border border-slate-300 px-1.5 py-1 text-left font-bold">
                  Situação
                </th>
                <th className="border border-slate-300 px-1.5 py-1 text-left font-bold">
                  Entregável
                </th>
                <th className="w-[135px] border border-slate-300 px-1.5 py-1 text-left font-bold">
                  Obra / Base
                </th>
                <th className="w-[85px] border border-slate-300 px-1.5 py-1 text-left font-bold">
                  Disciplina
                </th>
                <th className="w-[58px] border border-slate-300 px-1.5 py-1 text-left font-bold">
                  Prazo
                </th>
                <th className="w-[52px] border border-slate-300 px-1.5 py-1 text-right font-bold">
                  Atraso
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.alerts.map((alert, i) => {
                const isAtrasado = alert.slaStatus === 'ATRASADO';
                return (
                  <tr
                    key={alert.project.id}
                    style={{ backgroundColor: i % 2 === 1 ? '#f8fafc' : '#ffffff' }}
                  >
                    <td className="border border-slate-300 px-1.5 py-1">
                      <span
                        className="inline-block rounded px-1 py-px text-[8px] font-bold uppercase"
                        style={
                          isAtrasado
                            ? { backgroundColor: '#ffe4e6', color: '#9f1239' }
                            : { backgroundColor: '#fef3c7', color: '#92400e' }
                        }
                      >
                        {alert.slaStatus}
                      </span>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 align-top">
                      <span className="block break-words font-medium">
                        {alert.project.filename}
                      </span>
                      <span className="text-[8px] text-slate-500">{alert.project.status}</span>
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 align-top break-words">
                      {alert.project.client}
                      {alert.project.base ? ` — ${alert.project.base}` : ''}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 align-top break-words">
                      {alert.project.discipline}
                    </td>
                    <td className="border border-slate-300 px-1.5 py-1 align-top">
                      {format(alert.deadline, 'dd/MM/yy')}
                    </td>
                    <td
                      className="border border-slate-300 px-1.5 py-1 text-right align-top font-bold"
                      style={{ color: isAtrasado ? REPORT_COLORS.bad : REPORT_COLORS.warn }}
                    >
                      {isAtrasado ? `${alert.daysLate}d` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* ================= Anexo: gráficos ================= */}
      <div className="report-page-break">
        <ReportSection label="Anexo — Prazo & Entrega" />

        <div className="flex" style={{ gap: CARD_GAP }}>
          <ReportCard
            title="Entrega no Prazo (OTD)"
            hint={`Distribuição dos entregáveis medidos · meta ≥ ${META_OTD}%`}
            className="flex-1"
          >
            <OtdDonutChart stats={stats} />
          </ReportCard>
          <ReportCard
            title="OTD por mês"
            hint="Últimos 12 meses; meses sem SLA medida ficam sem ponto"
            className="flex-1"
          >
            <OtdMonthlyChart stats={stats} />
          </ReportCard>
        </div>

        <ReportCard
          title="Fluxo mensal: iniciados × entregues"
          hint="Trabalho que entrou na fila contra trabalho enviado ao cliente"
          className="mt-2.5"
        >
          <MonthlyFlowChart stats={stats} />
        </ReportCard>
      </div>

      <div className="report-page-break">
        <ReportSection label="Anexo — Qualidade" />

        <div className="flex" style={{ gap: CARD_GAP }}>
          <ReportCard
            title="Aprovação de primeira (IAPR)"
            hint={`Por disciplina e fase · meta ≥ ${META_IAPR}%`}
            className="flex-1"
          >
            <IaprByDisciplineChart stats={stats} />
          </ReportCard>
          <ReportCard
            title="IAPR por mês"
            hint="Tendência de retrabalho ao longo do ano"
            className="flex-1"
          >
            <IaprMonthlyChart stats={stats} />
          </ReportCard>
        </div>

        <ReportCard
          title="Motivos de revisão"
          hint={`${stats.totalReasons} revisões registradas · ${stats.reasonCategoryTotals.Interna} de causa interna, ${stats.reasonCategoryTotals.Externa} de causa externa, ${stats.reasonCategoryTotals.Outros} outras`}
          className="mt-2.5"
        >
          <ReasonsChart stats={stats} />
        </ReportCard>
      </div>

      <div className="report-page-break">
        <ReportSection label="Anexo — Eficiência" />

        <ReportCard
          title="Tempo médio de execução"
          hint="Dias úteis por disciplina, apenas ciclos concluídos, descontadas as pausas"
        >
          <ExecutionTimeChart stats={stats} />
        </ReportCard>

        <div className="mt-2.5 flex" style={{ gap: CARD_GAP }}>
          <ReportCard
            title="Tempo de resposta do cliente"
            hint="Dias em que o entregável ficou parado aguardando retorno"
            className="flex-1"
          >
            <ClientResponseChart stats={stats} />
          </ReportCard>
          <ReportCard
            title="Tempo de ciclo completo"
            hint="Do início da execução até o retorno do cliente"
            className="flex-1"
          >
            <CycleTimeChart stats={stats} />
          </ReportCard>
        </div>
      </div>

      <div className="report-page-break">
        <ReportSection label="Anexo — Carga de Trabalho" />

        <ReportCard
          title="Carga por obra"
          hint={`Arquivos por disciplina, revisões inclusas (esforço real da equipe) · ${stats.volumeResumo.revisoes} de ${stats.volumeResumo.files} arquivos são reemissões${
            stats.volumeResumo.files > 0
              ? ` (${Math.round((stats.volumeResumo.revisoes / stats.volumeResumo.files) * 100)}% de retrabalho)`
              : ''
          }`}
        >
          <VolumeChart stats={stats} />
        </ReportCard>
      </div>

      {/* ================= Rodapé ================= */}
      <footer className="report-block mt-5 border-t border-slate-300 pt-2 text-[8.5px] text-slate-500">
        <p>
          <strong>Cerne Construções</strong> · Relatório gerado automaticamente pelo EngPlot KPI em{' '}
          {format(generatedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
        </p>
        <p className="mt-0.5">
          OTD mede entregáveis aprovados dentro do prazo de entrega dos projetos: a 1ª entrega
          de cada entregável contra o prazo padrão da obra, e entregas posteriores (revisão
          pós-certificadora) só entram na conta quando têm uma meta própria configurada. IAPR
          mede entregáveis aprovados sem revisão, sempre pelo entregável (não pelo arquivo) —
          revisões do mesmo documento não são contadas duas vezes.
        </p>
      </footer>
    </div>
  );
}
