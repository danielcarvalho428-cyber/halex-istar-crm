import { Licitacao, LicitacaoItem, Empenho, EmpenhoItem, ConnectionMode, ProductCatalogItem, LicitacaoAttachment, CommercialContact, CommercialContactOutcome, CommercialOpportunity, CommercialPipelineStage, CommercialTask, CommercialTaskStatus, CommercialTaskType, AuditEvent } from '../types';
import type { BulkEmpenhoImportEntry, BulkEmpenhoImportResult } from './halex-bulk-empenho';
import * as storage from './storage';

export const isSupabaseConfigured = true;

export type AppDataBundle = {
  licitacoes: Licitacao[];
  itens: LicitacaoItem[];
  empenhos: Empenho[];
  empenhoItens: EmpenhoItem[];
};

async function sharedDataRequest<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ action, payload }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('A operação demorou mais que o esperado. Tente novamente.');
    }
    throw error;
  }

  const result = await response.json().catch(() => null) as { ok?: boolean; data?: T; message?: string } | null;
  if (!response.ok || !result?.ok) {
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.assign('/login');
    }
    throw new Error(result?.message || 'Erro ao acessar dados compartilhados.');
  }

  return result.data as T;
}

// Simple in-memory cache to avoid repeated JSON.parse on localStorage
const cache: {
  licitacoes: Licitacao[] | null;
  itens: LicitacaoItem[] | null;
  empenhos: Empenho[] | null;
  empenhoItens: EmpenhoItem[] | null;
  productCatalog: ProductCatalogItem[] | null;
} = {
  licitacoes: null,
  itens: null,
  empenhos: null,
  empenhoItens: null,
  productCatalog: null,
};

async function readLocalItems(): Promise<LicitacaoItem[]> {
  if (cache.itens) return cache.itens;
  seedMockDataIfEmpty();
  // Try migrating existing localStorage into IndexedDB (non-blocking)
  storage.migrateFromLocalStorage(KEYS).catch(() => {});
  const v = await storage.getAllItens();
  cache.itens = v;
  return v;
}

// Helpers for localStorage database keys
const KEYS = {
  LICITACOES: 'licitacoes_db_data',
  ITENS: 'licitacoes_db_itens',
  EMPENHOS: 'licitacoes_db_empenhos',
  EMPENHO_ITENS: 'licitacoes_db_empenho_itens',
};

// Generate standard UUID-like strings in mock client
function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'mock-uuid-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Check if localStorage has database seeded, if not, write mock data
export function seedMockDataIfEmpty() {
  if (typeof window === 'undefined') return;

  const existingLicitacoes = localStorage.getItem(KEYS.LICITACOES);
  if (existingLicitacoes) return; // Already initialized

  // Seed mock data
  const licitacao1Id = generateUUID();
  const licitacao2Id = generateUUID();
  
  const item1Id = generateUUID();
  const item2Id = generateUUID();
  const item3Id = generateUUID();
  const item4Id = generateUUID();
  
  const item5Id = generateUUID();

  const mockLicitacoes: Licitacao[] = [
    {
      id: licitacao1Id,
      ano: 2025,
      orgao: 'Prefeitura Municipal de Campinas',
      codigo_cliente: 'PMC-001',
      carteira_regiao: '4104',
      cidade: 'Campinas',
      estado: 'SP',
      orgao_email: 'compras@campinas.sp.gov.br',
      orgao_telefone: '(19) 0000-0000',
      orgao_contato: 'Setor de Compras',
      numero_pregao: '45/2025',
      numero_processo: '123/2025',
      modalidade: 'Pregão Eletrônico',
      data_abertura: '2025-05-10',
      data_vencimento: '2026-05-10',
      status: 'parcial',
      valor_total_ganho: 69000.00, // item1 + item2 + item4 ganho
      observacoes: 'Registro de preço para medicamentos e insumos hospitalares. Ata válida até maio/2026.',
      created_at: new Date('2025-05-10T10:00:00Z').toISOString(),
      updated_at: new Date('2025-05-10T10:00:00Z').toISOString(),
    },
    {
      id: licitacao2Id,
      ano: 2026,
      orgao: 'Hospital das Clínicas da UNICAMP',
      codigo_cliente: 'HC-UNICAMP',
      carteira_regiao: '4648',
      cidade: 'Campinas',
      estado: 'SP',
      orgao_email: 'licitacoes@hc.unicamp.br',
      orgao_telefone: '(19) 0000-0000',
      orgao_contato: 'Compras HC',
      numero_pregao: '12/2026',
      numero_processo: '554/2026',
      modalidade: 'Pregão Eletrônico',
      data_abertura: '2026-06-15',
      data_vencimento: '2027-06-15',
      status: 'em_andamento',
      valor_total_ganho: 0.00,
      observacoes: 'Aguardando abertura de propostas para cateteres e curativos.',
      created_at: new Date('2026-06-01T14:30:00Z').toISOString(),
      updated_at: new Date('2026-06-01T14:30:00Z').toISOString(),
    }
  ];

  const mockItens: LicitacaoItem[] = [
    // Licitacao 1 items
    {
      id: item1Id,
      licitacao_id: licitacao1Id,
      numero_item: 1,
      descricao: 'Soro Fisiológico 0,9% 500ml (Injetável)',
      marca: 'Eurofarma',
      unidade: 'Frasco',
      quantidade: 10000,
      valor_unitario: 4.50,
      valor_total: 45000.00,
      status: 'ganho',
      observacoes: 'Item homologado sem restrições.',
    },
    {
      id: item2Id,
      licitacao_id: licitacao1Id,
      numero_item: 2,
      descricao: 'Soro Glicosado 5% 500ml (Injetável)',
      marca: 'B. Braun',
      unidade: 'Frasco',
      quantidade: 5000,
      valor_unitario: 4.80,
      valor_total: 24000.00,
      status: 'ganho',
      observacoes: 'Item homologado.',
    },
    {
      id: item3Id,
      licitacao_id: licitacao1Id,
      numero_item: 3,
      descricao: 'Seringa Descartável 10ml c/ agulha 25x7',
      marca: 'Descarpack',
      unidade: 'Unidade',
      quantidade: 20000,
      valor_unitario: 0.35,
      valor_total: 7000.00,
      status: 'perdido',
      observacoes: 'Perdemos pelo preço. Concorrente fechou a R$ 0,32.',
    },
    // Licitacao 2 items
    {
      id: item4Id,
      licitacao_id: licitacao2Id,
      numero_item: 1,
      descricao: 'Cateter Venoso Periférico Nº 20G',
      marca: null,
      unidade: 'Unidade',
      quantidade: 3000,
      valor_unitario: 2.20,
      valor_total: 6600.00,
      status: 'pendente',
      observacoes: null,
    },
    {
      id: item5Id,
      licitacao_id: licitacao2Id,
      numero_item: 2,
      descricao: 'Esparadrapo Impermeável 10cm x 4,5m',
      marca: null,
      unidade: 'Rolo',
      quantidade: 1500,
      valor_unitario: 8.50,
      valor_total: 12750.00,
      status: 'pendente',
      observacoes: null,
    }
  ];

  // Empenhos for Licitação 1
  const empenho1Id = generateUUID();
  const empenho2Id = generateUUID();

  const mockEmpenhos: Empenho[] = [
    {
      id: empenho1Id,
      licitacao_id: licitacao1Id,
      numero_empenho: '2025NE00845',
      data_empenho: '2025-06-15',
      orgao: 'Prefeitura Municipal de Campinas',
      valor_empenho: 14700.00, // 3000 * 4.50 (item 1) + 250 * 4.80 (item 2)
      status: 'ativo',
      observacoes: 'Primeira remessa de soros para o almoxarifado central.',
      created_at: new Date('2025-06-15T09:00:00Z').toISOString(),
      updated_at: new Date('2025-06-15T09:00:00Z').toISOString(),
    },
    {
      id: empenho2Id,
      licitacao_id: licitacao1Id,
      numero_empenho: '2025NE01042',
      data_empenho: '2025-09-02',
      orgao: 'Prefeitura Municipal de Campinas',
      valor_empenho: 9000.00, // 2000 * 4.50 (item 1)
      status: 'entregue',
      observacoes: 'Segunda entrega de Soro Fisiológico.',
      created_at: new Date('2025-09-02T11:00:00Z').toISOString(),
      updated_at: new Date('2025-09-02T11:00:00Z').toISOString(),
    }
  ];

  const mockEmpenhoItens: EmpenhoItem[] = [
    // Empenho 1 details
    {
      id: generateUUID(),
      empenho_id: empenho1Id,
      licitacao_item_id: item1Id, // Soro Fisiológico (4.50)
      quantidade_empenhada: 3000,
      valor_unitario: 4.50,
      valor_total: 13500.00
    },
    {
      id: generateUUID(),
      empenho_id: empenho1Id,
      licitacao_item_id: item2Id, // Soro Glicosado (4.80)
      quantidade_empenhada: 250,
      valor_unitario: 4.80,
      valor_total: 1200.00
    },
    // Empenho 2 details
    {
      id: generateUUID(),
      empenho_id: empenho2Id,
      licitacao_item_id: item1Id, // Soro Fisiológico (4.50)
      quantidade_empenhada: 2000,
      valor_unitario: 4.50,
      valor_total: 9000.00
    }
  ];

  localStorage.setItem(KEYS.LICITACOES, JSON.stringify(mockLicitacoes));
  localStorage.setItem(KEYS.ITENS, JSON.stringify(mockItens));
  localStorage.setItem(KEYS.EMPENHOS, JSON.stringify(mockEmpenhos));
  localStorage.setItem(KEYS.EMPENHO_ITENS, JSON.stringify(mockEmpenhoItens));
}

// ----------------------------------------------------
// DATABASE API INTERFACE
// ----------------------------------------------------

export const db = {
  getConnectionMode(): ConnectionMode {
    return isSupabaseConfigured ? 'supabase' : 'local_storage';
  },

  async getAppData(): Promise<AppDataBundle> {
    if (typeof window !== 'undefined' && window.halexDesktop) {
      seedMockDataIfEmpty();
      await storage.migrateFromLocalStorage(KEYS).catch(() => {});
      const [licitacoes, itens, empenhos, empenhoItens] = await Promise.all([
        storage.getAllLicitacoes(),
        storage.getAllItens(),
        storage.getAllEmpenhos(),
        storage.getAllEmpenhoItens(),
      ]);
      return { licitacoes, itens, empenhos, empenhoItens };
    }

    if (isSupabaseConfigured) {
      return sharedDataRequest<AppDataBundle>('getAppData');
    }

    const [licitacoes, itens, empenhos, empenhoItens] = await Promise.all([
      this.getLicitacoes(),
      this.getAllItens(),
      this.getEmpenhos(),
      this.getAllEmpenhoItens(),
    ]);
    return { licitacoes, itens, empenhos, empenhoItens };
  },

  // LICITAÇÕES APIs
  async getLicitacoes(): Promise<Licitacao[]> {
    if (isSupabaseConfigured) {
      return sharedDataRequest<Licitacao[]>('getLicitacoes');
    }

    seedMockDataIfEmpty();
    if (cache.licitacoes) return cache.licitacoes;
    // Attempt migration and read from IndexedDB-backed storage
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const list = await storage.getAllLicitacoes();
    cache.licitacoes = list;
    return list;
  },

  async getLicitacao(id: string): Promise<Licitacao | null> {
    if (isSupabaseConfigured) {
      return sharedDataRequest<Licitacao | null>('getLicitacao', { id });
    }

    seedMockDataIfEmpty();
    // Ensure data migrated and read from IndexedDB-backed storage
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const list: Licitacao[] = await storage.getAllLicitacoes();
    const lic = list.find(l => l.id === id);
    if (!lic) return null;

    const allItens: LicitacaoItem[] = await storage.getAllItens();
    const itens = allItens
      .filter(i => i.licitacao_id === id)
      .sort((a, b) => a.numero_item - b.numero_item);

    return {
      ...lic,
      itens
    };
  },

  async getAllItens(): Promise<LicitacaoItem[]> {
    if (isSupabaseConfigured) {
      return sharedDataRequest<LicitacaoItem[]>('getAllItens');
    }

    return readLocalItems();
  },

  async saveLicitacao(licitacao: Omit<Licitacao, 'created_at' | 'updated_at'>, items: Omit<LicitacaoItem, 'id' | 'licitacao_id' | 'valor_total'>[]): Promise<Licitacao> {
    const isNew = !licitacao.id || licitacao.id === '';
    const licId = isNew ? generateUUID() : licitacao.id;
    const now = new Date().toISOString();

    const fullLicitacao: Licitacao = {
      ...licitacao,
      id: licId,
      created_at: isNew ? now : (licitacao as Partial<Licitacao>).created_at || now,
      updated_at: now
    };

    // Calculate won total: sum of items where status is 'ganho'
    const wonTotal = items
      .filter(item => item.status === 'ganho')
      .reduce((sum, item) => sum + (item.quantidade * item.valor_unitario), 0);
    
    fullLicitacao.valor_total_ganho = wonTotal;

    const fullItems: LicitacaoItem[] = items.map((item, idx) => ({
      ...item,
      id: (item as Partial<LicitacaoItem>).id || generateUUID(),
      licitacao_id: licId,
      numero_item: item.numero_item || (idx + 1),
      valor_total: item.quantidade * item.valor_unitario
    }));

    if (isSupabaseConfigured) {
      return sharedDataRequest<Licitacao>('saveLicitacao', { licitacao, items });
    }

    // Local Storage (IndexedDB) logic
    seedMockDataIfEmpty();
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const lList: Licitacao[] = await storage.getAllLicitacoes();
    const iList: LicitacaoItem[] = await storage.getAllItens();

    if (isNew) {
      lList.push(fullLicitacao);
    } else {
      const idx = lList.findIndex(l => l.id === licId);
      if (idx !== -1) {
        lList[idx] = fullLicitacao;
      } else {
        lList.push(fullLicitacao);
      }
    }

    // Filter out old items for this licitacao and add new ones
    const filteredItens = iList.filter(item => item.licitacao_id !== licId);
    filteredItens.push(...fullItems);

    await storage.setAllLicitacoes(lList);
    await storage.setAllItens(filteredItens);
    // Invalidate cache
    cache.licitacoes = null;
    cache.itens = null;

    return { ...fullLicitacao, itens: fullItems };
  },

  async deleteLicitacao(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      await sharedDataRequest<void>('deleteLicitacao', { id });
      return;
    }

    seedMockDataIfEmpty();
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const lList: Licitacao[] = await storage.getAllLicitacoes();
    const iList: LicitacaoItem[] = await storage.getAllItens();
    const eList: Empenho[] = await storage.getAllEmpenhos();
    const eiList: EmpenhoItem[] = await storage.getAllEmpenhoItens();

    // Cascade delete in localStorage
    const newLList = lList.filter(l => l.id !== id);
    const newIList = iList.filter(i => i.licitacao_id !== id);
    
    // Find empenhos linked to this licitacao and delete their sub-items
    const empenhosToDelete = eList.filter(e => e.licitacao_id === id).map(e => e.id);
    const newEList = eList.filter(e => e.licitacao_id !== id);
    const newEiList = eiList.filter(ei => !empenhosToDelete.includes(ei.empenho_id));

    await storage.setAllLicitacoes(newLList);
    await storage.setAllItens(newIList);
    await storage.setAllEmpenhos(newEList);
    await storage.setAllEmpenhoItens(newEiList);
    // Invalidate cache
    cache.licitacoes = null;
    cache.itens = null;
    cache.empenhos = null;
    cache.empenhoItens = null;
  },

  async duplicateLicitacao(id: string): Promise<Licitacao> {
    const original = await this.getLicitacao(id);
    if (!original) throw new Error('Licitação não encontrada');

    const newLicId = generateUUID();
    const now = new Date().toISOString();

    const duplicatedLicitacao: Licitacao = {
      ...original,
      id: newLicId,
      numero_pregao: `${original.numero_pregao} (Cópia)`,
      status: 'em_andamento',
      created_at: now,
      updated_at: now
    };

    const duplicatedItems: LicitacaoItem[] = (original.itens || []).map(item => ({
      ...item,
      id: generateUUID(),
      licitacao_id: newLicId
    }));

    if (isSupabaseConfigured) {
      return sharedDataRequest<Licitacao>('duplicateLicitacao', { id });
    }

    // Local Storage (IndexedDB) logic
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const lList: Licitacao[] = await storage.getAllLicitacoes();
    const iList: LicitacaoItem[] = await storage.getAllItens();

    lList.push(duplicatedLicitacao);
    iList.push(...duplicatedItems);

    await storage.setAllLicitacoes(lList);
    await storage.setAllItens(iList);
    // Invalidate cache
    cache.licitacoes = null;
    cache.itens = null;

    return {
      ...duplicatedLicitacao,
      itens: duplicatedItems
    };
  },

  // Attach an edital (file) to a licitacao. `contentBase64` is optional to avoid storing large blobs.
  async attachEdital(licitacaoId: string, edital: LicitacaoAttachment): Promise<void> {
    if (isSupabaseConfigured) {
      await sharedDataRequest<void>('attachEdital', { licitacaoId, edital });
      return;
    }

    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const lList = await storage.getAllLicitacoes();
    const idx = lList.findIndex(l => l.id === licitacaoId);
    if (idx === -1) throw new Error('Licitacao not found');
    lList[idx] = { ...lList[idx], edital };
    await storage.setAllLicitacoes(lList);
    cache.licitacoes = null;
  },

  async getEdital(licitacaoId: string) {
    if (isSupabaseConfigured) return sharedDataRequest<LicitacaoAttachment | null>('getEdital', { licitacaoId });
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const lList = await storage.getAllLicitacoes();
    const lic = lList.find(l => l.id === licitacaoId);
    return lic?.edital || null;
  },

  async attachAta(licitacaoId: string, ata: LicitacaoAttachment): Promise<void> {
    if (isSupabaseConfigured) {
      await sharedDataRequest<void>('attachAta', { licitacaoId, ata });
      return;
    }

    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const lList = await storage.getAllLicitacoes();
    const idx = lList.findIndex(l => l.id === licitacaoId);
    if (idx === -1) throw new Error('Licitacao not found');
    lList[idx] = { ...lList[idx], ata };
    await storage.setAllLicitacoes(lList);
    cache.licitacoes = null;
  },

  async getAta(licitacaoId: string) {
    if (isSupabaseConfigured) return sharedDataRequest<LicitacaoAttachment | null>('getAta', { licitacaoId });
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const lList = await storage.getAllLicitacoes();
    const lic = lList.find(l => l.id === licitacaoId);
    return lic?.ata || null;
  },

  async exportBackup() {
    if (isSupabaseConfigured) {
      return sharedDataRequest('exportBackup');
    }
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    return storage.getBackupData();
  },

  async importBackup(payload: { licitacoes: Licitacao[]; itens: LicitacaoItem[]; empenhos: Empenho[]; empenhoItens: EmpenhoItem[]; productCatalog?: ProductCatalogItem[]; commercialContacts?: CommercialContact[]; commercialOpportunities?: CommercialOpportunity[]; commercialTasks?: CommercialTask[]; auditEvents?: AuditEvent[] }) {
    if (isSupabaseConfigured) {
      await sharedDataRequest<void>('importBackup', { data: payload, confirmReplace: true });
      return;
    }
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    await storage.restoreBackupData(payload);
    cache.licitacoes = null;
    cache.itens = null;
    cache.empenhos = null;
    cache.empenhoItens = null;
    cache.productCatalog = null;
  },

  async getProductCatalog(): Promise<ProductCatalogItem[]> {
    if (isSupabaseConfigured) {
      return sharedDataRequest<ProductCatalogItem[]>('getProductCatalog');
    }

    if (cache.productCatalog) return cache.productCatalog;
    const items = await storage.getAllProductCatalogItems();
    cache.productCatalog = items;
    return items;
  },

  async saveProductCatalog(items: ProductCatalogItem[]): Promise<void> {
    if (isSupabaseConfigured) {
      await sharedDataRequest<void>('saveProductCatalog', { items });
      return;
    }

    await storage.setAllProductCatalogItems(items);
    cache.productCatalog = null;
  },

  async getAuditEvents(options: { limit?: number; actionPrefix?: string } = {}): Promise<AuditEvent[]> {
    if (isSupabaseConfigured) {
      return sharedDataRequest<AuditEvent[]>('getAuditEvents', options);
    }

    return [];
  },

  // EMPENHOS APIs
  async getEmpenhos(licitacaoId?: string): Promise<Empenho[]> {
    if (isSupabaseConfigured) {
      return sharedDataRequest<Empenho[]>('getEmpenhos', { licitacaoId });
    }

    seedMockDataIfEmpty();
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const list: Empenho[] = await storage.getAllEmpenhos();
    if (licitacaoId) {
      return list.filter(e => e.licitacao_id === licitacaoId).sort((a, b) => b.data_empenho.localeCompare(a.data_empenho));
    }
    return list.sort((a, b) => b.data_empenho.localeCompare(a.data_empenho));
  },

  async getEmpenho(id: string): Promise<Empenho | null> {
    if (isSupabaseConfigured) {
      return sharedDataRequest<Empenho | null>('getEmpenho', { id });
    }

    seedMockDataIfEmpty();
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const list: Empenho[] = await storage.getAllEmpenhos();
    const emp = list.find(e => e.id === id);
    if (!emp) return null;

    const allItens: EmpenhoItem[] = await storage.getAllEmpenhoItens();
    const itens = allItens.filter(i => i.empenho_id === id);

    return {
      ...emp,
      itens
    };
  },

  async saveEmpenho(empenho: Omit<Empenho, 'created_at' | 'updated_at'>, items: Omit<EmpenhoItem, 'id' | 'empenho_id' | 'valor_total'>[]): Promise<Empenho> {
    const isNew = !empenho.id || empenho.id === '';
    const empId = isNew ? generateUUID() : empenho.id;
    const now = new Date().toISOString();

    // Calculate total value of commitment based on item quantities and prices
    const totalVal = items.reduce((sum, item) => sum + (item.quantidade_empenhada * item.valor_unitario), 0);

    const fullEmpenho: Empenho = {
      ...empenho,
      id: empId,
      valor_empenho: totalVal,
      created_at: isNew ? now : (empenho as Partial<Empenho>).created_at || now,
      updated_at: now
    };

    const fullItems: EmpenhoItem[] = items.map(item => ({
      ...item,
      id: (item as Partial<EmpenhoItem>).id || generateUUID(),
      empenho_id: empId,
      valor_total: item.quantidade_empenhada * item.valor_unitario
    }));

    if (isSupabaseConfigured) {
      return sharedDataRequest<Empenho>('saveEmpenho', { empenho, items });
    }

    // Local Storage (IndexedDB) logic
    seedMockDataIfEmpty();
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const eList: Empenho[] = await storage.getAllEmpenhos();
    const eiList: EmpenhoItem[] = await storage.getAllEmpenhoItens();

    if (isNew) {
      eList.push(fullEmpenho);
    } else {
      const idx = eList.findIndex(e => e.id === empId);
      if (idx !== -1) {
        eList[idx] = fullEmpenho;
      } else {
        eList.push(fullEmpenho);
      }
    }

    // Filter out old sub-items for this commitment and insert new ones
    const filteredEi = eiList.filter(item => item.empenho_id !== empId);
    filteredEi.push(...fullItems);

    await storage.setAllEmpenhos(eList);
    await storage.setAllEmpenhoItens(filteredEi);
    // Invalidate cache
    cache.empenhos = null;
    cache.empenhoItens = null;

    return { ...fullEmpenho, itens: fullItems };
  },

  async saveBulkEmpenhos(entries: BulkEmpenhoImportEntry[]): Promise<BulkEmpenhoImportResult> {
    if (!isSupabaseConfigured) {
      const result: BulkEmpenhoImportResult = { imported: [], duplicates: [], failed: [] };
      for (const entry of entries) {
        try {
          const existing = (await this.getEmpenhos()).find(
            (empenho) => empenho.numero_empenho === entry.numeroEmpenho
              && empenho.licitacao_id === entry.licitacaoId
          );
          if (existing) {
            result.duplicates.push(entry.key);
            continue;
          }
          await this.saveEmpenho({
            id: '',
            licitacao_id: entry.licitacaoId,
            numero_empenho: entry.numeroEmpenho,
            data_empenho: entry.dataEmpenho,
            orgao: entry.orgao || null,
            valor_empenho: 0,
            status: 'ativo',
            observacoes: 'Importação em lote Halex.',
          }, entry.items.map((item) => ({
            licitacao_item_id: item.licitacaoItemId,
            quantidade_empenhada: item.quantidade,
            valor_unitario: item.valorUnitarioArquivo,
          })));
          result.imported.push(entry.key);
        } catch (error) {
          result.failed.push({
            key: entry.key,
            message: error instanceof Error ? error.message : 'Falha ao importar NF.',
          });
        }
      }
      return result;
    }

    return sharedDataRequest<BulkEmpenhoImportResult>('saveBulkEmpenhos', { entries });
  },

  async deleteEmpenho(id: string): Promise<void> {
    if (isSupabaseConfigured) {
      await sharedDataRequest<void>('deleteEmpenho', { id });
      return;
    }

    seedMockDataIfEmpty();
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const eList: Empenho[] = await storage.getAllEmpenhos();
    const eiList: EmpenhoItem[] = await storage.getAllEmpenhoItens();

    const newEList = eList.filter(e => e.id !== id);
    const newEiList = eiList.filter(ei => ei.empenho_id !== id);

    await storage.setAllEmpenhos(newEList);
    await storage.setAllEmpenhoItens(newEiList);
    // Invalidate cache
    cache.empenhos = null;
    cache.empenhoItens = null;
  },

  async deleteEmpenhosByLicitacao(licitacaoId: string): Promise<number> {
    if (isSupabaseConfigured) {
      return sharedDataRequest<number>('deleteEmpenhosByLicitacao', { licitacaoId });
    }

    seedMockDataIfEmpty();
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const eList: Empenho[] = await storage.getAllEmpenhos();
    const eiList: EmpenhoItem[] = await storage.getAllEmpenhoItens();
    const idsToDelete = new Set(
      eList.filter((empenho) => empenho.licitacao_id === licitacaoId).map((empenho) => empenho.id)
    );

    await storage.setAllEmpenhos(eList.filter((empenho) => !idsToDelete.has(empenho.id)));
    await storage.setAllEmpenhoItens(eiList.filter((item) => !idsToDelete.has(item.empenho_id)));
    cache.empenhos = null;
    cache.empenhoItens = null;

    return idsToDelete.size;
  },

  async getAllEmpenhoItens(): Promise<EmpenhoItem[]> {
    if (isSupabaseConfigured) {
      return sharedDataRequest<EmpenhoItem[]>('getAllEmpenhoItens');
    }

    seedMockDataIfEmpty();
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    return await storage.getAllEmpenhoItens();
  },

  async saveCommercialContact(payload: {
    licitacaoId: string;
    clientKey: string;
    contactedAt: string;
    outcome: CommercialContactOutcome;
    notes?: string;
    nextContactAt?: string;
  }): Promise<CommercialContact> {
    return sharedDataRequest<CommercialContact>('saveCommercialContact', payload);
  },

  async saveCommercialOpportunity(payload: {
    licitacaoId: string; clientKey: string; id?: string; title: string; stage: CommercialPipelineStage;
    estimatedValue: number; probability: number; owner?: string; expectedCloseAt?: string; notes?: string;
    createdAt?: string; createdBy?: string;
  }): Promise<CommercialOpportunity> {
    return sharedDataRequest<CommercialOpportunity>('saveCommercialOpportunity', payload);
  },

  async saveCommercialTask(payload: {
    licitacaoId: string; clientKey: string; id?: string; title: string; type: CommercialTaskType;
    dueAt: string; status: CommercialTaskStatus; owner?: string; notes?: string;
    completedAt?: string; createdAt?: string; createdBy?: string;
  }): Promise<CommercialTask> {
    return sharedDataRequest<CommercialTask>('saveCommercialTask', payload);
  },

  // Helper to clear localStorage
  async resetDatabase(): Promise<void> {
    if (typeof window === 'undefined') return;
    // Clear both localStorage and IndexedDB, then reseed
    localStorage.removeItem(KEYS.LICITACOES);
    localStorage.removeItem(KEYS.ITENS);
    localStorage.removeItem(KEYS.EMPENHOS);
    localStorage.removeItem(KEYS.EMPENHO_ITENS);
    await storage.clearAll();
    seedMockDataIfEmpty();
    // Migrate seeded data into IndexedDB
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    // Reset cache so new seeded data is loaded fresh
    cache.licitacoes = null;
    cache.itens = null;
    cache.empenhos = null;
    cache.empenhoItens = null;
    cache.productCatalog = null;
  }
};
