export type CrmClient = {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  contact: string;
  phone: string;
  email: string;
  lastPurchase: string;
  averageCycleDays: number;
  nextPurchase: string;
  total12m: number;
  status: 'Comprar agora' | 'Contato próximo' | 'Em ciclo';
};

export type CrmProduct = {
  id: string;
  code: string;
  description: string;
  presentation: string;
  unit: string;
  price: number;
};

export const previewClients: CrmClient[] = [
  { id: 'c1', code: '10428', name: 'Hospital Santa Clara', city: 'Goiânia', state: 'GO', contact: 'Mariana Souza', phone: '(62) 99999-1010', email: 'compras@santaclara.com.br', lastPurchase: '2026-04-08', averageCycleDays: 75, nextPurchase: '2026-06-22', total12m: 184500, status: 'Comprar agora' },
  { id: 'c2', code: '21874', name: 'Clínica Vida Plena', city: 'Uberlândia', state: 'MG', contact: 'Rafael Lima', phone: '(34) 98888-2030', email: 'rafael@vidaplena.com.br', lastPurchase: '2026-05-12', averageCycleDays: 60, nextPurchase: '2026-07-11', total12m: 98240, status: 'Contato próximo' },
  { id: 'c3', code: '30551', name: 'Centro Médico Horizonte', city: 'Cuiabá', state: 'MT', contact: 'Ana Ribeiro', phone: '(65) 97777-4050', email: 'suprimentos@horizonte.med.br', lastPurchase: '2026-06-02', averageCycleDays: 90, nextPurchase: '2026-08-31', total12m: 247800, status: 'Em ciclo' },
];

export const previewProducts: CrmProduct[] = [
  { id: 'p1', code: '100132', description: 'Cloreto de Sódio 0,9%', presentation: 'Bolsa 500 ml, sistema fechado', unit: 'CX', price: 248.9 },
  { id: 'p2', code: '100208', description: 'Glicose 5%', presentation: 'Bolsa 500 ml, caixa com 30 unidades', unit: 'CX', price: 286.5 },
  { id: 'p3', code: '100341', description: 'Ringer com Lactato', presentation: 'Bolsa 500 ml, caixa com 24 unidades', unit: 'CX', price: 271.2 },
  { id: 'p4', code: '100455', description: 'Água para Injeção', presentation: 'Frasco 10 ml, caixa com 200 unidades', unit: 'CX', price: 159.8 },
];

export function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function appDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T12:00:00`));
}
