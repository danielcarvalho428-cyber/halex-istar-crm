'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Trash2, 
  AlertCircle, 
  ListPlus,
  Upload
} from 'lucide-react';
import Link from 'next/link';
import { db } from '../../../../lib/db';
import { formatDateInputValue, toIsoDate } from '../../../../lib/date';
import { Licitacao, LicitacaoStatus, ItemStatus, ProductCatalogItem } from '../../../../types';

interface FormItem {
  id?: string;
  numero_item: number;
  descricao: string;
  marca: string;
  unidade: string;
  codigo_produto: string;
  quantidade: number;
  preco_minimo: string;
  valor_unitario: string;
  status: ItemStatus;
  observacoes: string;
}

type FormItemValue = FormItem[keyof FormItem];
type ImportRow = Record<string, unknown>;
type ImportMatrix = string[][];

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function pickValue(row: ImportRow, headers: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  const header = headers.find((h) => {
    const normalizedHeader = normalizeHeader(h);
    return normalizedCandidates.some((candidate) => (
      normalizedHeader === candidate ||
      (candidate.length >= 4 && normalizedHeader.includes(candidate)) ||
      (normalizedHeader.length >= 4 && candidate.includes(normalizedHeader))
    ));
  });
  const raw = header ? row[header] : undefined;
  return raw == null ? '' : String(raw).trim();
}

function hasHeaderMatch(cells: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  return cells.some((cell) => normalizedCandidates.includes(normalizeHeader(cell)));
}

function matrixToRows(matrix: ImportMatrix) {
  const meaningfulRows = matrix
    .map((row) => row.map((cell) => String(cell ?? '').trim()))
    .filter((row) => row.some(Boolean));

  const allCandidates = [
    'codigo', 'cod', 'codigoproduto', 'produto', 'descricao', 'item', 'material',
    'quantidade', 'quant', 'qtd', 'qtde', 'quantedital', 'quantidadeedital', 'quantidadedoedital', 'qtdedital', 'qtdedoedital', 'minimo', 'precominimo', 'valorautorizado', 'valorunitario', 'marca', 'unidade'
  ];

  const headerIndex = meaningfulRows.findIndex((row) => hasHeaderMatch(row, allCandidates));
  if (headerIndex >= 0) {
    const headers = meaningfulRows[headerIndex].map((cell, idx) => cell || `coluna_${idx + 1}`);
    return meaningfulRows.slice(headerIndex + 1).map((row) => {
      const record: ImportRow = {};
      headers.forEach((header, idx) => {
        record[header] = row[idx] || '';
      });
      return record;
    });
  }

  return meaningfulRows.map((row) => ({
    codigo: row[0] || '',
    descricao: row[1] || '',
    marca: row[2] || '',
    unidade: row[3] || '',
    quantidade: row[4] || '',
    preco_minimo: row[5] || '',
    valor_unitario: '',
  }));
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
  const digitsOnly = value.replace(/\D/g, '');
  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

function formatDecimalText(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(value);
}

export default function NovaLicitacaoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ProductCatalogItem[]>([]);
  const [importingItems, setImportingItems] = useState(false);
  const [itemsImportMsg, setItemsImportMsg] = useState<string | null>(null);

  // Bidding details state
  const [ano, setAno] = useState<number>(2026);
  const [orgao, setOrgao] = useState('');
  const [numeroPregao, setNumeroPregao] = useState('');
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [modalidade, setModalidade] = useState('Pregão Eletrônico');
  const [dataAbertura, setDataAbertura] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [codigoCliente, setCodigoCliente] = useState('');
  const [carteiraRegiao, setCarteiraRegiao] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [orgaoEmail, setOrgaoEmail] = useState('');
  const [orgaoTelefone, setOrgaoTelefone] = useState('');
  const [orgaoContato, setOrgaoContato] = useState('');
  const [status, setStatus] = useState<LicitacaoStatus>('em_andamento');
  const [observacoes, setObservacoes] = useState('');

  // Items rows state (start with one empty row)
  const [items, setItems] = useState<FormItem[]>([
    {
      numero_item: 1,
      descricao: '',
      marca: '',
      unidade: 'Unidade',
      codigo_produto: '',
      quantidade: 100,
      preco_minimo: '',
      valor_unitario: '',
      status: 'pendente',
      observacoes: ''
    }
  ]);

  useEffect(() => {
    db.getProductCatalog()
      .then(setCatalog)
      .catch((err) => {
        console.error(err);
      });
  }, []);

  const catalogByCode = useMemo(() => {
    const map = new Map<string, ProductCatalogItem>();
    catalog.forEach((product) => {
      map.set(product.codigo_produto.trim().toUpperCase(), product);
    });
    return map;
  }, [catalog]);

  // Append new item row
  const handleAddItemRow = () => {
    const nextNum = items.length > 0 ? Math.max(...items.map(i => i.numero_item)) + 1 : 1;
    setItems([
      ...items,
      {
        numero_item: nextNum,
        descricao: '',
        marca: '',
        unidade: 'Unidade',
        codigo_produto: '',
        quantidade: 100,
        preco_minimo: '',
        valor_unitario: '',
        status: 'pendente',
        observacoes: ''
      }
    ]);
  };

  // Remove item row
  const handleRemoveItemRow = (index: number) => {
    if (items.length === 1) {
      alert('A licitação deve conter pelo menos 1 item.');
      return;
    }
    const newItems = items.filter((_, idx) => idx !== index);
    // Re-index item numbers
    const reindexed = newItems.map((item, idx) => ({
      ...item,
      numero_item: idx + 1
    }));
    setItems(reindexed);
  };

  // Update item field
  const handleUpdateItemField = (index: number, field: keyof FormItem, val: FormItemValue) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [field]: val
    };
    setItems(updated);
  };

  const handleValorUnitarioChange = (index: number, value: string) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      valor_unitario: value,
      status: parseNumber(value) > 0 ? 'ganho' : updated[index].status,
    };
    setItems(updated);
  };

  const applyProductByCode = (index: number, code: string) => {
    const normalizedCode = code.trim().toUpperCase();
    const product = catalogByCode.get(normalizedCode);
    if (!normalizedCode || !product) return;

    setItems((current) => current.map((item, idx) => {
      if (idx !== index) return item;
      return {
        ...item,
        codigo_produto: product.codigo_produto,
        descricao: product.descricao || item.descricao,
        marca: product.marca || item.marca,
        unidade: product.unidade || item.unidade,
      };
    }));
  };

  const handleItemsImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingItems(true);
    setItemsImportMsg(null);
    setErrorMsg(null);

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      let matrix: ImportMatrix = [];

      if (extension === 'xlsx' || extension === 'xls') {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        matrix = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, defval: '' });
      } else {
        const text = await file.text();
        const parsed = Papa.parse<string[]>(text, {
          skipEmptyLines: true,
        });
        if (parsed.errors.length) {
          throw new Error(parsed.errors[0].message);
        }
        matrix = parsed.data;
      }

      const rows = matrixToRows(matrix);
      const firstRow = rows[0] as ImportRow | undefined;
      const detectedColumns = firstRow ? Object.keys(firstRow).filter((key) => String(firstRow[key] ?? '').trim() || !key.startsWith('coluna_')).slice(0, 8) : [];
      const importedItems = rows.map((row, idx): FormItem | null => {
        const headers = Object.keys(row);
        const codigo = pickValue(row, headers, ['codigo', 'cod', 'codigoproduto', 'codproduto', 'codigoitem', 'coditem', 'sku', 'referencia', 'ref']);
        const catalogProduct = codigo ? catalogByCode.get(codigo.trim().toUpperCase()) : undefined;
        const descricao = pickValue(row, headers, ['descricao', 'desc', 'descricaoproduto', 'produto', 'nome', 'nomeproduto', 'item', 'material', 'insumo']) || catalogProduct?.descricao || '';
        const quantidade = parseQuantity(pickValue(row, headers, ['quantedital', 'quantidadeedital', 'quantidadedoedital', 'quantdoedital', 'qtdedital', 'qtdeedital', 'qtdedoedital', 'qtdedoedital', 'quant', 'quantidade', 'qtd', 'qt', 'qtde', 'qde', 'quantidadeparticipando', 'qtdparticipando', 'qtdeparticipacao', 'quantidadeautorizada', 'qtdautorizada', 'qtdcotada', 'quantidadecotada']));
        const precoMinimo = parseNumber(pickValue(row, headers, ['minimo', 'precominimo', 'precominimoautorizado', 'precoautorizado', 'precoaprovado', 'precomaximo', 'valorminimo', 'valorminimoautorizado', 'valorautorizado', 'valoraprovado']));

        if (!codigo && !descricao && quantidade <= 0 && precoMinimo <= 0) return null;

        return {
          numero_item: parseNumber(pickValue(row, headers, ['numeroitem', 'itemnumero', 'nitem', 'item', 'lote'])) || idx + 1,
          descricao,
          marca: pickValue(row, headers, ['marca', 'fabricante', 'laboratorio']) || catalogProduct?.marca || '',
          unidade: pickValue(row, headers, ['unidade', 'und', 'un', 'u', 'embalagem']) || catalogProduct?.unidade || 'Unidade',
          codigo_produto: codigo || catalogProduct?.codigo_produto || '',
          quantidade: quantidade > 0 ? quantidade : 1,
          preco_minimo: precoMinimo > 0 ? formatDecimalText(precoMinimo) : '',
          valor_unitario: '',
          status: 'pendente',
          observacoes: '',
        };
      }).filter((item): item is FormItem => item !== null);

      if (importedItems.length === 0) {
        throw new Error(`Nenhum item valido foi encontrado na planilha. Colunas lidas: ${detectedColumns.join(', ') || 'nenhuma'}.`);
      }

      const reindexed = importedItems.map((item, idx) => ({
        ...item,
        numero_item: idx + 1,
      }));
      const quantityCount = reindexed.filter((item) => item.quantidade > 1).length;
      setItems(reindexed);
      setItemsImportMsg(`${reindexed.length} item(ns) importado(s). Quantidade lida em ${quantityCount} item(ns).`);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao importar a planilha de itens.');
    } finally {
      setImportingItems(false);
      e.target.value = '';
    }
  };

  // Submit Form Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Validations
    if (!orgao.trim()) {
      setErrorMsg('O órgão comprador é obrigatório.');
      return;
    }
    if (!numeroPregao.trim()) {
      setErrorMsg('O número do pregão é obrigatório.');
      return;
    }

    const normalizedDataAbertura = dataAbertura ? toIsoDate(dataAbertura) : '';
    const normalizedDataVencimento = dataVencimento ? toIsoDate(dataVencimento) : '';
    if (dataAbertura && !normalizedDataAbertura) {
      setErrorMsg('Digite a data de abertura no formato dia/mes/ano.');
      return;
    }
    if (dataVencimento && !normalizedDataVencimento) {
      setErrorMsg('Digite a data de vencimento no formato dia/mes/ano.');
      return;
    }

    // Validate items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.descricao.trim()) {
        setErrorMsg(`Preencha a descrição do item #${item.numero_item}.`);
        return;
      }
      if (item.quantidade <= 0) {
        setErrorMsg(`A quantidade do item #${item.numero_item} deve ser maior que zero.`);
        return;
      }
      if (parseNumber(item.valor_unitario) < 0) {
        setErrorMsg(`O valor unitário do item #${item.numero_item} não pode ser negativo.`);
        return;
      }
      if (item.preco_minimo !== '' && parseNumber(item.preco_minimo) < 0) {
        setErrorMsg(`O preco minimo do item #${item.numero_item} nao pode ser negativo.`);
        return;
      }
    }

    setLoading(true);
    try {
      const newLicitacao: Omit<Licitacao, 'created_at' | 'updated_at'> = {
        id: '', // Generated in DB layer
        ano,
        orgao: orgao.trim(),
        numero_pregao: numeroPregao.trim(),
        numero_processo: numeroProcesso.trim() || null,
        modalidade: modalidade.trim() || null,
        data_abertura: normalizedDataAbertura || null,
        data_vencimento: normalizedDataVencimento || null,
        codigo_cliente: codigoCliente.trim() || null,
        carteira_regiao: carteiraRegiao || null,
        cidade: cidade.trim() || null,
        estado: estado.trim().toUpperCase() || null,
        orgao_email: orgaoEmail.trim() || null,
        orgao_telefone: orgaoTelefone.trim() || null,
        orgao_contato: orgaoContato.trim() || null,
        status,
        valor_total_ganho: 0, // Calculated in DB layer based on won items
        observacoes: observacoes.trim() || null,
      };

      const itemsToSend = items.map(item => ({
        numero_item: item.numero_item,
        descricao: item.descricao.trim(),
        marca: item.marca.trim() || null,
        unidade: item.unidade.trim(),
        codigo_produto: item.codigo_produto.trim() || null,
        quantidade: Number(item.quantidade),
        preco_minimo: item.preco_minimo === '' ? null : parseNumber(item.preco_minimo),
        valor_unitario: item.valor_unitario === '' ? 0 : parseNumber(item.valor_unitario),
        status: item.status,
        observacoes: item.observacoes.trim() || null
      }));

      await db.saveLicitacao(newLicitacao, itemsToSend);
      alert('Licitação cadastrada com sucesso!');
      router.push('/dashboard/licitacoes');
    } catch (err) {
      console.error(err);
      setErrorMsg('Ocorreu um erro ao salvar a licitação. Verifique os dados.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const totalBidded = items.reduce((sum, i) => sum + (i.quantidade * parseNumber(i.valor_unitario)), 0);
  const totalWon = items
    .filter(i => i.status === 'ganho')
    .reduce((sum, i) => sum + (i.quantidade * parseNumber(i.valor_unitario)), 0);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/licitacoes"
          className="p-2 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-all"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-3xl font-semibold text-slate-50">Nova Licitação</h1>
          <p className="text-slate-400 text-sm mt-1">Registre um pregão e seus respectivos itens de cotação.</p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Step 1: Bidding metadata */}
        <div className="glass-card p-6 border-slate-800 bg-slate-900/40">
          <h3 className="text-base font-bold text-slate-100 mb-6 pb-2 border-b border-slate-900 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-bold">1</span>
            <span>Dados da Licitação</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Ano */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Ano</label>
              <input
                type="number"
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                className="form-input bg-slate-950 border-slate-800"
                min={2000}
                max={2100}
                required
              />
            </div>

            {/* Órgão */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Órgão Comprador</label>
                <input
                  type="text"
                  value={orgao}
                  onChange={(e) => setOrgao(e.target.value)}
                  placeholder="Ex: Secretaria Estadual de Saúde de SP"
                  className="form-input bg-slate-950 border-slate-800"
                  required
                />
              </div>

              {/* Código do Órgão */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Código do Órgão</label>
                <input
                  type="text"
                  value={codigoCliente}
                  onChange={(e) => setCodigoCliente(e.target.value)}
                  placeholder="Ex: ORG-12345"
                  className="form-input bg-slate-950 border-slate-800"
                />
              </div>

              {/* Carteira Região */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Carteira / Região</label>
                <select
                  value={carteiraRegiao}
                  onChange={(e) => setCarteiraRegiao(e.target.value)}
                  className="form-input bg-slate-950 border-slate-800"
                >
                  <option value="">Selecione</option>
                  <option value="4104">4104</option>
                  <option value="4648">4648</option>
                  <option value="4413">4413</option>
                </select>
              </div>

              {/* Cidade */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cidade</label>
                <input
                  type="text"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  placeholder="Ex: Campinas"
                  className="form-input bg-slate-950 border-slate-800"
                />
              </div>

              {/* Estado */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Estado</label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="form-input bg-slate-950 border-slate-800"
                >
                  <option value="">Selecione</option>
                  <option value="GO">GO</option>
                  <option value="TO">TO</option>
                  <option value="MG">MG</option>
                  <option value="PA">PA</option>
                  <option value="MA">MA</option>
                  <option value="MT">MT</option>
                </select>
              </div>

              {/* Contato Responsável */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Contato Responsável</label>
                <input
                  type="text"
                  value={orgaoContato}
                  onChange={(e) => setOrgaoContato(e.target.value)}
                  placeholder="Ex: Maria - Compras"
                  className="form-input bg-slate-950 border-slate-800"
                />
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Email do Órgão</label>
                <input
                  type="email"
                  value={orgaoEmail}
                  onChange={(e) => setOrgaoEmail(e.target.value)}
                  placeholder="Ex: compras@orgao.gov.br"
                  className="form-input bg-slate-950 border-slate-800"
                />
              </div>

              {/* Telefone */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Telefone do Órgão</label>
                <input
                  type="tel"
                  value={orgaoTelefone}
                  onChange={(e) => setOrgaoTelefone(e.target.value)}
                  placeholder="Ex: (62) 99999-9999"
                  className="form-input bg-slate-950 border-slate-800"
                />
              </div>

              {/* Numero Pregao */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Numero do Pregao</label>
                <input
                  type="text"
                  value={numeroPregao}
                  onChange={(e) => setNumeroPregao(e.target.value)}
                  placeholder="Ex: 45/2026"
                  className="form-input bg-slate-950 border-slate-800"
                  required
                />
              </div>

              {/* Número Processo */}
              <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Número do Processo</label>
              <input
                type="text"
                value={numeroProcesso}
                onChange={(e) => setNumeroProcesso(e.target.value)}
                placeholder="Ex: 50212/2026"
                className="form-input bg-slate-950 border-slate-800"
              />
            </div>

            {/* Modalidade */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Modalidade</label>
              <input
                type="text"
                value={modalidade}
                onChange={(e) => setModalidade(e.target.value)}
                className="form-input bg-slate-950 border-slate-800"
              />
            </div>

            {/* Data Abertura */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Data de Abertura</label>
              <input
                type="text"
                inputMode="numeric"
                value={dataAbertura}
                onChange={(e) => setDataAbertura(formatDateInputValue(e.target.value))}
                placeholder="dd/mm/aaaa"
                className="form-input bg-slate-950 border-slate-800"
              />
            </div>

            {/* Data Vencimento */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Data de Vencimento</label>
              <input
                type="text"
                inputMode="numeric"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(formatDateInputValue(e.target.value))}
                placeholder="dd/mm/aaaa"
                className="form-input bg-slate-950 border-slate-800"
              />
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Status Principal</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as LicitacaoStatus)}
                className="form-input bg-slate-950 border-slate-800"
              >
                <option value="em_andamento">Em Andamento</option>
                <option value="ganha">Ganha (Ativa)</option>
                <option value="perdida">Perdida</option>
                <option value="cancelada">Cancelada</option>
                <option value="parcial">Parcial (Ganha alguns itens)</option>
              </select>
            </div>

            {/* Observações */}
            <div className="flex flex-col gap-1.5 md:col-span-3">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Observações Gerais</label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Anotações sobre validade da ata, recurso, prazos, etc."
                rows={3}
                className="form-input bg-slate-950 border-slate-800 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Step 2: Items Grid */}
        <div className="glass-card p-6 border-slate-800 bg-slate-900/40">
          <div className="flex justify-between items-center mb-6 pb-2 border-b border-slate-900">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">2</span>
              <span>Itens da Licitação</span>
            </h3>
            <div className="flex flex-wrap justify-end gap-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold rounded cursor-pointer">
                <Upload size={14} />
                <span>{importingItems ? 'Importando...' : 'Importar Itens Excel'}</span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleItemsImport}
                  disabled={importingItems}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={handleAddItemRow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 text-xs font-semibold rounded cursor-pointer"
              >
                <Plus size={14} />
                <span>Adicionar Item</span>
              </button>
            </div>
          </div>

          <div className="mb-5 rounded-lg border border-slate-800 bg-slate-950/35 p-3 text-xs text-slate-400">
            <span>Importe CSV/XLSX com colunas como codigo, descricao/produto, marca, unidade, quantidade e preco minimo/valor autorizado.</span>
            {itemsImportMsg && <span className="block mt-1 text-cyan-300">{itemsImportMsg}</span>}
          </div>

          <datalist id="product-code-options">
            {catalog.slice(0, 500).map((product) => (
              <option
                key={product.codigo_produto}
                value={product.codigo_produto}
                label={product.descricao}
              />
            ))}
          </datalist>
          <datalist id="brand-options">
            <option value="Halex Istar" />
            <option value="Isofarma" />
          </datalist>

          {/* Interactive Row Entries */}
          <div className="space-y-6">
            {items.map((item, index) => (
              <div 
                key={index} 
                className="p-4 rounded-xl border border-slate-950 bg-slate-950/20 flex flex-col gap-4 relative"
              >
                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => handleRemoveItemRow(index)}
                  className="absolute top-4 right-4 text-slate-500 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Excluir Item"
                >
                  <Trash2 size={14} />
                </button>

                {/* Line Item Indicator */}
                <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
                  <ListPlus size={14} className="text-indigo-400" />
                  <span>Item #{item.numero_item}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Descrição */}
                  <div className="flex flex-col gap-1 md:col-span-4">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Descrição do Insumo</label>
                    <input
                      type="text"
                      value={item.descricao}
                      onChange={(e) => handleUpdateItemField(index, 'descricao', e.target.value)}
                      placeholder="Ex: Soro Fisiológico 500ml"
                      className="form-input py-1.5 text-xs bg-slate-950 border-slate-800"
                      required
                    />
                  </div>

                  {/* Marca */}
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Marca</label>
                    <input
                      type="text"
                      value={item.marca}
                      onChange={(e) => handleUpdateItemField(index, 'marca', e.target.value)}
                      list="brand-options"
                      placeholder="Ex: Halex Istar ou Isofarma"
                      className="form-input py-1.5 text-xs bg-slate-950 border-slate-800"
                    />
                  </div>

                  {/* Código do Produto */}
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Código do Produto</label>
                    <input
                      type="text"
                      value={item.codigo_produto}
                      onChange={(e) => {
                        handleUpdateItemField(index, 'codigo_produto', e.target.value);
                        applyProductByCode(index, e.target.value);
                      }}
                      onBlur={(e) => applyProductByCode(index, e.target.value)}
                      list="product-code-options"
                      placeholder="SKU ou código interno"
                      className="form-input py-1.5 text-xs bg-slate-950 border-slate-800"
                    />
                  </div>

                  {/* Unidade */}
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Unidade</label>
                    <input
                      type="text"
                      value={item.unidade}
                      onChange={(e) => handleUpdateItemField(index, 'unidade', e.target.value)}
                      placeholder="Ex: Frasco"
                      className="form-input py-1.5 text-xs bg-slate-950 border-slate-800"
                      required
                    />
                  </div>

                  {/* Quantidade */}
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Qtd</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatQuantity(item.quantidade)}
                      onChange={(e) => handleUpdateItemField(index, 'quantidade', parseQuantity(e.target.value))}
                      className="form-input py-1.5 text-xs bg-slate-950 border-slate-800 font-mono"
                      required
                    />
                  </div>

                  {/* Valor Unitário */}
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Minimo</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.preco_minimo}
                      onChange={(e) => handleUpdateItemField(index, 'preco_minimo', e.target.value)}
                      placeholder="Ex: 0,32"
                      className="form-input py-1.5 text-xs bg-slate-950 border-slate-800 font-mono"
                    />
                  </div>

                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Val. Unitário</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.valor_unitario}
                      onChange={(e) => handleValorUnitarioChange(index, e.target.value)}
                      placeholder="Ex: 0,32"
                      className="form-input py-1.5 text-xs bg-slate-950 border-slate-800 font-mono"
                    />
                  </div>

                  {/* Status Item */}
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Resultado</label>
                    <select
                      value={item.status}
                      onChange={(e) => handleUpdateItemField(index, 'status', e.target.value as ItemStatus)}
                      className="form-input py-1.5 text-xs bg-slate-950 border-slate-800"
                    >
                      <option value="pendente">Pendente</option>
                      <option value="ganho">Ganho (Com Saldo)</option>
                      <option value="perdido">Perdido</option>
                      <option value="cancelado">Cancelado</option>
                      <option value="desclassificado">Desclassificado</option>
                    </select>
                  </div>

                  {/* Observacoes item */}
                  <div className="flex flex-col gap-1 md:col-span-8">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Observações do Item</label>
                    <input
                      type="text"
                      value={item.observacoes}
                      onChange={(e) => handleUpdateItemField(index, 'observacoes', e.target.value)}
                      placeholder="Motivo de perda, prazo de entrega especial, etc."
                      className="form-input py-1.5 text-xs bg-slate-950 border-slate-800"
                    />
                  </div>

                  {/* Calc Total Inline */}
                  <div className="flex flex-col gap-1 md:col-span-2 items-end justify-center pt-4 md:pt-0">
                    <span className="text-[10px] text-slate-500 uppercase font-medium">Subtotal</span>
                    <span className="text-xs font-bold text-slate-300 font-mono">
                      {formatCurrency(item.quantidade * parseNumber(item.valor_unitario))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Submittals summary */}
          <div className="mt-8 pt-6 border-t border-slate-950 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs">
            <div className="flex flex-wrap gap-6 text-slate-400 font-medium">
              <div>
                <span>Valor Total Cotado: </span>
                <span className="money-value font-bold text-slate-200 font-mono">{formatCurrency(totalBidded)}</span>
              </div>
              <div>
                <span>Valor Homologado (Ganho): </span>
                <span className="money-value font-bold text-emerald-400 font-mono">{formatCurrency(totalWon)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAddItemRow}
              className="brand-secondary flex items-center gap-1 rounded px-4 py-2 text-xs font-semibold cursor-pointer"
            >
              <Plus size={14} />
              <span>Adicionar Outro Item</span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="sticky bottom-4 z-30 flex flex-col gap-3 rounded-lg border border-amber-200/10 bg-black/80 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-stone-500">
            <span className="font-semibold text-stone-300">{items.length}</span> item(ns) · total homologado{' '}
            <span className="money-value font-mono font-bold text-emerald-300">{formatCurrency(totalWon)}</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Link
            href="/dashboard/licitacoes"
            className="brand-secondary rounded px-5 py-2.5 text-center text-sm font-semibold transition-all"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="brand-button flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-bold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Save size={16} />
                <span>Salvar Licitação</span>
              </>
            )}
          </button>
          </div>
        </div>
      </form>
    </div>
  );
}
