import { openDB, IDBPDatabase } from 'idb';
import { Licitacao, LicitacaoItem, Empenho, EmpenhoItem, ProductCatalogItem } from '../types';

const DB_NAME = 'licitacoes_local_db';
const DB_VERSION = 2;
const STORE_LICITACOES = 'licitacoes';
const STORE_ITENS = 'itens';
const STORE_EMPENHOS = 'empenhos';
const STORE_EMPENHO_ITENS = 'empenho_itens';
const STORE_PRODUCT_CATALOG = 'product_catalog';
const MIGRATION_DONE_KEY = 'licitacoes_indexeddb_migration_done';

let db: IDBPDatabase | null = null;

async function initDB() {
  if (db) return db;
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(upgradeDb: IDBPDatabase) {
      if (!upgradeDb.objectStoreNames.contains(STORE_LICITACOES)) {
        upgradeDb.createObjectStore(STORE_LICITACOES, { keyPath: 'id' });
      }
      if (!upgradeDb.objectStoreNames.contains(STORE_ITENS)) {
        upgradeDb.createObjectStore(STORE_ITENS, { keyPath: 'id' });
      }
      if (!upgradeDb.objectStoreNames.contains(STORE_EMPENHOS)) {
        upgradeDb.createObjectStore(STORE_EMPENHOS, { keyPath: 'id' });
      }
      if (!upgradeDb.objectStoreNames.contains(STORE_EMPENHO_ITENS)) {
        upgradeDb.createObjectStore(STORE_EMPENHO_ITENS, { keyPath: 'id' });
      }
      if (!upgradeDb.objectStoreNames.contains(STORE_PRODUCT_CATALOG)) {
        upgradeDb.createObjectStore(STORE_PRODUCT_CATALOG, { keyPath: 'codigo_produto' });
      }
    }
  });
  return db;
}

export async function getAllLicitacoes(): Promise<Licitacao[]> {
  const d = await initDB();
  return (await d.getAll(STORE_LICITACOES)) as Licitacao[];
}

export async function getAllItens(): Promise<LicitacaoItem[]> {
  const d = await initDB();
  return (await d.getAll(STORE_ITENS)) as LicitacaoItem[];
}

export async function getAllEmpenhos(): Promise<Empenho[]> {
  const d = await initDB();
  return (await d.getAll(STORE_EMPENHOS)) as Empenho[];
}

export async function getAllEmpenhoItens(): Promise<EmpenhoItem[]> {
  const d = await initDB();
  return (await d.getAll(STORE_EMPENHO_ITENS)) as EmpenhoItem[];
}

export async function getAllProductCatalogItems(): Promise<ProductCatalogItem[]> {
  const d = await initDB();
  return (await d.getAll(STORE_PRODUCT_CATALOG)) as ProductCatalogItem[];
}

export async function setAllLicitacoes(items: Licitacao[]) {
  const d = await initDB();
  const tx = d.transaction(STORE_LICITACOES, 'readwrite');
  await tx.objectStore(STORE_LICITACOES).clear();
  for (const it of items) await tx.objectStore(STORE_LICITACOES).put(it);
  await tx.done;
}

export async function setAllItens(items: LicitacaoItem[]) {
  const d = await initDB();
  const tx = d.transaction(STORE_ITENS, 'readwrite');
  await tx.objectStore(STORE_ITENS).clear();
  for (const it of items) await tx.objectStore(STORE_ITENS).put(it);
  await tx.done;
}

export async function setAllEmpenhos(items: Empenho[]) {
  const d = await initDB();
  const tx = d.transaction(STORE_EMPENHOS, 'readwrite');
  await tx.objectStore(STORE_EMPENHOS).clear();
  for (const it of items) await tx.objectStore(STORE_EMPENHOS).put(it);
  await tx.done;
}

export async function setAllEmpenhoItens(items: EmpenhoItem[]) {
  const d = await initDB();
  const tx = d.transaction(STORE_EMPENHO_ITENS, 'readwrite');
  await tx.objectStore(STORE_EMPENHO_ITENS).clear();
  for (const it of items) await tx.objectStore(STORE_EMPENHO_ITENS).put(it);
  await tx.done;
}

export async function setAllProductCatalogItems(items: ProductCatalogItem[]) {
  const d = await initDB();
  const tx = d.transaction(STORE_PRODUCT_CATALOG, 'readwrite');
  await tx.objectStore(STORE_PRODUCT_CATALOG).clear();
  for (const it of items) await tx.objectStore(STORE_PRODUCT_CATALOG).put(it);
  await tx.done;
}

export async function clearAll() {
  const d = await initDB();
  await d.clear(STORE_LICITACOES);
  await d.clear(STORE_ITENS);
  await d.clear(STORE_EMPENHOS);
  await d.clear(STORE_EMPENHO_ITENS);
  await d.clear(STORE_PRODUCT_CATALOG);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(MIGRATION_DONE_KEY);
  }
}

export async function getBackupData() {
  return {
    licitacoes: await getAllLicitacoes(),
    itens: await getAllItens(),
    empenhos: await getAllEmpenhos(),
    empenhoItens: await getAllEmpenhoItens(),
    productCatalog: await getAllProductCatalogItems()
  };
}

export async function restoreBackupData(payload: { licitacoes: Licitacao[]; itens: LicitacaoItem[]; empenhos: Empenho[]; empenhoItens: EmpenhoItem[]; productCatalog?: ProductCatalogItem[] }) {
  await setAllLicitacoes(payload.licitacoes || []);
  await setAllItens(payload.itens || []);
  await setAllEmpenhos(payload.empenhos || []);
  await setAllEmpenhoItens(payload.empenhoItens || []);
  await setAllProductCatalogItems(payload.productCatalog || []);
}

// Migrate existing localStorage data into IndexedDB (one-time)
export async function migrateFromLocalStorage(keys: { LICITACOES: string; ITENS: string; EMPENHOS: string; EMPENHO_ITENS: string; }) {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(MIGRATION_DONE_KEY) === 'true') return;

  try {
    const d = await initDB();
    const existingRecords =
      await d.count(STORE_LICITACOES) +
      await d.count(STORE_ITENS) +
      await d.count(STORE_EMPENHOS) +
      await d.count(STORE_EMPENHO_ITENS);

    if (existingRecords > 0) {
      localStorage.setItem(MIGRATION_DONE_KEY, 'true');
      return;
    }

    const licRaw = localStorage.getItem(keys.LICITACOES);
    const itensRaw = localStorage.getItem(keys.ITENS);
    const empenhosRaw = localStorage.getItem(keys.EMPENHOS);
    const empenhoItensRaw = localStorage.getItem(keys.EMPENHO_ITENS);

    if (licRaw) await setAllLicitacoes(JSON.parse(licRaw));
    if (itensRaw) await setAllItens(JSON.parse(itensRaw));
    if (empenhosRaw) await setAllEmpenhos(JSON.parse(empenhosRaw));
    if (empenhoItensRaw) await setAllEmpenhoItens(JSON.parse(empenhoItensRaw));
    localStorage.setItem(MIGRATION_DONE_KEY, 'true');
  } catch (err) {
    // Migration failures should not break the app — ignore and continue using localStorage
    console.warn('Migration to IndexedDB failed:', err);
  }
}
