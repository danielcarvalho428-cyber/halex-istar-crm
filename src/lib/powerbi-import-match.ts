export type PowerBiLicitacaoIdentity = {
  codigo_cliente?: string | null;
  numero_processo?: string | null;
  numero_pregao: string;
};

function normalizeIdentityPart(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
}

export function getPowerBiLicitacaoMatchKeys(value: PowerBiLicitacaoIdentity) {
  const client = normalizeIdentityPart(value.codigo_cliente);
  const process = normalizeIdentityPart(value.numero_processo);
  const pregao = normalizeIdentityPart(value.numero_pregao);
  const keys: string[] = [];

  if (client && pregao) keys.push(`client:${client}|pregao:${pregao}`);
  if (process && pregao) keys.push(`process:${process}|pregao:${pregao}`);
  if (!client && !process && pregao) keys.push(`pregao:${pregao}`);

  return keys;
}

export function createPowerBiLicitacaoMatchSet(values: PowerBiLicitacaoIdentity[]) {
  return new Set(values.flatMap(getPowerBiLicitacaoMatchKeys));
}

export function hasPowerBiLicitacaoMatch(
  existingKeys: ReadonlySet<string>,
  value: PowerBiLicitacaoIdentity
) {
  return getPowerBiLicitacaoMatchKeys(value).some((key) => existingKeys.has(key));
}
