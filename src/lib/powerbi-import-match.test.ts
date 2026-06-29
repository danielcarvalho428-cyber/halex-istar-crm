import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPowerBiLicitacaoMatchSet,
  hasPowerBiLicitacaoMatch,
} from './powerbi-import-match.ts';

test('matches the same pregão despite formatting differences', () => {
  const existing = createPowerBiLicitacaoMatchSet([{
    codigo_cliente: '001234',
    numero_processo: 'PROC-88/2026',
    numero_pregao: 'PE 15/2026',
  }]);

  assert.equal(hasPowerBiLicitacaoMatch(existing, {
    codigo_cliente: '001234',
    numero_processo: 'proc 88 2026',
    numero_pregao: 'PE-15-2026',
  }), true);
});

test('does not treat equal pregão numbers from different clients as the same record', () => {
  const existing = createPowerBiLicitacaoMatchSet([{
    codigo_cliente: 'CLIENTE-A',
    numero_processo: null,
    numero_pregao: '15/2026',
  }]);

  assert.equal(hasPowerBiLicitacaoMatch(existing, {
    codigo_cliente: 'CLIENTE-B',
    numero_processo: null,
    numero_pregao: '15/2026',
  }), false);
});
