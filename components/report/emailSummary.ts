/**
 * Texto do email que acompanha o relatório.
 *
 * O corpo é texto puro de propósito: gráficos embutidos no corpo do email não
 * renderizam no Outlook para Desktop (que usa o motor do Word e ignora SVG), e
 * o destinatário veria retângulos vazios. Os números que importam vão no corpo,
 * e o detalhamento visual vai no PDF anexo.
 */
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardFilterState } from '../../hooks/useDashboardFilters';
import { DashboardStats, META_IAPR, META_OTD } from '../dashboardShared';

/** Quantos atrasados listar no corpo do email antes de remeter ao anexo. */
const MAX_ATRASADOS_NO_EMAIL = 5;

export interface ReportSummaryInput {
  stats: DashboardStats;
  filters: DashboardFilterState;
  totalProjects: number;
  generatedAt: Date;
  periodoLabel: string;
}

export function buildEmailSubject({ generatedAt }: ReportSummaryInput): string {
  return `Indicadores de Projetos — Cerne Construções — ${format(generatedAt, 'dd/MM/yyyy')}`;
}

export function buildEmailBody(input: ReportSummaryInput): string {
  const { stats, filters, totalProjects, generatedAt, periodoLabel } = input;

  const atrasados = stats.alerts.filter((a) => a.slaStatus === 'ATRASADO');
  const vencendo = stats.alerts.filter((a) => a.slaStatus === 'VENCENDO');
  const delta = stats.deliveries30 - stats.deliveriesPrev30;
  const deltaTexto = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : 'sem variação';

  const linhas: string[] = [];

  linhas.push('Olá,');
  linhas.push('');
  linhas.push(
    'Segue o relatório de indicadores de projetos da Cerne Construções. O detalhamento completo, com os gráficos, está no PDF em anexo.',
  );
  linhas.push('');
  linhas.push(`PERÍODO: ${periodoLabel}`);
  linhas.push(
    `BASE DE CÁLCULO: ${totalProjects} arquivo${totalProjects !== 1 ? 's' : ''} de projeto`,
  );
  if (filters.clients.length > 0) linhas.push(`OBRAS: ${filters.clients.join(', ')}`);
  if (filters.disciplines.length > 0) {
    linhas.push(`DISCIPLINAS: ${filters.disciplines.join(', ')}`);
  }
  linhas.push('');

  linhas.push('--- RESUMO ---');
  linhas.push(
    `Em execução: ${stats.groupsInProgress} entregáveis (${stats.totalWipFiles} arquivos em trabalho)`,
  );
  linhas.push(`Aguardando retorno do cliente: ${stats.groupsWaiting} entregáveis`);
  linhas.push(`Atrasados (SLA da obra): ${atrasados.length}`);
  linhas.push(`A vencer em até 1 dia: ${vencendo.length}`);
  linhas.push(
    `Entregas nos últimos 30 dias: ${stats.deliveries30} (${deltaTexto} vs. os 30 dias anteriores)`,
  );
  linhas.push(
    stats.totalSlaMeasured > 0
      ? `OTD (entrega no prazo): ${stats.otdPercentage}% — meta >= ${META_OTD}% — ${stats.totalSlaMeasured} entregáveis medidos`
      : 'OTD (entrega no prazo): sem SLA medida no período',
  );
  linhas.push(
    stats.closedGroups > 0
      ? `IAPR (aprovação de primeira): ${stats.iaprGlobal}% — meta >= ${META_IAPR}% — ${stats.closedGroups} ciclos concluídos`
      : 'IAPR (aprovação de primeira): nenhum ciclo concluído no período',
  );
  linhas.push(
    `Carga de trabalho: ${stats.volumeResumo.files} arquivos em ${stats.volumeResumo.obras} obra${
      stats.volumeResumo.obras !== 1 ? 's' : ''
    }, sendo ${stats.volumeResumo.revisoes} reemissões`,
  );
  linhas.push('');

  if (atrasados.length > 0) {
    linhas.push(`--- ATRASADOS (${atrasados.length}) ---`);
    atrasados.slice(0, MAX_ATRASADOS_NO_EMAIL).forEach((a, i) => {
      const base = a.project.base ? ` / ${a.project.base}` : '';
      linhas.push(
        `${i + 1}. ${a.project.filename} — ${a.project.client}${base} — ${a.project.discipline} — ${a.daysLate} dia${a.daysLate !== 1 ? 's' : ''} de atraso (prazo ${format(a.deadline, 'dd/MM/yyyy')})`,
      );
    });
    if (atrasados.length > MAX_ATRASADOS_NO_EMAIL) {
      linhas.push(
        `... e mais ${atrasados.length - MAX_ATRASADOS_NO_EMAIL}. A lista completa está no PDF em anexo.`,
      );
    }
    linhas.push('');
  }

  if (filters.statuses.length > 0) {
    linhas.push(
      'OBSERVAÇÃO: este relatório foi gerado com filtro de status ativo, então OTD e IAPR consideram apenas o recorte filtrado e não representam o indicador da operação completa.',
    );
    linhas.push('');
  }

  linhas.push(
    `Relatório gerado pelo EngPlot KPI em ${format(generatedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.`,
  );

  return linhas.join('\n');
}

/**
 * Teto de caracteres do corpo no mailto:. O Outlook e o Windows cortam a URL
 * por volta de 2000 caracteres; acima disso o email abre truncado no meio de
 * uma frase. Quando o resumo passa daqui, o corpo é cortado numa quebra de
 * linha e remete ao PDF — o texto integral continua disponível no botão
 * "Copiar resumo", que não passa por URL nenhuma.
 */
const MAX_CORPO_MAILTO = 1500;

/**
 * Monta a URL mailto: com assunto e corpo prontos. O destinatário fica em
 * branco de propósito — quem envia escolhe a lista no próprio cliente de email.
 */
export function buildMailtoUrl(input: ReportSummaryInput): string {
  const subject = encodeURIComponent(buildEmailSubject(input));

  let corpo = buildEmailBody(input);
  if (corpo.length > MAX_CORPO_MAILTO) {
    const corte = corpo.lastIndexOf('\n', MAX_CORPO_MAILTO);
    corpo =
      corpo.slice(0, corte > 0 ? corte : MAX_CORPO_MAILTO) +
      '\n\n[Resumo abreviado para caber no email. Os números completos estão no PDF em anexo.]';
  }

  return `mailto:?subject=${subject}&body=${encodeURIComponent(corpo)}`;
}
