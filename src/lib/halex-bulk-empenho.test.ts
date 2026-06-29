import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchHalexInvoices,
  parseHalexInvoiceMatrix,
  type HalexInvoice,
} from './halex-bulk-empenho.ts';
import type { Licitacao, LicitacaoItem } from '../types/index.ts';

const baseLicitacao = {
  ano: 2025,
  orgao: 'Cliente',
  codigo_cliente: '509315',
  carteira_regiao: '4104',
  cidade: null,
  estado: 'GO',
  orgao_email: null,
  orgao_telefone: null,
  orgao_contato: null,
  numero_processo: null,
  modalidade: null,
  status: 'ganha' as const,
  valor_total_ganho: 100,
  observacoes: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

function item(id: string, licitacaoId: string): LicitacaoItem {
  return {
    id,
    licitacao_id: licitacaoId,
    numero_item: 1,
    descricao: 'Produto',
    marca: null,
    unidade: 'UN',
    quantidade: 1000,
    valor_unitario: 3.88,
    valor_total: 3880,
    codigo_produto: '4130',
    status: 'ganho',
    observacoes: null,
  };
}

const invoice: HalexInvoice = {
  key: '509315|0001',
  numeroEmpenho: 'NF 0001',
  nf: '0001',
  dataEmpenho: '2026-02-01',
  dataFaturamento: '2026-02-02',
  ordemVenda: '10',
  codigoCliente: '509315',
  nomeCliente: 'Cliente',
  items: [{
    codigoProduto: '4130',
    descricao: 'Produto',
    quantidadeCaixas: 1,
    quantidade: 10,
    valorUnitario: 3.88,
    valorTotal: 38.8,
  }],
};

test('parses Halex invoice blocks from a worksheet matrix', () => {
  const parsed = parseHalexInvoiceMatrix([
    ['Lançamento', 'Faturamento', 'Unidade', 'Ordem Venda SAP', 'NF', 'Código Cliente', 'Nome Cliente'],
    ['01/02/2026', '02/02/2026', 'BP01', '10', '0001', '509315', 'Cliente'],
    [],
    ['Cód. Produto', 'Desc. Produto', 'Qtd. Caixas', 'Qtd. Unidades', 'Preço Proposto (R$)', 'Total Item (R$)'],
    ['4130', 'Produto', 1, 10, 3.88, 38.8],
    ['TOTAL NF (R$): 38,80'],
  ]);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].codigoCliente, '509315');
  assert.equal(parsed[0].items[0].quantidade, 10);
});

test('uses invoice date to choose between equal client, product, and price matches', () => {
  const oldPregao: Licitacao = {
    ...baseLicitacao,
    id: 'old',
    numero_pregao: '2025',
    data_abertura: '2025-01-01',
    data_vencimento: '2025-12-31',
  };
  const currentPregao: Licitacao = {
    ...baseLicitacao,
    id: 'current',
    ano: 2026,
    numero_pregao: '2026',
    data_abertura: '2026-01-01',
    data_vencimento: '2026-12-31',
  };

  const matches = matchHalexInvoices(
    [invoice],
    [oldPregao, currentPregao],
    [item('old-item', 'old'), item('current-item', 'current')],
    []
  );

  assert.equal(matches[0].selectedLicitacaoId, 'current');
  assert.equal(matches[0].confidence, 'high');
});

test('requires manual selection when the best candidates are tied', () => {
  const first: Licitacao = {
    ...baseLicitacao,
    id: 'first',
    numero_pregao: 'A',
    data_abertura: '2026-01-01',
    data_vencimento: '2026-12-31',
  };
  const second: Licitacao = {
    ...baseLicitacao,
    id: 'second',
    numero_pregao: 'B',
    data_abertura: '2026-01-01',
    data_vencimento: '2026-12-31',
  };

  const matches = matchHalexInvoices(
    [invoice],
    [first, second],
    [item('first-item', 'first'), item('second-item', 'second')],
    []
  );

  assert.equal(matches[0].selectedLicitacaoId, null);
  assert.equal(matches[0].confidence, 'ambiguous');
});

test('marks an NF that already exists for the same client as duplicate', () => {
  const licitacao: Licitacao = {
    ...baseLicitacao,
    id: 'current',
    numero_pregao: '2026',
    data_abertura: '2026-01-01',
    data_vencimento: '2026-12-31',
  };

  const matches = matchHalexInvoices(
    [invoice],
    [licitacao],
    [item('current-item', 'current')],
    [{
      id: 'existing',
      licitacao_id: 'current',
      numero_empenho: 'NF 0001',
      data_empenho: '2026-02-01',
      orgao: 'Cliente',
      valor_empenho: 38.8,
      status: 'ativo',
      observacoes: null,
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
    }]
  );

  assert.equal(matches[0].duplicateEmpenhoId, 'existing');
});
