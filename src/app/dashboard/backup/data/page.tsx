'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { db } from '../../../../lib/db';
import { AuditEvent, CommercialContact, CommercialOpportunity, CommercialTask, Empenho, EmpenhoItem, Licitacao, LicitacaoItem, ProductCatalogItem } from '../../../../types';

type ProductImportRow = Record<string, unknown>;

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function pickValue(row: ProductImportRow, headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  const header = headers.find((h) => normalizedCandidates.includes(normalizeHeader(h)));
  const raw = header ? row[header] : undefined;
  return raw == null ? '' : String(raw).trim();
}

function parseNumber(value: string) {
  if (!value) return 0;
  const clean = value.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRowsToCatalog(rows: ProductImportRow[]): ProductCatalogItem[] {
  const byCode = new Map<string, ProductCatalogItem>();
  const now = new Date().toISOString();

  rows.forEach((row) => {
    const headers = Object.keys(row);
    const codigo = pickValue(row, headers, ['codigo', 'cod', 'codigoproduto', 'codproduto', 'codigoitem', 'sku', 'referencia', 'ref', 'item']);
    if (!codigo) return;

    byCode.set(codigo.toUpperCase(), {
      codigo_produto: codigo,
      descricao: pickValue(row, headers, ['descricao', 'desc', 'descricaoproduto', 'produto', 'nome', 'nomeproduto', 'material', 'insumo']),
      marca: pickValue(row, headers, ['marca', 'fabricante', 'laboratorio']) || null,
      unidade: pickValue(row, headers, ['unidade', 'und', 'un', 'u', 'embalagem']) || 'Unidade',
      valor_unitario: parseNumber(pickValue(row, headers, ['valorunitario', 'valorunit', 'valor', 'preco', 'precounitario', 'custo'])),
      updated_at: now,
    });
  });

  return Array.from(byCode.values());
}

interface BackupPayload {
  licitacoes: Licitacao[];
  itens: LicitacaoItem[];
  empenhos: Empenho[];
  empenhoItens: EmpenhoItem[];
  productCatalog?: ProductCatalogItem[];
  commercialContacts?: CommercialContact[];
  commercialOpportunities?: CommercialOpportunity[];
  commercialTasks?: CommercialTask[];
  auditEvents?: AuditEvent[];
}

type BackupFilePayload = { backup: BackupPayload } | BackupPayload;

function getBackupPayload(parsed: BackupFilePayload) {
  return 'backup' in parsed ? parsed.backup : parsed;
}

export default function BackupDataPage() {
  const router = useRouter();
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<{ licitacoes: number; itens: number; empenhos: number; empenhoItens: number; productCatalog: number; crm: number; auditoria: number } | null>(null);
  const [fileName, setFileName] = useState('');
  const [catalogImporting, setCatalogImporting] = useState(false);
  const [catalogMsg, setCatalogMsg] = useState<string | null>(null);

  async function onExport() {
    setExporting(true);
    try {
      const backup = await db.exportBackup();
      const payload = JSON.stringify({ exported_at: new Date().toISOString(), backup }, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `licitacoes-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Erro ao exportar backup.');
    } finally {
      setExporting(false);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportError(null);
    setPreview(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupFilePayload;
      const data = getBackupPayload(parsed);

      if (!data || !Array.isArray(data.licitacoes) || !Array.isArray(data.itens) || !Array.isArray(data.empenhos) || !Array.isArray(data.empenhoItens)) {
        throw new Error('Arquivo inválido: Estrutura de backup não encontrada.');
      }

      setPreview({
        licitacoes: data.licitacoes.length,
        itens: data.itens.length,
        empenhos: data.empenhos.length,
        empenhoItens: data.empenhoItens.length,
        productCatalog: data.productCatalog?.length || 0,
        crm: (data.commercialContacts?.length || 0) + (data.commercialOpportunities?.length || 0) + (data.commercialTasks?.length || 0),
        auditoria: data.auditEvents?.length || 0,
      });
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Erro ao ler o arquivo.');
    }
  }

  async function onImport() {
    const input = document.querySelector<HTMLInputElement>('input[data-backup-input]');
    const file = input?.files?.[0];
    if (!file) {
      setImportError('Selecione um arquivo de backup JSON primeiro.');
      return;
    }
    if (!window.confirm('Esta ação substituirá todos os dados atuais. Deseja continuar?')) {
      return;
    }

    setImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupFilePayload;
      const data = getBackupPayload(parsed);

      if (!data || !Array.isArray(data.licitacoes) || !Array.isArray(data.itens) || !Array.isArray(data.empenhos) || !Array.isArray(data.empenhoItens)) {
        throw new Error('Arquivo inválido: Estrutura de backup não encontrada.');
      }

      await db.importBackup(data);
      alert('Importação concluída com sucesso. Os dados foram atualizados.');
      router.push('/dashboard');
    } catch (err: unknown) {
      console.error(err);
      setImportError(err instanceof Error ? err.message : 'Erro ao importar backup.');
    } finally {
      setImporting(false);
    }
  }

  async function onProductCatalogFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCatalogImporting(true);
    setCatalogMsg(null);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let rows: ProductImportRow[] = [];

      if (extension === 'xlsx' || extension === 'xls') {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<ProductImportRow>(firstSheet, { defval: '' });
      } else {
        const text = await file.text();
        const parsed = Papa.parse<ProductImportRow>(text, {
          header: true,
          skipEmptyLines: true,
        });
        if (parsed.errors.length) {
          throw new Error(parsed.errors[0].message);
        }
        rows = parsed.data;
      }

      const imported = mapRowsToCatalog(rows);
      if (imported.length === 0) {
        throw new Error('Nenhum produto com codigo foi encontrado na tabela.');
      }

      const existing = await db.getProductCatalog();
      const merged = new Map<string, ProductCatalogItem>();
      existing.forEach((product) => merged.set(product.codigo_produto.trim().toUpperCase(), product));
      imported.forEach((product) => merged.set(product.codigo_produto.trim().toUpperCase(), product));

      const nextCatalog = Array.from(merged.values()).sort((a, b) => a.codigo_produto.localeCompare(b.codigo_produto));
      await db.saveProductCatalog(nextCatalog);
      setCatalogMsg(`${imported.length} produto(s) importado(s). Catalogo total: ${nextCatalog.length}.`);
    } catch (err: unknown) {
      console.error(err);
      setCatalogMsg(err instanceof Error ? err.message : 'Erro ao importar a tabela de produtos.');
    } finally {
      setCatalogImporting(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Backup de Dados</h1>
          <p className="text-sm text-slate-400 mt-2">Use esta página para exportar os dados como JSON ou importar uma cópia de segurança.</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm border border-slate-700"
        >
          Voltar ao Painel
        </Link>
      </div>

      <div className="glass-card p-6 border-slate-800 bg-slate-900/40">
        <h4 className="text-lg font-semibold text-slate-200">Backup de Dados</h4>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={onExport} disabled={exporting} className="brand-secondary px-4 py-2 text-sm font-semibold">
            {exporting ? 'Exportando...' : 'Exportar backup JSON'}
          </button>
          <button type="button" onClick={() => document.querySelector<HTMLInputElement>('input[data-backup-input]')?.click()} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm">
            Selecionar arquivo de importação
          </button>
        </div>

        <div className="mt-4">
          <input type="file" data-backup-input onChange={onFileChange} accept="application/json" className="hidden" />
          {fileName && <p className="text-sm text-slate-200">Arquivo escolhido: {fileName}</p>}
          {preview && (
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
              <p><strong>Pré-visualização:</strong></p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>{preview.licitacoes} licitação(ões)</li>
                <li>{preview.itens} item(ns)</li>
                <li>{preview.empenhos} empenho(s)</li>
                <li>{preview.empenhoItens} item(ns) de empenho</li>
                <li>{preview.productCatalog} produto(s) no catálogo</li>
                <li>{preview.crm} registro(s) comerciais</li>
                <li>{preview.auditoria} evento(s) de auditoria</li>
              </ul>
              <p className="text-xs text-slate-500 mt-3">A importação substituirá os dados atuais. Faça backup antes se quiser preservar o estado atual.</p>
            </div>
          )}
          {importError && <p className="mt-3 text-sm text-rose-400">{importError}</p>}
        </div>

        <div className="mt-6">
          <button type="button" onClick={onImport} disabled={importing || !preview} className="brand-button px-4 py-2 text-sm font-semibold">
            {importing ? 'Importando...' : 'Importar backup e substituir dados'}
          </button>
        </div>
      </div>

      <div className="glass-card p-6 border-slate-800 bg-slate-900/40">
        <h4 className="text-lg font-semibold text-slate-200">Catalogo de Produtos</h4>
        <p className="text-sm text-slate-400 mt-2">
          Atualize aqui a tabela base usada para preencher produtos pelo codigo no cadastro de licitacoes.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => document.querySelector<HTMLInputElement>('input[data-product-catalog-input]')?.click()}
            disabled={catalogImporting}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm disabled:opacity-50"
          >
            {catalogImporting ? 'Importando...' : 'Importar tabela de produtos'}
          </button>
          <input
            type="file"
            data-product-catalog-input
            onChange={onProductCatalogFile}
            accept=".csv,.xlsx,.xls"
            className="hidden"
          />
        </div>

        {catalogMsg && <p className="mt-3 text-sm text-cyan-300">{catalogMsg}</p>}
      </div>
    </div>
  );
}
