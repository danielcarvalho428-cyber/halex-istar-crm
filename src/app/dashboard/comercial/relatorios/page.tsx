'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Printer, TrendingUp } from 'lucide-react';
import CommercialNav from '@/components/CommercialNav';
import { collectCommercialRecords } from '@/lib/commercial-contacts';
import { db } from '@/lib/db';
import { buildPurchaseTrends } from '@/lib/purchase-trends';
import type { Empenho, Licitacao } from '@/types';

function money(value: number) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }

export default function CommercialReportsPage() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [empenhos, setEmpenhos] = useState<Empenho[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const id = window.setTimeout(() => void db.getAppData().then((data) => { setLicitacoes(data.licitacoes); setEmpenhos(data.empenhos); }).finally(() => setLoading(false)), 0); return () => clearTimeout(id); }, []);
  const trends = useMemo(() => buildPurchaseTrends(licitacoes, empenhos), [licitacoes, empenhos]);
  const records = useMemo(() => collectCommercialRecords(licitacoes), [licitacoes]);
  const open = records.opportunities.filter((item) => !['recuperado', 'perdido'].includes(item.stage));
  const recovered = records.opportunities.filter((item) => item.stage === 'recuperado');
  const lost = records.opportunities.filter((item) => item.stage === 'perdido');
  const pipeline = open.reduce((sum, item) => sum + item.estimated_value, 0);
  const forecast = open.reduce((sum, item) => sum + item.estimated_value * item.probability / 100, 0);
  const recoveredValue = recovered.reduce((sum, item) => sum + item.estimated_value, 0);
  const conversion = recovered.length + lost.length ? recovered.length / (recovered.length + lost.length) * 100 : 0;
  const byRegion = useMemo(() => {
    const map = new Map<string, { clients: number; urgent: number; value: number }>();
    trends.forEach((trend) => {
      const current = map.get(trend.region) || { clients: 0, urgent: 0, value: 0 };
      current.clients += 1; if (['atrasado', 'agora'].includes(trend.priority)) current.urgent += 1;
      current.value += records.opportunities.filter((item) => item.client_key === trend.clientKey && !['perdido'].includes(item.stage)).reduce((sum, item) => sum + item.estimated_value, 0);
      map.set(trend.region, current);
    });
    return [...map.entries()].sort((a, b) => b[1].value - a[1].value);
  }, [records.opportunities, trends]);
  const exportCsv = () => {
    const rows = [['Região','Clientes','Prioridade imediata','Pipeline'], ...byRegion.map(([region, row]) => [region, row.clients, row.urgent, row.value])];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"','""')}"`).join(';')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `relatorio-comercial-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  if (loading) return <div className="py-20 text-center text-sm text-stone-500">Gerando relatório...</div>;
  return <div className="space-y-6 print:bg-white">
    <header className="page-hero flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="lumina-kicker">CRM Comercial</p><h1 className="mt-2 text-3xl font-semibold">Relatório executivo</h1><p className="mt-2 text-sm text-stone-500">Pipeline, conversão, receita recuperada e prioridades por região.</p></div><div className="flex gap-2 print:hidden"><button onClick={exportCsv} className="brand-secondary inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold"><Download size={15} />CSV</button><button onClick={() => window.print()} className="brand-button inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold"><Printer size={15} />Imprimir / PDF</button></div></header>
    <div className="print:hidden"><CommercialNav /></div>
    <section className="metric-strip grid grid-cols-2 xl:grid-cols-4">{[['Pipeline aberto',money(pipeline)],['Previsão ponderada',money(forecast)],['Receita recuperada',money(recoveredValue)],['Conversão',`${conversion.toFixed(1)}%`]].map(([label,value]) => <div key={label} className="metric-item p-4"><p className="text-[10px] font-bold uppercase text-stone-500">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</section>
    <section className="grid gap-6 lg:grid-cols-2"><div className="glass-card p-5"><div className="flex items-center gap-2"><TrendingUp size={17} className="text-amber-700" /><h2 className="font-semibold">Resumo comercial</h2></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-lg bg-stone-50 p-3"><dt className="text-stone-500">Clientes analisados</dt><dd className="mt-1 text-xl font-bold">{trends.length}</dd></div><div className="rounded-lg bg-red-50 p-3"><dt className="text-red-600">Contato imediato</dt><dd className="mt-1 text-xl font-bold text-red-700">{trends.filter((item) => ['atrasado','agora'].includes(item.priority)).length}</dd></div><div className="rounded-lg bg-amber-50 p-3"><dt className="text-amber-700">Contatos registrados</dt><dd className="mt-1 text-xl font-bold text-amber-900">{records.contacts.length}</dd></div><div className="rounded-lg bg-emerald-50 p-3"><dt className="text-emerald-700">Tarefas concluídas</dt><dd className="mt-1 text-xl font-bold text-emerald-800">{records.tasks.filter((item) => item.status === 'concluida').length}</dd></div></dl></div><div className="glass-card p-5"><h2 className="font-semibold">Funil</h2><div className="mt-4 space-y-3">{['identificado','contato','interessado','proposta','negociacao','recuperado','perdido'].map((stage) => { const count=records.opportunities.filter((item)=>item.stage===stage).length; const pct=records.opportunities.length?count/records.opportunities.length*100:0; return <div key={stage}><div className="mb-1 flex justify-between text-xs"><span className="capitalize">{stage}</span><strong>{count}</strong></div><div className="h-2 rounded-full bg-stone-100"><div className="h-full rounded-full bg-amber-500" style={{width:`${pct}%`}} /></div></div>; })}</div></div></section>
    <section className="glass-card overflow-hidden"><div className="border-b border-stone-900/8 p-4"><h2 className="font-semibold">Desempenho por região</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead><tr><th className="p-3">Região</th><th className="p-3">Clientes</th><th className="p-3">Contato imediato</th><th className="p-3 text-right">Pipeline</th></tr></thead><tbody>{byRegion.map(([region,row]) => <tr key={region} className="border-t border-stone-100"><td className="p-3 font-semibold">{region}</td><td className="p-3">{row.clients}</td><td className="p-3">{row.urgent}</td><td className="p-3 text-right font-bold text-amber-800">{money(row.value)}</td></tr>)}</tbody></table></div></section>
  </div>;
}
