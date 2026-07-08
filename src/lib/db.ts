import { Licitacao, LicitacaoItem, Empenho, EmpenhoItem, ProductCatalogItem, LicitacaoAttachment, CommercialContact, CommercialOpportunity, CommercialTask, AuditEvent } from '../types';
import type { BulkEmpenhoImportEntry, BulkEmpenhoImportResult } from './halex-bulk-empenho';
import * as storage from './storage';

// Operational data is local-only (IndexedDB, migrated from legacy localStorage).
export type AppDataBundle = {
  licitacoes: Licitacao[];
  itens: LicitacaoItem[];
  empenhos: Empenho[];
  empenhoItens: EmpenhoItem[];
};

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

// Helpers for legacy localStorage database keys (migrated into IndexedDB)
const KEYS = {
  LICITACOES: 'licitacoes_db_data',
  ITENS: 'licitacoes_db_itens',
  EMPENHOS: 'licitacoes_db_empenhos',
  EMPENHO_ITENS: 'licitacoes_db_empenho_itens',
};

async function readLocalItems(): Promise<LicitacaoItem[]> {
  if (cache.itens) return cache.itens;
  // Try migrating existing localStorage into IndexedDB (non-blocking)
  storage.migrateFromLocalStorage(KEYS).catch(() => {});
  const v = await storage.getAllItens();
  cache.itens = v;
  return v;
}

// Generate standard UUID-like strings
function generateUUID(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'mock-uuid-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// ----------------------------------------------------
// DATABASE API INTERFACE
// ----------------------------------------------------

export const db = {
  async getAppData(): Promise<AppDataBundle> {
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const [licitacoes, itens, empenhos, empenhoItens] = await Promise.all([
      storage.getAllLicitacoes(),
      storage.getAllItens(),
      storage.getAllEmpenhos(),
      storage.getAllEmpenhoItens(),
    ]);
    return { licitacoes, itens, empenhos, empenhoItens };
  },

  // LICITAÇÕES APIs
  async getLicitacoes(): Promise<Licitacao[]> {
    if (cache.licitacoes) return cache.licitacoes;
    // Attempt migration and read from IndexedDB-backed storage
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const list = await storage.getAllLicitacoes();
    cache.licitacoes = list;
    return list;
  },

  async getLicitacao(id: string): Promise<Licitacao | null> {
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

    // Local Storage (IndexedDB) logic
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
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const lList = await storage.getAllLicitacoes();
    const idx = lList.findIndex(l => l.id === licitacaoId);
    if (idx === -1) throw new Error('Licitacao not found');
    lList[idx] = { ...lList[idx], edital };
    await storage.setAllLicitacoes(lList);
    cache.licitacoes = null;
  },

  async getEdital(licitacaoId: string) {
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const lList = await storage.getAllLicitacoes();
    const lic = lList.find(l => l.id === licitacaoId);
    return lic?.edital || null;
  },

  async attachAta(licitacaoId: string, ata: LicitacaoAttachment): Promise<void> {
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const lList = await storage.getAllLicitacoes();
    const idx = lList.findIndex(l => l.id === licitacaoId);
    if (idx === -1) throw new Error('Licitacao not found');
    lList[idx] = { ...lList[idx], ata };
    await storage.setAllLicitacoes(lList);
    cache.licitacoes = null;
  },

  async getAta(licitacaoId: string) {
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const lList = await storage.getAllLicitacoes();
    const lic = lList.find(l => l.id === licitacaoId);
    return lic?.ata || null;
  },

  async exportBackup() {
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    return storage.getBackupData();
  },

  async importBackup(payload: { licitacoes: Licitacao[]; itens: LicitacaoItem[]; empenhos: Empenho[]; empenhoItens: EmpenhoItem[]; productCatalog?: ProductCatalogItem[]; commercialContacts?: CommercialContact[]; commercialOpportunities?: CommercialOpportunity[]; commercialTasks?: CommercialTask[]; auditEvents?: AuditEvent[] }) {
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    await storage.restoreBackupData(payload);
    cache.licitacoes = null;
    cache.itens = null;
    cache.empenhos = null;
    cache.empenhoItens = null;
    cache.productCatalog = null;
  },

  async getProductCatalog(): Promise<ProductCatalogItem[]> {
    if (cache.productCatalog) return cache.productCatalog;
    const items = await storage.getAllProductCatalogItems();
    cache.productCatalog = items;
    return items;
  },

  async saveProductCatalog(items: ProductCatalogItem[]): Promise<void> {
    await storage.setAllProductCatalogItems(items);
    cache.productCatalog = null;
  },

  async getAuditEvents(): Promise<AuditEvent[]> {
    // Audit trail is not persisted in the local-only build.
    return [];
  },

  // EMPENHOS APIs
  async getEmpenhos(licitacaoId?: string): Promise<Empenho[]> {
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    const list: Empenho[] = await storage.getAllEmpenhos();
    if (licitacaoId) {
      return list.filter(e => e.licitacao_id === licitacaoId).sort((a, b) => b.data_empenho.localeCompare(a.data_empenho));
    }
    return list.sort((a, b) => b.data_empenho.localeCompare(a.data_empenho));
  },

  async getEmpenho(id: string): Promise<Empenho | null> {
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

    // Local Storage (IndexedDB) logic
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
  },

  async deleteEmpenho(id: string): Promise<void> {
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
    await storage.migrateFromLocalStorage(KEYS).catch(() => {});
    return await storage.getAllEmpenhoItens();
  },

  // Helper to clear all local data
  async resetDatabase(): Promise<void> {
    if (typeof window === 'undefined') return;
    // Clear both localStorage and IndexedDB
    localStorage.removeItem(KEYS.LICITACOES);
    localStorage.removeItem(KEYS.ITENS);
    localStorage.removeItem(KEYS.EMPENHOS);
    localStorage.removeItem(KEYS.EMPENHO_ITENS);
    await storage.clearAll();
    // Reset cache
    cache.licitacoes = null;
    cache.itens = null;
    cache.empenhos = null;
    cache.empenhoItens = null;
    cache.productCatalog = null;
  }
};
