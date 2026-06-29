import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterHalexPowerBiRows,
  groupHalexRows,
  type HalexPowerBiRow,
} from './powerbi-halex.ts';

function row(dataAbertura: string, dataFim: string, representante = 'PAULO ROBERTO'): HalexPowerBiRow {
  return {
    cliente: 'Cliente',
    uf: 'GO',
    licit: '15/2024',
    edital: '15/2024',
    processo: 'PROC-15',
    dataAbertura,
    dataFim,
    codigoCliente: '1',
    cnpj: null,
    codigoProduto: '10',
    produto: 'Produto',
    apresentacao: null,
    fabricante: null,
    unidade: 'UN',
    numeroItem: 1,
    regional: null,
    representante,
    quantidade: 1,
    valorTotal: 10,
    quantidadeSaldo: 0,
    valorSaldo: 0,
  };
}

test('includes expired pregões opened from October 1, 2024', () => {
  const expired = row('2024-10-01', '2025-01-01');
  const result = filterHalexPowerBiRows(
    [expired],
    '2024-10-01',
    '2026-06-25',
    'PAULO ROBERTO'
  );

  assert.deepEqual(result, [expired]);
});

test('excludes pregões opened before the historical cutoff or in the future', () => {
  const result = filterHalexPowerBiRows(
    [
      row('2024-09-30', '2025-01-01'),
      row('2026-06-26', '2027-01-01'),
      row('2025-01-10', '2025-02-01', 'OUTRO REPRESENTANTE'),
    ],
    '2024-10-01',
    '2026-06-25',
    'PAULO ROBERTO'
  );

  assert.deepEqual(result, []);
});

test('uses the selected opening-date end boundary instead of expiration date', () => {
  const result = filterHalexPowerBiRows(
    [
      row('2025-03-01', '2024-01-01'),
      row('2025-03-02', '2027-01-01'),
      row('2025-02-28', '2027-01-01'),
    ],
    '2025-03-01',
    '2025-03-01',
    'PAULO ROBERTO'
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].dataAbertura, '2025-03-01');
});

test('keeps pregões outside the known UF carteira map', () => {
  const rows = [{
    ...row('2025-05-10', '2026-05-10'),
    uf: 'SP',
    regional: 'REGIONAL SUDESTE',
  }];

  const groups = groupHalexRows(rows);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].licitacao.carteira_regiao, 'REGIONAL SUDESTE');
});
