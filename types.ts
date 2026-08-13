export enum Discipline {
  ARCHITECTURE = 'Arquitetura',
  STRUCTURE = 'Estrutura/Cobertura', // Unificado — antes 'Estrutura' e 'Cobertura' eram disciplinas separadas
  FOUNDATION = 'Fundação',
  HYDRAULIC = 'Hidráulica',
  ELECTRICAL = 'Elétrica',
  DATA = 'Dados',
  SPDA = 'SPDA',
  FIRE = 'Incêndio',
  HVAC = 'Climatização',
  OTHER = 'Outros',
}

export enum ProjectPhase {
  PRELIMINARY = 'Preliminar',
  EXECUTIVE = 'Executivo',
}

export enum Status {
  IN_PROGRESS = 'Em Andamento',
  DONE = 'Execução Concluída', // Alterado de 'Concluído' para ser mais específico
  WAITING_APPROVAL = 'Aguardando Aprovação', // Novo
  APPROVED = 'Aprovado', // Novo
  REJECTED = 'Reprovado', // Novo
  REVISED = 'Revisado', // Novo: Indica que este arquivo gerou uma revisão
  SUPERSEDED = 'Executivo Gerado', // Preliminar finalizado sem envio: o executivo foi criado antes, tornando o envio desnecessário
}

export enum RevisionReason {
  INTERNAL_ERROR = 'Erro Interno',
  CLIENT_REQUEST = 'Solicitação Cliente',
  SCOPE_CHANGE = 'Mudança de Escopo',
  PROJECT_CHANGE = 'Mudança de Projeto', // Novo
  ADDENDUM = 'Aditivo', // Novo
  COMPATIBILITY = 'Compatibilização',
  OTHER = 'Outros', // Novo
}

export type DateFilterType = 'ALL' | 'MONTH' | 'QUARTER' | 'SEMESTER' | 'YEAR' | 'CUSTOM';
export type Period = 'MANHA' | 'TARDE';

// Foto do ciclo que a revisão ENCERROU (Catálogo/Carteira, onde a revisão é
// in-place no mesmo documento). Sem ela, as datas do ciclo anterior seriam
// sobrescritas sem registro — o histórico e os Indicadores perderiam a revisão.
export interface RevisionCycleSnapshot {
  revisao: number; // número da revisão encerrada (R00, R01...)
  startDate?: string;
  startPeriod?: Period;
  endDate?: string;
  endPeriod?: Period;
  sendDate?: string;
  sendPeriod?: Period;
  feedbackDate?: string;
  feedbackPeriod?: Period;
  blockedDays?: number;
}

export interface Revision {
  id: string;
  date: string;
  reason: RevisionReason;
  comment: string;
  snapshot?: RevisionCycleSnapshot; // ausente nas entradas antigas e na aba Projetos (lá cada revisão é um doc próprio)
}

export interface ProjectPause {
  id: string;
  startDate: string; // ISO Date
  startPeriod?: Period; // Novo
  endDate?: string; // ISO Date (se vazio, a pausa está em andamento)
  endPeriod?: Period; // Novo
  reason?: string; // Opcional, para descrever o motivo
}

export interface ProjectFile {
  id: string;
  groupId?: string; // NOVO: Relaciona a familia de revisões
  revision?: number; // NOVO: Número exato da revisão (0, 1, 2...)
  filename: string;
  client: string;
  base: string; // Nova coluna: Base / Setor / Bloco
  discipline: Discipline;
  phase?: ProjectPhase; // Nova coluna: Fase do Projeto
  status: Status;

  startDate: string; // ISO Date
  startPeriod?: Period; // Novo

  endDate: string; // ISO Date (Fim da Execução)
  endPeriod?: Period; // Novo

  sendDate: string; // ISO Date (Data de Envio)
  sendPeriod?: Period; // Novo

  feedbackDate: string; // ISO Date (Data de Feedback - Aprovação ou Reprovação)
  feedbackPeriod?: Period; // Novo

  blockedDays: number; // Days waiting for client
  revisions: Revision[];
  pauses?: ProjectPause[]; // Array de pausas de execução do time
  predecessorIds?: string[]; // IDs de arquivos que precisam terminar antes deste começar

  // Meta de entrega desta revisão (opcional). Sobrepõe o prazo padrão da 1ª entrega
  // (client.projectDeadlineDate); sem ela, revisões após a 1ª não são medidas por SLA.
  targetDate?: string;
}

// Interface para o Filtro Avançado
export interface ProjectFilterState {
  clients: string[];
  disciplines: Discipline[];
  isActive: boolean;
}

// --- COMPRAS (LEGADO) ---
// Módulo substituído por Suprimentos. Os tipos abaixo permanecem apenas para a
// migração one-shot da coleção `purchases` (services/db.ts: migrateLegacyPurchasesToSupply).

export enum PurchaseStatus {
  PENDING = 'Pendente', // Solicitação feita
  BOUGHT = 'Comprado', // Pedido realizado no fornecedor
  DELIVERED = 'Entregue', // Material chegou na base
  CANCELED = 'Cancelado',
}

export interface PurchaseDoc {
  id: string;
  description: string; // O que foi pedido (Resumo)
  client: string; // Para qual cliente
  base: string; // Para qual base/obra
  application: string; // Qual a aplicação (Ex: Infraestrutura elétrica)
  requester: string; // Quem pediu

  requestDate: string; // Data do pedido
  requestPeriod?: Period; // Novo

  arrivalDate: string; // Data da chegada (vazio se não chegou)
  arrivalPeriod?: Period; // Novo

  status: PurchaseStatus;
  link?: string; // Link de referência ou rastreio
  observation?: string;
}

// --- SUPRIMENTOS ---
// Módulo unificado que substitui "Listas de Materiais" + "Compras":
// um pedido (SupplyOrder) percorre o ciclo completo, do planejamento à entrega.

export enum SupplyStatus {
  PLANNING = 'Planejamento', // Lista de materiais em elaboração
  READY = 'Lista Pronta', // Lista fechada, aguardando cotação
  QUOTING = 'Em Cotação', // Cotação com fornecedores em andamento
  BOUGHT = 'Comprado', // Pedido realizado no fornecedor
  DELIVERED = 'Entregue', // Material chegou na obra/base
  CANCELED = 'Cancelado',
}

export type SupplyPriority = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';

// Item do pedido — permite marcação de entrega parcial
export interface SupplyItem {
  id: string;
  description: string;
  quantity: number;
  unit: string; // un, m, kg, cx...
  delivered: boolean;
  deliveredAt?: string; // ISO Date de quando o item chegou
  observation?: string;
}

// Evento da timeline de status (histórico completo, inclui regressões)
export interface SupplyStatusEvent {
  id: string;
  status: SupplyStatus; // status de DESTINO do movimento
  date: string; // ISO Date
  period?: Period;
  user?: string;
  comment?: string;
}

// Datas de marco por etapa (cache achatado p/ KPIs sem varrer o histórico)
export interface SupplyMilestones {
  readyAt?: string;
  readyPeriod?: Period;
  quotingAt?: string;
  quotingPeriod?: Period;
  boughtAt?: string;
  boughtPeriod?: Period;
  deliveredAt?: string;
  deliveredPeriod?: Period;
  canceledAt?: string;
}

export interface SupplyOrder {
  id: string;
  title: string; // Nome do pedido/lista (ex: "Infra elétrica Bloco B")
  client: string; // Obra — nome denormalizado, igual às demais coleções
  base: string;
  application?: string; // Aplicação (ex: Infraestrutura de rede)
  discipline?: Discipline; // Opcional — habilita o filtro global de disciplinas
  requester: string;
  priority: SupplyPriority;
  status: SupplyStatus;
  items: SupplyItem[];

  createdAt: string; // ISO Date (início do Planejamento)
  createdPeriod?: Period;
  neededBy?: string; // Data-limite desejada — base do alerta de atraso

  milestones: SupplyMilestones;
  statusHistory: SupplyStatusEvent[];

  link?: string;
  observation?: string;

  // Rastreio da migração one-shot do módulo antigo de Compras (idempotência)
  legacy?: { source: 'purchases'; originalId: string };
}

// --- CLIENTES / OBRAS ---

export enum SiteType {
  CONSTRUCTION_SITE = 'Canteiro de Obras',
  OPERATIONAL_BASE = 'Bases Operacionais',
  // Contrato de rodovia: obras iguais replicadas ao longo do traçado (KM).
  // Usa o fluxo Catálogo/Carteira (Referência → Conjunto → Prancha) em vez
  // do fluxo de arquivos da aba Projetos.
  HIGHWAY = 'Obra de Rodovia',
}

export enum ObraStatus {
  ACTIVE = 'Em andamento',
  PAUSED = 'Pausada',
  COMPLETED = 'Concluída',
  CANCELLED = 'Cancelada',
}

export interface ClientDoc {
  id: string;
  name: string;
  location: string;
  type: SiteType;
  numberOfBases?: number;
  // Obras de rodovia: bases (KM/trecho) NOMEADAS, registradas aqui e usadas como
  // fonte única de seleção na instanciação do Catálogo — evita grafias divergentes
  // da mesma base ("KM 104" vs "104+000"). Para HIGHWAY, numberOfBases = bases.length.
  bases?: string[];

  // Cronograma da Obra
  obraStartDate?: string; // Início da Obra
  expectedCompletionDate?: string; // Fim da Obra (rótulo na UI; propriedade mantida p/ não migrar dado)
  projectDeadlineDate?: string; // Data Estipulada para Finalizar os Projetos — dirige o SLA/OTD

  // Data em que o PACOTE DE PROJETOS foi efetivamente entregue (cumprimento do prazo
  // contratual) — independe do status físico da obra (Canteiro pode seguir ACTIVE com os
  // projetos já entregues). Quando preenchida, o SLA fica "resolvido": deixa de crescer
  // contra o dia de hoje e vira um veredito fixo (no prazo/atrasado em N dias) na data
  // marcada; entregáveis (Canteiro, Catálogo, Carteira) ainda em aberto DEPOIS dela deixam
  // de contar como atraso de SLA — o que roda depois é fluxo de revisão, não descumprimento
  // de prazo. Ver utils.ts `isProjectsSlaClosed`.
  projectsDeliveredAt?: string;

  // SLA antigo (legado) — mantido só para exibição somente-leitura; não editável, não usado em cálculo.
  // Media o prazo da OBRA INTEIRA (contrato + N dias corridos), por isso o OTD nunca refletia atraso real.
  contractDate?: string;
  deadlineDays?: number;

  // Ciclo de Vida da Obra
  obraStatus?: ObraStatus;
  completedAt?: string; // ISO Date — suprime alertas SLA quando COMPLETED ou CANCELLED
  responsavel?: string;
  observacoes?: string;
}

export interface KPISummary {
  totalFiles: number;
  avgExecutionTime: number;
  totalBlockedDays: number;
  revisionRate: number;
}

// Entrada da Lixeira: cópia de segurança gravada ANTES de qualquer exclusão no
// app (todas as abas). `data` é o documento original intacto; restaurar =
// recriar o doc em `coll/docId` e remover a entrada. `opId` agrupa exclusões
// feitas numa mesma ação (ex.: conjunto + suas pranchas, lote de referências).
export interface TrashEntry {
  id: string;
  coll: string;
  docId: string;
  data: Record<string, any>;
  label: string; // nome legível do que foi excluído (filename/name/título)
  client: string; // obra, quando o doc tem esse vínculo
  deletedAt: string; // ISO datetime
  deletedBy: string; // e-mail de quem excluiu
  opId: string;
}
