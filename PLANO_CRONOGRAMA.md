# Plano de Implementação — Roadmap da aba CRONOGRAMA

> **Instruções para o executor (modelo/dev):** Execute as fases **na ordem** (1 → 5). Cada fase é independente e entrega valor sozinha — se precisar parar, pare ao fim de uma fase. Ao final de CADA fase: rode `npx tsc --noEmit` (deve sair limpo), teste manualmente com `npm run dev` na aba Cronograma, e faça um commit separado.

## Regras gerais (valem para todas as fases)

1. **Não** renomeie props, campos ou funções existentes. **Não** altere outras abas (Dashboard, Projetos, Materiais, Obras).
2. Toda classe de cor Tailwind precisa da variante `dark:` correspondente (siga os padrões já usados no arquivo).
3. Datas: sempre via `date-fns` (`parseISO`, `isValid`, `format`, `differenceInCalendarDays`). Strings de data no modelo são ISO `yyyy-MM-dd`. Textos de UI em português.
4. Arquivo principal: `components/ProjectTimeline.tsx`. Tipos: `types.ts`. Utilitários: `utils.ts`. Edição de projetos: `components/ProjectList.tsx`. A aba é montada em `App.tsx` (~linha 536): `<ProjectTimeline projects={filteredProjects} holidays={holidays} clients={clients} />`.

## Contexto do código atual (leia antes de editar)

`ProjectTimeline.tsx` tem dois componentes:

- **`ClientDetailGantt`** (modal): um `useMemo` retorna `{ rows, days, totalDays, chartStart, contractDeadline, holidaySet }`.
  - `rows` = linhas de disciplina, cada uma com `children` (arquivos). Campos de um item FILE: `id, type:'FILE', label, revision, discipline, status, start, end, duration, netDuration, plannedEnd, deadlineDays, isLate, daysLate, pauses`.
  - Todas as datas usadas no eixo precisam ser empurradas para o array `allDates` dentro do `useMemo` (é dele que saem `chartStart`/`totalDays`).
  - Renderização: cada linha tem uma célula de rótulo fixa (`w-[130px] md:w-[350px]`, sticky) e uma célula de gráfico (`<div className="flex-1 relative h-full">`). Posições são percentuais: `left = (differenceInCalendarDays(data, chartStart) / totalDays) * 100`.
  - Já existem linhas verticais de referência (`showTodayLine`, `todayLeftPct`, `showDeadlineLine`, `deadlineLeftPct`) calculadas logo após `const chartWidth = Math.max(900, totalDays * 40);` e renderizadas dentro da célula de gráfico de cada linha com `z-[12]`.
- **`ProjectTimeline`** (visão macro): `clientStats` (useMemo) gera cards por cliente com `{ name, totalFiles, startDate, endDate, activeFiles, deliveredFiles, relevantFiles, duration, deadline, progress, isOverdue, isFinished }`.

Campos relevantes de `ProjectFile` (types.ts): `startDate, endDate, sendDate, feedbackDate` (ISO strings), `status` (enum `Status`), `pauses`, `client`, `discipline`, `revision`, `groupId`.

---

## FASE 1 — Marcos de Envio e Aprovação no Gantt

**Objetivo:** mostrar como losangos (◆) os eventos `sendDate` (envio ao cliente) e `feedbackDate` (aprovação/reprovação), e uma faixa fina "tempo do cliente" entre envio e feedback. Esses dados já existem no modelo; hoje são invisíveis no Gantt.

### 1.1 Dados (dentro do `useMemo` de `ClientDetailGantt`, no `files.forEach`)

Logo após o cálculo de `plannedEnd`, adicione:

```ts
const send = f.sendDate && isValid(parseISO(f.sendDate)) ? parseISO(f.sendDate) : null;
const feedback =
  f.feedbackDate && isValid(parseISO(f.feedbackDate)) ? parseISO(f.feedbackDate) : null;
if (send) allDates.push(send);
if (feedback) allDates.push(feedback);
```

E inclua `send, feedback` no objeto do `fileRows.push({ ... })`.

### 1.2 Renderização (na célula de gráfico, junto ao bloco `{/* Linhas de referência: Hoje e Prazo Contratual */}`)

Adicione ANTES das linhas de referência:

```tsx
{
  /* Faixa "tempo do cliente" (envio → feedback ou hoje) */
}
{
  row.type === 'FILE' && row.send && (
    <div
      className="absolute bottom-1 h-1 rounded-full bg-blue-400/50 dark:bg-blue-500/40 z-[11] pointer-events-none"
      style={{
        left: `${((differenceInCalendarDays(row.send, chartStart) + 0.5) / totalDays) * 100}%`,
        width: `${(Math.max(0.5, differenceInCalendarDays(row.feedback || new Date(), row.send)) / totalDays) * 100}%`,
      }}
    />
  );
}
{
  /* Marco: enviado ao cliente */
}
{
  row.type === 'FILE' && row.send && (
    <div
      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-blue-500 border border-white dark:border-slate-800 shadow z-[13]"
      style={{
        left: `${((differenceInCalendarDays(row.send, chartStart) + 0.5) / totalDays) * 100}%`,
      }}
      title={`Enviado ao cliente: ${format(row.send, 'dd/MM/yyyy')}`}
    />
  );
}
{
  /* Marco: feedback do cliente */
}
{
  row.type === 'FILE' && row.feedback && (
    <div
      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border border-white dark:border-slate-800 shadow z-[13] ${row.status === Status.REJECTED ? 'bg-rose-500' : 'bg-emerald-500'}`}
      style={{
        left: `${((differenceInCalendarDays(row.feedback, chartStart) + 0.5) / totalDays) * 100}%`,
      }}
      title={`Feedback: ${format(row.feedback, 'dd/MM/yyyy')} — ${row.status}`}
    />
  );
}
```

### 1.3 Legenda (no cabeçalho do modal, junto aos itens "Executado / Planejado / Hoje / Prazo Contratual")

```tsx
<div className="flex items-center gap-1"><div className="w-2 h-2 rotate-45 bg-blue-500"></div><span className="text-slate-600 dark:text-slate-300 font-medium tracking-tight uppercase">Envio</span></div>
<div className="flex items-center gap-1"><div className="w-2 h-2 rotate-45 bg-emerald-500"></div><span className="text-slate-600 dark:text-slate-300 font-medium tracking-tight uppercase">Feedback</span></div>
```

### Critérios de aceite

- Arquivo com `sendDate` mostra ◆ azul; com `feedbackDate` mostra ◆ verde (ou vermelho se `Status.REJECTED`).
- Se envio/feedback caem depois do fim da execução, o eixo se estende para incluí-los (garantido pelo `allDates.push`).
- Tooltip mostra a data no formato dd/MM/yyyy. `tsc --noEmit` limpo.

---

## FASE 2 — Zoom de escala (Dia / Semana / Compacto)

**Objetivo:** projetos longos geram scroll enorme (40px por dia). Adicionar controle de densidade SEM re-agrupar dados: só muda a largura por dia e a densidade dos rótulos do eixo.

### 2.1 Estado (em `ClientDetailGantt`, junto ao `expandedDisciplines`)

```tsx
const [dayWidth, setDayWidth] = useState<number>(() => {
  const saved = Number(localStorage.getItem('cronograma_day_width'));
  return [40, 16, 6].includes(saved) ? saved : 40;
});
const changeDayWidth = (w: number) => {
  setDayWidth(w);
  localStorage.setItem('cronograma_day_width', String(w));
};
```

### 2.2 Largura do gráfico

Substituir `const chartWidth = Math.max(900, totalDays * 40);` por `const chartWidth = Math.max(900, totalDays * dayWidth);`.

### 2.3 Botões (no cabeçalho do modal, ao lado do botão "MS Project XML")

```tsx
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
```

### 2.4 Densidade de rótulos do eixo

No `days.map` do cabeçalho do eixo, o número do dia (`{format(day, 'dd')}`) só deve renderizar quando legível:

```ts
const showDayNumber =
  dayWidth >= 24 ||
  (dayWidth >= 12 && day.getDay() === 1) ||
  (dayWidth < 12 && format(day, 'dd') === '01');
```

Envolva o `<span>` do número com `{showDayNumber && (...)}`. Os rótulos de mês (`isMonthStart`) permanecem sempre.

### Critérios de aceite

- Os 3 níveis funcionam; escolha persiste ao fechar/reabrir o modal (localStorage).
- Em "Semana" aparecem os dias de segunda-feira; em "Mês" só o dia 01. Barras, marcos, linhas de Hoje/Prazo continuam alinhados (nada além de `chartWidth` e rótulos muda — as posições são percentuais).

---

## FASE 3 — Previsão de conclusão (forecast) nos cards

**Objetivo:** responder "nesse ritmo, quando termina?". Calcular o ritmo de entrega recente e projetar a data de término, comparando com o prazo contratual.

### 3.1 Novo utilitário em `utils.ts` (final do arquivo)

```ts
// Soma N dias úteis a uma data, pulando fins de semana e feriados
export const addBusinessDaysWithHolidays = (
  from: Date,
  businessDays: number,
  holidays: string[],
): Date => {
  const holidaySet = new Set(holidays);
  let date = from;
  let remaining = businessDays;
  let guard = 0;
  while (remaining > 0 && guard < 3650) {
    date = addDays(date, 1);
    guard++;
    if (!isWeekend(date) && !holidaySet.has(format(date, 'yyyy-MM-dd'))) remaining--;
  }
  return date;
};
```

(`addDays`, `isWeekend`, `format` já estão importados em utils.ts.)

### 3.2 Cálculo no `clientStats` (componente `ProjectTimeline`)

O grupo por cliente precisa acumular as datas de entrega. No `projects.forEach`, dentro do bloco `if (DELIVERED_STATUSES.includes(p.status))`, adicione a coleta da data do evento de entrega (fim de execução):

```ts
if (p.endDate && isValid(parseISO(p.endDate))) {
  groups[p.client].deliveryDates.push(parseISO(p.endDate));
}
```

(Adicione `deliveryDates: Date[]` ao tipo do `groups` e `deliveryDates: []` na inicialização.)

No `map` final (onde já se calculam `deadline`, `progress`, `isOverdue`), adicione:

```ts
// Ritmo: entregas nos últimos 45 dias corridos
const WINDOW_DAYS = 45;
const windowStart = addDays(today, -WINDOW_DAYS);
const recentDeliveries = stats.deliveryDates.filter((d) => d >= windowStart && d <= today).length;
const windowBusinessDays = calculateBusinessDaysWithHolidays(windowStart, today, holidays);
const pace = windowBusinessDays > 0 ? recentDeliveries / windowBusinessDays : 0; // entregas por dia útil
const remaining = stats.relevantFiles - stats.deliveredFiles;
let forecastDate: Date | null = null;
if (remaining > 0 && pace > 0) {
  forecastDate = addBusinessDaysWithHolidays(today, Math.ceil(remaining / pace), holidays);
}
const forecastBeyondDeadline = !!(forecastDate && deadline && forecastDate > deadline);
```

Inclua `forecastDate, forecastBeyondDeadline, remaining` no objeto retornado. Importe `addBusinessDaysWithHolidays` de `../utils` e `addDays` de `date-fns` (verifique se já está importado no topo do ProjectTimeline.tsx — está).

### 3.3 UI no card (logo abaixo da linha "Prazo contratual")

```tsx
{
  client.forecastDate && (
    <div
      className={`flex items-center gap-2 text-sm ${client.forecastBeyondDeadline ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-emerald-600 dark:text-emerald-400'}`}
    >
      <TrendingUp size={16} />
      <span>Previsão de término: {format(client.forecastDate, 'dd/MM/yyyy')}</span>
    </div>
  );
}
{
  !client.forecastDate && client.remaining > 0 && (
    <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
      <TrendingUp size={16} />
      <span>Previsão: sem entregas nos últimos 45 dias</span>
    </div>
  );
}
```

Adicione `TrendingUp` ao import de `lucide-react`.

### Critérios de aceite

- Cliente com entregas recentes e trabalho restante mostra data projetada (verde se ≤ prazo, vermelha se > prazo).
- Cliente 100% entregue não mostra previsão. Cliente sem ritmo mostra o aviso.
- A previsão nunca cai em fim de semana/feriado.

---

## FASE 4 — Gantt de Portfólio (todos os clientes numa linha do tempo)

**Objetivo:** visão de alocação entre obras: uma linha por cliente, na mesma escala de tempo, com prazo e atraso visíveis. Alterna com os cards por um toggle.

### 4.1 Estado e toggle (componente `ProjectTimeline`)

```tsx
const [viewMode, setViewMode] = useState<'CARDS' | 'TIMELINE'>('CARDS');
```

No cabeçalho da aba (div com título "Cronograma Geral"), adicione à direita:

```tsx
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
```

Envolva o grid de cards existente com `{viewMode === 'CARDS' && (...)}`.

### 4.2 Cálculo do domínio global (novo `useMemo`, usa `clientStats` já pronto)

```tsx
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
```

Importe `eachMonthOfInterval` de `date-fns` (adicionar ao import existente).

### 4.3 Renderização da linha do tempo

```tsx
{
  viewMode === 'TIMELINE' && portfolio && (
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
            {/* Marco de prazo contratual */}
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
  );
}
```

### Critérios de aceite

- Toggle alterna Cards ↔ Linha do tempo sem quebrar o modal de detalhe (clicar numa linha abre o mesmo `ClientDetailGantt`).
- Barras vermelhas para clientes em atraso, verdes para concluídos; linha de hoje e prazos visíveis; meses no eixo.

---

## FASE 5 — Dependências entre disciplinas, caminho crítico e export enriquecido

**A fase mais complexa. Execute os sub-passos na ordem; cada um compila sozinho.**

### 5.1 Modelo de dados (`types.ts`)

Em `ProjectFile`, adicionar (campo opcional — Firestore não exige migração):

```ts
predecessorIds?: string[]; // IDs de arquivos que precisam terminar antes deste começar
```

### 5.2 UI de edição (em `components/ProjectList.tsx`)

Localize o formulário/modal de edição de um arquivo (procure onde `endDate` e `startDate` são editados e onde `onUpdate` é chamado). Adicione um campo "Predecessores":

- Um `<select multiple>` (ou lista de checkboxes, siga o estilo dos selects existentes) listando os outros arquivos **do mesmo cliente**, excluindo o próprio arquivo e os com `status === Status.REVISED`. Value = `p.id`, label = `p.filename`.
- Salvar em `predecessorIds` no objeto passado a `onUpdate`.
- **Cuidado:** não altere nenhum outro campo do formulário. Se o formulário for inline (não modal), coloque o campo no fim.

### 5.3 Violações de dependência no Gantt (`ProjectTimeline.tsx`, `useMemo` de `ClientDetailGantt`)

Após montar todos os `rowData`, construa um índice e marque violações:

```ts
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
  fr.predecessorViolations = violated; // string[]
});
```

Na célula de rótulo dos arquivos (junto ao `CheckCircle2`), renderize:

```tsx
{
  row.predecessorViolations?.length > 0 && (
    <AlertTriangle
      size={12}
      className="text-amber-500 flex-shrink-0"
      title={`Iniciou antes do término de: ${row.predecessorViolations.join(', ')}`}
    />
  );
}
```

(`AlertTriangle` já está importado.)

### 5.4 Caminho crítico simplificado

Ainda no `useMemo`, após o passo 5.3 — a maior cadeia de dependências por duração líquida:

```ts
const memo: Record<string, number> = {};
const inPath = new Set<string>();
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
// Reconstrói a cadeia marcando os nós
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
```

Na linha do arquivo (div externa da row, `className` que já contém `flex items-center h-10`), adicione borda quando crítico: `${row.isCritical ? 'border-l-2 border-l-red-500' : ''}`. Adicione item na legenda: "Caminho crítico".

**Nota:** só marque caminho crítico se houver ao menos uma dependência cadastrada (`inPath.size > 1`) — sem dependências, o conceito não se aplica.

### 5.5 Export MS Project enriquecido (`exportToMSProjectXML`)

1. A função precisa receber os projetos para mapear dependências: mude a assinatura para `exportToMSProjectXML(clientName: string, rows: any[], projectsById: Record<string, string[]>)` onde `projectsById` mapeia `fileRow.id → predecessorIds`. No botão, monte o mapa a partir de `projects`.
2. Ao gerar as tasks, guarde `fileRow.id → UID` num `Record<string, number>` (primeira passada) e gere `PredecessorLink` na segunda passada — OU gere as tasks de arquivos primeiro no contador e depois o XML (mais simples: faça uma primeira iteração só atribuindo UIDs, depois gere o XML).
3. Em cada `<Task>` de arquivo, adicione:

```xml
<PercentComplete>{done ? 100 : 0}</PercentComplete>
```

onde `done` = status é `Execução Concluída`, `Aguardando Aprovação` ou `Aprovado`. E para cada predecessor com UID conhecido:

```xml
<PredecessorLink><PredecessorUID>{uid}</PredecessorUID><Type>1</Type></PredecessorLink>
```

(Type 1 = Finish-to-Start.)

### Critérios de aceite

- Cadastrar um predecessor num arquivo e ver: ⚠ âmbar quando as datas violam a precedência; borda vermelha na cadeia mais longa; XML abre no MS Project com vínculos FS e % concluído.
- Arquivo sem dependências: nenhum badge, nenhum caminho crítico, export igual ao atual + `PercentComplete`.
- Ciclos de dependência (A→B→A) não travam a página (proteção `visiting`).

---

## Checklist final (após todas as fases)

- [ ] `npx tsc --noEmit` limpo
- [ ] `npm run build` sem erros
- [ ] Testar em dark mode e em tela estreita (mobile) — a coluna de rótulos vira 130px
- [ ] Testar cliente SEM `contractDate` (nada de prazo/forecast deve aparecer, sem crash)
- [ ] Testar cliente com 1 arquivo apenas e cliente com 0 arquivos válidos
- [ ] Um commit por fase, mensagens: `feat(cronograma): fase N — <resumo>`
