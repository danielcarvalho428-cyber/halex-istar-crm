import type { CommercialContact, CommercialOpportunity, CommercialTask } from '@/types';

const CONTACT_MARKER = /\[LICITASALDO_CRM_V1:([^\]]+)\]/g;
const OPPORTUNITY_MARKER = /\[LICITASALDO_OPPORTUNITY_V1:([^\]]+)\]/g;
const TASK_MARKER = /\[LICITASALDO_TASK_V1:([^\]]+)\]/g;
const ALL_COMMERCIAL_MARKERS = /\[(?:LICITASALDO_CRM_V1|LICITASALDO_OPPORTUNITY_V1|LICITASALDO_TASK_V1):[^\]]+\]/g;

export function encodeCommercialContact(contact: CommercialContact) {
  return `[LICITASALDO_CRM_V1:${encodeURIComponent(JSON.stringify(contact))}]`;
}

export function encodeCommercialOpportunity(opportunity: CommercialOpportunity) {
  return `[LICITASALDO_OPPORTUNITY_V1:${encodeURIComponent(JSON.stringify(opportunity))}]`;
}

export function encodeCommercialTask(task: CommercialTask) {
  return `[LICITASALDO_TASK_V1:${encodeURIComponent(JSON.stringify(task))}]`;
}

export function extractCommercialContacts(observacoes?: string | null) {
  if (!observacoes) return [] as CommercialContact[];

  const contacts: CommercialContact[] = [];
  for (const match of observacoes.matchAll(CONTACT_MARKER)) {
    try {
      const parsed = JSON.parse(decodeURIComponent(match[1])) as CommercialContact;
      if (parsed?.id && parsed?.client_key && parsed?.contacted_at) contacts.push(parsed);
    } catch {
      // Ignore malformed legacy markers without hiding the remaining notes.
    }
  }
  return contacts;
}

export function extractCommercialContactMarkers(observacoes?: string | null) {
  return observacoes?.match(ALL_COMMERCIAL_MARKERS)?.join('\n') || '';
}

export function stripCommercialContactMarkers(observacoes?: string | null) {
  return (observacoes || '').replace(ALL_COMMERCIAL_MARKERS, '').replace(/\n{3,}/g, '\n\n').trim();
}

export function appendCommercialContact(observacoes: string | null | undefined, contact: CommercialContact) {
  return [observacoes?.trim(), encodeCommercialContact(contact)].filter(Boolean).join('\n');
}

export function preserveCommercialContactMarkers(
  nextObservacoes: string | null | undefined,
  previousObservacoes: string | null | undefined
) {
  const markers = extractCommercialContactMarkers(previousObservacoes);
  return [stripCommercialContactMarkers(nextObservacoes), markers].filter(Boolean).join('\n') || null;
}

function parseMarkers<T>(observacoes: string | null | undefined, pattern: RegExp) {
  if (!observacoes) return [] as T[];
  const result: T[] = [];
  for (const match of observacoes.matchAll(pattern)) {
    try {
      result.push(JSON.parse(decodeURIComponent(match[1])) as T);
    } catch {
      // Ignore one malformed marker and continue reading the remaining CRM history.
    }
  }
  return result;
}

function encodeMarker(type: 'OPPORTUNITY' | 'TASK', value: CommercialOpportunity | CommercialTask) {
  return type === 'OPPORTUNITY'
    ? encodeCommercialOpportunity(value as CommercialOpportunity)
    : encodeCommercialTask(value as CommercialTask);
}

function replaceRecord(
  observacoes: string | null | undefined,
  pattern: RegExp,
  recordId: string,
  marker: string
) {
  const retained = (observacoes || '').split('\n').filter((line) => {
    const match = Array.from(line.matchAll(pattern))[0];
    if (!match) return true;
    try {
      return (JSON.parse(decodeURIComponent(match[1])) as { id?: string }).id !== recordId;
    } catch {
      return true;
    }
  }).join('\n').trim();
  return [retained, marker].filter(Boolean).join('\n');
}

export function extractCommercialOpportunities(observacoes?: string | null) {
  return parseMarkers<CommercialOpportunity>(observacoes, OPPORTUNITY_MARKER);
}

export function extractCommercialTasks(observacoes?: string | null) {
  return parseMarkers<CommercialTask>(observacoes, TASK_MARKER);
}

export function upsertCommercialOpportunity(observacoes: string | null | undefined, opportunity: CommercialOpportunity) {
  return replaceRecord(observacoes, OPPORTUNITY_MARKER, opportunity.id, encodeMarker('OPPORTUNITY', opportunity));
}

export function upsertCommercialTask(observacoes: string | null | undefined, task: CommercialTask) {
  return replaceRecord(observacoes, TASK_MARKER, task.id, encodeMarker('TASK', task));
}

export function collectCommercialRecords(licitacoes: { observacoes?: string | null }[]) {
  const contacts = licitacoes.flatMap((item) => extractCommercialContacts(item.observacoes));
  const opportunities = licitacoes.flatMap((item) => extractCommercialOpportunities(item.observacoes));
  const tasks = licitacoes.flatMap((item) => extractCommercialTasks(item.observacoes));
  return {
    contacts: Array.from(new Map(contacts.map((item) => [item.id, item])).values()),
    opportunities: Array.from(new Map(opportunities.map((item) => [item.id, item])).values()),
    tasks: Array.from(new Map(tasks.map((item) => [item.id, item])).values()),
  };
}
