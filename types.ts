
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
  REVISED = 'Revisado' // Novo: Indica que este arquivo gerou uma revisão
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
  endDate?: string; // ISO Date (se vazio, a pausa está em andamento)
  reason?: string; // Opcional, para descrever o motivo
}

export interface ProjectFile {
  id: string;
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
}

// Interface para o Filtro Avançado
export interface ProjectFilterState {
    clients: string[];
    disciplines: Discipline[];
    isActive: boolean;
}

export type MaterialStatus = 'IN_PROGRESS' | 'DONE' | 'REVISED';

export interface MaterialDoc {
  id: string;
  client: string;
  filename: string;
  base: string; // Nova coluna adicionada
  discipline: Discipline;
  
  startDate: string;
  startPeriod?: Period; // Novo

  endDate: string;
  endPeriod?: Period; // Novo
  
  status: MaterialStatus;
  revisions: { id: string; date: string; reason: string; comment: string }[];
}

// --- COMPRAS ---

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

// --- CLIENTES / OBRAS ---

export enum SiteType {
  CONSTRUCTION_SITE = 'Canteiro de Obras',
  OPERATIONAL_BASE = 'Bases Operacionais'
}

export interface ClientDoc {
  id: string;
  name: string; // Nome do Cliente
  location: string; // Local da Obra
  type: SiteType;
  numberOfBases?: number; // Apenas se type for OPERATIONAL_BASE

  // SLA Padrão da Obra
  contractDate?: string; // Data de Assinatura do Contrato para esta obra
  deadlineDays?: number; // Dias corridos previstos para execução
}

export interface KPISummary {
  totalFiles: number;
  avgExecutionTime: number;
  totalBlockedDays: number;
  revisionRate: number;
}
