// TypeScript Types for Biddings & Commitments system

export type LicitacaoStatus = 'em_andamento' | 'ganha' | 'perdida' | 'cancelada' | 'parcial';

export type ItemStatus = 'ganho' | 'perdido' | 'cancelado' | 'desclassificado' | 'pendente';

export type EmpenhoStatus = 'ativo' | 'entregue' | 'parcial' | 'cancelado' | 'pago';

export interface LicitacaoItem {
  id: string;
  licitacao_id: string;
  numero_item: number;
  descricao: string;
  marca: string | null;
  unidade: string;
  quantidade: number;
  preco_minimo?: number | null;
  valor_unitario: number;
  valor_total: number; // calculated: quantidade * valor_unitario
  codigo_produto?: string | null;
  status: ItemStatus;
  observacoes: string | null;
}

export interface ProductCatalogItem {
  codigo_produto: string;
  descricao: string;
  marca: string | null;
  unidade: string;
  valor_unitario: number;
  updated_at: string;
}

export interface LicitacaoAttachment {
  name: string;
  uploaded_at: string; // ISO
  contentBase64?: string | null;
  mime?: string | null;
}

export interface Licitacao {
  id: string;
  ano: number;
  orgao: string;
  codigo_cliente?: string | null;
  carteira_regiao?: string | null;
  cidade?: string | null;
  estado?: string | null;
  orgao_email?: string | null;
  orgao_telefone?: string | null;
  orgao_contato?: string | null;
  numero_pregao: string;
  numero_processo: string | null;
  modalidade: string | null;
  data_abertura: string | null; // YYYY-MM-DD
  data_vencimento?: string | null; // YYYY-MM-DD
  status: LicitacaoStatus;
  valor_total_ganho: number;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  itens?: LicitacaoItem[];
  edital?: LicitacaoAttachment | null;
  ata?: LicitacaoAttachment | null;
}

export interface EmpenhoItem {
  id: string;
  empenho_id: string;
  licitacao_item_id: string;
  quantidade_empenhada: number;
  valor_unitario: number;
  valor_total: number; // calculated: quantidade_empenhada * valor_unitario
}

export interface Empenho {
  id: string;
  licitacao_id: string;
  numero_empenho: string;
  data_empenho: string; // YYYY-MM-DD
  orgao: string | null;
  valor_empenho: number;
  status: EmpenhoStatus;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  itens?: EmpenhoItem[];
}

export type AccountRole = 'admin' | 'viewer';

export interface AppSession {
  username: string;
  role: AccountRole;
  accountId?: string | null;
  displayName?: string | null;
  company?: string | null;
  expiresAt: number;
}

export interface AppAccount {
  id: string;
  username: string;
  role: AccountRole;
  display_name: string | null;
  company: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export type CommercialContactOutcome =
  | 'contato_realizado'
  | 'interessado'
  | 'sem_resposta'
  | 'retornar'
  | 'sem_interesse';

export interface CommercialContact {
  id: string;
  client_key: string;
  licitacao_id: string;
  contacted_at: string;
  outcome: CommercialContactOutcome;
  notes: string | null;
  next_contact_at: string | null;
  created_by: string;
  created_at: string;
}

export type CommercialPipelineStage =
  | 'identificado'
  | 'contato'
  | 'interessado'
  | 'proposta'
  | 'negociacao'
  | 'recuperado'
  | 'perdido';

export interface CommercialOpportunity {
  id: string;
  client_key: string;
  licitacao_id: string;
  title: string;
  stage: CommercialPipelineStage;
  estimated_value: number;
  probability: number;
  owner: string | null;
  expected_close_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type CommercialTaskStatus = 'pendente' | 'concluida' | 'cancelada';
export type CommercialTaskType = 'ligacao' | 'whatsapp' | 'email' | 'reuniao' | 'proposta' | 'outro';

export interface CommercialTask {
  id: string;
  client_key: string;
  licitacao_id: string;
  title: string;
  type: CommercialTaskType;
  due_at: string;
  status: CommercialTaskStatus;
  owner: string | null;
  notes: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AuditEvent {
  id: string;
  actor_username: string;
  actor_role: AccountRole;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// High-level filter configuration
export interface DashboardFilters {
  ano?: number | 'todos';
  orgao?: string | 'todos';
  status?: LicitacaoStatus | 'todos';
  produto?: string;
  comSaldo?: boolean;
}
