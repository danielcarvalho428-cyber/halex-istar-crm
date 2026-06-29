import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDashboardStats, calculateLicitacaoSummary } from './saldo.ts';
import type { Empenho, EmpenhoItem, Licitacao, LicitacaoItem } from '../types/index.ts';

const licitacao: Licitacao = {
  id: 'lic-1',
  ano: 2026,
  orgao: 'Hospital Teste',
  numero_pregao: '10/2026',
  numero_processo: null,
  modalidade: null,
  data_abertura: '2026-01-01',
  data_vencimento: '2099-01-01',
  status: 'ganha',
  valor_total_ganho: 1000,
  observacoes: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const item: LicitacaoItem = {
  id: 'item-1',
  licitacao_id: 'lic-1',
  numero_item: 1,
  descricao: 'Produto Teste',
  marca: null,
  unidade: 'UN',
  quantidade: 10,
  valor_unitario: 100,
  valor_total: 1000,
  status: 'ganho',
  observacoes: null,
};

test('active committed value follows active empenho headers after duplicates are deleted', () => {
  const empenhos: Empenho[] = [
    {
      id: 'emp-remaining',
      licitacao_id: 'lic-1',
      numero_empenho: 'NF 001',
      data_empenho: '2026-02-01',
      orgao: 'Hospital Teste',
      valor_empenho: 300,
      status: 'ativo',
      observacoes: null,
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    },
  ];
  const staleDuplicateItemRows: EmpenhoItem[] = [
    {
      id: 'ei-remaining',
      empenho_id: 'emp-remaining',
      licitacao_item_id: 'item-1',
      quantidade_empenhada: 3,
      valor_unitario: 100,
      valor_total: 300,
    },
    {
      id: 'ei-stale-deleted-duplicate',
      empenho_id: 'emp-deleted-duplicate',
      licitacao_item_id: 'item-1',
      quantidade_empenhada: 3,
      valor_unitario: 100,
      valor_total: 300,
    },
  ];

  const summary = calculateLicitacaoSummary(licitacao, [item], empenhos, staleDuplicateItemRows);

  assert.equal(summary.valorTotalEmpenhado, 300);
  assert.equal(summary.saldoRestante, 700);
});

test('expired licitacao still shows the real remaining saldo for maintenance', () => {
  const expiredLicitacao: Licitacao = {
    ...licitacao,
    id: 'lic-expired',
    data_vencimento: '2020-01-01',
  };
  const expiredItem: LicitacaoItem = {
    ...item,
    id: 'item-expired',
    licitacao_id: 'lic-expired',
  };

  const summary = calculateLicitacaoSummary(expiredLicitacao, [expiredItem], [], []);

  assert.equal(summary.valorTotalGanho, 1000);
  assert.equal(summary.saldoRestante, 1000);
  assert.equal(summary.itemSaldos[0].saldoQuantidade, 10);
  assert.equal(summary.itemSaldos[0].saldoFinanceiro, 1000);
});

test('dashboard remaining saldo includes expired licitacoes while saldos are being reconciled', () => {
  const activeLicitacao: Licitacao = {
    ...licitacao,
    id: 'lic-active',
    data_vencimento: '2099-01-01',
  };
  const expiredLicitacao: Licitacao = {
    ...licitacao,
    id: 'lic-expired',
    data_vencimento: '2020-01-01',
  };
  const activeItem: LicitacaoItem = {
    ...item,
    id: 'item-active',
    licitacao_id: 'lic-active',
  };
  const expiredItem: LicitacaoItem = {
    ...item,
    id: 'item-expired',
    licitacao_id: 'lic-expired',
  };

  const stats = calculateDashboardStats(
    [activeLicitacao, expiredLicitacao],
    [activeItem, expiredItem],
    [],
    []
  );

  assert.equal(stats.totalRemaining, 2000);
  assert.equal(stats.availableItemsCount, 2);
});
