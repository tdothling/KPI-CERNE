
export enum Discipline {
  ARCHITECTURE = 'Arquitetura',
  STRUCTURE = 'Estrutura',
  FOUNDATION = 'Fundação',
  HYDRAULIC = 'Hidráulica',
  ELECTRICAL = 'Elétrica',
  DATA = 'Dados',
  SPDA = 'SPDA',
  HVAC = 'Climatização',
  OTHER = 'Outros'
}

export enum ProjectPhase {
  PRELIMINARY = 'Preliminar',
  EXECUTIVE = 'Executivo'
}

export enum Status {
  IN_PROGRESS = 'Em Andamento',
  DONE = 'Execução Concluída', // Alterado de 'Concluído' para ser mais específico
  WAITING_APPROVAL = 'Aguardando Aprovação', // Novo
  APPROVED = 'Aprovado', // Novo
  REJECTED = 'Reprovado', // Novo
  REVISED = 'Revisado', // Novo: Indica que este arquivo gerou uma revisão
  SUPERSEDED = 'Executivo Gerado' // Preliminar finalizado sem envio: o executivo foi criado antes, tornando o envio desnecessário
}

export enum RevisionReason {
  INTERNAL_ERROR = 'Erro Interno',
  CLIENT_REQUEST = 'Solicitação Cliente',
  SCOPE_CHANGE = 'Mudança de Escopo',
  PROJECT_CHANGE = 'Mudança de Projeto', // Novo
  ADDENDUM = 'Aditivo', // Novo
  COMPATIBILITY = 'Compatibilização',
  OTHER = 'Outros' // Novo
}

export type DateFilterType = 'ALL' | 'MONTH' | 'QUARTER' | 'SEMESTER' | 'YEAR' | 'CUSTOM';
export type Period = 'MANHA' | 'TARDE';

export interface Revision {
  id: string;
  date: string;
  reason: RevisionReason;
  comment: string;
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
  CANCELED = 'Cancelado'
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
  PLANNING = 'Planejamento',    // Lista de materiais em elaboração
  READY = 'Lista Pronta',       // Lista fechada, aguardando cotação
  QUOTING = 'Em Cotação',       // Cotação com fornecedores em andamento
  BOUGHT = 'Comprado',          // Pedido realizado no fornecedor
  DELIVERED = 'Entregue',       // Material chegou na obra/base
  CANCELED = 'Cancelado'
}

export type SupplyPriority = 'BAIXA' | 'NORMAL' | 'ALTA' | 'URGENTE';

// Item do pedido — permite marcação de entrega parcial
export interface SupplyItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;               // un, m, kg, cx...
  delivered: boolean;
  deliveredAt?: string;       // ISO Date de quando o item chegou
  observation?: string;
}

// Evento da timeline de status (histórico completo, inclui regressões)
export interface SupplyStatusEvent {
  id: string;
  status: SupplyStatus;       // status de DESTINO do movimento
  date: string;               // ISO Date
  period?: Period;
  user?: string;
  comment?: string;
}

// Datas de marco por etapa (cache achatado p/ KPIs sem varrer o histórico)
export interface SupplyMilestones {
  readyAt?: string;     readyPeriod?: Period;
  quotingAt?: string;   quotingPeriod?: Period;
  boughtAt?: string;    boughtPeriod?: Period;
  deliveredAt?: string; deliveredPeriod?: Period;
  canceledAt?: string;
}

export interface SupplyOrder {
  id: string;
  title: string;              // Nome do pedido/lista (ex: "Infra elétrica Bloco B")
  client: string;             // Obra — nome denormalizado, igual às demais coleções
  base: string;
  application?: string;       // Aplicação (ex: Infraestrutura de rede)
  discipline?: Discipline;    // Opcional — habilita o filtro global de disciplinas
  requester: string;
  priority: SupplyPriority;
  status: SupplyStatus;
  items: SupplyItem[];

  createdAt: string;          // ISO Date (início do Planejamento)
  createdPeriod?: Period;
  neededBy?: string;          // Data-limite desejada — base do alerta de atraso

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
  HIGHWAY = 'Obra de Rodovia'
}

export enum ObraStatus {
  ACTIVE = 'Em andamento',
  PAUSED = 'Pausada',
  COMPLETED = 'Concluída',
  CANCELLED = 'Cancelada'
}

export interface ClientDoc {
  id: string;
  name: string;
  location: string;
  type: SiteType;
  numberOfBases?: number;

  // SLA Padrão da Obra
  contractDate?: string;
  deadlineDays?: number;

  // Ciclo de Vida da Obra
  obraStatus?: ObraStatus;
  completedAt?: string; // ISO Date — suprime alertas SLA quando COMPLETED ou CANCELLED
  expectedCompletionDate?: string; // Prazo previsto de conclusão (campo editorial, independente do SLA)
  responsavel?: string;
  observacoes?: string;
}

export interface KPISummary {
  totalFiles: number;
  avgExecutionTime: number;
  totalBlockedDays: number;
  revisionRate: number;
}
