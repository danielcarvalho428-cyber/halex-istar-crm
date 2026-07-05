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
  clientType?: 'hospital' | 'distribuidor';
  cnpj?: string;
  carteira?: string;
};

export type CrmProduct = {
  id: string;
  code: string;
  description: string;
  presentation: string;
  brand?: string;
  unit: string;
  price: number;
  priceHospital?: number;
  priceDistribuidor?: number;
  packSize?: number;
};

export const previewClients: CrmClient[] = [
  { id: 'c1', code: '10428', name: 'Hospital Santa Clara', city: 'Goiânia', state: 'GO', contact: 'Mariana Souza', phone: '(62) 99999-1010', email: 'compras@santaclara.com.br', lastPurchase: '2026-04-08', averageCycleDays: 75, nextPurchase: '2026-06-22', total12m: 184500, status: 'Comprar agora', clientType: 'hospital', carteira: 'Centro-Oeste' },
  { id: 'c2', code: '21874', name: 'Clínica Vida Plena', city: 'Uberlândia', state: 'MG', contact: 'Rafael Lima', phone: '(34) 98888-2030', email: 'rafael@vidaplena.com.br', lastPurchase: '2026-05-12', averageCycleDays: 60, nextPurchase: '2026-07-11', total12m: 98240, status: 'Contato próximo', clientType: 'hospital', cnpj: '12.345.678/0001-90', carteira: 'Triângulo Mineiro' },
  { id: 'c3', code: '30551', name: 'Centro Médico Horizonte', city: 'Cuiabá', state: 'MT', contact: 'Ana Ribeiro', phone: '(65) 97777-4050', email: 'suprimentos@horizonte.med.br', lastPurchase: '2026-06-02', averageCycleDays: 90, nextPurchase: '2026-08-31', total12m: 247800, status: 'Em ciclo', clientType: 'distribuidor', cnpj: '98.765.432/0001-12', carteira: 'Norte' },
];

export const previewProducts: CrmProduct[] = [
  { id: 'p1', code: '100132', description: 'Cloreto de Sódio 0,9%', presentation: 'Bolsa 500 ml, sistema fechado', brand: 'Halex Istar', unit: 'CX', price: 248.9, priceHospital: 248.9, priceDistribuidor: 210.5, packSize: 30 },
  { id: 'p2', code: '100208', description: 'Glicose 5%', presentation: 'Bolsa 500 ml, caixa com 30 unidades', brand: 'Halex Istar', unit: 'CX', price: 286.5, priceHospital: 286.5, priceDistribuidor: 250.0, packSize: 30 },
  { id: 'p3', code: '100341', description: 'Ringer com Lactato', presentation: 'Bolsa 500 ml, caixa com 24 unidades', brand: 'Halex Istar', unit: 'CX', price: 271.2, priceHospital: 271.2, priceDistribuidor: 240.0, packSize: 24 },
  { id: 'p4', code: '100455', description: 'Água para Injeção', presentation: 'Frasco 10 ml, caixa com 200 unidades', brand: 'Halex Istar', unit: 'CX', price: 159.8, priceHospital: 159.8, priceDistribuidor: 140.0, packSize: 200 },
];

export function money(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function appDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00`);
  if (isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat('pt-BR').format(date);
}
