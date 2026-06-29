'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Papa from 'papaparse';
import Fuse from 'fuse.js';
import { db } from '../../../../../lib/db';
import { formatAppDate, formatDateInputValue, todayIsoDate, toIsoDate } from '../../../../../lib/date';
import { normalizeHalexDocument } from '../../../../../lib/halex-bulk-empenho';
import { Empenho, EmpenhoItem, Licitacao, LicitacaoItem } from '../../../../../types';

type FileRow = Record<string, unknown>;
type MatrixRow = Array<string | number | Date | null | undefined>;

interface Mapping {
  empenho?: string;
  data?: string;
  codigo?: string;
  description?: string;
  quantity?: string;
  value?: string;
}

interface ImportedMatch {
  row: FileRow;
  numeroEmpenho: string;
  dataEmpenho: string;
  dataFaturamento: string;
  nf: string;
  text: string;
  codigo: string;
  qty: number;
  val: number;
  best?: LicitacaoItem;
  priceMatches: boolean;
  score: number | null;
  selectedId: string | null;
}

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function pickHeader(headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  return headers.find((header) => {
    const normalized = normalizeHeader(header);
    return normalizedCandidates.some((candidate) => (
      normalized === candidate ||
      (candidate.length >= 4 && normalized.includes(candidate)) ||
      (normalized.length >= 4 && candidate.includes(normalized))
    ));
  });
}

function valueOf(row: FileRow, header?: string) {
  if (!header) return '';
  const raw = row[header];
  return raw == null ? '' : String(raw).trim();
}

function parseNumber(value: string) {
  if (!value) return 0;
  let clean = value.replace(/[^\d,.-]/g, '');
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    clean = clean
      .replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '')
      .replace(decimalSeparator, '.');
  } else if (lastComma >= 0) {
    clean = clean.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  } else {
    clean = clean.replace(/,(?=\d{3}(\D|$))/g, '');
  }

  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseQuantity(value: string) {
  return Math.max(0, Math.round(parseNumber(value)));
}

function parseDate(value: string) {
  if (!value) return '';

  const excelSerial = Number(value);
  if (Number.isFinite(excelSerial) && excelSerial > 20000 && excelSerial < 80000) {
    const date = new Date(Math.round((excelSerial - 25569) * 86400 * 1000));
    return date.toISOString().slice(0, 10);
  }

  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const appDate = toIsoDate(trimmed);
  if (appDate) return appDate;

  const br = trimmed.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    const day = br[1].padStart(2, '0');
    const month = br[2].padStart(2, '0');
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function pricesMatch(a: number, b: number) {
  if (a <= 0 || b <= 0) return false;
  return Math.abs(a - b) <= 0.01;
}

function detectMapping(headers: string[]): Mapping {
  return {
    empenho: pickHeader(headers, ['numeroempenho', 'empenho', 'notaempenho', 'ne', 'numerone', 'documento']),
    data: pickHeader(headers, ['dataempenho', 'datalancamento', 'data', 'emissao', 'dataemissao']),
    codigo: pickHeader(headers, ['codigo', 'codigoproduto', 'codproduto', 'sku', 'referencia', 'itemcodigo']),
    description: pickHeader(headers, ['descricao', 'descricaoproduto', 'produto', 'material', 'item', 'nome']),
    quantity: pickHeader(headers, ['quantidade', 'qtd', 'qtde', 'qtdempenhada', 'quantidadeempenhada']),
    value: pickHeader(headers, ['valorunitario', 'valorunit', 'vlrunitario', 'preco', 'valor', 'unitario']),
  };
}

function matrixToGenericRows(matrix: MatrixRow[]): FileRow[] {
  const meaningfulRows = matrix
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some(Boolean));

  if (meaningfulRows.length < 2) return [];

  const headers = meaningfulRows[0].map((cell, index) => cell || `coluna_${index + 1}`);
  return meaningfulRows.slice(1).map((row) => {
    const record: FileRow = {};
    headers.forEach((header, index) => {
      record[header] = row[index] || '';
    });
    return record;
  });
}

function pastedTextToMatrix(text: string): MatrixRow[] {
  const cleaned = text.trim();
  if (!cleaned) return [];

  const delimiter = cleaned.includes('\t') ? '\t' : undefined;
  const parsed = Papa.parse<string[]>(cleaned, {
    delimiter,
    skipEmptyLines: true,
  });

  return parsed.data
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some(Boolean));
}

function matrixToCompanyRows(matrix: MatrixRow[]): FileRow[] {
  const rows: FileRow[] = [];

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i].map((cell) => String(cell ?? '').trim());
    const isHeader = normalizeHeader(row[0] || '') === 'lancamento' && normalizeHeader(row[4] || '') === 'nf';
    if (!isHeader) continue;

    const meta = matrix[i + 1] || [];
    const lancamento = meta[0] || '';
    const faturamento = meta[1] || '';
    const ordemVenda = meta[3] || '';
    const nf = meta[4] || '';
    const codigoCliente = meta[5] || '';
    const nomeCliente = meta[6] || '';

    let itemHeaderIndex = -1;
    for (let j = i + 2; j < Math.min(i + 8, matrix.length); j++) {
      const possible = matrix[j].map((cell) => String(cell ?? '').trim());
      if (normalizeHeader(possible[0] || '') === 'codproduto' && normalizeHeader(possible[1] || '') === 'descproduto') {
        itemHeaderIndex = j;
        break;
      }
    }

    if (itemHeaderIndex === -1) continue;

    for (let j = itemHeaderIndex + 1; j < matrix.length; j++) {
      const item = matrix[j];
      const first = String(item[0] ?? '').trim();
      const normalizedFirst = normalizeHeader(first);

      if (!first) break;
      if (normalizedFirst.startsWith('totalnf')) break;
      if (normalizedFirst === 'lancamento') {
        i = j - 1;
        break;
      }

      rows.push({
        numero_empenho: nf ? `NF ${String(nf).trim()}` : `IMP-${i + 1}`,
        data_empenho: lancamento || faturamento,
        data_faturamento: faturamento,
        codigo: item[0] || '',
        descricao: item[1] || '',
        qtd_caixas: item[2] || '',
        quantidade: item[3] || '',
        valor_unitario: item[4] || '',
        total_item: item[5] || '',
        ordem_venda_sap: ordemVenda,
        nf,
        codigo_cliente: codigoCliente,
        nome_cliente: nomeCliente,
      });
    }
  }

  return rows;
}

export default function UploadEmpenhoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null);
  const [licitacaoItems, setLicitacaoItems] = useState<LicitacaoItem[]>([]);
  const [existingEmpenhos, setExistingEmpenhos] = useState<Empenho[]>([]);
  const [fileRows, setFileRows] = useState<FileRow[]>([]);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [matches, setMatches] = useState<ImportedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importMode, setImportMode] = useState<'company' | 'generic' | null>(null);
  const [fallbackEmpenhoNumber, setFallbackEmpenhoNumber] = useState('');
  const [fallbackDataEmpenho, setFallbackDataEmpenho] = useState(formatAppDate(todayIsoDate()));
  const [pastedText, setPastedText] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [detailed, existing] = await Promise.all([
          db.getLicitacao(id),
          db.getEmpenhos(id),
        ]);
        setLicitacao(detailed);
        setLicitacaoItems(detailed?.itens || []);
        setExistingEmpenhos(existing);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const fuse = useMemo(() => (
    new Fuse(licitacaoItems, { keys: ['descricao', 'marca', 'codigo_produto'], threshold: 0.4 })
  ), [licitacaoItems]);

  const groups = useMemo(() => {
    const grouped = new Map<string, ImportedMatch[]>();
    matches
      .filter((match) => match.selectedId && match.qty > 0)
      .forEach((match) => {
        const key = `${match.numeroEmpenho}__${match.dataEmpenho}`;
        grouped.set(key, [...(grouped.get(key) || []), match]);
      });
    return Array.from(grouped.entries()).map(([key, rows]) => {
      const [numeroEmpenho, dataEmpenho] = key.split('__');
      return { numeroEmpenho, dataEmpenho, rows };
    });
  }, [matches]);

  const existingEmpenhoKeys = useMemo(() => (
    new Set(existingEmpenhos.map((empenho) => normalizeHalexDocument(empenho.numero_empenho)).filter(Boolean))
  ), [existingEmpenhos]);

  const duplicateGroupCount = useMemo(() => (
    groups.filter((group) => existingEmpenhoKeys.has(normalizeHalexDocument(group.numeroEmpenho))).length
  ), [existingEmpenhoKeys, groups]);

  function generateMatches(rows: FileRow[], map: Mapping) {
    const suggested = rows.map((row): ImportedMatch | null => {
      const numeroEmpenho = valueOf(row, map.empenho) || fallbackEmpenhoNumber || `IMP-${Date.now()}`;
      const dataEmpenho = parseDate(valueOf(row, map.data)) || toIsoDate(fallbackDataEmpenho) || todayIsoDate();
      const dataFaturamento = parseDate(valueOf(row, 'data_faturamento'));
      const nf = valueOf(row, 'nf') || numeroEmpenho.replace(/^NF\s*/i, '');
      const codigo = valueOf(row, map.codigo);
      const text = valueOf(row, map.description) || codigo;
      const qty = parseQuantity(valueOf(row, map.quantity));
      const rawVal = parseNumber(valueOf(row, map.value));

      const codeMatch = codigo
        ? licitacaoItems.find((item) => item.codigo_produto?.trim().toUpperCase() === codigo.trim().toUpperCase())
        : undefined;
      const fuzzy = !codeMatch && text ? fuse.search(text)[0] : undefined;
      const best = codeMatch || fuzzy?.item;
      const val = rawVal > 0 ? rawVal : best?.valor_unitario || 0;
      const priceMatches = !!best && (best.valor_unitario <= 0 || pricesMatch(val, best.valor_unitario));
      const selectedId = priceMatches ? best?.id ?? null : null;

      if (!text && !codigo && qty <= 0) return null;

      return {
        row,
        numeroEmpenho,
        dataEmpenho,
        dataFaturamento,
        nf,
        text,
        codigo,
        qty,
        val,
        best,
        priceMatches,
        score: codeMatch ? 0 : fuzzy?.score ?? null,
        selectedId,
      };
    }).filter((match): match is ImportedMatch => match !== null);

    setMatches(suggested);
  }

  function loadRows(rows: FileRow[], mode: 'company' | 'generic', nextMessage: string | null) {
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    const detected = detectMapping(headers);
    setFileRows(rows);
    setFileHeaders(headers);
    setMapping(detected);
    setImportMode(mode);
    setMessage(nextMessage);
    generateMatches(rows, detected);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessage(null);
    const filename = (file.name || '').toLowerCase();

    if (filename.endsWith('.pdf')) {
      setFileRows([]);
      setFileHeaders([]);
      setMatches([]);
      setImportMode(null);
      setMessage('PDF ainda nao pode ser lido automaticamente com seguranca. Exporte em Excel ou CSV para lancar os empenhos automaticamente.');
      e.target.value = '';
      return;
    }

    if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
      const ab = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(ab, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const matrix = XLSX.utils.sheet_to_json<MatrixRow>(workbook.Sheets[firstSheet], { header: 1, defval: '' });
      const companyRows = matrixToCompanyRows(matrix);
      const isCompanyExport = companyRows.length > 0;
      const rows = companyRows.length > 0
        ? companyRows
        : XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' }) as FileRow[];
      loadRows(
        rows,
        isCompanyExport ? 'company' : 'generic',
        isCompanyExport ? 'Formato da empresa reconhecido automaticamente. Nao precisa mapear colunas.' : null
      );
      e.target.value = '';
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<FileRow>) => {
        const rows = results.data;
        loadRows(rows, 'generic', null);
        e.target.value = '';
      },
      error: (err) => {
        setMessage(err.message);
        e.target.value = '';
      },
    });
  }

  function handlePasteImport() {
    setMessage(null);
    const matrix = pastedTextToMatrix(pastedText);
    const companyRows = matrixToCompanyRows(matrix);
    const rows = companyRows.length > 0 ? companyRows : matrixToGenericRows(matrix);

    if (rows.length === 0) {
      setFileRows([]);
      setFileHeaders([]);
      setMatches([]);
      setImportMode(null);
      setMessage('Nao consegui ler a tabela colada. Copie a linha de cabecalho junto com as linhas de dados da Halex e tente novamente.');
      return;
    }

    const isCompanyExport = companyRows.length > 0;
    loadRows(
      rows,
      isCompanyExport ? 'company' : 'generic',
      isCompanyExport
        ? 'Tabela da Halex reconhecida pelo formato da empresa.'
        : 'Tabela colada lida. Confira o mapeamento das colunas antes de confirmar.'
    );
  }

  async function createEmpenhos() {
    setCreating(true);
    try {
      if (groups.length === 0) {
        alert('Nenhum item mapeado. Confirme as correspondencias antes de criar.');
        return;
      }

      let created = 0;
      let skippedDuplicates = 0;
      const createdKeys = new Set<string>();
      for (const group of groups) {
        const documentKey = normalizeHalexDocument(group.numeroEmpenho);
        if (existingEmpenhoKeys.has(documentKey) || createdKeys.has(documentKey)) {
          skippedDuplicates++;
          continue;
        }

        const itemsToSend: Omit<EmpenhoItem, 'id' | 'empenho_id' | 'valor_total'>[] = group.rows.map((match) => ({
          licitacao_item_id: match.selectedId || '',
          quantidade_empenhada: match.qty,
          valor_unitario: match.val,
        })).filter((item) => item.licitacao_item_id !== '' && item.quantidade_empenhada > 0);

        if (itemsToSend.length === 0) continue;

        await db.saveEmpenho({
          id: '',
          licitacao_id: id,
          numero_empenho: group.numeroEmpenho,
          data_empenho: group.dataEmpenho,
          orgao: licitacao?.orgao || null,
          valor_empenho: 0,
          status: 'ativo',
          observacoes: [
            `Importado automaticamente com ${itemsToSend.length} item(ns).`,
            `Nota fiscal: ${group.numeroEmpenho}.`,
            `Lancamento: ${group.dataEmpenho}.`,
            group.rows[0]?.dataFaturamento ? `Faturamento: ${group.rows[0].dataFaturamento}.` : '',
          ].filter(Boolean).join(' '),
        }, itemsToSend);
        created++;
        createdKeys.add(documentKey);
      }

      const parts = [`${created} empenho(s) criado(s) com sucesso.`];
      if (skippedDuplicates > 0) {
        parts.push(`${skippedDuplicates} duplicado(s) ignorado(s).`);
      }
      alert(parts.join(' '));
      if (created > 0) {
        router.push(`/dashboard/licitacoes/${id}`);
      }
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert('Erro ao criar empenhos: ' + errorMessage);
    } finally {
      setCreating(false);
    }
  }

  function updateMatch(index: number, selectedId: string | null) {
    const copy = [...matches];
    copy[index].selectedId = selectedId;
    const selected = licitacaoItems.find((item) => item.id === selectedId);
    if (selected && copy[index].val <= 0) copy[index].val = selected.valor_unitario;
    if (selected) copy[index].priceMatches = pricesMatch(copy[index].val, selected.valor_unitario);
    setMatches(copy);
  }

  function updateMapping(next: Mapping) {
    setMapping(next);
    generateMatches(fileRows, next);
  }

  if (loading) return <div className="p-6 text-sm text-slate-400">Carregando itens...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Importar Empenhos</h1>
          <p className="text-sm text-slate-400 mt-1">Carregue Excel ou CSV exportado do sistema da empresa para lancar varios empenhos e baixar saldo automaticamente.</p>
        </div>
        <Link
          href={`/dashboard/licitacoes/${id}`}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm border border-slate-700"
        >
          <ArrowLeft size={14} /> Voltar para a Licitacao
        </Link>
      </div>

      <div className="glass-card p-4">
        <h3 className="font-semibold text-slate-200">Importar empenhos desta licitacao</h3>
        <p className="text-xs text-slate-400">Para o relatorio da empresa, selecione um arquivo ou cole a tabela copiada da Halex. O sistema reconhece NF, datas, codigo, quantidade e valor automaticamente.</p>

        <div className="mt-4">
          <input id="empenho-file-input" type="file" accept=".csv,.xlsx,.xls,.pdf,application/pdf" onChange={handleFile} className="hidden" />
          <button
            onClick={() => document.getElementById('empenho-file-input')?.click()}
            className="brand-secondary px-4 py-2 text-sm font-semibold"
            type="button"
          >
            Selecionar arquivo
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950/30 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1">
              <label className="text-xs font-semibold text-slate-300">Colar tabela da Halex</label>
              <textarea
                value={pastedText}
                onChange={(event) => setPastedText(event.target.value)}
                rows={6}
                className="form-input mt-2 min-h-32 w-full resize-y text-xs font-mono"
                placeholder="Cole aqui as linhas copiadas da tela da Halex, incluindo o cabecalho."
              />
            </div>
            <div className="flex shrink-0 flex-col gap-2 lg:w-52 lg:pt-7">
              <button
                onClick={handlePasteImport}
                disabled={!pastedText.trim()}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
              >
                Processar texto
              </button>
              <button
                onClick={() => {
                  setPastedText('');
                  setMessage(null);
                }}
                disabled={!pastedText.trim()}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>

        {message && <p className="mt-3 text-sm text-amber-300">{message}</p>}

        {importMode !== 'company' && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400">Numero padrao se o arquivo nao tiver coluna</label>
              <input placeholder="Ex: 2026NE0001" className="form-input mt-1" value={fallbackEmpenhoNumber} onChange={(e) => setFallbackEmpenhoNumber(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400">Data padrao se o arquivo nao tiver coluna</label>
              <input type="text" inputMode="numeric" placeholder="dd/mm/aaaa" className="form-input mt-1" value={fallbackDataEmpenho} onChange={(e) => setFallbackDataEmpenho(formatDateInputValue(e.target.value))} />
            </div>
          </div>
        )}

        {fileHeaders.length > 0 && importMode !== 'company' && (
          <div className="mt-4 p-3 border border-slate-800 rounded bg-slate-950/30">
            <h4 className="text-sm font-semibold text-slate-200">Mapeamento de Colunas</h4>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                ['empenho', 'Numero do Empenho'],
                ['data', 'Data do Empenho'],
                ['codigo', 'Codigo do Produto'],
                ['description', 'Descricao'],
                ['quantity', 'Quantidade'],
                ['value', 'Valor Unitario'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs text-slate-400">{label}</label>
                  <select
                    className="form-input mt-1"
                    value={(mapping as Record<string, string | undefined>)[key] || ''}
                    onChange={(e) => updateMapping({ ...mapping, [key]: e.target.value || undefined })}
                  >
                    <option value="">-- escolher coluna --</option>
                    {fileHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {matches.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-300">
            <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800">{matches.length} linha(s) lida(s)</span>
            <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800">{groups.length} empenho(s) identificado(s)</span>
            <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800">{matches.filter((m) => m.selectedId).length} item(ns) mapeado(s)</span>
            <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800">{matches.filter((m) => m.best && !m.priceMatches).length} com produto encontrado mas valor diferente</span>
            {duplicateGroupCount > 0 && <span className="px-2 py-1 rounded bg-amber-950/40 border border-amber-800 text-amber-300">{duplicateGroupCount} duplicado(s) ja existem e serao ignorados</span>}
            {importMode === 'company' && <span className="px-2 py-1 rounded bg-emerald-950/40 border border-emerald-800 text-emerald-300">Relatorio da empresa reconhecido</span>}
          </div>
        )}

        <div className="mt-4">
          <button onClick={createEmpenhos} disabled={creating || groups.length === 0} className="brand-button px-4 py-2 text-sm font-semibold" type="button">
            {creating ? 'Criando...' : 'Confirmar e baixar saldo'}
          </button>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-semibold text-slate-200">Previa do que sera lancado</h4>
          <div className="mt-2">
            {matches.length === 0 ? (
              <p className="text-xs text-slate-500">Nenhum arquivo carregado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 bg-slate-950/40">
                      <th className="px-2 py-2 text-left">Empenho</th>
                      <th className="px-2 py-2 text-left">Origem</th>
                      <th className="px-2 py-2 text-left">Sugestao</th>
                      <th className="px-2 py-2 text-right">Qtd</th>
                      <th className="px-2 py-2 text-right">Valor</th>
                      <th className="px-2 py-2 text-left">Validacao</th>
                      <th className="px-2 py-2 text-left">Confirmar Item</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {matches.map((match, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/30">
                        <td className="px-2 py-2 font-mono">
                          {match.numeroEmpenho}
                          <br /><span className="text-slate-500">Lanc: {formatAppDate(match.dataEmpenho)}</span>
                          {match.dataFaturamento ? <><br /><span className="text-slate-500">Fat: {formatAppDate(match.dataFaturamento)}</span></> : null}
                        </td>
                        <td className="px-2 py-2">{match.text || match.codigo || '-'}</td>
                        <td className="px-2 py-2">{match.best ? match.best.descricao : '-'}</td>
                        <td className="money-cell px-2 py-2 font-mono">{match.qty.toLocaleString('pt-BR')}</td>
                        <td className="money-cell px-2 py-2 font-mono">{formatCurrency(match.val)}</td>
                        <td className={`px-2 py-2 ${match.selectedId ? 'text-emerald-300' : 'text-amber-300'}`}>
                          {match.selectedId ? 'OK' : match.best ? `Valor diferente do pregao (${formatCurrency(match.best.valor_unitario)})` : 'Sem item correspondente'}
                        </td>
                        <td className="px-2 py-2">
                          <select value={match.selectedId || ''} onChange={(e) => updateMatch(idx, e.target.value || null)} className="form-input">
                            <option value="">-- selecionar --</option>
                            {licitacaoItems.map((item) => (
                              <option key={item.id} value={item.id}>{item.numero_item} - {item.codigo_produto ? `${item.codigo_produto} - ` : ''}{item.descricao}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
