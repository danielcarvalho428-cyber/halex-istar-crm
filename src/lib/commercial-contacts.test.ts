import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendCommercialContact,
  collectCommercialRecords,
  preserveCommercialContactMarkers,
  stripCommercialContactMarkers,
  upsertCommercialOpportunity,
  upsertCommercialTask,
} from './commercial-contacts.ts';
import type { CommercialContact, CommercialOpportunity, CommercialTask } from '@/types';

const contact: CommercialContact = {
  id: 'contact-1', client_key: 'code:1', licitacao_id: 'lic-1',
  contacted_at: '2026-06-24', outcome: 'interessado', notes: 'Retornar',
  next_contact_at: '2026-06-30', created_by: 'admin', created_at: '2026-06-24T12:00:00Z',
};
const opportunity: CommercialOpportunity = {
  id: 'opp-1', client_key: 'code:1', licitacao_id: 'lic-1', title: 'Recuperação',
  stage: 'proposta', estimated_value: 1000, probability: 65, owner: 'Paulo',
  expected_close_at: '2026-07-10', notes: null, created_by: 'admin',
  created_at: '2026-06-24T12:00:00Z', updated_at: '2026-06-24T12:00:00Z',
};
const task: CommercialTask = {
  id: 'task-1', client_key: 'code:1', licitacao_id: 'lic-1', title: 'Ligar',
  type: 'ligacao', due_at: '2026-06-25', status: 'pendente', owner: null,
  notes: null, completed_at: null, created_by: 'admin',
  created_at: '2026-06-24T12:00:00Z', updated_at: '2026-06-24T12:00:00Z',
};

test('commercial markers round-trip without leaking into visible notes', () => {
  let notes = appendCommercialContact('Nota pública', contact);
  notes = upsertCommercialOpportunity(notes, opportunity);
  notes = upsertCommercialTask(notes, task);
  assert.equal(stripCommercialContactMarkers(notes), 'Nota pública');
  const records = collectCommercialRecords([{ observacoes: notes }]);
  assert.equal(records.contacts[0].id, contact.id);
  assert.equal(records.opportunities[0].id, opportunity.id);
  assert.equal(records.tasks[0].id, task.id);
});

test('imports preserve CRM markers while replacing public notes', () => {
  const existing = appendCommercialContact('Texto antigo', contact);
  const merged = preserveCommercialContactMarkers('Texto importado', existing);
  assert.equal(stripCommercialContactMarkers(merged), 'Texto importado');
  assert.equal(collectCommercialRecords([{ observacoes: merged }]).contacts.length, 1);
});

test('upsert replaces an existing record instead of duplicating it', () => {
  const first = upsertCommercialOpportunity('', opportunity);
  const updated = upsertCommercialOpportunity(first, { ...opportunity, stage: 'negociacao' });
  const records = collectCommercialRecords([{ observacoes: updated }]);
  assert.equal(records.opportunities.length, 1);
  assert.equal(records.opportunities[0].stage, 'negociacao');
});
