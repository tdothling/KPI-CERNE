
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

export interface Revision {
  id: string;
  date: string;
  reason: RevisionReason;
  comment: string;
}

export interface ProjectFile {
  id: string;
  filename: string;
  client: string;
  base: string; // Nova coluna: Base / Setor / Bloco
  discipline: Discipline;
  status: Status;
  startDate: string; // ISO Date
  endDate: string; // ISO Date (Fim da Execução)
  sendDate: string; // ISO Date (Data de Envio)
  feedbackDate: string; // ISO Date (Data de Feedback - Aprovação ou Reprovação)
  blockedDays: number; // Days waiting for client
  revisions: Revision[];
}

export type MaterialStatus = 'IN_PROGRESS' | 'DONE' | 'REVISED';

export interface MaterialDoc {
  id: string;
  client: string;
  filename: string;
  base: string; // Nova coluna adicionada
  discipline: Discipline;
  startDate: string;
  endDate: string;
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
  arrivalDate: string; // Data da chegada (vazio se não chegou)
  status: PurchaseStatus;
  link?: string; // Link de referência ou rastreio
  observation?: string;
}

export interface KPISummary {
  totalFiles: number;
  avgExecutionTime: number;
  totalBlockedDays: number;
  revisionRate: number;
}
