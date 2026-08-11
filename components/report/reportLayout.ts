/**
 * Medidas do relatório A4.
 *
 * Tudo aqui é em pixels de CSS, que na impressão valem 1/96 de polegada. Uma
 * folha A4 retrato tem 210mm; descontando as margens de 10mm definidas na regra
 * @page (index.css), sobram 190mm de largura útil ≈ 718px.
 *
 * É por isso que os gráficos do relatório usam largura fixa em vez do
 * ResponsiveContainer do recharts: o ResponsiveContainer mede a largura da
 * janela, que não tem relação nenhuma com a largura da folha — era a causa dos
 * gráficos saírem cortados no PDF.
 */

/** Largura útil da folha A4 retrato com margem de 10mm. */
export const REPORT_DOC_WIDTH = 718;

/** Padding horizontal + borda de um cartão do relatório. */
const CARD_INSET = 30;

/** Espaço entre dois cartões lado a lado. */
export const CARD_GAP = 14;

/** Largura de um gráfico que ocupa a folha inteira. */
export const CHART_FULL = REPORT_DOC_WIDTH - CARD_INSET;

/** Largura de um gráfico em cartão de meia folha. */
export const CHART_HALF = Math.floor((REPORT_DOC_WIDTH - CARD_GAP) / 2) - CARD_INSET;

/** Paleta fixa em tema claro — o relatório ignora o modo escuro do app. */
export const REPORT_COLORS = {
  axis: '#64748b',
  grid: '#e2e8f0',
  text: '#1e293b',
  muted: '#64748b',
  border: '#cbd5e1',
  brand: '#651830',
  brandLight: '#8e1c3e',
  good: '#10b981',
  bad: '#ef4444',
  warn: '#f59e0b',
  info: '#0ea5e9',
};
